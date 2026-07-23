import { parse } from 'yaml'
import { z } from 'zod'
import catalogText from '../assets/courses.yaml?raw'
import planText from '../assets/scd-curriculum.yaml?raw'

const categorySchema = z.enum([
  'cst',
  'math',
  'ge-lower',
  'ge-upper',
  'elective-prereq',
  'elective',
])

const prerequisiteSchema: z.ZodType<unknown> = z.lazy(() => z.object({
  course: z.string().optional(),
  min_grade: z.string().optional(),
  all_of: z.array(prerequisiteSchema).optional(),
  any_of: z.array(prerequisiteSchema).optional(),
}).passthrough())

const sourceCourseSchema = z.object({
  name: z.string(),
  units: z.union([z.number(), z.string()]),
  description: z.string().optional(),
  prereqs: z.array(prerequisiteSchema).optional(),
  prereq_notes: z.array(z.string()).optional(),
  placeholder: z.boolean().default(false),
}).passthrough()

const planSlotSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('course'), courseId: z.string(), credits: z.number().positive(), category: categorySchema }),
  z.object({ type: z.literal('requirement'), slotId: z.string(), label: z.string(), credits: z.number().positive(), category: categorySchema, guidance: z.string() }),
  z.object({ type: z.literal('choice'), slotId: z.string(), alternatives: z.array(z.string()).min(2), credits: z.number().positive(), category: categorySchema, guidance: z.string() }),
])

const planSchema = z.object({
  years: z.array(z.object({
    year: z.enum(['freshman', 'sophomore', 'junior', 'senior']),
    terms: z.array(z.object({ term: z.enum(['fall', 'spring']), slots: z.array(planSlotSchema) })),
  })),
})

export type Category = z.infer<typeof categorySchema>
export type PlanSlot = z.infer<typeof planSlotSchema>
export type CurriculumPlan = z.infer<typeof planSchema>

export interface Course {
  id: string
  code: string
  aliases: string[]
  name: string
  units: number
  description?: string
  prerequisites: unknown[]
  prerequisiteNotes: string[]
  placeholder: boolean
}

export function canonicalCourseId(value: string): string {
  const compact = value.trim().toUpperCase().replace(/[\s-]+/g, '')
  const match = compact.match(/^([A-Z]+)(\d+)([A-Z]*)$/)
  return match ? `${match[1]}-${match[2]}${match[3]}` : compact
}

const parsedCatalog = z.object({ courses: z.object({ catalog: z.record(z.string(), sourceCourseSchema) }) }).parse(parse(catalogText))

const catalogEntries: Course[] = Object.entries(parsedCatalog.courses.catalog).map(([code, course]) => {
  const id = canonicalCourseId(code)
  const units = typeof course.units === 'number' ? course.units : Number.parseInt(course.units, 10)
  return {
    id,
    code,
    aliases: [code, code.replace(' ', '')],
    name: course.name,
    units,
    description: course.description,
    prerequisites: course.prereqs ?? [],
    prerequisiteNotes: course.prereq_notes ?? [],
    placeholder: course.placeholder,
  }
})

export const curriculumPlan: CurriculumPlan = planSchema.parse(parse(planText))
export const coursesById = new Map(catalogEntries.map(course => [course.id, course]))

export function getCourse(value: string): Course | undefined {
  return coursesById.get(canonicalCourseId(value))
}

export function slotLabel(slot: PlanSlot): string {
  if (slot.type === 'course') return getCourse(slot.courseId)?.code ?? slot.courseId
  if (slot.type === 'choice') return slot.alternatives.map(alternative => getCourse(alternative)?.code ?? alternative).join(' or ')
  return slot.label
}

export function progressKey(slot: PlanSlot): string {
  return slot.type === 'course' ? `course:${slot.courseId}` : `slot:${slot.slotId}`
}

export function prerequisiteText(prerequisite: unknown): string {
  return formatPrerequisite(prerequisite)
}

function formatPrerequisite(prerequisite: unknown, parentOperator?: 'and' | 'or'): string {
  if (!prerequisite || typeof prerequisite !== 'object') return 'Prerequisite details unavailable.'
  const value = prerequisite as { course?: string; min_grade?: string; all_of?: unknown[]; any_of?: unknown[] }
  if (value.course) {
    const course = getCourse(value.course)
    return `${course?.code ?? value.course}${value.min_grade ? ` (${value.min_grade} or better)` : ''}`
  }
  if (value.all_of) return formatGroup(value.all_of, 'and', parentOperator)
  if (value.any_of) return formatGroup(value.any_of, 'or', parentOperator)
  return 'Prerequisite details unavailable.'
}

function formatGroup(prerequisites: unknown[], operator: 'and' | 'or', parentOperator?: 'and' | 'or'): string {
  const text = prerequisites.map(prerequisite => formatPrerequisite(prerequisite, operator)).join(` ${operator} `)
  return parentOperator && parentOperator !== operator ? `(${text})` : text
}

export function prerequisitesMet(prerequisites: unknown[], completedCourseIds: Set<string>): boolean {
  return prerequisites.every(prerequisiteMet)

  function prerequisiteMet(prerequisite: unknown): boolean {
    if (!prerequisite || typeof prerequisite !== 'object') return false
    const value = prerequisite as { course?: string; all_of?: unknown[]; any_of?: unknown[] }
    if (value.course) return completedCourseIds.has(canonicalCourseId(value.course))
    if (value.all_of) return value.all_of.every(prerequisiteMet)
    if (value.any_of) return value.any_of.some(prerequisiteMet)
    return false
  }
}

export function prerequisiteCount(prerequisites: unknown[]): number {
  return prerequisites.reduce<number>((count, prerequisite) => count + countPrerequisiteCourses(prerequisite), 0)
}

export function prerequisiteCourseIds(prerequisites: unknown[]): Set<string> {
  const ids = new Set<string>()
  for (const prerequisite of prerequisites) collectPrerequisiteCourseIds(prerequisite, ids)
  return ids
}

function collectPrerequisiteCourseIds(prerequisite: unknown, ids: Set<string>) {
  if (!prerequisite || typeof prerequisite !== 'object') return
  const value = prerequisite as { course?: string; all_of?: unknown[]; any_of?: unknown[] }
  if (value.course) ids.add(canonicalCourseId(value.course))
  if (value.all_of) value.all_of.forEach(item => collectPrerequisiteCourseIds(item, ids))
  if (value.any_of) value.any_of.forEach(item => collectPrerequisiteCourseIds(item, ids))
}

function countPrerequisiteCourses(prerequisite: unknown): number {
  if (!prerequisite || typeof prerequisite !== 'object') return 0
  const value = prerequisite as { course?: string; all_of?: unknown[]; any_of?: unknown[] }
  if (value.course) return 1
  if (value.all_of) return value.all_of.reduce<number>((count, item) => count + countPrerequisiteCourses(item), 0)
  if (value.any_of) return value.any_of.reduce<number>((count, item) => count + countPrerequisiteCourses(item), 0)
  return 0
}
