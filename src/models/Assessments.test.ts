import { describe, expect, it } from 'vitest'
import { createAssessmentAttempt, getAssessmentPack, parseAssessmentQuestion, readinessBand } from './Assessments'

describe('assessment packs', () => {
  it('defines ten MATH 130 readiness skills', () => {
    const pack = getAssessmentPack('MATH-130')

    expect(pack?.questionSlots).toHaveLength(10)
  })

  it('selects one fragment variation for every question slot', () => {
    const pack = getAssessmentPack('MATH-130')
    if (!pack) throw new Error('Expected the MATH 130 assessment pack')

    const attempt = createAssessmentAttempt('MATH-130', pack, () => 0)

    expect(attempt).toHaveLength(10)
    expect(attempt[0]).toEqual(expect.objectContaining({
      slotId: 'q01',
      variation: 1,
      path: '/assessments/MATH-130/q01/v001.yaml',
    }))
  })

  it('uses supportive readiness bands rather than enrollment advice', () => {
    expect(readinessBand(9, 10).title).toBe('Strong starting point')
    expect(readinessBand(6, 10).title).toBe('Some topics to review')
    expect(readinessBand(2, 10).message).toContain('not enrollment advice')
  })

  it('parses generated YAML question content with rich HTML fields', () => {
    const question = parseAssessmentQuestion(`question_html: '<p>\\(x+1\\)</p>'\nanswer:\n  - label: Answer\n    accepted_values: ['2']\n    kind: fill_in_multiple_blanks_question\nexplanation_html: '<p>Because…</p>'`)

    expect(question.question_html).toContain('\\(x+1\\)')
    expect(question.explanation_html).toContain('Because')
  })
})
