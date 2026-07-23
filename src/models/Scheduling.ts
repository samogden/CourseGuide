import {
  activeProgramRequirements,
  candidateCourseIds,
  directRequirementCourseIds,
  getCourse,
  prerequisiteCount,
  prerequisiteCourseIds,
  prerequisitesMet,
  progressKey,
  type CurriculumPlan,
  type PlanSlot,
  type Requirement,
} from './Curriculum'

export type SuggestionKind = 'standard' | 'stretch'

export interface ScheduledSuggestion {
  kind: SuggestionKind
  courseId?: string
}

export interface SuggestedSchedule {
  credits: number
  suggestions: ReadonlyMap<string, ScheduledSuggestion>
  isCourseReady: (slot: PlanSlot) => boolean
  isHighPriority: (slot: PlanSlot) => boolean
}

export interface ScheduleSelection {
  programId?: string
  concentrationId?: string | null
}

interface RankedCourse {
  courseId: string
  reachCount: number
  depth: number
  directRequired: boolean
  prerequisiteCount: number
}

interface SlotCandidate {
  slot: PlanSlot
  key: string
  slotIndex: number
  courseId: string
  prerequisiteCount: number
}

const defaultProgramId = 'bs-computer-science'

export function buildSuggestedSchedule(plan: CurriculumPlan, completed: ReadonlySet<string>, selection?: ScheduleSelection): SuggestedSchedule {
  const completedCourseIds = new Set([...completed]
    .filter(key => key.startsWith('course:'))
    .map(key => key.slice('course:'.length)))
  const isCourseReady = (slot: PlanSlot) => slot.type !== 'course' || prerequisitesMet(getCourse(slot.courseId)?.prerequisites ?? [], completedCourseIds)
  const plannedCourses = plan.years.flatMap((year, yearIndex) => year.terms.flatMap((term, termIndex) => term.slots
    .filter((slot): slot is Extract<PlanSlot, { type: 'course' }> => slot.type === 'course')
    .map(slot => ({ courseId: slot.courseId, order: yearIndex * 10 + termIndex }))))
  const plannedCourseIds = new Set(plannedCourses.map(course => course.courseId))
  const plannedCourseOrder = new Map(plannedCourses.map(course => [course.courseId, course.order]))
  const pathRequirements = resolvePathRequirements(selection)
  const hasConcentration = Boolean(selection?.concentrationId)
  const activeCourseIds = hasConcentration ? candidateCourseIds(pathRequirements) : new Set<string>()
  const directRequiredCourseIds = hasConcentration ? directRequirementCourseIds(pathRequirements) : new Set<string>()
  const downstreamGraph = hasConcentration ? buildDownstreamGraph(activeCourseIds) : new Map<string, Set<string>>()
  const rankedPathCourses = hasConcentration ? buildRankedPathCourses(activeCourseIds, plannedCourseIds, completedCourseIds, directRequiredCourseIds, downstreamGraph) : []
  const genericAssignments = hasConcentration ? assignGenericSlots(plan, completedCourseIds, rankedPathCourses) : new Map<string, string>()
  const suggestions = new Map<string, ScheduledSuggestion>()
  let credits = 0
  for (const year of plan.years) {
    for (const term of year.terms) {
      const candidates: SlotCandidate[] = []
      for (const [slotIndex, slot] of term.slots.entries()) {
        if (slot.type === 'course') {
          const candidate = {
            slot,
            key: progressKey(slot),
            slotIndex,
            courseId: slot.courseId,
            prerequisiteCount: prerequisiteCount(getCourse(slot.courseId)?.prerequisites ?? []),
          } satisfies SlotCandidate
          if (isCourseReadyCandidate(candidate, completedCourseIds)) candidates.push(candidate)
          continue
        }

        const assignedCourseId = genericAssignments.get(progressKey(slot))
        if (!assignedCourseId) continue
        const candidate = {
          slot,
          key: progressKey(slot),
          slotIndex,
          courseId: assignedCourseId,
          prerequisiteCount: prerequisiteCount(getCourse(assignedCourseId)?.prerequisites ?? []),
        } satisfies SlotCandidate
        if (isCourseReadyCandidate(candidate, completedCourseIds)) candidates.push(candidate)
      }

      candidates.sort((left, right) => right.prerequisiteCount - left.prerequisiteCount || left.slotIndex - right.slotIndex)

      let termCredits = 0
      for (const candidate of candidates) {
        if (termCredits + candidate.slot.credits > 18) continue
        termCredits += candidate.slot.credits
        credits += candidate.slot.credits
        suggestions.set(candidate.key, {
          kind: termCredits >= 16 ? 'stretch' : 'standard',
          courseId: candidate.courseId,
        })
      }
    }
  }

  const isHighPriority = (slot: PlanSlot) => {
    const suggestion = suggestions.get(progressKey(slot))
    if (!suggestion || suggestion.kind !== 'standard') return false
    const courseId = slot.type === 'course' ? slot.courseId : suggestion.courseId
    if (!courseId) return false
    return isCourseHighPriority(courseId, plannedCourseOrder, downstreamGraph)
  }

  return { credits, suggestions, isCourseReady, isHighPriority }
}

function resolvePathRequirements(selection?: ScheduleSelection): Requirement[] {
  if (!selection?.concentrationId) return []
  return activeProgramRequirements(selection.programId ?? defaultProgramId, selection.concentrationId)
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

function assignGenericSlots(
  plan: CurriculumPlan,
  completedCourseIds: ReadonlySet<string>,
  rankedCourses: RankedCourse[],
): Map<string, string> {
  const assignments = new Map<string, string>()
  const usedCourseIds = new Set<string>()
  const genericSlots = plan.years.flatMap(year => year.terms.flatMap(term => term.slots.filter(slot => slot.type !== 'course' && (slot.category === 'elective-prereq' || slot.category === 'elective'))))

  for (const slot of genericSlots) {
    const slotKey = progressKey(slot)
    const eligibleCandidates = rankedCourses.filter(candidate =>
      !usedCourseIds.has(candidate.courseId) &&
      getCourse(candidate.courseId)?.units === slot.credits &&
      prerequisitesMet(getCourse(candidate.courseId)?.prerequisites ?? [], completedCourseIds))
    if (eligibleCandidates.length === 0) continue

    const preferredCandidate = slot.category === 'elective-prereq'
      ? eligibleCandidates.find(candidate => candidate.reachCount > 0 || candidate.directRequired)
      : undefined
    const candidate = preferredCandidate ?? eligibleCandidates[0]

    if (slot.category === 'elective-prereq' && candidate.reachCount === 0 && !candidate.directRequired) continue
    assignments.set(slotKey, candidate.courseId)
    usedCourseIds.add(candidate.courseId)
  }

  return assignments
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

function isCourseHighPriority(courseId: string, plannedCourseOrder: ReadonlyMap<string, number>, downstreamGraph: ReadonlyMap<string, ReadonlySet<string>>): boolean {
  if (downstreamReachCount(courseId, downstreamGraph) > 0) return true
  const order = plannedCourseOrder.get(courseId)
  if (order === undefined) return false
  for (const [plannedCourseId, plannedOrder] of plannedCourseOrder.entries()) {
    if (plannedOrder <= order) continue
    if (prerequisiteCourseIds(getCourse(plannedCourseId)?.prerequisites ?? []).has(courseId)) return true
  }
  return false
}

function isCourseReadyCandidate(candidate: SlotCandidate, completedCourseIds: ReadonlySet<string>): boolean {
  return prerequisitesMet(getCourse(candidate.courseId)?.prerequisites ?? [], completedCourseIds)
}
