import {
  concentrationRequirements,
  candidateCourseIds,
  directRequirementCourseIds,
  getCourse,
  isCourseOffered,
  prerequisiteCount,
  prerequisiteCourseIds,
  prerequisitesMet,
  progressKey,
  requirementCourseIds,
  slotLabel,
  type CurriculumPlan,
  type PlanSlot,
  type Requirement,
} from './Curriculum'

export type SuggestionKind = 'standard' | 'stretch'

export interface ScheduledSuggestion {
  kind: SuggestionKind
  courseId?: string
}

export interface PathSlotOptions {
  label: string
  courseIds: readonly string[]
}

export interface SuggestedSchedule {
  credits: number
  suggestions: ReadonlyMap<string, ScheduledSuggestion>
  assignments: ReadonlyMap<string, string>
  pathOptions: ReadonlyMap<string, PathSlotOptions>
  choiceOptions: ReadonlyMap<string, PathSlotOptions>
  selectedTargetKeys: ReadonlySet<string>
  isCourseReady: (slot: PlanSlot) => boolean
  isHighPriority: (slot: PlanSlot) => boolean
}

export interface ScheduleSelection {
  programId?: string
  concentrationId?: string | null
  targetCourses?: ReadonlyMap<string, string>
  currentTerm?: 'fall' | 'spring'
}

export interface RegistrationCourse {
  key: string
  slot: PlanSlot
  courseId?: string
  label: string
  credits: number
  kind: SuggestionKind
}

export interface RegistrationEdge {
  sourceCourseId: string
  targetCourseId: string
  targetSlot: PlanSlot
}

export interface RegistrationPlan {
  credits: number
  courses: RegistrationCourse[]
  edges: RegistrationEdge[]
}

interface RankedCourse {
  courseId: string
  reachCount: number
  depth: number
  directRequired: boolean
  prerequisiteCount: number
}

interface SelectedEntry {
  key: string
  slot: PlanSlot
  courseId?: string
}

interface TermCandidate {
  key: string
  slot: PlanSlot
  slotIndex: number
  courseId?: string
  consumePathCourse: boolean
  priority: number
}

const defaultProgramId = 'bs-computer-science'

export function buildSuggestedSchedule(plan: CurriculumPlan, completed: ReadonlySet<string>, selection?: ScheduleSelection): SuggestedSchedule {
  const completedCourseIds = new Set([...completed]
    .filter(key => key.startsWith('course:'))
    .map(key => key.slice('course:'.length)))
  const isCourseReady = (slot: PlanSlot) => slot.type !== 'course' || prerequisitesMet(getCourse(slot.courseId)?.prerequisites ?? [], completedCourseIds)
  const explicitPlannedCourseIds = new Set(plan.years.flatMap(year => year.terms.flatMap(term => term.slots.flatMap(slot => {
    if (slot.type === 'course') return [slot.courseId]
    if (slot.type === 'choice') return slot.alternatives
    return []
  }))))
  const pathRequirements = resolvePathRequirements(selection)
  const hasConcentration = Boolean(selection?.concentrationId)
  const preferredCourseIds = new Set([...explicitPlannedCourseIds, ...completedCourseIds])
  const activeCourseIds = hasConcentration ? expandPrerequisiteClosure(candidateCourseIds(pathRequirements), preferredCourseIds) : new Set<string>()
  const directRequiredCourseIds = hasConcentration ? directRequirementCourseIds(pathRequirements) : new Set<string>()
  const downstreamGraph = hasConcentration ? buildDownstreamGraph(activeCourseIds) : new Map<string, Set<string>>()
  const rankedPathCourses = hasConcentration ? buildRankedPathCourses(activeCourseIds, explicitPlannedCourseIds, completedCourseIds, directRequiredCourseIds, downstreamGraph) : []
  const rankedPathAssignmentCourses = hasConcentration ? buildRankedPathCourses(activeCourseIds, explicitPlannedCourseIds, new Set<string>(), directRequiredCourseIds, downstreamGraph) : []
  const generalDownstreamGraph = buildDownstreamGraph(explicitPlannedCourseIds)
  const rankedGeneralCourses = buildRankedPathCourses(explicitPlannedCourseIds, new Set<string>(), completedCourseIds, new Set<string>(), generalDownstreamGraph)
  const rankedPathCourseById = new Map(rankedPathCourses.map((course, index) => [course.courseId, { ...course, rank: index }]))
  const rankedGeneralCourseById = new Map(rankedGeneralCourses.map((course, index) => [course.courseId, { ...course, rank: index }]))
  const { assignments, pathOptions, choiceOptions, selectedTargetKeys } = buildPathAssignments(
    plan,
    completedCourseIds,
    pathRequirements,
    rankedPathAssignmentCourses,
    directRequiredCourseIds,
    selection?.targetCourses,
  )
  const suggestions = new Map<string, ScheduledSuggestion>()
  const selectedEntries: SelectedEntry[] = []
  const usedPathCourseIds = new Set<string>()
  let credits = 0
  let suggestedTerm: 'fall' | 'spring' | undefined = selection?.currentTerm

  for (const year of plan.years) {
    for (const term of year.terms) {
      const selectedInTerm = new Set<string>()
      let madeProgress = true
      while (madeProgress && credits < 18) {
        madeProgress = false
        const termCandidates = term.slots
          .flatMap((slot, slotIndex) => {
            const key = progressKey(slot)
            if (completed.has(key) || selectedInTerm.has(key)) return []
            const candidate = resolveSlotCandidate(
              slot,
              completedCourseIds,
              hasConcentration,
              rankedPathCourses,
              usedPathCourseIds,
              suggestedTerm ?? term.term,
            )
            if (!candidate) return []
            return [{
              key,
              slot,
              slotIndex,
              courseId: candidate.courseId,
              consumePathCourse: candidate.consumePathCourse,
              priority: getCandidatePriority(
                slot,
                candidate.courseId,
                slotIndex,
                rankedPathCourseById,
                rankedGeneralCourseById,
                directRequiredCourseIds,
                downstreamGraph,
              ),
            } satisfies TermCandidate]
          })
          .sort((left, right) =>
            left.priority - right.priority ||
            left.slotIndex - right.slotIndex ||
            Number(right.slot.type === 'course') - Number(left.slot.type === 'course') ||
            left.key.localeCompare(right.key))

        for (const candidate of termCandidates) {
          if (credits + candidate.slot.credits > 18) continue
          const suggestionKind: SuggestionKind = credits + candidate.slot.credits >= 16 ? 'stretch' : 'standard'
          suggestions.set(candidate.key, {
            kind: suggestionKind,
            ...(candidate.courseId ? { courseId: candidate.courseId } : {}),
          })
          selectedEntries.push({ key: candidate.key, slot: candidate.slot, courseId: candidate.courseId })
          if (candidate.courseId && candidate.consumePathCourse) usedPathCourseIds.add(candidate.courseId)
          selectedInTerm.add(candidate.key)
          credits += candidate.slot.credits
          suggestedTerm ??= term.term
          madeProgress = true
          break
        }
      }
    }
  }

  const highPriorityKeys = new Set(
    selectedEntries
      .filter(entry => entry.slot.type === 'course')
      .slice(0, 4)
      .map(entry => entry.key),
  )
  const isHighPriority = (slot: PlanSlot) => {
    const suggestion = suggestions.get(progressKey(slot))
    if (suggestion?.kind === 'stretch') return false
    if (slot.type === 'course') return highPriorityKeys.has(progressKey(slot))
    return false
  }

  return { credits, suggestions, assignments, pathOptions, choiceOptions, selectedTargetKeys, isCourseReady, isHighPriority }
}

export function buildRegistrationPlan(plan: CurriculumPlan, completed: ReadonlySet<string>, selection?: ScheduleSelection): RegistrationPlan {
  const schedule = buildSuggestedSchedule(plan, completed, selection)
  const completedCourseIds = new Set([...completed]
    .filter(key => key.startsWith('course:'))
    .map(key => key.slice('course:'.length)))
  const slots = plan.years.flatMap(year => year.terms.flatMap(term => term.slots))
  const courses = slots.flatMap(slot => {
    const suggestion = schedule.suggestions.get(progressKey(slot))
    if (!suggestion) return []
    const courseId = suggestion.courseId ?? schedule.assignments.get(progressKey(slot)) ?? (slot.type === 'course' ? slot.courseId : undefined)
    return [{
      key: progressKey(slot),
      slot,
      courseId,
      label: courseId ? getCourse(courseId)?.code ?? slotLabel(slot) : slotLabel(slot),
      credits: slot.credits,
      kind: suggestion.kind,
    }]
  })
  const registrationCourseIds = new Set(courses.flatMap(course => course.courseId ? [course.courseId] : []))
  const futureCourses = new Map<string, PlanSlot>()
  for (const slot of slots) {
    const courseId = schedule.assignments.get(progressKey(slot)) ?? (slot.type === 'course' ? slot.courseId : undefined)
    if (!courseId || completedCourseIds.has(courseId) || registrationCourseIds.has(courseId)) continue
    futureCourses.set(courseId, slot)
  }
  const edges: RegistrationEdge[] = []
  for (const [targetCourseId, targetSlot] of futureCourses) {
    const prerequisites = prerequisiteCourseIds(getCourse(targetCourseId)?.prerequisites ?? [])
    for (const sourceCourseId of registrationCourseIds) {
      if (prerequisites.has(sourceCourseId)) edges.push({ sourceCourseId, targetCourseId, targetSlot })
    }
  }

  return { credits: schedule.credits, courses, edges }
}

function buildPathAssignments(
  plan: CurriculumPlan,
  completedCourseIds: ReadonlySet<string>,
  pathRequirements: Requirement[],
  rankedPathCourses: RankedCourse[],
  directRequiredCourseIds: ReadonlySet<string>,
  targetCourses?: ReadonlyMap<string, string>,
): { assignments: Map<string, string>; pathOptions: Map<string, PathSlotOptions>; choiceOptions: Map<string, PathSlotOptions>; selectedTargetKeys: Set<string> } {
  const assignments = new Map<string, string>()
  const pathOptions = new Map<string, PathSlotOptions>()
  const choiceOptions = buildChoiceOptions(plan)
  const selectedTargetKeys = new Set<string>()

  if (pathRequirements.length > 0) {
    const projectedCourseIds = new Set(completedCourseIds)
    const usedPathCourseIds = new Set<string>()
    const requiredPathCourses = rankedPathCourses.filter(course => directRequiredCourseIds.has(course.courseId))
    const remainingSlots: Extract<PlanSlot, { type: 'requirement' }>[] = []

    for (const year of plan.years) {
      for (const term of year.terms) {
        const courseIdsCompletedBeforeTerm = new Set(projectedCourseIds)
        const courseIdsTakenThisTerm: string[] = []
        for (const slot of term.slots) {
          if (slot.type === 'course') {
            courseIdsTakenThisTerm.push(slot.courseId)
            continue
          }

          if (slot.type !== 'requirement' || slot.category !== 'elective') continue
          const courseId = pickGenericCourse(slot, courseIdsCompletedBeforeTerm, requiredPathCourses, usedPathCourseIds, term.term)
          if (!courseId) {
            remainingSlots.push(slot)
            continue
          }
          assignments.set(progressKey(slot), courseId)
          usedPathCourseIds.add(courseId)
          courseIdsTakenThisTerm.push(courseId)
        }
        courseIdsTakenThisTerm.forEach(courseId => projectedCourseIds.add(courseId))
      }
    }

    const optionGroups = pathOptionGroups(pathRequirements)
    for (const [index, slot] of remainingSlots.entries()) {
      const optionGroup = optionGroups[index]
      if (!optionGroup) break
      pathOptions.set(progressKey(slot), optionGroup)
    }
  }

  const unavailableCourseIds = new Set(assignments.values())
  for (const [slotKey, courseId] of targetCourses ?? []) {
    const options = pathOptions.get(slotKey) ?? choiceOptions.get(slotKey)
    if (!options || !options.courseIds.includes(courseId) || unavailableCourseIds.has(courseId)) continue
    assignments.set(slotKey, courseId)
    selectedTargetKeys.add(slotKey)
    unavailableCourseIds.add(courseId)
  }
  filterUnavailableOptions(pathOptions, assignments, unavailableCourseIds)
  filterUnavailableOptions(choiceOptions, assignments, unavailableCourseIds)

  return { assignments, pathOptions, choiceOptions, selectedTargetKeys }
}

function buildChoiceOptions(plan: CurriculumPlan): Map<string, PathSlotOptions> {
  const options = new Map<string, PathSlotOptions>()
  for (const year of plan.years) {
    for (const term of year.terms) {
      for (const slot of term.slots) {
        if (slot.type !== 'choice' || !slot.alternatives.every(courseId => getCourse(courseId))) continue
        options.set(progressKey(slot), { label: 'Course choice', courseIds: slot.alternatives })
      }
    }
  }
  return options
}

function filterUnavailableOptions(optionsBySlot: Map<string, PathSlotOptions>, assignments: ReadonlyMap<string, string>, unavailableCourseIds: ReadonlySet<string>) {
  for (const [slotKey, options] of optionsBySlot) {
    const selectedCourseId = assignments.get(slotKey)
    optionsBySlot.set(slotKey, {
      ...options,
      courseIds: options.courseIds.filter(courseId => courseId === selectedCourseId || !unavailableCourseIds.has(courseId)),
    })
  }
}

function pathOptionGroups(requirements: Requirement[]): PathSlotOptions[] {
  return requirements.flatMap(requirement => {
    const courseIds = requirementCourseIds(requirement)
    if (requirement.completion.kind === 'all') return []
    if (requirement.completion.kind === 'choose') {
      return Array.from({ length: requirement.completion.count }, () => ({
        label: 'Concentration course option',
        courseIds,
      }))
    }
    const slotCount = Math.ceil(requirement.completion.credits / 4)
    return Array.from({ length: slotCount }, () => ({
      label: 'Concentration elective option',
      courseIds,
    }))
  })
}

function resolvePathRequirements(selection?: ScheduleSelection): Requirement[] {
  if (!selection?.concentrationId) return []
  return concentrationRequirements(selection.programId ?? defaultProgramId, selection.concentrationId)
}

function buildRankedPathCourses(
  activeCourseIds: Set<string>,
  plannedCourseIds: ReadonlySet<string>,
  completedCourseIds: ReadonlySet<string>,
  directRequiredCourseIds: ReadonlySet<string>,
  downstreamGraph: ReadonlyMap<string, ReadonlySet<string>>,
): RankedCourse[] {
  return [...activeCourseIds]
    .filter(courseId => !plannedCourseIds.has(courseId) && !completedCourseIds.has(courseId) && getCourse(courseId))
    .map(courseId => ({
      courseId,
      reachCount: downstreamReachCount(courseId, downstreamGraph),
      depth: downstreamDepth(courseId, downstreamGraph),
      directRequired: directRequiredCourseIds.has(courseId),
      prerequisiteCount: prerequisiteCount(getCourse(courseId)?.prerequisites ?? []),
    }))
    .sort((left, right) =>
      right.reachCount - left.reachCount ||
      right.depth - left.depth ||
      Number(right.directRequired) - Number(left.directRequired) ||
      right.prerequisiteCount - left.prerequisiteCount ||
      left.courseId.localeCompare(right.courseId))
}

function resolveSlotCandidate(
  slot: PlanSlot,
  projectedCourseIds: ReadonlySet<string>,
  hasConcentration: boolean,
  rankedPathCourses: RankedCourse[],
  usedPathCourseIds: ReadonlySet<string>,
  term: 'fall' | 'spring',
): { courseId?: string; consumePathCourse: boolean } | undefined {
  if (slot.type === 'course') {
    const course = getCourse(slot.courseId)
    if (!course) return undefined
    if (!isCourseOffered(course.id, term)) return undefined
    if (!prerequisitesMet(course.prerequisites, projectedCourseIds)) return undefined
    return { courseId: course.id, consumePathCourse: false }
  }

  if (slot.type === 'choice') {
    return { consumePathCourse: false }
  }

  if (!hasConcentration || slot.category !== 'elective') {
    return { consumePathCourse: false }
  }

  const courseId = pickGenericCourse(slot, projectedCourseIds, rankedPathCourses, usedPathCourseIds, term)
  if (courseId) return { courseId, consumePathCourse: true }
  return { consumePathCourse: false }
}

function pickGenericCourse(
  slot: Extract<PlanSlot, { type: 'requirement' }>,
  projectedCourseIds: ReadonlySet<string>,
  rankedPathCourses: RankedCourse[],
  usedPathCourseIds: ReadonlySet<string>,
  term: 'fall' | 'spring',
): string | undefined {
  const eligibleCandidates = rankedPathCourses.filter(candidate =>
    !usedPathCourseIds.has(candidate.courseId) &&
    getCourse(candidate.courseId)?.units === slot.credits &&
    isCourseOffered(candidate.courseId, term) &&
    prerequisitesMet(getCourse(candidate.courseId)?.prerequisites ?? [], projectedCourseIds))

  if (eligibleCandidates.length === 0) return undefined

  return eligibleCandidates[0]?.courseId
}

function getCandidatePriority(
  slot: PlanSlot,
  courseId: string | undefined,
  slotIndex: number,
  rankedPathCourseById: ReadonlyMap<string, RankedCourse & { rank: number }>,
  rankedGeneralCourseById: ReadonlyMap<string, RankedCourse & { rank: number }>,
  directRequiredCourseIds: ReadonlySet<string>,
  downstreamGraph: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  const categoryTier = slot.type === 'course'
    ? (slot.category === 'cst' || slot.category === 'math' ? 0 : 2)
    : 1
  const basePriority = categoryTier * 20 + slotIndex
  if (!courseId) return basePriority
  const rankedCourse = rankedPathCourseById.get(courseId) ?? rankedGeneralCourseById.get(courseId)
  if (!rankedCourse) return basePriority

  const pathBonus = 300 + rankedCourse.reachCount * 20 + rankedCourse.depth * 10 + rankedCourse.prerequisiteCount * 5 + (rankedCourse.directRequired || directRequiredCourseIds.has(courseId) ? 50 : 0) + (downstreamReachCount(courseId, downstreamGraph) > 0 ? 25 : 0) - rankedCourse.rank * 2
  return basePriority - Math.max(pathBonus, 0)
}

function buildDownstreamGraph(courseIds: Iterable<string>): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>()
  const visited = new Set<string>()

  const visit = (courseId: string) => {
    if (visited.has(courseId)) return
    visited.add(courseId)
    const course = getCourse(courseId)
    if (!course) return
    for (const prerequisiteId of prerequisiteCourseIds(course.prerequisites)) {
      let dependents = graph.get(prerequisiteId)
      if (!dependents) {
        dependents = new Set<string>()
        graph.set(prerequisiteId, dependents)
      }
      dependents.add(courseId)
      visit(prerequisiteId)
    }
  }

  for (const courseId of courseIds) visit(courseId)
  return graph
}

function expandPrerequisiteClosure(courseIds: Iterable<string>, preferredCourseIds: ReadonlySet<string>): Set<string> {
  const expanded = new Set<string>()
  const stack = [...courseIds]

  while (stack.length > 0) {
    const courseId = stack.pop()
    if (!courseId || expanded.has(courseId)) continue
    expanded.add(courseId)
    const course = getCourse(courseId)
    if (!course) continue
    for (const prerequisiteId of preferredPrerequisiteCourseIds(course.prerequisites, preferredCourseIds)) {
      if (!expanded.has(prerequisiteId)) stack.push(prerequisiteId)
    }
  }

  return expanded
}

function preferredPrerequisiteCourseIds(prerequisites: unknown[], preferredCourseIds: ReadonlySet<string>): string[] {
  const ids: string[] = []
  for (const prerequisite of prerequisites) ids.push(...preferredPrerequisiteCourseIdsForNode(prerequisite, preferredCourseIds))
  return ids
}

function preferredPrerequisiteCourseIdsForNode(prerequisite: unknown, preferredCourseIds: ReadonlySet<string>): string[] {
  if (!prerequisite || typeof prerequisite !== 'object') return []
  const value = prerequisite as { courseId?: string; allOf?: unknown[]; anyOf?: unknown[] }
  if (value.courseId) return [getCourse(value.courseId)?.id ?? value.courseId]
  if (value.allOf) return value.allOf.flatMap(item => preferredPrerequisiteCourseIdsForNode(item, preferredCourseIds))
  if (value.anyOf) {
    const options = value.anyOf.map(option => {
      const optionIds = prerequisiteCourseIds([option])
      const overlapCount = [...optionIds].filter(courseId => preferredCourseIds.has(courseId)).length
      return { option, overlapCount, size: optionIds.size }
    })
    options.sort((left, right) => right.overlapCount - left.overlapCount || right.size - left.size)
    return preferredPrerequisiteCourseIdsForNode(options[0].option, preferredCourseIds)
  }
  return []
}

function downstreamReachCount(courseId: string, graph: ReadonlyMap<string, ReadonlySet<string>>, memo = new Map<string, number>(), active = new Set<string>()): number {
  if (memo.has(courseId)) return memo.get(courseId) ?? 0
  const dependents = graph.get(courseId)
  if (!dependents || dependents.size === 0) {
    memo.set(courseId, 0)
    return 0
  }
  const reachable = new Set<string>()
  collectDescendants(courseId, graph, reachable, active)
  const count = reachable.size
  memo.set(courseId, count)
  return count
}

function collectDescendants(courseId: string, graph: ReadonlyMap<string, ReadonlySet<string>>, reachable: Set<string>, active: Set<string>) {
  if (active.has(courseId)) return
  active.add(courseId)
  for (const dependent of graph.get(courseId) ?? []) {
    if (reachable.has(dependent)) continue
    reachable.add(dependent)
    collectDescendants(dependent, graph, reachable, active)
  }
  active.delete(courseId)
}

function downstreamDepth(courseId: string, graph: ReadonlyMap<string, ReadonlySet<string>>, memo = new Map<string, number>(), active = new Set<string>()): number {
  if (memo.has(courseId)) return memo.get(courseId) ?? 0
  if (active.has(courseId)) return 0
  active.add(courseId)
  const dependents = graph.get(courseId)
  if (!dependents || dependents.size === 0) {
    memo.set(courseId, 0)
    active.delete(courseId)
    return 0
  }
  let depth = 0
  for (const dependent of dependents) {
    depth = Math.max(depth, 1 + downstreamDepth(dependent, graph, memo, active))
  }
  memo.set(courseId, depth)
  active.delete(courseId)
  return depth
}
