import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'yaml'

interface QuestionSlot {
  id: string
  variations: number
}

interface AssessmentPack {
  questionSlots: QuestionSlot[]
}

interface AnswerDefinition {
  label: string
  accepted_values: string[]
  kind: string
}

interface QuestionFile {
  question_html: string
  answer: AnswerDefinition[]
  explanation_html: string
}

const root = resolve(process.cwd(), 'public/assessments')
const manifestPath = resolve(process.cwd(), 'src/assets/assessments.yaml')
const errors: string[] = []
let questionCount = 0

const manifest = await readManifest()
await discoverAssessmentDirectories(manifest)
for (const [courseId, pack] of Object.entries(manifest)) await validateCourse(courseId, pack)

if (errors.length > 0) {
  throw new Error(`Assessment validation failed:\n${errors.slice(0, 50).map(error => `- ${error}`).join('\n')}${errors.length > 50 ? `\n- …and ${errors.length - 50} more errors` : ''}`)
}

console.log(`Assessment validation passed: ${questionCount} question files.`)

async function readManifest(): Promise<Record<string, AssessmentPack>> {
  const source = parse(await readFile(manifestPath, 'utf8'))
  if (!isRecord(source) || !isRecord(source.assessments)) throw new Error('Assessment manifest must define an assessments object.')

  const packs: Record<string, AssessmentPack> = {}
  for (const [courseId, value] of Object.entries(source.assessments)) {
    if (!isRecord(value) || !Array.isArray(value.questionSlots)) {
      errors.push(`${courseId}: missing questionSlots in the assessment manifest`)
      continue
    }
    // Variation counts are discovered from public/assessments, just as they
    // are for the generated runtime pack. Metadata only declares slot IDs and
    // skills, so deleting old variation files does not leave a stale count.
    const questionSlots = value.questionSlots.flatMap(slot => {
      if (!isRecord(slot) || typeof slot.id !== 'string') {
        errors.push(`${courseId}: every question slot needs an id`)
        return []
      }
      return [{ id: slot.id, variations: 0 }]
    })
    packs[courseId] = { questionSlots }
  }
  return packs
}

async function discoverAssessmentDirectories(packs: Record<string, AssessmentPack>) {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    errors.push('missing public assessment directory')
    return
  }

  for (const entry of entries.filter(entry => entry.isDirectory())) {
    const courseRoot = resolve(root, entry.name)
    const slotEntries = await readdir(courseRoot, { withFileTypes: true })
    const questionSlots = await Promise.all(slotEntries
      .filter(slot => slot.isDirectory() && /^q\d+$/.test(slot.name))
      .map(async slot => ({
        id: slot.name,
        variations: (await readdir(resolve(courseRoot, slot.name), { withFileTypes: true }))
          .filter(file => file.isFile() && /^v\d{3}\.yaml$/.test(file.name)).length,
      })))
    // Filesystem discovery is authoritative for both runtime and validation.
    packs[entry.name] = { questionSlots }
  }
}

async function validateCourse(courseId: string, pack: AssessmentPack) {
  const courseRoot = resolve(root, courseId)
  const expectedSlotIds = new Set(pack.questionSlots.map(slot => slot.id))
  let directories: Awaited<ReturnType<typeof readdir>>
  try {
    directories = await readdir(courseRoot, { withFileTypes: true })
  } catch {
    errors.push(`${courseId}: missing public assessment directory`)
    return
  }

  const actualSlotIds = new Set(directories.filter(entry => entry.isDirectory()).map(entry => entry.name))
  if (expectedSlotIds.size !== 10) errors.push(`${courseId}: expected exactly 10 question directories but found ${expectedSlotIds.size}`)
  for (const slotId of expectedSlotIds) if (!actualSlotIds.has(slotId)) errors.push(`${courseId}: missing question directory ${slotId}`)
  for (const slotId of actualSlotIds) if (!expectedSlotIds.has(slotId)) errors.push(`${courseId}: ${slotId} is not declared in the assessment manifest`)

  for (const slot of pack.questionSlots) {
    const slotRoot = resolve(courseRoot, slot.id)
    let files: Awaited<ReturnType<typeof readdir>>
    try {
      files = await readdir(slotRoot, { withFileTypes: true })
    } catch {
      continue
    }
    const questionFiles = files.filter(file => file.isFile() && /^v\d{3}\.yaml$/.test(file.name)).map(file => file.name).sort()
    if (questionFiles.length !== slot.variations) errors.push(`${courseId}/${slot.id}: expected ${slot.variations} YAML variations but found ${questionFiles.length}`)
    const expectedFiles = new Set(Array.from({ length: slot.variations }, (_, index) => `v${String(index + 1).padStart(3, '0')}.yaml`))
    for (const fileName of expectedFiles) if (!questionFiles.includes(fileName)) errors.push(`${courseId}/${slot.id}: missing ${fileName}`)
    for (const fileName of questionFiles) if (!expectedFiles.has(fileName)) errors.push(`${courseId}/${slot.id}: unexpected ${fileName}`)
    for (const fileName of questionFiles) await validateQuestion(resolve(slotRoot, fileName), `${courseId}/${slot.id}/${fileName}`)
  }
}

async function validateQuestion(path: string, label: string) {
  let question: QuestionFile
  try {
    question = parseQuestionFile(parse(await readFile(path, 'utf8')), label)
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : 'could not parse YAML'}`)
    return
  }

  if (/<(?:html|head|body|script|style)\b/i.test(question.question_html) || /<script\b/i.test(question.explanation_html)) {
    errors.push(`${label}: HTML fields must be fragments without page, style, or script elements`)
  }

  const inputs = [...question.question_html.matchAll(/<input\b[^>]*>/gi)]
    .map(match => match[0])
    .filter(tag => /\bclass\s*=\s*["'][^"']*\bquizgen-answer-input\b/i.test(tag))
  if (inputs.length !== question.answer.length) {
    errors.push(`${label}: found ${inputs.length} answer inputs but ${question.answer.length} answer definitions`)
    return
  }

  inputs.forEach((input, index) => {
    const encodedAnswer = attribute(input, 'data-accepted')
    if (!encodedAnswer) {
      errors.push(`${label}: answer input ${index + 1} is missing data-accepted`)
      return
    }
    let htmlAnswers: string[]
    try {
      const value = JSON.parse(decodeHtmlEntities(encodedAnswer))
      if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error()
      htmlAnswers = value
    } catch {
      errors.push(`${label}: answer input ${index + 1} has invalid data-accepted JSON`)
      return
    }
    const yamlAnswers = question.answer[index]?.accepted_values ?? []
    if (!sameValues(htmlAnswers, yamlAnswers)) errors.push(`${label}: answer input ${index + 1} data-accepted does not match answer.accepted_values`)
  })

  questionCount++
}

function parseQuestionFile(value: unknown, label: string): QuestionFile {
  if (!isRecord(value) || typeof value.question_html !== 'string' || typeof value.explanation_html !== 'string' || !Array.isArray(value.answer)) {
    throw new Error('requires question_html, answer, and explanation_html')
  }
  if (value.question_html.trim() === '' || value.explanation_html.trim() === '') throw new Error('question_html and explanation_html cannot be empty')
  const answer = value.answer.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.label !== 'string' || typeof entry.kind !== 'string' || !Array.isArray(entry.accepted_values) || !entry.accepted_values.every(item => typeof item === 'string')) {
      throw new Error(`answer ${index + 1} requires label, kind, and string accepted_values`)
    }
    return { label: entry.label, kind: entry.kind, accepted_values: entry.accepted_values }
  })
  if (answer.length === 0) throw new Error(`${label} requires at least one answer definition`)
  return { question_html: value.question_html, explanation_html: value.explanation_html, answer }
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return match?.[1] ?? match?.[2]
}

function decodeHtmlEntities(value: string): string {
  return value.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&apos;', "'").replaceAll('&amp;', '&')
}

function sameValues(left: string[], right: string[]): boolean {
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
