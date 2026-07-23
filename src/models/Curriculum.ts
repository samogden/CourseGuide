import { parse } from 'yaml'
import { z } from 'zod'
import catalogText from '../assets/courses.yaml?raw'
import overridesText from '../assets/course-overrides.yaml?raw'
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

const overrideSchema = z.object({
  courses: z.record(z.string(), z.object({ code: z.string(), name: z.string(), units: z.number(), description: z.string().optional(), prereqs: z.array(prerequisiteSchema).optional() })),
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
const parsedOverrides = overrideSchema.parse(parse(overridesText))

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
    placeholder: false,
  }
})

const placeholderEntries: Course[] = Object.entries(parsedOverrides.courses).map(([id, course]) => ({
  id: canonicalCourseId(id),
  code: course.code,
  aliases: [course.code, course.code.replace(' ', '')],
  name: course.name,
  units: course.units,
  description: course.description,
  prerequisites: course.prereqs ?? [],
  prerequisiteNotes: [],
  placeholder: true,
}))

export const curriculumPlan: CurriculumPlan = planSchema.parse(parse(planText))
export const coursesById = new Map([...catalogEntries, ...placeholderEntries].map(course => [course.id, course]))

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
  if (!prerequisite || typeof prerequisite !== 'object') return 'Prerequisite details unavailable.'
  const value = prerequisite as { course?: string; min_grade?: string; all_of?: unknown[]; any_of?: unknown[] }
  if (value.course) {
    const course = getCourse(value.course)
    return `${course?.code ?? value.course}${value.min_grade ? ` (${value.min_grade} or better)` : ''}`
  }
  if (value.all_of) return value.all_of.map(prerequisiteText).join(' and ')
  if (value.any_of) return value.any_of.map(prerequisiteText).join(' or ')
  return 'Prerequisite details unavailable.'
}
