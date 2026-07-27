import { getCourse, isCourseOffered, type AcademicTerm, type PlanSlot } from './Curriculum'

export interface PreparationTerm {
  term: AcademicTerm
  slots: PlanSlot[]
}

const maximumCreditsPerTerm = 15

function categoryForCourse(courseId: string): 'cst' | 'math' {
  return courseId.startsWith('MATH-') ? 'math' : 'cst'
}

/**
 * Places optional transfer refreshers before the upper-division roadmap. These
 * courses are refreshers, not missing prerequisites: AS-T transfer credit is
 * still assumed by the degree scheduler.
 */
export function buildPreparationTerms(courseIds: Iterable<string>, startTerm: AcademicTerm = 'fall'): PreparationTerm[] {
  const pending = [...new Set(courseIds)]
    .map(courseId => getCourse(courseId))
    .filter((course): course is NonNullable<typeof course> => Boolean(course))
  const terms: PreparationTerm[] = []
  let term = startTerm

  while (pending.length > 0) {
    const slots: PlanSlot[] = []
    let credits = 0

    for (let index = 0; index < pending.length;) {
      const course = pending[index]
      if (!course || !isCourseOffered(course.id, term) || credits + course.units > maximumCreditsPerTerm) {
        index += 1
        continue
      }
      slots.push({ type: 'course', courseId: course.id, credits: course.units, category: categoryForCourse(course.id) })
      credits += course.units
      pending.splice(index, 1)
    }

    if (slots.length > 0) terms.push({ term, slots })
    term = term === 'fall' ? 'spring' : 'fall'
  }

  return terms
}

export function preparationCredits(courseIds: Iterable<string>, completed: ReadonlySet<string>): number {
  return [...new Set(courseIds)].reduce((total, courseId) => {
    const course = getCourse(courseId)
    return total + (course && !completed.has(`course:${course.id}`) ? course.units : 0)
  }, 0)
}
