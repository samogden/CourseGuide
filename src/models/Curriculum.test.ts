import { describe, expect, it } from 'vitest'
import { canonicalCourseId, curriculumPlan, getCourse, slotLabel } from './Curriculum'

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
})
