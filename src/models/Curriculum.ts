import { parse } from 'yaml'
import { z } from 'zod'

const categorySchema = z.enum(['cst', 'math', 'ge-lower', 'ge-upper', 'elective'])

const prerequisiteSchema: z.ZodType<unknown> = z.lazy(() => z.object({
  courseId: z.string().optional(),
  minimumGrade: z.string().optional(),
  allOf: z.array(prerequisiteSchema).optional(),
  anyOf: z.array(prerequisiteSchema).optional(),
}).strict())

const courseSchema = z.object({
  code: z.string(),
  title: z.string(),
  teachingStatus: z.enum(['active', 'inactive']),
  credits: z.object({ minimum: z.number().nonnegative(), maximum: z.number().nonnegative() }).strict().refine(value => value.minimum <= value.maximum),
  description: z.string().optional(),
  offered: z.union([
    z.object({ terms: z.array(z.enum(['fall', 'spring'])).min(1) }).strict(),
    z.object({ availability: z.literal('periodic') }).strict(),
  ]).optional(),
  minimumStanding: z.enum(['junior']).optional(),
  prerequisites: z.array(prerequisiteSchema).optional(),
  corequisites: z.array(prerequisiteSchema).optional(),
  prerequisiteNotes: z.array(z.string()).optional(),
  placeholder: z.boolean().default(false),
}).strict()

const planSlotSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('course'), courseId: z.string(), credits: z.number().positive(), category: categorySchema, source: z.enum(['major', 'minor', 'other']).optional() }),
  z.object({ type: z.literal('requirement'), slotId: z.string(), label: z.string(), credits: z.number().positive(), category: categorySchema, guidance: z.string(), courseIds: z.array(z.string()).optional(), source: z.enum(['major', 'minor', 'other']).optional() }),
  z.object({ type: z.literal('choice'), slotId: z.string(), alternatives: z.array(z.string()).min(2), credits: z.number().positive(), category: categorySchema, guidance: z.string(), source: z.enum(['major', 'minor', 'other']).optional() }),
])

const planSchema = z.object({
  schemaVersion: z.literal(1),
  years: z.array(z.object({
    year: z.enum(['freshman', 'sophomore', 'junior', 'senior']),
    terms: z.array(z.object({ term: z.enum(['fall', 'spring']), slots: z.array(planSlotSchema) })),
  })),
}).strict()

const completionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }).strict(),
  z.object({ kind: z.literal('choose'), count: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal('minimumCredits'), credits: z.number().positive() }).strict(),
])

const requirementSchema = z.object({
  id: z.string(),
  completion: completionSchema,
  minimumGrade: z.string().optional(),
  optionLabel: z.string().optional(),
  courseIds: z.array(z.string()).min(1),
  prerequisites: z.array(prerequisiteSchema).optional(),
}).strict()

const programSchema = z.object({
  title: z.string(),
  requirements: z.array(requirementSchema),
  concentrations: z.record(z.string(), z.object({ title: z.string(), requirements: z.array(requirementSchema) }).strict()),
}).strict()

const roadmapSchema = z.object({
  status: z.enum(['verified', 'derived']),
  plan: planSchema,
}).strict()

const degreeFileSchema = programSchema.extend({
  schemaVersion: z.literal(1),
  catalogYear: z.string(),
  id: z.string(),
  credential: z.string(),
  college: z.object({ id: z.string(), title: z.string() }).strict(),
  department: z.object({ id: z.string(), title: z.string() }).strict(),
  coursePrefixes: z.array(z.string()).min(1),
  roadmaps: z.record(z.string(), roadmapSchema).default({}),
}).strict()

const minorFileSchema = z.object({
  schemaVersion: z.literal(1),
  catalogYear: z.string(),
  id: z.string(),
  title: z.string(),
  college: z.object({ id: z.string(), title: z.string() }).strict(),
  department: z.object({ id: z.string(), title: z.string() }).strict(),
  requiredCredits: z.number().positive(),
  note: z.string().optional(),
  requirements: z.array(requirementSchema),
}).strict()

const courseFileSchema = z.object({
  schemaVersion: z.literal(1),
  prefix: z.string(),
  courses: z.record(z.string(), courseSchema),
}).strict()

const catalogFileSchema = z.object({
  schemaVersion: z.literal(1),
  catalogYear: z.string(),
  title: z.string(),
  colleges: z.array(z.object({
    id: z.string(),
    title: z.string(),
    departments: z.array(z.object({ id: z.string(), title: z.string() }).strict()),
  }).strict()),
}).strict()

const programsSchema = z.object({
  schemaVersion: z.literal(2),
  programs: z.record(z.string(), programSchema),
  catalogVersions: z.record(z.string(), z.object({ title: z.string(), programs: z.record(z.string(), programSchema) }).strict()),
}).strict()

export type Category = z.infer<typeof categorySchema>
export type AcademicTerm = 'fall' | 'spring'
export type DegreeType = 'bs' | 'ast-to-bs'
export type PlanSlot = z.infer<typeof planSlotSchema>
export type CurriculumPlan = z.infer<typeof planSchema>
export type Programs = z.infer<typeof programsSchema>
export type CatalogVersion = Programs['catalogVersions'][string]
export type Requirement = z.infer<typeof requirementSchema>
export type Program = Programs['programs'][string]
export type Concentration = Program['concentrations'][string]
export type Minor = z.infer<typeof minorFileSchema>
export type ProgramRoadmap = z.infer<typeof roadmapSchema>
export type DegreeCatalogEntry = z.infer<typeof degreeFileSchema>
export type CatalogMetadata = z.infer<typeof catalogFileSchema>

export const defaultCatalogVersion = '2026'

export interface Course {
  id: string
  code: string
  aliases: string[]
  name: string
  units: number
  maximumUnits: number
  teachingStatus: 'active' | 'inactive'
  description?: string
  offeredTerms?: readonly AcademicTerm[]
  prerequisites: unknown[]
  corequisites: unknown[]
  prerequisiteNotes: string[]
  placeholder: boolean
  minimumStanding?: 'junior'
}

function inferredCorequisites(notes: readonly string[]): { courseId: string }[] {
  return [...new Set(notes.flatMap(note => [...note.matchAll(/Coreq:\s*([A-Z]+)\s*(\d+[A-Z]*)/g)]
    .map(match => canonicalCourseId(`${match[1]}-${match[2]}`))))]
    .map(courseId => ({ courseId }))
}

export interface PlanCreditSummary {
  total: number
  major: number
  lowerDivisionGeneralEducation: number
  upperDivisionGeneralEducation: number
}

export function canonicalCourseId(value: string): string {
  const compact = value.trim().toUpperCase().replace(/[\s-]+/g, '')
  const match = compact.match(/^([A-Z]+)(\d+)([A-Z]*)$/)
  return match ? `${match[1]}-${match[2]}${match[3]}` : compact
}

const catalogAssetTexts = import.meta.glob('../assets/catalogs/**/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const catalogAssets = Object.entries(catalogAssetTexts).map(([path, text]) => ({ path, value: parse(text) }))
const catalogYearForPath = (path: string): string => {
  const match = path.match(/\/catalogs\/([^/]+)\//)
  if (!match) throw new Error(`Catalog asset is missing a catalog-year directory: ${path}`)
  return match[1]
}
const catalogFiles = catalogAssets
  .filter(asset => asset.path.endsWith('/catalog.yaml'))
  .map(asset => catalogFileSchema.parse(asset.value))
const courseFiles = catalogAssets
  .filter(asset => asset.path.includes('/courses/'))
  .map(asset => ({ catalogYear: catalogYearForPath(asset.path), file: courseFileSchema.parse(asset.value) }))
const degreeFiles = catalogAssets
  .filter(asset => asset.path.includes('/programs/'))
  .map(asset => ({ catalogYear: catalogYearForPath(asset.path), file: degreeFileSchema.parse(asset.value) }))
const minorFiles = catalogAssets
  .filter(asset => asset.path.includes('/minors/'))
  .map(asset => ({ catalogYear: catalogYearForPath(asset.path), file: minorFileSchema.parse(asset.value) }))

if (catalogFiles.length === 0) throw new Error('No catalog metadata files were found.')

const catalogMetadataByYear = new Map(catalogFiles.map(catalog => [catalog.catalogYear, catalog]))
const coursesByCatalogYear = new Map<string, Record<string, z.infer<typeof courseSchema>>>()
for (const { catalogYear, file: courseFile } of courseFiles) {
  if (!catalogMetadataByYear.has(catalogYear)) throw new Error(`Course prefix ${courseFile.prefix} does not belong to a known catalog year.`)
  const existing = coursesByCatalogYear.get(catalogYear) ?? {}
  for (const [courseId, course] of Object.entries(courseFile.courses)) {
    if (!courseId.startsWith(`${courseFile.prefix}-`)) throw new Error(`Course ${courseId} does not match ${courseFile.prefix}.yaml.`)
    if (existing[courseId]) throw new Error(`Duplicate course ID in ${catalogYear}: ${courseId}`)
    existing[courseId] = course
  }
  coursesByCatalogYear.set(catalogYear, existing)
}

const programRecordsByYear = new Map<string, Record<string, Program>>()
const roadmapRecords = new Map<string, ProgramRoadmap>()
const degreeRecords = new Map<string, DegreeCatalogEntry>()
for (const { catalogYear: pathCatalogYear, file: degree } of degreeFiles) {
  if (degree.catalogYear !== pathCatalogYear) throw new Error(`Program ${degree.id} is in ${pathCatalogYear} but declares ${degree.catalogYear}.`)
  if (!catalogMetadataByYear.has(degree.catalogYear)) throw new Error(`Program ${degree.id} references unknown catalog year ${degree.catalogYear}.`)
  const records = programRecordsByYear.get(degree.catalogYear) ?? {}
  if (records[degree.id]) throw new Error(`Duplicate program ID in ${degree.catalogYear}: ${degree.id}`)
  records[degree.id] = { title: degree.title, requirements: degree.requirements, concentrations: degree.concentrations }
  programRecordsByYear.set(degree.catalogYear, records)
  degreeRecords.set(`${degree.catalogYear}/${degree.id}`, degree)
  for (const [degreeType, roadmap] of Object.entries(degree.roadmaps)) roadmapRecords.set(`${degree.catalogYear}/${degree.id}/${degreeType}`, roadmap)
}

const minorRecordsByYear = new Map<string, Record<string, Minor>>()
for (const { catalogYear: pathCatalogYear, file: minor } of minorFiles) {
  if (minor.catalogYear !== pathCatalogYear) throw new Error(`Minor ${minor.id} is in ${pathCatalogYear} but declares ${minor.catalogYear}.`)
  if (!catalogMetadataByYear.has(minor.catalogYear)) throw new Error(`Minor ${minor.id} references unknown catalog year ${minor.catalogYear}.`)
  const records = minorRecordsByYear.get(minor.catalogYear) ?? {}
  if (records[minor.id]) throw new Error(`Duplicate minor ID in ${minor.catalogYear}: ${minor.id}`)
  records[minor.id] = minor
  minorRecordsByYear.set(minor.catalogYear, records)
}

const programCatalogSource = {
  schemaVersion: 2 as const,
  programs: programRecordsByYear.get(defaultCatalogVersion) ?? {},
  catalogVersions: Object.fromEntries(catalogFiles.map(catalog => [catalog.catalogYear, {
    title: catalog.title,
    programs: programRecordsByYear.get(catalog.catalogYear) ?? {},
  }])),
}
export const programs: Programs = programsSchema.parse(programCatalogSource)
export const catalogVersions = programs.catalogVersions
export const catalogMetadata = Object.fromEntries(catalogFiles.map(catalog => [catalog.catalogYear, catalog])) as Record<string, CatalogMetadata>
export const minors = { catalogVersions: Object.fromEntries(catalogFiles.map(catalog => [catalog.catalogYear, {
  minors: minorRecordsByYear.get(catalog.catalogYear) ?? {},
}])) }
const parsedCatalog = { schemaVersion: 1 as const, courses: coursesByCatalogYear.get(defaultCatalogVersion) ?? {} }
export const curriculumPlan: CurriculumPlan = roadmapRecords.get(`${defaultCatalogVersion}/bs-computer-science/bs`)?.plan ?? { schemaVersion: 1, years: [] }

/** Courses AS-T students ordinarily completed before entering the upper division. */
export const transferAssumedCourseIds = new Set(
  curriculumPlan.years
    .filter(year => year.year === 'freshman' || year.year === 'sophomore')
    .flatMap(year => year.terms.flatMap(term => term.slots.flatMap(slot => {
      if (slot.type === 'course') return [slot.courseId]
      if (slot.type === 'choice') return slot.alternatives
      return []
    }))),
)

export const transferReadinessCourseIds = [
  'MATH-130',
  'MATH-150',
  'CST-231',
  'CST-237',
  'CST-238',
  'MATH-151',
  'MATH-170',
  'MATH-270',
] as const

export function roadmapForProgram(programId: string, degreeType: DegreeType, catalogVersion: string = defaultCatalogVersion): ProgramRoadmap | undefined {
  const storedRoadmap = roadmapRecords.get(`${catalogVersion}/${programId}/${degreeType}`) ?? roadmapRecords.get(`${catalogVersion}/${programId}/bs`)
  if (storedRoadmap) return storedRoadmap
  return getProgram(programId, catalogVersion) ? { status: 'derived', plan: deriveRoadmap(programId, catalogVersion) } : undefined
}

export function planForDegreeType(degreeType: DegreeType, programId: string = 'bs-computer-science', catalogVersion: string = defaultCatalogVersion): CurriculumPlan {
  const exactRoadmap = roadmapRecords.get(`${catalogVersion}/${programId}/${degreeType}`)
  const roadmap = exactRoadmap ?? roadmapForProgram(programId, degreeType, catalogVersion) ?? roadmapForProgram(programId, 'bs', catalogVersion)
  if (!roadmap) return { schemaVersion: 1, years: [] }
  if (degreeType === 'bs') return roadmap.plan
  if (exactRoadmap && exactRoadmap.plan.years.every(year => year.year === 'junior' || year.year === 'senior')) return exactRoadmap.plan
  return {
    ...roadmap.plan,
    years: roadmap.plan.years.filter(year => year.year === 'junior' || year.year === 'senior'),
  }
}

/** Adds a selected minor as planned coursework without consuming the major's elective slots. */
export function appendMinorToPlan(plan: CurriculumPlan, minor: Minor | undefined): CurriculumPlan {
  if (!minor) return plan
  const years = plan.years.map(year => ({ ...year, terms: year.terms.map(term => ({ ...term, slots: [...term.slots] })) }))
  const terms = years.flatMap(year => year.terms)
  const plannedCourseIds = new Set(plan.years.flatMap(year => year.terms.flatMap(term => term.slots.flatMap(slot => slot.type === 'course' ? [slot.courseId] : []))))
  const completedBefore = (termIndex: number) => new Set(
    terms.slice(0, termIndex).flatMap(term => term.slots.flatMap(slot => slot.type === 'course' ? [slot.courseId] : [])),
  )
  const prerequisitesMetForPlan = (prerequisites: unknown[], completed: ReadonlySet<string>): boolean => {
    const met = (prerequisite: unknown): boolean => {
      if (!prerequisite || typeof prerequisite !== 'object') return false
      const value = prerequisite as { courseId?: string; allOf?: unknown[]; anyOf?: unknown[] }
      if (value.courseId) {
        const id = canonicalCourseId(value.courseId)
        // Courses outside this plan are assumed to have been completed by the
        // student before entering the program; planned courses must be earlier.
        return !plannedCourseIds.has(id) || completed.has(id)
      }
      if (value.allOf) return value.allOf.every(met)
      if (value.anyOf) return value.anyOf.some(met)
      return false
    }
    return prerequisites.every(met)
  }
  const canTake = (courseId: string, term: AcademicTerm, termIndex: number) => {
    const course = getCourse(courseId)
    if (!course || !isCourseOffered(courseId, term)) return false
    // Respect an explicit catalog standing requirement. Course numbers are a
    // placement preference below, not an artificial eligibility rule: when a
    // minor otherwise cannot fit, an advisor can select an appropriate option
    // from its requirement in an earlier open term.
    return prerequisitesMetForPlan(course.prerequisites, completedBefore(termIndex))
  }
  const preferredStartTerm = (courseIds: readonly string[], credits: number): number => {
    // Prefer the earliest level represented by the requirement.  A 200-level
    // option belongs in sophomore year, a 300-level option in junior year,
    // and so on.  This applies to choices as well as named courses, while
    // still allowing a later term to be used when the preferred year is full.
    const levels = courseIds
      .map(courseId => getCourse(courseId))
      .filter((course): course is Course => Boolean(course))
      // A one-unit practicum alone cannot fill a four-unit requirement slot.
      .filter(course => course.maximumUnits >= credits)
      .map(course => Number(course.code.match(/\d{3}/)?.[0] ?? 100))
      // Special-topics/independent-study numbers (x95–x99, such as BIO
      // 196) are not reliable indicators of when the regular curriculum is
      // taken. Exclude them before deriving the placement preference.
      .filter(courseNumber => courseNumber % 100 < 95)
    const level = Math.min(...levels)
    if (!Number.isFinite(level)) return 0
    return level >= 400 ? 6 : level >= 300 ? 4 : level >= 200 ? 2 : 0
  }
  const appendSlot = (slot: PlanSlot, courseIds: readonly string[]) => {
    const startTerm = preferredStartTerm(courseIds, slot.credits)
    const eligible = (limit: number, firstTerm = startTerm) => terms.findIndex((term, termIndex) =>
      termIndex >= firstTerm &&
      term.slots.reduce((total, current) => total + current.credits, 0) + slot.credits <= limit &&
      (courseIds.length === 0 || courseIds.some(courseId => canTake(courseId, term.term, termIndex))),
    )
    // Preserve the major roadmap first. Put minor work in normal 15-credit
    // openings where possible, then use the 16–18 stretch range. If the
    // preferred year and every later term are full, use an earlier opening as
    // a last resort rather than silently dropping required minor credits.
    // Never fall back to an overloaded term: 18 credits is a hard limit.
    const targetIndex = eligible(15)
    const stretchTargetIndex = targetIndex >= 0 ? targetIndex : eligible(18)
    const earlierTargetIndex = stretchTargetIndex >= 0 ? stretchTargetIndex : eligible(15, 0)
    const earlierStretchTargetIndex = earlierTargetIndex >= 0 ? earlierTargetIndex : eligible(18, 0)
    const target = terms[earlierStretchTargetIndex]
    if (!target) return false
    target.slots.push(slot)
    return true
  }
  for (const requirement of minor.requirements) {
    if (requirement.completion.kind === 'all') {
      for (const courseId of requirementCourseIds(requirement)) {
        const course = getCourse(courseId)
        if (plannedCourseIds.has(courseId)) continue
        if (course) appendSlot({ type: 'course', courseId, credits: course.units, category: 'elective', source: 'minor' }, [courseId])
      }
    } else if (requirement.completion.kind === 'choose') {
      const alternatives = requirementCourseIds(requirement).filter(courseId => !plannedCourseIds.has(courseId))
      if (alternatives.length < 2) continue
      for (let index = 0; index < requirement.completion.count; index += 1) {
        const credits = getCourse(alternatives[0])?.units ?? 4
        appendSlot({
          type: 'choice',
          slotId: `minor-${minor.id}-${requirement.id}-${index + 1}`,
          alternatives,
          credits,
          category: 'elective',
          source: 'minor',
          guidance: requirement.optionLabel ?? 'Choose a course for this minor requirement.',
        }, alternatives)
      }
    } else if (requirement.completion.kind === 'minimumCredits') {
      const alternatives = requirementCourseIds(requirement).filter(courseId => !plannedCourseIds.has(courseId))
      // `minimumCredits` is itself the catalog obligation. Do not subtract
      // earlier prerequisite/choice requirements from it: Biology, for
      // example, explicitly requires 12 credits from this list in addition
      // to its lower- and upper-division gateway choices.
      const creditsToPlan = requirement.completion.credits
      const slotCount = Math.ceil(creditsToPlan / 4)
      for (let index = 0; index < slotCount; index += 1) {
        appendSlot({
          type: 'requirement',
          slotId: `minor-${minor.id}-${requirement.id}-${index + 1}`,
          label: 'Minor course option',
          credits: Math.min(4, creditsToPlan - index * 4),
          category: 'elective',
          courseIds: alternatives,
          source: 'minor',
          guidance: requirement.optionLabel ?? 'Choose coursework that satisfies this minor requirement.',
        }, alternatives)
      }
    }
  }
  return { ...plan, years }
}

export function degreeYearLabel(degreeType: DegreeType, year: CurriculumPlan['years'][number]['year']): string {
  if (degreeType === 'ast-to-bs') return year === 'junior' ? '1st year' : '2nd year'
  return year
}

const catalogEntries: Course[] = Object.entries(parsedCatalog.courses).map(([id, course]) => {
  if (id !== canonicalCourseId(id)) throw new Error(`Course catalog ID must be canonical: ${id}`)
  return {
    id,
    code: course.code,
    aliases: [course.code, course.code.replace(' ', '')],
    name: course.title,
    units: course.credits.minimum,
    maximumUnits: course.credits.maximum,
    teachingStatus: course.teachingStatus,
    description: course.description,
    offeredTerms: course.offered && 'terms' in course.offered ? course.offered.terms : undefined,
    prerequisites: course.prerequisites ?? [],
    corequisites: [...(course.corequisites ?? []), ...inferredCorequisites(course.prerequisiteNotes ?? [])],
    prerequisiteNotes: course.prerequisiteNotes ?? [],
    placeholder: course.placeholder,
    minimumStanding: course.minimumStanding,
  }
})

export const coursesById = new Map(catalogEntries.map(course => [course.id, course]))

function derivedCategory(courseId: string): Category {
  if (courseId.startsWith('MATH-')) return 'math'
  if (courseId.startsWith('FYS-')) return 'ge-lower'
  if (courseId.startsWith('CST-')) return 'cst'
  return 'elective'
}

interface DerivedOptionSlot {
  slot: PlanSlot
  courseIds: string[]
  minimumTermIndex?: number
}

/**
 * CSUMB's catalog-wide GE pattern. Staff-verified roadmaps keep their own
 * placement; this is applied only while generating a draft roadmap.
 */
function generalEducationSlots(): DerivedOptionSlot[] {
  const lowerDivision = [
    ['ge-1-lower-division', 'GE Area 1: English Communication'],
    ['ge-2-lower-division', 'GE Area 2: Mathematical Concepts & Quantitative Reasoning'],
    ['ge-3-lower-division', 'GE Area 3: Arts & Humanities'],
    ['ge-4-lower-division', 'GE Area 4: Social & Behavioral Sciences'],
    ['ge-5-lower-division', 'GE Area 5: Physical & Biological Sciences'],
    ['ge-6-lower-division', 'GE Area 6: Ethnic Studies'],
  ] as const
  const lowerSlots = lowerDivision.map(([slotId, label]): DerivedOptionSlot => ({
    courseIds: [],
    slot: {
      type: 'requirement',
      slotId,
      label,
      credits: 3,
      category: 'ge-lower',
      guidance: `Complete a lower-division ${label.replace('GE ', '')} course.`,
    },
  }))
  return [
    ...lowerSlots,
    ...[
      ['ge-upper-2-or-5', 'Upper-Division GE Area 2 or Area 5'],
      ['ge-upper-3', 'Upper-Division GE Area 3'],
      ['ge-upper-4', 'Upper-Division GE Area 4'],
    ].map(([slotId, label]): DerivedOptionSlot => ({
      courseIds: [],
      minimumTermIndex: 4,
      slot: {
        type: 'requirement',
        slotId,
        label,
        credits: 3,
        category: 'ge-upper',
        guidance: `Complete an ${label.toLowerCase()} course.`,
      },
    })),
  ]
}

/**
 * Produces an explicitly draft roadmap for catalog programs that have requirements but no
 * staff-verified sequence. It only orders courses against prerequisites that are also in
 * the program requirements; outside preparation is left for advisor review.
 */
function deriveRoadmap(programId: string, catalogVersion: string): CurriculumPlan {
  const program = getProgram(programId, catalogVersion)
  if (!program) return { schemaVersion: 1, years: [] }

  const requiredCourseIds = new Set(program.requirements
    .filter(requirement => requirement.completion.kind === 'all')
    .flatMap(requirementCourseIds))
  const plannedRequiredCourseIds = new Set(requiredCourseIds)
  const deferredCourseIds = [...requiredCourseIds].filter(courseId => getCourse(courseId)?.code.endsWith('499'))
  deferredCourseIds.forEach(courseId => requiredCourseIds.delete(courseId))
  const scheduled = new Set<string>()
  const terms: { term: AcademicTerm; slots: PlanSlot[] }[] = []
  const yearNames: CurriculumPlan['years'][number]['year'][] = ['freshman', 'sophomore', 'junior', 'senior']

  for (let termIndex = 0; requiredCourseIds.size > 0 && termIndex < 8; termIndex += 1) {
    const term: AcademicTerm = termIndex % 2 === 0 ? 'fall' : 'spring'
    let credits = 0
    const slots: PlanSlot[] = []
    const candidates = [...requiredCourseIds].sort((left, right) => Number(left.startsWith('FYS-')) * -1 || left.localeCompare(right))
    for (const courseId of candidates) {
      if (!requiredCourseIds.has(courseId)) continue
      const course = getCourse(courseId)
      const corequisiteIds = course ? courseCorequisiteIds(courseId).filter(corequisiteId => requiredCourseIds.has(corequisiteId)) : []
      const bundleCourseIds = [courseId, ...corequisiteIds]
      const bundleCourses = bundleCourseIds.map(candidateId => getCourse(candidateId))
      if (bundleCourses.some(candidate => !candidate) || bundleCourses.some((_, index) => !isCourseOffered(bundleCourseIds[index], term))) continue
      if (credits + bundleCourses.reduce((total, candidate) => total + candidate!.units, 0) > 15) continue
      if (bundleCourses.some(candidate => candidate!.minimumStanding === 'junior' && termIndex < 4)) continue
      const canScheduleBundle = bundleCourseIds.every(candidateId => {
        const candidate = getCourse(candidateId)
        if (!candidate) return false
        const corequisites = new Set(courseCorequisiteIds(candidateId))
          const requiredEarlier = [...prerequisiteCourseIds(candidate.prerequisites)]
          .filter(prerequisiteId => !corequisites.has(prerequisiteId) && plannedRequiredCourseIds.has(prerequisiteId))
        return requiredEarlier.every(prerequisiteId => scheduled.has(prerequisiteId))
      })
      if (!canScheduleBundle) continue
      for (const bundleCourseId of bundleCourseIds) {
        const bundleCourse = getCourse(bundleCourseId)
        if (!bundleCourse) continue
        slots.push({ type: 'course', courseId: bundleCourseId, credits: bundleCourse.units, category: derivedCategory(bundleCourseId) })
        credits += bundleCourse.units
        requiredCourseIds.delete(bundleCourseId)
      }
    }
    slots.forEach(slot => {
      if (slot.type === 'course') scheduled.add(slot.courseId)
    })
    terms.push({ term, slots })
  }

  if (deferredCourseIds.length > 0) {
    const finalTerm = terms.at(-1) ?? { term: 'spring' as const, slots: [] }
    for (const courseId of deferredCourseIds) {
      const course = getCourse(courseId)
      if (course) finalTerm.slots.push({ type: 'course', courseId, credits: course.units, category: derivedCategory(courseId) })
    }
    if (terms.length === 0) terms.push(finalTerm)
  }

  while (terms.length < 8) terms.push({ term: terms.length % 2 === 0 ? 'fall' : 'spring', slots: [] })

  const optionSlots: DerivedOptionSlot[] = []
  for (const requirement of program.requirements) {
    if (requirement.completion.kind === 'choose') {
      optionSlots.push({
        courseIds: requirementCourseIds(requirement),
        slot: {
          type: 'choice' as const,
          slotId: `derived-${requirement.id}`,
          alternatives: requirementCourseIds(requirement),
          credits: getCourse(requirement.courseIds[0])?.units ?? 4,
          category: 'elective' as const,
          guidance: `Choose ${requirement.completion.count} course${requirement.completion.count === 1 ? '' : 's'} that satisfies this requirement.`,
        },
      })
    }
    if (requirement.completion.kind === 'minimumCredits') {
      for (let index = 0; index < Math.ceil(requirement.completion.credits / 4); index += 1) {
        optionSlots.push({
          courseIds: requirementCourseIds(requirement),
          slot: {
            type: 'requirement',
            slotId: `derived-${requirement.id}-${index + 1}`,
            label: 'Program elective',
            credits: 4,
            category: 'elective',
            guidance: 'Choose coursework that satisfies this program requirement.',
          },
        })
      }
    }
  }
  optionSlots.push(...generalEducationSlots())
  for (const { slot, courseIds, minimumTermIndex } of optionSlots) {
    const targetTerm = terms.find((candidateTerm, termIndex) => {
      if (termIndex < (minimumTermIndex ?? 0)) return false
      const credits = candidateTerm.slots.reduce((total, candidate) => total + candidate.credits, 0)
      if (credits + slot.credits > 15) return false
      if (courseIds.length === 0) return true
      const completedBeforeTerm = new Set(terms
        .slice(0, termIndex)
        .flatMap(term => term.slots)
        .flatMap(candidate => candidate.type === 'course' ? [candidate.courseId] : []))
      return courseIds.some(courseId => {
        const course = getCourse(courseId)
        if (!course || !isCourseOffered(courseId, candidateTerm.term)) return false
        if (course.minimumStanding === 'junior' && termIndex < 4) return false
        const plannedPrerequisites = [...prerequisiteCourseIds(course.prerequisites)].filter(prerequisiteId => scheduled.has(prerequisiteId))
        return plannedPrerequisites.every(prerequisiteId => completedBeforeTerm.has(prerequisiteId))
      })
    })
    const fallbackTerm = terms.at(-1) ?? { term: 'fall' as const, slots: [] }
    if (!terms.includes(fallbackTerm)) terms.push(fallbackTerm)
    const destinationTerm = targetTerm ?? fallbackTerm
    destinationTerm.slots.push(slot)
  }

  return {
    schemaVersion: 1,
    years: terms.slice(0, 8).reduce<CurriculumPlan['years']>((years, term, index) => {
      const year = yearNames[Math.floor(index / 2)]
      const current = years.at(-1)
      if (current?.year === year) current.terms.push(term)
      else years.push({ year, terms: [term] })
      return years
    }, []),
  }
}

const programCourseIds = Object.values(programs.programs).flatMap(program => [
  ...program.requirements.flatMap(requirement => requirement.courseIds),
  ...Object.values(program.concentrations).flatMap(concentration => concentration.requirements.flatMap(requirement => requirement.courseIds)),
])

const minorCourseIds = Object.values(minors.catalogVersions)
  .flatMap(catalog => Object.values(catalog.minors))
  .flatMap(minor => minor.requirements.flatMap(requirement => requirement.courseIds))

for (const courseId of [...programCourseIds, ...minorCourseIds]) {
  if (!coursesById.has(courseId)) throw new Error(`Program requirement references unknown course: ${courseId}`)
}

export function getCatalogVersion(catalogVersion: string = defaultCatalogVersion): CatalogVersion | undefined {
  return catalogVersions[catalogVersion]
}

export function getCatalogMetadata(catalogVersion: string = defaultCatalogVersion): CatalogMetadata | undefined {
  return catalogMetadata[catalogVersion]
}

export function getDegreeCatalogEntry(programId: string, catalogVersion: string = defaultCatalogVersion): DegreeCatalogEntry | undefined {
  return degreeRecords.get(`${catalogVersion}/${programId}`)
}

export function getProgram(programId: string, catalogVersion: string = defaultCatalogVersion): Program | undefined {
  return getCatalogVersion(catalogVersion)?.programs[programId]
}

export function getConcentration(programId: string, concentrationId: string | null | undefined, catalogVersion: string = defaultCatalogVersion): Concentration | undefined {
  if (!concentrationId) return undefined
  return getProgram(programId, catalogVersion)?.concentrations[concentrationId]
}

export function minorsForCatalog(catalogVersion: string = defaultCatalogVersion): Record<string, Minor> {
  return minors.catalogVersions[catalogVersion]?.minors ?? {}
}

export function getMinor(minorId: string | null | undefined, catalogVersion: string = defaultCatalogVersion): Minor | undefined {
  if (!minorId) return undefined
  return minorsForCatalog(catalogVersion)[minorId]
}

export function minorRequirements(minorId: string | null | undefined, catalogVersion: string = defaultCatalogVersion): Requirement[] {
  return getMinor(minorId, catalogVersion)?.requirements ?? []
}

export function activeProgramRequirements(programId: string, concentrationId: string | null | undefined, catalogVersion: string = defaultCatalogVersion): Requirement[] {
  const program = getProgram(programId, catalogVersion)
  if (!program) return []
  const concentration = getConcentration(programId, concentrationId, catalogVersion)
  return concentration ? [...program.requirements, ...concentration.requirements] : [...program.requirements]
}

export function concentrationRequirements(programId: string, concentrationId: string | null | undefined, catalogVersion: string = defaultCatalogVersion): Requirement[] {
  return getConcentration(programId, concentrationId, catalogVersion)?.requirements ?? []
}

export function requirementCourseIds(requirement: Requirement): string[] {
  return requirement.courseIds.map(canonicalCourseId)
}

export function directRequirementCourseIds(requirements: Requirement[]): Set<string> {
  return new Set(requirements.filter(requirement => requirement.completion.kind === 'all').flatMap(requirementCourseIds))
}

export function candidateCourseIds(requirements: Requirement[]): Set<string> {
  return new Set(requirements.flatMap(requirementCourseIds))
}

export function getCourse(value: string): Course | undefined {
  return coursesById.get(canonicalCourseId(value))
}

export function courseCorequisiteIds(courseId: string): string[] {
  return [...new Set(prerequisiteCourseIds(getCourse(courseId)?.corequisites ?? []))]
}

export function isCourseOffered(courseId: string, term: AcademicTerm): boolean {
  const offeredTerms = getCourse(courseId)?.offeredTerms
  return !offeredTerms || offeredTerms.includes(term)
}

export function slotLabel(slot: PlanSlot): string {
  if (slot.type === 'course') return getCourse(slot.courseId)?.code ?? slot.courseId
  if (slot.type === 'choice') return slot.alternatives.map(alternative => getCourse(alternative)?.code ?? alternative).join(' or ')
  return slot.label
}

export function summarizePlanCredits(plan: CurriculumPlan): PlanCreditSummary {
  return plan.years.reduce<PlanCreditSummary>((summary, year) => {
    for (const term of year.terms) {
      for (const slot of term.slots) {
        summary.total += slot.credits
        if (slot.category === 'ge-lower') summary.lowerDivisionGeneralEducation += slot.credits
        else if (slot.category === 'ge-upper') summary.upperDivisionGeneralEducation += slot.credits
        else summary.major += slot.credits
      }
    }
    return summary
  }, {
    total: 0,
    major: 0,
    lowerDivisionGeneralEducation: 0,
    upperDivisionGeneralEducation: 0,
  })
}

export function remainingPlanCredits(plan: CurriculumPlan, completed: ReadonlySet<string>, courseAssignments: ReadonlyMap<string, string> = new Map()): number {
  return plan.years.reduce((remaining, year) => remaining + year.terms.reduce((termRemaining, term) => termRemaining + term.slots.reduce((slotRemaining, slot) => {
    return isPlanSlotCompleted(slot, completed, courseAssignments) ? slotRemaining : slotRemaining + slot.credits
  }, 0), 0), 0)
}

function isPlanSlotCompleted(slot: PlanSlot, completed: ReadonlySet<string>, courseAssignments: ReadonlyMap<string, string>): boolean {
  const resolvedCourseId = courseAssignments.get(progressKey(slot))
  const completionKey = resolvedCourseId ? `course:${resolvedCourseId}` : progressKey(slot)
  return completed.has(progressKey(slot)) || completed.has(completionKey)
}

export function progressKey(slot: PlanSlot): string {
  return slot.type === 'course' ? `course:${slot.courseId}` : `slot:${slot.slotId}`
}

export function prerequisiteText(prerequisite: unknown): string {
  return formatPrerequisite(prerequisite)
}

function formatPrerequisite(prerequisite: unknown, parentOperator?: 'and' | 'or'): string {
  if (!prerequisite || typeof prerequisite !== 'object') return 'Prerequisite details unavailable.'
  const value = prerequisite as { courseId?: string; minimumGrade?: string; allOf?: unknown[]; anyOf?: unknown[] }
  if (value.courseId) {
    const course = getCourse(value.courseId)
    return `${course?.code ?? value.courseId}${value.minimumGrade ? ` (${value.minimumGrade} or better)` : ''}`
  }
  if (value.allOf) return formatGroup(value.allOf, 'and', parentOperator)
  if (value.anyOf) return formatGroup(value.anyOf, 'or', parentOperator)
  return 'Prerequisite details unavailable.'
}

function formatGroup(prerequisites: unknown[], operator: 'and' | 'or', parentOperator?: 'and' | 'or'): string {
  const text = prerequisites.map(prerequisite => formatPrerequisite(prerequisite, operator)).join(` ${operator} `)
  return parentOperator && parentOperator !== operator ? `(${text})` : text
}

export function prerequisitesMet(prerequisites: readonly unknown[], completedCourseIds: ReadonlySet<string>): boolean {
  return prerequisites.every(prerequisiteMet)

  function prerequisiteMet(prerequisite: unknown): boolean {
    if (!prerequisite || typeof prerequisite !== 'object') return false
    const value = prerequisite as { courseId?: string; allOf?: unknown[]; anyOf?: unknown[] }
    if (value.courseId) return completedCourseIds.has(canonicalCourseId(value.courseId))
    if (value.allOf) return value.allOf.every(prerequisiteMet)
    if (value.anyOf) return value.anyOf.some(prerequisiteMet)
    return false
  }
}

export function prerequisiteCount(prerequisites: unknown[]): number {
  return prerequisites.reduce<number>((count, prerequisite) => count + countPrerequisiteCourses(prerequisite), 0)
}

function countPrerequisiteCourses(prerequisite: unknown): number {
  if (!prerequisite || typeof prerequisite !== 'object') return 0
  const value = prerequisite as { courseId?: string; allOf?: unknown[]; anyOf?: unknown[] }
  if (value.courseId) return 1
  if (value.allOf) return value.allOf.reduce<number>((count, item) => count + countPrerequisiteCourses(item), 0)
  if (value.anyOf) return value.anyOf.reduce<number>((count, item) => count + countPrerequisiteCourses(item), 0)
  return 0
}

export function prerequisiteCourseIds(prerequisites: unknown[]): Set<string> {
  const ids = new Set<string>()
  for (const prerequisite of prerequisites) collectPrerequisiteCourseIds(prerequisite, ids)
  return ids
}

function collectPrerequisiteCourseIds(prerequisite: unknown, ids: Set<string>) {
  if (!prerequisite || typeof prerequisite !== 'object') return
  const value = prerequisite as { courseId?: string; allOf?: unknown[]; anyOf?: unknown[] }
  if (value.courseId) ids.add(canonicalCourseId(value.courseId))
  if (value.allOf) value.allOf.forEach(item => collectPrerequisiteCourseIds(item, ids))
  if (value.anyOf) value.anyOf.forEach(item => collectPrerequisiteCourseIds(item, ids))
}
