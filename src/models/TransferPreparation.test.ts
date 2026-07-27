import { describe, expect, it } from 'vitest'
import { buildPreparationTerms, preparationCredits } from './TransferPreparation'

describe('transfer preparation scheduling', () => {
  it('keeps optional refreshers at or below 15 credits per preparation term', () => {
    const terms = buildPreparationTerms(['MATH-130', 'CST-231', 'CST-237', 'CST-238', 'MATH-151'])

    expect(terms.length).toBe(2)
    expect(terms.flatMap(term => term.slots).map(slot => slot.type === 'course' ? slot.courseId : '')).toEqual(['MATH-130', 'CST-231', 'CST-237', 'CST-238', 'MATH-151'])
    expect(terms.every(term => term.slots.reduce((total, slot) => total + slot.credits, 0) <= 15)).toBe(true)
  })

  it('does not count a completed optional refresher toward remaining preparation credits', () => {
    expect(preparationCredits(['MATH-130', 'CST-231'], new Set(['course:MATH-130']))).toBe(4)
  })
})
