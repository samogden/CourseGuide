import { describe, expect, it } from 'vitest'
import { canonicalCourseId, curriculumPlan, getCourse, prerequisiteCount, prerequisiteCourseIds, prerequisitesMet, prerequisiteText, slotLabel } from './Curriculum'

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
})
