import { parse } from 'yaml'
import { z } from 'zod'
import catalogText from '../assets/courses.yaml?raw'
import planText from '../assets/scd-curriculum.yaml?raw'
import programsText from '../assets/programs.yaml?raw'

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
  credits: z.object({ minimum: z.number().positive(), maximum: z.number().positive() }).strict().refine(value => value.minimum <= value.maximum),
  description: z.string().optional(),
  offered: z.union([
    z.object({ terms: z.array(z.enum(['fall', 'spring'])).min(1) }).strict(),
    z.object({ availability: z.literal('periodic') }).strict(),
  ]).optional(),
  prerequisites: z.array(prerequisiteSchema).optional(),
  corequisites: z.array(prerequisiteSchema).optional(),
  prerequisiteNotes: z.array(z.string()).optional(),
  placeholder: z.boolean().default(false),
}).strict()

const planSlotSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('course'), courseId: z.string(), credits: z.number().positive(), category: categorySchema }),
  z.object({ type: z.literal('requirement'), slotId: z.string(), label: z.string(), credits: z.number().positive(), category: categorySchema, guidance: z.string() }),
  z.object({ type: z.literal('choice'), slotId: z.string(), alternatives: z.array(z.string()).min(2), credits: z.number().positive(), category: categorySchema, guidance: z.string() }),
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
  courseIds: z.array(z.string()).min(1),
}).strict()

const programsSchema = z.object({
  schemaVersion: z.literal(2),
  programs: z.record(z.string(), z.object({
    title: z.string(),
    requirements: z.array(requirementSchema),
    concentrations: z.record(z.string(), z.object({ title: z.string(), requirements: z.array(requirementSchema) }).strict()),
  }).strict()),
  catalogVersions: z.record(z.string(), z.object({
    title: z.string(),
    programs: z.record(z.string(), z.object({
      title: z.string(),
      requirements: z.array(requirementSchema),
      concentrations: z.record(z.string(), z.object({ title: z.string(), requirements: z.array(requirementSchema) }).strict()),
    }).strict()),
  }).strict()),
}).strict()

export type Category = z.infer<typeof categorySchema>
export type AcademicTerm = 'fall' | 'spring'
export type PlanSlot = z.infer<typeof planSlotSchema>
export type CurriculumPlan = z.infer<typeof planSchema>
export type Programs = z.infer<typeof programsSchema>
export type CatalogVersion = Programs['catalogVersions'][string]
export type Requirement = z.infer<typeof requirementSchema>
export type Program = Programs['programs'][string]
export type Concentration = Program['concentrations'][string]

export const defaultCatalogVersion = '2026'

export interface Course {
  id: string
  code: string
  aliases: string[]
  name: string
  units: number
  teachingStatus: 'active' | 'inactive'
  description?: string
  offeredTerms?: readonly AcademicTerm[]
  prerequisites: unknown[]
  prerequisiteNotes: string[]
  placeholder: boolean
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

const parsedCatalog = z.object({ schemaVersion: z.literal(1), courses: z.record(z.string(), courseSchema) }).strict().parse(parse(catalogText))
export const curriculumPlan: CurriculumPlan = planSchema.parse(parse(planText))
export const programs: Programs = programsSchema.parse(parse(programsText))
export const catalogVersions = programs.catalogVersions

const catalogEntries: Course[] = Object.entries(parsedCatalog.courses).map(([id, course]) => {
  if (id !== canonicalCourseId(id)) throw new Error(`Course catalog ID must be canonical: ${id}`)
  return {
    id,
    code: course.code,
    aliases: [course.code, course.code.replace(' ', '')],
    name: course.title,
    units: course.credits.minimum,
    teachingStatus: course.teachingStatus,
    description: course.description,
    offeredTerms: course.offered && 'terms' in course.offered ? course.offered.terms : undefined,
    prerequisites: course.prerequisites ?? [],
    prerequisiteNotes: course.prerequisiteNotes ?? [],
    placeholder: course.placeholder,
  }
})

export const coursesById = new Map(catalogEntries.map(course => [course.id, course]))

const programCourseIds = Object.values(programs.programs).flatMap(program => [
  ...program.requirements.flatMap(requirement => requirement.courseIds),
  ...Object.values(program.concentrations).flatMap(concentration => concentration.requirements.flatMap(requirement => requirement.courseIds)),
])

for (const courseId of programCourseIds) {
  if (!coursesById.has(courseId)) throw new Error(`Program requirement references unknown course: ${courseId}`)
}

export function getCatalogVersion(catalogVersion: string = defaultCatalogVersion): CatalogVersion | undefined {
  return catalogVersions[catalogVersion]
}

export function getProgram(programId: string, catalogVersion: string = defaultCatalogVersion): Program | undefined {
  return getCatalogVersion(catalogVersion)?.programs[programId]
}

export function getConcentration(programId: string, concentrationId: string | null | undefined, catalogVersion: string = defaultCatalogVersion): Concentration | undefined {
  if (!concentrationId) return undefined
  return getProgram(programId, catalogVersion)?.concentrations[concentrationId]
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
  return completed.has(completionKey)
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

export function prerequisitesMet(prerequisites: unknown[], completedCourseIds: ReadonlySet<string>): boolean {
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
