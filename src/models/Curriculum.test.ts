import { describe, expect, it } from 'vitest'
import { canonicalCourseId, catalogVersions, coursesById, curriculumPlan, defaultCatalogVersion, degreeYearLabel, getCourse, planForDegreeType, prerequisiteCount, prerequisiteCourseIds, prerequisitesMet, prerequisiteText, programs, remainingPlanCredits, slotLabel, summarizePlanCredits, transferAssumedCourseIds, type CurriculumPlan } from './Curriculum'

describe('curriculum data', () => {
  it('normalizes alternate course code spacing', () => {
    expect(canonicalCourseId('cst231')).toBe('CST-231')
    expect(getCourse('CST 231')?.id).toBe('CST-231')
  })

  it('represents pipe choices as explicit alternatives', () => {
    const mathChoice = curriculumPlan.years[1].terms[0].slots[1]
    expect(mathChoice.type).toBe('choice')
    expect(slotLabel(mathChoice)).toBe('MATH 151 or MATH 270')
  })

  it('uses FYS 145 and the two official World Culture and Language courses', () => {
    const firstYearFall = curriculumPlan.years[0].terms[0].slots
    const cultureChoice = curriculumPlan.years[1].terms[1].slots[0]

    expect(firstYearFall[1]).toMatchObject({ type: 'course', courseId: 'FYS-145', credits: 3 })
    expect(cultureChoice).toMatchObject({
      type: 'choice',
      alternatives: ['JAPN-350', 'SPAN-350'],
    })
    expect(getCourse('JAPN 350')?.name).toBe('World Culture and Language: Japanese')
    expect(getCourse('SPAN 350')?.name).toBe('World Culture and Language: Spanish')
  })

  it('places CST 462S in the final fall and keeps an elective in the final spring', () => {
    const finalFall = curriculumPlan.years[3].terms[0].slots
    const finalSpring = curriculumPlan.years[3].terms[1].slots

    expect(finalFall.some(slot => slot.type === 'course' && slot.courseId === 'CST-462S')).toBe(true)
    expect(finalSpring.some(slot => slot.type === 'requirement' && slot.slotId === 'senior-spring-elective')).toBe(true)
  })

  it('evaluates nested prerequisite alternatives', () => {
    const dataStructures = getCourse('CST 238')
    expect(prerequisitesMet(dataStructures?.prerequisites ?? [], new Set(['CST-231', 'MATH-130']))).toBe(true)
    expect(prerequisitesMet(dataStructures?.prerequisites ?? [], new Set(['CST-231']))).toBe(false)
  })

  it('counts prerequisite courses for scheduling priority', () => {
    expect(prerequisiteCount(getCourse('CST 238')?.prerequisites ?? [])).toBe(3)
  })

  it('finds course IDs referenced by a prerequisite rule', () => {
    expect(prerequisiteCourseIds(getCourse('CST 238')?.prerequisites ?? [])).toEqual(new Set(['CST-231', 'MATH-130', 'MATH-150']))
  })

  it('models the MATH 130 to MATH 150 to MATH 151 preparation sequence', () => {
    expect(prerequisiteCourseIds(getCourse('MATH 150')?.prerequisites ?? [])).toEqual(new Set(['MATH-130']))
    expect(prerequisiteCourseIds(getCourse('MATH 151')?.prerequisites ?? [])).toEqual(new Set(['MATH-150']))
    expect(prerequisiteCourseIds(getCourse('MATH 270')?.prerequisites ?? [])).toEqual(new Set(['MATH-150', 'MATH-170']))
  })

  it('places MATH 150 in freshman spring as the Area 2 mathematics course', () => {
    const freshmanSpring = curriculumPlan.years[0].terms[1].slots

    expect(freshmanSpring).toContainEqual(expect.objectContaining({ type: 'course', courseId: 'MATH-150', credits: 4 }))
    expect(freshmanSpring.some(slot => slot.type === 'requirement' && slot.slotId === 'ge-2-lower-division')).toBe(false)
  })

  it('uses parentheses to preserve prerequisite alternatives', () => {
    expect(prerequisiteText(getCourse('CST 238')?.prerequisites[0])).toBe('CST 231 (C- or better) and (MATH 130 (C- or better) or MATH 150 (C- or better))')
  })

  it('resolves every concrete course in the plan from the one catalog', () => {
    const plannedCourseIds = curriculumPlan.years.flatMap(year => year.terms.flatMap(term => term.slots.flatMap(slot => {
      if (slot.type === 'course') return [slot.courseId]
      if (slot.type === 'choice') return slot.alternatives.filter(alternative => /^([A-Z]+)-\d/.test(alternative))
      return []
    })))
    expect(plannedCourseIds.every(courseId => coursesById.has(courseId))).toBe(true)
  })

  it('preserves active and inactive teaching status in the unified catalog', () => {
    expect(getCourse('CST 231')?.teachingStatus).toBe('active')
    expect(getCourse('CST 201')?.teachingStatus).toBe('inactive')
  })

  it('separates major and general-education credits', () => {
    const plan = {
      schemaVersion: 1,
      years: [{
        year: 'freshman',
        terms: [{
          term: 'fall',
          slots: [
            { type: 'course', courseId: 'CST-231', credits: 4, category: 'cst' },
            { type: 'requirement', slotId: 'ge-lower', label: 'Lower GE', credits: 3, category: 'ge-lower', guidance: '' },
            { type: 'requirement', slotId: 'ge-upper', label: 'Upper GE', credits: 3, category: 'ge-upper', guidance: '' },
          ],
        }],
      }],
    } as CurriculumPlan

    expect(summarizePlanCredits(plan)).toEqual({
      total: 10,
      major: 4,
      lowerDivisionGeneralEducation: 3,
      upperDivisionGeneralEducation: 3,
    })
  })

  it('keeps the official concentration course lists distinct', () => {
    const softwareEngineering = programs.programs['bs-computer-science'].concentrations['software-engineering']
    const softwareElectives = softwareEngineering.requirements.find(requirement => requirement.id === 'upper_division_electives')
    const general = programs.programs['bs-computer-science'].concentrations.general

    expect(softwareElectives?.courseIds).not.toContain('CST-363')
    expect(general.title).toBe('General')
    expect(general.requirements[0].completion).toEqual({ kind: 'minimumCredits', credits: 24 })
  })

  it('treats the advanced game-development pair as a required choice', () => {
    const gameDevelopment = programs.programs['bs-computer-science'].concentrations['game-development']
    const requiredCourses = gameDevelopment.requirements.find(requirement => requirement.id === 'required_upper_division')
    const advancedChoice = gameDevelopment.requirements.find(requirement => requirement.id === 'advanced_game_development_choice')
    const electiveCourses = gameDevelopment.requirements.find(requirement => requirement.id === 'upper_division_electives')

    expect(requiredCourses?.completion).toEqual({ kind: 'all' })
    expect(requiredCourses?.courseIds).toEqual(['CST-325', 'CST-326'])
    expect(advancedChoice?.completion).toEqual({ kind: 'choose', count: 1 })
    expect(advancedChoice?.courseIds).toEqual(['CST-426', 'CST-438'])
    expect(electiveCourses?.courseIds).not.toContain('CST-438')
    expect(prerequisiteCourseIds(advancedChoice?.prerequisites ?? [])).toEqual(new Set(['CST-325', 'CST-326']))
    expect(prerequisiteCourseIds(getCourse('CST 438')?.prerequisites ?? [])).toEqual(new Set(['CST-338']))
  })

  it('exposes the official pathways through the 2026 catalog version', () => {
    expect(defaultCatalogVersion).toBe('2026')
    expect(catalogVersions['2026']?.title).toBe('2026 Catalog')
    expect(catalogVersions['2026']?.programs['bs-computer-science'].concentrations['data-science']).toBeDefined()
  })

  it('calculates remaining credits from completed plan slots', () => {
    const firstCourse = curriculumPlan.years[0].terms[0].slots[0]

    expect(remainingPlanCredits(curriculumPlan, new Set([`course:${firstCourse.type === 'course' ? firstCourse.courseId : ''}`]))).toBe(100)
  })

  it('derives the AS-T roadmap from only the junior and senior plan years', () => {
    const transferPlan = planForDegreeType('ast-to-bs')

    expect(transferPlan.years.map(year => year.year)).toEqual(['junior', 'senior'])
    expect(degreeYearLabel('ast-to-bs', 'junior')).toBe('1st year')
    expect(degreeYearLabel('ast-to-bs', 'senior')).toBe('2nd year')
    expect(['CST-231', 'CST-238', 'MATH-130', 'MATH-170'].every(courseId => transferAssumedCourseIds.has(courseId))).toBe(true)
  })

})
