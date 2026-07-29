import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'yaml'

interface CatalogFile {
  path: string
  value: Record<string, unknown>
}

const catalogRoot = resolve(process.cwd(), 'src/assets/catalogs')

async function yamlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return yamlFiles(path)
    return entry.isFile() && path.endsWith('.yaml') ? [path] : []
  }))
  return nested.flat()
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${context} must be a mapping.`)
  return value as Record<string, unknown>
}

function courseIdsFromRequirements(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('requirements must be a list.')
  return value.flatMap(requirement => {
    const record = asRecord(requirement, 'Requirement')
    if (!Array.isArray(record.courseIds) || !record.courseIds.every(courseId => typeof courseId === 'string')) throw new Error('Requirement courseIds must be a list of course IDs.')
    return record.courseIds
  })
}

const files: CatalogFile[] = await Promise.all((await yamlFiles(catalogRoot)).map(async path => ({
  path,
  value: asRecord(parse(await readFile(path, 'utf8')), path),
})))

const catalogYears = new Set(files
  .filter(file => file.path.endsWith('/catalog.yaml'))
  .map(file => String(file.value.catalogYear ?? '')))
if (catalogYears.size === 0 || catalogYears.has('')) throw new Error('Every catalog snapshot needs a catalog.yaml with catalogYear.')
for (const file of files.filter(file => file.path.endsWith('/catalog.yaml'))) {
  const [, pathYear] = file.path.match(/\/catalogs\/([^/]+)\//) ?? []
  if (file.value.catalogYear !== pathYear) throw new Error(`${file.path} must declare the matching catalog year.`)
}

const coursesByYear = new Map<string, Set<string>>()
for (const file of files.filter(file => file.path.includes('/courses/'))) {
  const [, year] = file.path.match(/\/catalogs\/([^/]+)\//) ?? []
  const prefix = String(file.value.prefix ?? '')
  const courses = asRecord(file.value.courses, `${file.path} courses`)
  if (!year || !catalogYears.has(year)) throw new Error(`${file.path} is not under a known catalog year.`)
  if (!prefix) throw new Error(`${file.path} must declare prefix.`)
  const ids = coursesByYear.get(year) ?? new Set<string>()
  for (const courseId of Object.keys(courses)) {
    if (!courseId.startsWith(`${prefix}-`)) throw new Error(`${file.path}: ${courseId} does not match prefix ${prefix}.`)
    if (ids.has(courseId)) throw new Error(`${year}: duplicate course ID ${courseId}.`)
    ids.add(courseId)
  }
  coursesByYear.set(year, ids)
}

for (const file of files.filter(file => file.path.includes('/programs/') || file.path.includes('/minors/'))) {
  const [, pathYear] = file.path.match(/\/catalogs\/([^/]+)\//) ?? []
  const catalogYear = String(file.value.catalogYear ?? '')
  if (!pathYear || catalogYear !== pathYear || !catalogYears.has(catalogYear)) throw new Error(`${file.path} must declare the matching catalog year.`)
  const knownCourseIds = coursesByYear.get(catalogYear) ?? new Set<string>()
  const requirementGroups: unknown[] = [file.value.requirements]
  const concentrations = file.value.concentrations
  if (concentrations && typeof concentrations === 'object' && !Array.isArray(concentrations)) {
    requirementGroups.push(...Object.values(concentrations as Record<string, unknown>).map(concentration => asRecord(concentration, 'Concentration').requirements))
  }
  for (const group of requirementGroups) {
    for (const courseId of courseIdsFromRequirements(group)) {
      if (!knownCourseIds.has(courseId)) throw new Error(`${file.path}: unknown requirement course ${courseId}.`)
    }
  }
  const roadmaps = file.value.roadmaps
  if (roadmaps && typeof roadmaps === 'object' && !Array.isArray(roadmaps)) {
    for (const roadmap of Object.values(roadmaps as Record<string, unknown>)) {
      const plan = asRecord(roadmap, 'Roadmap').plan
      const years = asRecord(plan, 'Roadmap plan').years
      if (!Array.isArray(years)) throw new Error(`${file.path}: roadmap years must be a list.`)
      for (const year of years) {
        const terms = asRecord(year, 'Roadmap year').terms
        if (!Array.isArray(terms)) throw new Error(`${file.path}: roadmap terms must be a list.`)
        for (const term of terms) {
          const slots = asRecord(term, 'Roadmap term').slots
          if (!Array.isArray(slots)) throw new Error(`${file.path}: roadmap slots must be a list.`)
          for (const slot of slots) {
            const record = asRecord(slot, 'Roadmap slot')
            const courseIds = record.type === 'course' ? [record.courseId] : record.type === 'choice' ? record.alternatives : []
            if (!Array.isArray(courseIds)) throw new Error(`${file.path}: roadmap choice alternatives must be a list.`)
            for (const courseId of courseIds) {
              if (typeof courseId === 'string' && /^[A-Z]+-\d/.test(courseId) && !knownCourseIds.has(courseId)) throw new Error(`${file.path}: roadmap references unknown course ${courseId}.`)
            }
          }
        }
      }
    }
  }
}

console.log(`Catalog validation passed: ${catalogYears.size} catalog year(s), ${[...coursesByYear.values()].reduce((total, courses) => total + courses.size, 0)} courses, ${files.length} YAML files.`)
