import { describe, expect, it } from 'vitest'
import { curriculumPlan, planForDegreeType, progressKey, transferAssumedCourseIds, type CurriculumPlan } from './Curriculum'
import { buildCompactedSchedule, buildRegistrationPlan, buildSuggestedSchedule, sortSlotsForPresentation } from './Scheduling'

describe('suggested scheduling', () => {
  it('compacts eligible work forward without moving junior-standing courses early', () => {
    const compacted = buildCompactedSchedule(curriculumPlan, new Set(), 15, 'bs', {
      programId: 'bs-computer-science',
      concentrationId: 'general',
    })
    const secondSpring = compacted.terms.find(term => term.year === 2 && term.term === 'spring')
    const thirdFall = compacted.terms.find(term => term.year === 3 && term.term === 'fall')

    expect(compacted.terms.every(term => term.credits <= 15)).toBe(true)
    expect(secondSpring?.slots.map(progressKey)).toContain('slot:junior-fall-cst-334-or-cst-370')
    expect(secondSpring?.slots.map(progressKey)).toContain('course:CST-338')
    expect(secondSpring?.slots.map(progressKey)).not.toContain('course:CST-349')
    expect(thirdFall?.slots.map(progressKey)).toContain('course:CST-349')
  })

  it('allows junior-standing courses in the first AS-T transfer term', () => {
    const compacted = buildCompactedSchedule(planForDegreeType('ast-to-bs'), new Set(), 15, 'ast-to-bs', {
      programId: 'bs-computer-science',
      concentrationId: 'general',
      assumedCompletedCourseIds: transferAssumedCourseIds,
    })

    expect(compacted.terms[0]?.slots.map(progressKey)).toContain('course:CST-349')
  })

  it('moves completed compacted courses into the earliest displayed term', () => {
    const completed = new Set(['slot:junior-fall-cst-334-or-cst-370', 'course:CST-334'])
    const compacted = buildCompactedSchedule(curriculumPlan, completed, 15, 'bs', {
      programId: 'bs-computer-science',
      concentrationId: 'general',
    })

    expect(compacted.terms[0]?.slots.map(progressKey)).toContain('slot:junior-fall-cst-334-or-cst-370')
  })

  it('presents core work before concentration requirements, electives, math, and GE work', () => {
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set(), {
      programId: 'bs-computer-science',
      concentrationId: 'data-science',
    })
    const juniorFall = curriculumPlan.years[2].terms[0].slots
    const orderedKeys = sortSlotsForPresentation(juniorFall, schedule.assignments, schedule.courseOptions).map(progressKey)

    expect(orderedKeys).toEqual([
      'slot:junior-fall-cst-334-or-cst-370',
      'course:CST-338',
      'course:CST-349',
      'slot:junior-fall-elective-prerequisite',
    ])
  })

  it('presents completed work before every other course in a term', () => {
    const freshmanFall = curriculumPlan.years[0].terms[0].slots
    const orderedKeys = sortSlotsForPresentation(freshmanFall, new Map(), new Map(), new Set(['course:MATH-130'])).map(progressKey)

    expect(orderedKeys[0]).toBe('course:MATH-130')
  })

  it('keeps the early prerequisite-driven course visible and standard', () => {
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set())
    const cst286 = curriculumPlan.years[0].terms[0].slots[3]

    expect(schedule.suggestions.get(progressKey(cst286))?.kind).toBe('standard')
    expect(schedule.isHighPriority(cst286)).toBe(true)
  })

  it('does not use a suggested course to satisfy another suggested course prerequisite', () => {
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set())
    const cst238 = curriculumPlan.years[0].terms[1].slots[0]

    expect(schedule.suggestions.has(progressKey(cst238))).toBe(false)
  })

  it('adds an eligible later-plan course as an early stretch option', () => {
    const completed = new Set(['course:CST-231', 'course:MATH-130', 'course:CST-286'])
    const schedule = buildSuggestedSchedule(curriculumPlan, completed)
    const cst238 = curriculumPlan.years[0].terms[1].slots[0]

    expect(schedule.suggestions.get(progressKey(cst238))?.kind).toBe('standard')
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
                  label: 'Elective',
                  credits: 4,
                  category: 'elective',
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

  it('places a concentration prerequisite in an earlier term than the course it unlocks', () => {
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set(), {
      programId: 'bs-computer-science',
      concentrationId: 'network-security',
    })
    const juniorSpring = curriculumPlan.years[2].terms[1].slots
    const seniorFallElective = curriculumPlan.years[3].terms[0].slots.find(slot => slot.type === 'requirement' && slot.category === 'elective')

    expect(schedule.assignments.get(progressKey(juniorSpring[2]))).toBe('CST-315')
    expect(schedule.assignments.get(progressKey(juniorSpring[3]))).toBeUndefined()
    expect(seniorFallElective).toBeDefined()
    expect(schedule.assignments.get(progressKey(seniorFallElective!))).toBe('CST-415')
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
    const juniorSpringElective = curriculumPlan.years[2].terms[1].slots[3]
    const seniorFallElective = curriculumPlan.years[3].terms[0].slots.find(slot => slot.type === 'requirement' && slot.category === 'elective')

    expect(seniorFallElective).toBeDefined()
    expect(schedule.assignments.get(progressKey(seniorFallElective!))).toBe('CST-463')
    expect(schedule.courseOptions.get(progressKey(juniorSpringElective))).toEqual({
      label: 'Concentration elective option',
      courseIds: ['CST-205', 'CST-311', 'CST-315', 'CST-325', 'CST-326', 'CST-336', 'CST-380', 'CST-438'],
    })
  })

  it('places the required game-development choice after its prerequisites', () => {
    const gameDevelopment = buildSuggestedSchedule(curriculumPlan, new Set(), {
      programId: 'bs-computer-science',
      concentrationId: 'game-development',
    })
    const juniorChoice = curriculumPlan.years[2].terms[0].slots[0]
    const juniorFallElective = curriculumPlan.years[2].terms[0].slots[3]
    const juniorSpringElective = curriculumPlan.years[2].terms[1].slots[2]
    const seniorFallElective = curriculumPlan.years[3].terms[0].slots.find(slot => slot.type === 'requirement' && slot.slotId === 'senior-fall-elective-1')

    expect(gameDevelopment.courseOptions.get(progressKey(juniorChoice))?.label).toBe('CST 334 or CST 370')
    expect(gameDevelopment.assignments.get(progressKey(juniorFallElective))).toBe('CST-325')
    expect(gameDevelopment.assignments.get(progressKey(juniorSpringElective))).toBe('CST-326')
    expect(seniorFallElective).toBeDefined()
    expect(gameDevelopment.courseOptions.get(progressKey(seniorFallElective!))).toEqual({
      label: 'CST 426 or CST 438',
      courseIds: ['CST-426', 'CST-438'],
      required: true,
      prerequisites: [{ courseId: 'CST-325' }, { courseId: 'CST-326' }],
    })
  })

  it('keeps the final software-engineering elective available as a concentration option', () => {
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set(), {
      programId: 'bs-computer-science',
      concentrationId: 'software-engineering',
    })
    const finalElective = curriculumPlan.years[3].terms[1].slots.find(slot => slot.type === 'requirement' && slot.slotId === 'senior-spring-elective')

    expect(finalElective).toBeDefined()
    expect(schedule.courseOptions.get(progressKey(finalElective!))).toEqual(expect.objectContaining({
      label: 'Concentration elective option',
    }))
  })

  it('keeps an unselected concentration elective as a choice when it is suggested', () => {
    const electiveSlots = Array.from({ length: 4 }, (_, index) => ({
      type: 'requirement' as const,
      slotId: `elective-choice-${index}`,
      label: 'Elective',
      credits: 4,
      category: 'elective' as const,
      guidance: 'Choose a concentration elective.',
    }))
    const miniPlan = {
      schemaVersion: 1,
      years: [{
        year: 'freshman',
        terms: [{ term: 'fall', slots: electiveSlots }],
      }],
    } as unknown as CurriculumPlan

    const schedule = buildSuggestedSchedule(miniPlan, new Set(), {
      programId: 'bs-computer-science',
      concentrationId: 'data-science',
    })
    const optionalSlot = electiveSlots[0]

    expect(schedule.courseOptions.get(progressKey(optionalSlot))?.label).toBe('Concentration elective option')
    expect(schedule.suggestions.get(progressKey(optionalSlot))?.courseId).toBeUndefined()
  })

  it('removes a selected target course from the other elective option lists', () => {
    const juniorSpringElective = curriculumPlan.years[2].terms[1].slots[3]
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set(), {
      programId: 'bs-computer-science',
      concentrationId: 'data-science',
      targetCourses: new Map([[progressKey(juniorSpringElective), 'CST-205']]),
    })

    expect(schedule.assignments.get(progressKey(juniorSpringElective))).toBe('CST-205')
    expect(schedule.selectedTargetKeys.has(progressKey(juniorSpringElective))).toBe(true)
    expect([...schedule.courseOptions.entries()]
      .filter(([slotKey]) => slotKey !== progressKey(juniorSpringElective))
      .every(([, options]) => !options.courseIds.includes('CST-205'))).toBe(true)
  })

  it('removes a selected course choice from the matching course-choice slot', () => {
    const juniorFallChoice = curriculumPlan.years[2].terms[0].slots[0]
    const juniorSpringChoice = curriculumPlan.years[2].terms[1].slots[0]
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set(), {
      targetCourses: new Map([[progressKey(juniorFallChoice), 'CST-334']]),
    })

    expect(schedule.assignments.get(progressKey(juniorFallChoice))).toBe('CST-334')
    expect(schedule.courseOptions.get(progressKey(juniorSpringChoice))?.courseIds).toEqual(['CST-370'])
  })

  it('does not suggest a course-choice slot after its selected course is completed', () => {
    const mathChoice = curriculumPlan.years[1].terms[0].slots[1]
    const schedule = buildSuggestedSchedule(curriculumPlan, new Set(['course:MATH-151']), {
      targetCourses: new Map([[progressKey(mathChoice), 'MATH-151']]),
    })

    expect(schedule.suggestions.has(progressKey(mathChoice))).toBe(false)
  })

  it('connects a registration course to its directly unlocked future course', () => {
    const completed = new Set(['course:CST-231', 'course:MATH-130', 'course:CST-286'])
    const registrationPlan = buildRegistrationPlan(curriculumPlan, completed, { currentTerm: 'fall' })

    expect(registrationPlan.courses.some(course => course.courseId === 'CST-238')).toBe(true)
    expect(registrationPlan.edges).toContainEqual(expect.objectContaining({
      sourceCourseId: 'CST-238',
      targetCourseId: 'CST-338',
    }))
  })
})
