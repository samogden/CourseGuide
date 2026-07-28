import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'yaml'

interface AssessmentMetadata {
  title?: string
  introduction?: string
  questionSlots?: { id?: string; skill?: string }[]
}

interface AssessmentPack {
  title: string
  introduction: string
  questionSlots: { id: string; skill: string; variations: number }[]
}

const assessmentRoot = resolve(process.cwd(), 'public/assessments')
const metadataPath = resolve(process.cwd(), 'src/assets/assessments.yaml')
const outputPath = resolve(process.cwd(), 'src/assets/assessment-packs.generated.ts')
const metadata = await readMetadata()
const entries = await readdir(assessmentRoot, { withFileTypes: true })
const packs: Record<string, AssessmentPack> = {}

for (const entry of entries.filter(entry => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
  const courseId = entry.name
  const courseMetadata = metadata[courseId]
  const skills = new Map((courseMetadata?.questionSlots ?? [])
    .filter((slot): slot is { id: string; skill: string } => typeof slot.id === 'string' && typeof slot.skill === 'string')
    .map(slot => [slot.id, slot.skill]))
  const questionSlots = await discoverQuestionSlots(resolve(assessmentRoot, courseId), skills)
  const courseCode = courseId.replace('-', ' ')

  packs[courseId] = {
    title: courseMetadata?.title ?? `${courseCode} readiness self-check`,
    introduction: courseMetadata?.introduction ?? `This optional self-check can help you identify topics to review before ${courseCode}. It does not affect enrollment or your course plan.`,
    questionSlots,
  }
}

const source = `// Generated from public/assessments by scripts/generate-assessment-packs.ts. Do not edit manually.\n\nexport const discoveredAssessmentPacks = ${JSON.stringify(packs, null, 2)} as const\n`
await writeFile(outputPath, source)

async function readMetadata(): Promise<Record<string, AssessmentMetadata>> {
  const source = parse(await readFile(metadataPath, 'utf8'))
  if (!source || typeof source !== 'object' || !('assessments' in source) || !source.assessments || typeof source.assessments !== 'object') return {}
  return source.assessments as Record<string, AssessmentMetadata>
}

async function discoverQuestionSlots(courseRoot: string, skills: ReadonlyMap<string, string>): Promise<AssessmentPack['questionSlots']> {
  const entries = await readdir(courseRoot, { withFileTypes: true })
  const slotIds = entries
    .filter(entry => entry.isDirectory() && /^q\d+$/.test(entry.name))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))

  return Promise.all(slotIds.map(async id => {
    const files = await readdir(resolve(courseRoot, id), { withFileTypes: true })
    const variations = files.filter(file => file.isFile() && /^v\d{3}\.yaml$/.test(file.name)).length
    return { id, skill: skills.get(id) ?? `Question ${Number(id.slice(1))}`, variations }
  }))
}
