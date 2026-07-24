import { describe, expect, it } from 'vitest'
import { curriculumPlan, progressKey, type CurriculumPlan } from './Curriculum'
import { buildSuggestedSchedule } from './Scheduling'

describe('suggested scheduling', () => {
  it('keeps the early prerequisite-driven course visible and standard', () => {
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set())
    const cst286 = curriculumPlan.years[0].terms[0].slots[3]

    expect(schedule.suggestions.get(progressKey(cst286))?.kind).toBe('standard')
    expect(schedule.isHighPriority(cst286)).toBe(true)
  })

  it('does not recommend a later course with unmet prerequisites', () => {
    const softwareEngineering = curriculumPlan.years[2].terms[0].slots[1]
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set())

    expect(schedule.isCourseReady(softwareEngineering)).toBe(false)
    expect(schedule.suggestions.has(progressKey(softwareEngineering))).toBe(false)
  })

  it('assigns a concentration-specific prereq course to a generic slot', () => {
    const miniPlan = {
      schemaVersion: 1,
      years: [
        {
          year: 'freshman',
          terms: [
            {
              term: 'fall',
              slots: [
                {
                  type: 'requirement',
                  slotId: 'elective-prereq-slot',
                  label: 'Elective Pre-req',
                  credits: 4,
                  category: 'elective-prereq',
                  guidance: 'Choose a prerequisite-bearing elective.',
                },
              ],
            },
          ],
        },
      ],
    } as unknown as CurriculumPlan

    const completed = new Set(['course:CST-231', 'course:CST-238', 'course:MATH-130'])
    const schedule = buildSuggestedSchedule(miniPlan, completed, { programId: 'bs-computer-science', concentrationId: 'data-science' })
    const electivePrereqSlot = miniPlan.years[0].terms[0].slots[0]

    expect(schedule.suggestions.get(progressKey(electivePrereqSlot))?.courseId).toBe('CST-383')
    expect(schedule.suggestions.get(progressKey(electivePrereqSlot))?.kind).toBe('standard')
  })

  it('fills later elective slots differently for each concentration', () => {
    const dataScience = buildSuggestedSchedule(curriculumPlan, new Set(), {
      programId: 'bs-computer-science',
      concentrationId: 'data-science',
    })
    const networkSecurity = buildSuggestedSchedule(curriculumPlan, new Set(), {
      programId: 'bs-computer-science',
      concentrationId: 'network-security',
    })
    const juniorFallElectivePrerequisite = curriculumPlan.years[2].terms[0].slots[3]

    expect(dataScience.assignments.get(progressKey(juniorFallElectivePrerequisite))).toBe('CST-383')
    expect(networkSecurity.assignments.get(progressKey(juniorFallElectivePrerequisite))).toBe('CST-311')
  })

  it('keeps a completed path course in its assigned elective slot', () => {
    const completed = new Set(['course:CST-383'])
    const schedule = buildSuggestedSchedule(curriculumPlan, completed, {
      programId: 'bs-computer-science',
      concentrationId: 'data-science',
    })
    const juniorFallElectivePrerequisite = curriculumPlan.years[2].terms[0].slots[3]

    expect(schedule.assignments.get(progressKey(juniorFallElectivePrerequisite))).toBe('CST-383')
  })

  it('shows concentration elective choices instead of selecting arbitrary electives', () => {
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set(), {
      programId: 'bs-computer-science',
      concentrationId: 'data-science',
    })
    const seniorFallElective = curriculumPlan.years[3].terms[0].slots[0]

    expect(schedule.assignments.has(progressKey(seniorFallElective))).toBe(false)
    expect(schedule.pathOptions.get(progressKey(seniorFallElective))).toEqual({
      label: 'Concentration elective option',
      courseIds: ['CST-205', 'CST-311', 'CST-315', 'CST-325', 'CST-326', 'CST-336', 'CST-380', 'CST-438'],
    })
  })
})
