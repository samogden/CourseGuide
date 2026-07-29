import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parse, stringify } from 'yaml'

const sourceDirectory = resolve(process.cwd(), 'course_htmls')
const catalogDirectory = resolve(process.cwd(), 'src/assets/catalogs/2026')
const outputDirectory = resolve(catalogDirectory, 'programs')

const affiliations = {
  Accounting: ['college-of-business', 'College of Business', 'business', 'Business'],
  'Agribusiness Supply Chain Management': ['college-of-science', 'College of Science', 'agricultural-plant-and-soil-sciences', 'Agricultural Plant and Soil Sciences'],
  'Agricultural Plant & Soil Sciences': ['college-of-science', 'College of Science', 'agricultural-plant-and-soil-sciences', 'Agricultural Plant and Soil Sciences'],
  Biology: ['college-of-science', 'College of Science', 'biology', 'Biology'],
  'Business Administration': ['college-of-business', 'College of Business', 'business', 'Business'],
  'Cinematic Arts & Technology': ['college-of-arts-humanities-and-social-sciences', 'College of Arts, Humanities and Social Sciences', 'cinematic-arts-and-technology', 'Cinematic Arts and Technology'],
  'Collaborative Health & Human Services': ['college-of-health-sciences-and-human-services', 'College of Health Sciences and Human Services', 'collaborative-health-and-human-services', 'Collaborative Health and Human Services'],
  'Communication Design': ['college-of-science', 'College of Science', 'computing-and-design', 'Computing and Design'],
  'Environmental Science, Technology, & Policy': ['college-of-science', 'College of Science', 'environmental-science-technology-and-policy', 'Environmental Science, Technology, and Policy'],
  'Environmental Studies': ['college-of-science', 'College of Science', 'environmental-studies', 'Environmental Studies'],
  'Ethnic & Gender Studies': ['college-of-arts-humanities-and-social-sciences', 'College of Arts, Humanities and Social Sciences', 'ethnic-and-gender-studies', 'Ethnic and Gender Studies'],
  'Global Studies': ['college-of-arts-humanities-and-social-sciences', 'College of Arts, Humanities and Social Sciences', 'global-studies', 'Global Studies'],
  'Human Development & Family Science': ['college-of-education', 'College of Education', 'human-development-and-family-science', 'Human Development and Family Science'],
  'Humanities & Communication': ['college-of-arts-humanities-and-social-sciences', 'College of Arts, Humanities and Social Sciences', 'humanities-and-communication', 'Humanities and Communication'],
  'Japanese Language & Culture': ['college-of-arts-humanities-and-social-sciences', 'College of Arts, Humanities and Social Sciences', 'world-languages-and-cultures', 'World Languages and Cultures'],
  Kinesiology: ['college-of-health-sciences-and-human-services', 'College of Health Sciences and Human Services', 'kinesiology', 'Kinesiology'],
  'Liberal Studies': ['college-of-education', 'College of Education', 'liberal-studies', 'Liberal Studies'],
  'Marine Science': ['college-of-science', 'College of Science', 'marine-science', 'Marine Science'],
  Mathematics: ['college-of-science', 'College of Science', 'mathematics-and-statistics', 'Mathematics and Statistics'],
  'Mechatronics Engineering': ['college-of-science', 'College of Science', 'mechatronics-engineering', 'Mechatronics Engineering'],
  Music: ['college-of-arts-humanities-and-social-sciences', 'College of Arts, Humanities and Social Sciences', 'music-and-performing-arts', 'Music and Performing Arts'],
  Nursing: ['college-of-health-sciences-and-human-services', 'College of Health Sciences and Human Services', 'nursing', 'Nursing'],
  Psychology: ['college-of-arts-humanities-and-social-sciences', 'College of Arts, Humanities and Social Sciences', 'psychology', 'Psychology'],
  'Public Health': ['college-of-health-sciences-and-human-services', 'College of Health Sciences and Human Services', 'public-health', 'Public Health'],
  'Social Sciences': ['college-of-arts-humanities-and-social-sciences', 'College of Arts, Humanities and Social Sciences', 'social-sciences', 'Social Sciences'],
  Sociology: ['college-of-arts-humanities-and-social-sciences', 'College of Arts, Humanities and Social Sciences', 'sociology', 'Sociology'],
  'Spanish Language & Hispanic Cultures': ['college-of-arts-humanities-and-social-sciences', 'College of Arts, Humanities and Social Sciences', 'world-languages-and-cultures', 'World Languages and Cultures'],
  'Statistics & Data Science': ['college-of-science', 'College of Science', 'mathematics-and-statistics', 'Mathematics and Statistics'],
  'Visual & Public Art': ['college-of-arts-humanities-and-social-sciences', 'College of Arts, Humanities and Social Sciences', 'visual-and-public-art', 'Visual and Public Art'],
}

function decode(value) {
  return value.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&(nbsp|amp|quot|apos|lt|gt|ndash|mdash|rsquo|lsquo|ldquo|rdquo);/gi, (_, entity) => ({ nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' })[entity.toLowerCase()] ?? `&${entity};`)
}
function text(value) { return decode(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim() }
function slug(value) { return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function filename(value) { return value.replace(/[^A-Za-z0-9]/g, '') }
function courseIds(value) {
  return [...value.matchAll(/(?:aria-label="View course details for\s*|>\s*)([A-Z]{2,})\s+(\d+[A-Z]?)(?=\s*[–-])/g)]
    .map(([, prefix, number]) => `${prefix}-${number}`).filter((id, index, all) => all.indexOf(id) === index)
}
function completion(instruction, units) {
  const normalized = instruction.toLowerCase()
  const credits = instruction.match(/(?:at least|minimum of|complete)\s+(\d+)\s*(?:or more\s*)?units?/i)
  if (credits) return { kind: 'minimumCredits', credits: Number(credits[1]) }
  if (/\b(?:all|both|the following course|the following core)/.test(normalized) && !/one of|two of|three of/.test(normalized)) return { kind: 'all' }
  const count = normalized.match(/\b(one|two|three|four|five|six)\b/)
  if (count && /\b(?:of|additional)\b/.test(normalized)) return { kind: 'choose', count: ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 })[count[1]] }
  return { kind: 'all' }
}

const knownCourses = new Set()
for (const file of await readdir(resolve(catalogDirectory, 'courses'))) {
  const courseFile = parse(await readFile(resolve(catalogDirectory, 'courses', file), 'utf8'))
  Object.keys(courseFile.courses).forEach(id => knownCourses.add(id))
}

function requirements(section, units) {
  const items = [...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(match => match[1])
  const result = []
  let instruction = ''
  let group = []
  const flush = () => {
    const ids = group.filter((id, index, all) => knownCourses.has(id) && all.indexOf(id) === index)
    if (!ids.length) return
    result.push({ id: `${slug(instruction || 'required-courses')}-${result.length + 1}`, completion: completion(instruction, units), ...(instruction && { optionLabel: instruction }), courseIds: ids })
  }
  for (const item of items) {
    const itemText = text(item)
    const ids = courseIds(item)
    if (!ids.length && /\b(?:complete|choose|select|take)\b/i.test(itemText)) { flush(); instruction = itemText; group = [] }
    else if (ids.length) group.push(...ids)
  }
  flush()
  if (!result.length) {
    const ids = courseIds(section).filter(id => knownCourses.has(id))
    if (ids.length) result.push({ id: 'required-courses', completion: { kind: 'all' }, courseIds: ids })
  }
  return result
}

const programs = new Map()
for (const file of (await readdir(sourceDirectory)).filter(file => file.endsWith('.html')).sort()) {
  const html = await readFile(resolve(sourceDirectory, file), 'utf8')
  if (!html.trim()) continue
  const rawTitle = text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '')
  const titleMatch = rawTitle.match(/^(.*?)\s*,?\s*(B\.[AS])\.?\s*(?:[~+]\s*(.*))?$/i)
  if (!titleMatch) throw new Error(`${file}: cannot identify degree title: ${rawTitle}`)
  const [, base, credential, concentrationText] = titleMatch
  const affiliation = affiliations[base.trim()]
  if (!affiliation) throw new Error(`${file}: no affiliation mapping for ${base}`)
  const [, , departmentId] = affiliation
  const programId = `${slug(credential.replace('.', ''))}-${slug(base)}`
  const sectionMatches = [...html.matchAll(/<div class="acalog-core">\s*<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
  const sections = sectionMatches.map((match, index) => ({ heading: text(match[1]), body: html.slice(match.index, sectionMatches[index + 1]?.index) }))
    .filter(section => /(?:Required|Core Courses|Core Requirements|Concentration|Major Electives)/i.test(section.heading))
  const core = sections.find(section => /(?:Required Courses|Core (?:Courses|Requirements))/i.test(section.heading) && !/Concentration/i.test(section.heading))
  if (!core) throw new Error(`${file}: ${rawTitle} has no core requirement section`)
  const unitMatch = core.heading.match(/(\d+)\s*(?:-|–)?\s*(\d+)?\s*\+?\s*units?/i)
  if (!unitMatch) throw new Error(`${file}: ${rawTitle} core has no unit total`)
  const coreCredits = { minimum: Number(unitMatch[1]), maximum: Number(unitMatch[2] ?? unitMatch[1]) }
  const entry = programs.get(programId) ?? { base: base.trim(), credential: credential.toUpperCase(), affiliation, requirements: requirements(core.body, coreCredits), concentrations: {} }
  if (concentrationText) {
    const concentration = sections.find(section => /Concentration|Major Electives/i.test(section.heading) && section !== core)
    if (!concentration) throw new Error(`${file}: ${rawTitle} has no concentration section`)
    const concentrationTitle = concentrationText.replace(/\s+(?:Concentration|Minor|Credential)$/i, '').trim()
    entry.concentrations[slug(concentrationTitle)] = { title: concentrationTitle, requirements: requirements(concentration.body, { minimum: 0, maximum: 0 }) }
  }
  programs.set(programId, entry)
}

for (const [id, program] of programs) {
  if (id === 'bs-computer-science') continue // preserves the only department-supplied roadmap
  const [collegeId, collegeTitle, departmentId, departmentTitle] = program.affiliation
  const allRequirements = [...program.requirements, ...Object.values(program.concentrations).flatMap(concentration => concentration.requirements)]
  const coursePrefixes = [...new Set(allRequirements.flatMap(requirement => requirement.courseIds.map(id => id.split('-')[0])))].sort()
  const value = { schemaVersion: 1, catalogYear: '2026', id, title: `${program.credential} ${program.base}`, credential: program.credential, college: { id: collegeId, title: collegeTitle }, department: { id: departmentId, title: departmentTitle }, coursePrefixes, requirements: program.requirements, concentrations: program.concentrations }
  const path = resolve(outputDirectory, collegeId, departmentId, `${filename(program.base)}_${program.credential.replace('.', '')}.yaml`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, stringify(value, { lineWidth: 0 }))
}
console.log(`Imported ${programs.size} programs from ${[...programs.values()].reduce((count, program) => count + Object.keys(program.concentrations).length, 0)} concentration pages.`)
