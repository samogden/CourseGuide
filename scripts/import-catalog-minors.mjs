import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'
import { parse, stringify } from 'yaml'

const sourceDirectory = resolve(process.cwd(), 'course_htmls')
const catalogDirectory = resolve(process.cwd(), 'src/assets/catalogs/2026')
const outputDirectory = resolve(catalogDirectory, 'minors')
const collegeTitles = {
  'college-of-arts-humanities-and-social-sciences': 'College of Arts, Humanities and Social Sciences',
  'college-of-business': 'College of Business',
  'college-of-education': 'College of Education',
  'college-of-health-sciences-and-human-services': 'College of Health Sciences and Human Services',
  'college-of-science': 'College of Science',
}

async function files(directory, extension = '.html') {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? files(path, extension) : entry.isFile() && path.endsWith(extension) ? [path] : []
  }))).flat()
}

function decode(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&(nbsp|amp|quot|apos|lt|gt|ndash|mdash|rsquo|lsquo|ldquo|rdquo);/gi, (_, entity) => ({
      nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—',
      rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
    })[entity.toLowerCase()] ?? `&${entity};`)
}

function text(value) {
  return decode(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
}

function slug(value) {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function filename(value) {
  return value.replace(/[^A-Za-z0-9]/g, '')
}

function courses(value) {
  return [...value.matchAll(/(?:aria-label="View course details for\s*|>\s*)([A-Z]{2,})\s+(\d+[A-Z]?)(?=\s*[–-])/g)]
    .map(([, prefix, number]) => `${prefix}-${number}`)
    .filter((course, index, all) => all.indexOf(course) === index)
}

function completion(instruction, units) {
  const normalized = instruction.toLowerCase()
  const unitMatch = instruction.match(/(?:at least|minimum of|complete)\s+(\d+)\s*(?:or more\s*)?units?/i)
  if (unitMatch) return { kind: 'minimumCredits', credits: Number(unitMatch[1]) }
  if (/\b(?:all|both|the following course|the following theory)/.test(normalized) && !/one of|two of|three of/.test(normalized)) return { kind: 'all' }
  const count = normalized.match(/\b(one|two|three|four|five)\b/)
  if (count && /\b(?:of|additional)\b/.test(normalized)) {
    return { kind: 'choose', count: ({ one: 1, two: 2, three: 3, four: 4, five: 5 })[count[1]] }
  }

  // A list without an explicit cardinality is a course menu. The program-wide
  // required-credit total remains authoritative for these catalog variations.
  return { kind: 'minimumCredits', credits: units.minimum }
}

const knownCourses = new Set()
for (const file of await files(resolve(catalogDirectory, 'courses'), '.yaml')) {
  const value = parse(await readFile(file, 'utf8'))
  Object.keys(value.courses).forEach(course => knownCourses.add(course))
}

const minors = []
for (const file of (await files(sourceDirectory)).sort()) {
  const html = await readFile(file, 'utf8')
  if (!html.trim()) continue
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const title = titleMatch && text(titleMatch[1]).replace(/\s*,?\s*Minor$/i, '').trim()
  if (!title) throw new Error(`${basename(file)} has no minor title`)
  const requiredHeading = html.search(/Required Courses\s*(?:~|&tilde;)/i)
  if (requiredHeading < 0) throw new Error(`${title} has no required-course section`)
  const coreStart = html.lastIndexOf('<div class="acalog-core">', requiredHeading)
  const nextSection = html.indexOf('<div class="acalog-core">', requiredHeading)
  const core = html.slice(coreStart, nextSection < 0 ? undefined : nextSection)
  const heading = text(core.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '')
  const range = heading.match(/(\d+)\s*(?:-|–)?\s*(\d+)?\s*units?/i)
  if (!range) throw new Error(`${title} has no required-credit total`)
  const creditRange = { minimum: Number(range[1]), maximum: Number(range[2] ?? range[1]) }
  const items = [...core.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(match => match[1])
  const requirements = []
  let instruction = ''
  let groupCourses = []
  const flush = () => {
    const ids = groupCourses.filter((course, index, all) => knownCourses.has(course) && all.indexOf(course) === index)
    if (!ids.length) return
    requirements.push({
      id: slug(instruction || `course-options-${requirements.length + 1}`),
      completion: completion(instruction, creditRange),
      ...(instruction && { optionLabel: instruction }),
      courseIds: ids,
    })
  }
  for (const item of items) {
    const itemText = text(item)
    const ids = courses(item)
    if (!ids.length && /\b(?:complete|choose|select|take)\b/i.test(itemText)) {
      flush()
      instruction = itemText
      groupCourses = []
    } else if (ids.length) {
      groupCourses.push(...ids)
    }
  }
  flush()
  if (!requirements.length) {
    const ids = courses(core).filter(course => knownCourses.has(course))
    if (!ids.length) throw new Error(`${title} has no recognized courses`)
    requirements.push({ id: 'course-options', completion: { kind: 'minimumCredits', credits: creditRange.minimum }, courseIds: ids })
  }
  const college = relative(sourceDirectory, dirname(file)).split('/')[0]
  const collegeTitle = collegeTitles[college]
  if (!collegeTitle) throw new Error(`${title} has unknown college directory ${college}`)
  const id = slug(title)
  minors.push({ college, title, id, value: {
    schemaVersion: 1,
    catalogYear: '2026',
    id,
    title,
    college: { id: college, title: collegeTitle },
    department: { id: 'interdisciplinary-studies', title: 'Interdisciplinary Studies' },
    requiredCredits: creditRange.minimum,
    requirements,
  } })
}

// Keep manually curated minor records that are outside this HTML import.
await mkdir(outputDirectory, { recursive: true })
for (const minor of minors) {
  const path = resolve(outputDirectory, minor.college, 'interdisciplinary-studies', `${filename(minor.title)}.yaml`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, stringify(minor.value, { lineWidth: 0 }))
}

console.log(`Imported ${minors.length} minors from ${new Set(minors.map(minor => minor.college)).size} colleges.`)
