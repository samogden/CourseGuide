import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { stringify } from 'yaml'

const sourceDirectory = resolve(process.cwd(), 'course_htmls')
const outputDirectory = resolve(process.cwd(), 'src/assets/catalogs/2026/courses')

function decodeHtml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&(nbsp|amp|quot|apos|lt|gt|ndash|mdash|rsquo|lsquo|ldquo|rdquo|hellip);/gi, (_, entity) => ({
      nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—',
      rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…',
    })[entity.toLowerCase()] ?? `&${entity};`)
}

function text(html) {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')).trim()
}

function fieldHtml(record, label) {
  const match = record.match(new RegExp(`<strong>\\s*${label}:\\s*<\\/strong>([\\s\\S]*?)(?=<br\\s*\\/?>(?:\\s*<br\\s*\\/?>)*\\s*<strong>|<\\/li>)`, 'i'))
  return match?.[1] ?? ''
}

function offered(value) {
  if (/periodically offered/i.test(value)) return { availability: 'periodic' }
  const terms = ['fall', 'spring'].filter(term => new RegExp(`\\b${term}\\b`, 'i').test(value))
  return terms.length ? { terms } : undefined
}

function credits(value) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?/)
  if (!match) throw new Error(`Unable to parse units: ${value}`)
  return { minimum: Number(match[1]), maximum: Number(match[2] ?? match[1]) }
}

function courseIds(value) {
  return [...value.matchAll(/\b([A-Z]{2,})\s+(\d+[A-Z]?)\b/g)].map(([, prefix, number]) => `${prefix}-${number}`)
}

function prerequisiteRules(value) {
  if (!/\bprereq/i.test(value)) return []
  const grade = /C- or better/i.test(value) ? { minimumGrade: 'C-' } : {}
  const ids = courseIds(value)
  if (!ids.length) return []
  // Catalog requirements use parentheses around alternatives. Retain that
  // distinction so the scheduler can evaluate common prerequisite patterns.
  const alternative = value.match(/\(\s*([A-Z]{2,}\s+\d+[A-Z]?(?:\s+or\s+[A-Z]{2,}\s+\d+[A-Z]?)+)\s*\)/i)
  if (alternative) {
    const alternatives = courseIds(alternative[1])
    const required = ids.filter(id => !alternatives.includes(id))
    return [{ allOf: [...required.map(courseId => ({ courseId, ...grade })), { anyOf: alternatives.map(courseId => ({ courseId, ...grade })) }] }]
  }
  if (/\bor\b/i.test(value)) return [{ anyOf: ids.map(courseId => ({ courseId, ...grade })) }]
  return ids.map(courseId => ({ courseId, ...grade }))
}

const courseHeading = /<h3>\s*([A-Z]+)\s+(\d+[A-Z]?)\s*[-–]\s*([\s\S]*?)<\/h3>/g
const courses = new Map()
for (const file of (await readdir(sourceDirectory)).sort()) {
  const html = await readFile(resolve(sourceDirectory, file), 'utf8')
  const headings = [...html.matchAll(courseHeading)]
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]
    const [, prefix, number, rawTitle] = heading
    const record = html.slice(heading.index + heading[0].length, headings[index + 1]?.index)
    const units = text(fieldHtml(record, 'Units'))
    if (!units) throw new Error(`${basename(file)}: ${prefix} ${number} has no units`)

    const content = record.replace(/^\s*<hr\s*\/?\s*>/i, '')
    const description = text(content.split(/<strong>/i, 1)[0])
    const requirements = text(fieldHtml(record, 'Prerequisite\\(s\\)\\/Corequisite\\(s\\)'))
    const availability = text(fieldHtml(record, 'Typically Offered'))
    const course = {
      code: `${prefix} ${number}`,
      title: text(rawTitle),
      teachingStatus: 'active',
      credits: credits(units),
      ...(description && { description }),
      ...(offered(availability) && { offered: offered(availability) }),
      ...(prerequisiteRules(requirements).length && { prerequisites: prerequisiteRules(requirements) }),
      ...(requirements && { prerequisiteNotes: [requirements] }),
      ...( /Junior or Senior Standing|Junior Standing Required/i.test(requirements) && { minimumStanding: 'junior' }),
    }
    const id = `${prefix}-${number}`
    if (courses.has(id)) throw new Error(`Duplicate course ${id}`)
    courses.set(id, course)
  }
}

// Preserve manually verified records whose catalog expressions include nested
// prerequisite/corequisite logic that cannot be losslessly inferred from prose.
Object.assign(courses.get('CST-238'), {
  prerequisites: [{
    allOf: [
      { courseId: 'CST-231', minimumGrade: 'C-' },
      { anyOf: [{ courseId: 'MATH-130', minimumGrade: 'C-' }, { courseId: 'MATH-150', minimumGrade: 'C-' }] },
    ],
  }],
})
Object.assign(courses.get('CST-286'), {
  credits: { minimum: 3, maximum: 3 },
  description: 'Catalog details are still being added.',
  placeholder: true,
})
delete courses.get('CST-286').prerequisites
delete courses.get('CST-286').prerequisiteNotes
Object.assign(courses.get('CST-383'), {
  prerequisites: [{ anyOf: [
    { courseId: 'CST-238', minimumGrade: 'C-' },
    { courseId: 'BIO-380', minimumGrade: 'C-' },
    { allOf: [{ courseId: 'CST-319', minimumGrade: 'C-' }, { anyOf: [
      { courseId: 'STAT-100', minimumGrade: 'C-' }, { courseId: 'STAT-250', minimumGrade: 'C-' },
      { courseId: 'MATH-320', minimumGrade: 'C-' }, { courseId: 'BUS-204', minimumGrade: 'C-' },
    ] }] },
  ] }],
})
courses.get('CST-201').teachingStatus = 'inactive'

const byPrefix = new Map()
for (const [id, course] of courses) {
  const prefix = id.split('-')[0]
  const group = byPrefix.get(prefix) ?? new Map()
  group.set(id, course)
  byPrefix.set(prefix, group)
}

await mkdir(outputDirectory, { recursive: true })
await Promise.all((await readdir(outputDirectory)).filter(file => file.endsWith('.yaml')).map(file => rm(resolve(outputDirectory, file))))
for (const [prefix, entries] of [...byPrefix].sort(([left], [right]) => left.localeCompare(right))) {
  const orderedCourses = Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true })))
  const yaml = stringify({ schemaVersion: 1, prefix, courses: orderedCourses }, { lineWidth: 0 })
  await writeFile(resolve(outputDirectory, `${prefix}.yaml`), yaml)
}

console.log(`Imported ${courses.size} courses into ${byPrefix.size} prefix files.`)
