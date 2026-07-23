import { describe, expect, it } from 'vitest'
import { curriculumPlan, progressKey } from './Curriculum'
import { buildSuggestedSchedule } from './Scheduling'

describe('suggested scheduling', () => {
  it('highlights a prerequisite-aware course without marking it as stretch', () => {
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set())
    const math170 = curriculumPlan.years[0].terms[1].slots[1]

    expect(schedule.suggestions.get(progressKey(math170))?.kind).toBe('standard')
    expect(schedule.isHighPriority(math170)).toBe(true)
  })

  it('does not recommend a course with unmet prerequisites', () => {
    const dataStructures = curriculumPlan.years[0].terms[1].slots[0]
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set())

    expect(schedule.isCourseReady(dataStructures)).toBe(false)
    expect(schedule.suggestions.has(progressKey(dataStructures))).toBe(false)
  })

  it('prioritizes concentration prereq courses in elective-pre-req slots', () => {
    const completed = new Set(['course:CST-231', 'course:CST-238', 'course:MATH-130'])
    const schedule = buildSuggestedSchedule(curriculumPlan, completed, { programId: 'bs-computer-science', concentrationId: 'data-science' })
    const electivePrereqSlot = curriculumPlan.years[2].terms[0].slots[3]

    expect(schedule.suggestions.get(progressKey(electivePrereqSlot))?.courseId).toBe('CST-383')
    expect(schedule.suggestions.get(progressKey(electivePrereqSlot))?.kind).toBe('standard')
    expect(schedule.isHighPriority(electivePrereqSlot)).toBe(true)
  })
})
