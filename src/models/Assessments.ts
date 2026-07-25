import { parse } from 'yaml'
import { z } from 'zod'
import assessmentText from '../assets/assessments.yaml?raw'

const assessmentSchema = z.object({
  title: z.string(),
  introduction: z.string(),
  questionSlots: z.array(z.object({
    id: z.string().regex(/^q\d+$/),
    skill: z.string(),
    variations: z.number().int().positive(),
  }).strict()).length(10),
}).strict()

const assessmentCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  assessments: z.record(z.string(), assessmentSchema),
}).strict()

export type AssessmentPack = z.infer<typeof assessmentSchema>

export interface AssessmentQuestionSelection {
  slotId: string
  skill: string
  variation: number
  path: string
}

const questionFileSchema = z.object({
  question_html: z.string(),
  answer: z.array(z.object({
    label: z.string(),
    accepted_values: z.array(z.string()),
    kind: z.string(),
  }).passthrough()),
  explanation_html: z.string(),
}).passthrough()

export type AssessmentQuestionContent = z.infer<typeof questionFileSchema>

export const assessmentCatalog = assessmentCatalogSchema.parse(parse(assessmentText))

export function getAssessmentPack(courseId: string): AssessmentPack | undefined {
  return assessmentCatalog.assessments[courseId]
}

export function createAssessmentAttempt(courseId: string, pack: AssessmentPack, random: () => number = Math.random): AssessmentQuestionSelection[] {
  return pack.questionSlots.map(slot => {
    const variation = Math.floor(random() * slot.variations) + 1
    return {
      slotId: slot.id,
      skill: slot.skill,
      variation,
      path: `/assessments/${courseId}/${slot.id}/v${String(variation).padStart(3, '0')}.yaml`,
    }
  })
}

export function parseAssessmentQuestion(source: string): AssessmentQuestionContent {
  return questionFileSchema.parse(parse(source))
}

export function readinessBand(correctCount: number, totalQuestions: number): { title: string; message: string } {
  const ratio = totalQuestions === 0 ? 0 : correctCount / totalQuestions
  if (ratio >= 0.8) return { title: 'Strong starting point', message: 'You showed confidence with most of these representative skills. Review any missed topics, then use this as one input while planning your next course.' }
  if (ratio >= 0.5) return { title: 'Some topics to review', message: 'You have a foundation to build on. Reviewing the missed skills could make the transition into MATH 130 more comfortable.' }
  return { title: 'Review would be helpful', message: 'A refresher on the missed skills may help you feel more prepared. This is a self-check, not enrollment advice.' }
}
