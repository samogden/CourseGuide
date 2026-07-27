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

  it('exposes the official pathways through the 2026 catalog version', () => {
    expect(defaultCatalogVersion).toBe('2026')
    expect(catalogVersions['2026']?.title).toBe('2026 Catalog')
    expect(catalogVersions['2026']?.programs['bs-computer-science'].concentrations['data-science']).toBeDefined()
  })

  it('calculates remaining credits from completed plan slots', () => {
    const firstCourse = curriculumPlan.years[0].terms[0].slots[0]

    expect(remainingPlanCredits(curriculumPlan, new Set([`course:${firstCourse.type === 'course' ? firstCourse.courseId : ''}`]))).toBe(98)
  })

  it('derives the AS-T roadmap from only the junior and senior plan years', () => {
    const transferPlan = planForDegreeType('ast-to-bs')

    expect(transferPlan.years.map(year => year.year)).toEqual(['junior', 'senior'])
    expect(degreeYearLabel('ast-to-bs', 'junior')).toBe('1st year')
    expect(degreeYearLabel('ast-to-bs', 'senior')).toBe('2nd year')
    expect(['CST-231', 'CST-238', 'MATH-130', 'MATH-170'].every(courseId => transferAssumedCourseIds.has(courseId))).toBe(true)
  })

})
