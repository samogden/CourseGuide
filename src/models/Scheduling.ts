import {
  concentrationRequirements,
  activeProgramRequirements,
  defaultCatalogVersion,
  candidateCourseIds,
  courseCorequisiteIds,
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
  type DegreeType,
  type PlanSlot,
  type Requirement,
  minorRequirements,
} from './Curriculum'

export type SuggestionKind = 'standard' | 'stretch'

export interface ScheduledSuggestion {
  kind: SuggestionKind
  courseId?: string
}

export interface PathSlotOptions {
  label: string
  courseIds: readonly string[]
  required?: boolean
  prerequisites?: readonly unknown[]
  minimumCredits?: number
  requirementId?: string
}

export interface SuggestedSchedule {
  credits: number
  suggestions: ReadonlyMap<string, ScheduledSuggestion>
  assignments: ReadonlyMap<string, string>
  courseOptions: ReadonlyMap<string, PathSlotOptions>
  selectedTargetKeys: ReadonlySet<string>
  isCourseReady: (slot: PlanSlot) => boolean
  isHighPriority: (slot: PlanSlot) => boolean
}

export interface ScheduleSelection {
  catalogVersion?: string
  programId?: string
  concentrationId?: string | null
  minorId?: string | null
  includeProgramRequirements?: boolean
  reservedCourseIds?: ReadonlyMap<string, readonly string[]>
  targetCourses?: ReadonlyMap<string, string>
  currentTerm?: 'fall' | 'spring'
  /** Transfer coursework that is assumed satisfied without rendering it in the active plan. */
  assumedCompletedCourseIds?: ReadonlySet<string>
}

export interface RegistrationCourse {
  key: string
  slot: PlanSlot
  courseId?: string
  label: string
  credits: number
  category: PresentationCategory
  kind: SuggestionKind
  priority: 'high' | 'regular' | 'stretch'
  downstreamCount: number
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
  upcomingCourses: RegistrationFutureCourse[]
}

export interface RegistrationFutureCourse {
  key: string
  label: string
  credits: number
  prerequisiteCount: number
  isAvailableNow: boolean
}

export interface CompactedTerm {
  year: number
  term: 'fall' | 'spring'
  slots: PlanSlot[]
  credits: number
}

export interface CompactedSchedule {
  terms: CompactedTerm[]
  assignments: ReadonlyMap<string, string>
  courseOptions: ReadonlyMap<string, PathSlotOptions>
  selectedTargetKeys: ReadonlySet<string>
}

export type PresentationCategory = 'cst' | 'concentration-required' | 'elective' | 'math' | 'ge-lower' | 'ge-upper'

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
  for (const courseId of selection?.assumedCompletedCourseIds ?? []) completedCourseIds.add(courseId)
  const isCourseReady = (slot: PlanSlot) => slot.type !== 'course' || prerequisitesMet(getCourse(slot.courseId)?.prerequisites ?? [], completedCourseIds)
  const explicitPlannedCourseIds = new Set(plan.years.flatMap(year => year.terms.flatMap(term => term.slots.flatMap(slot => {
    if (slot.type === 'course') return [slot.courseId]
    if (slot.type === 'choice') return slot.alternatives
    return []
  }))))
  const programRequirements = selection?.includeProgramRequirements
    ? activeProgramRequirements(selection.programId ?? defaultProgramId, null, selection.catalogVersion ?? defaultCatalogVersion)
    : []
  const pathRequirements = [...programRequirements, ...resolvePathRequirements(selection)]
  const hasPathRequirements = pathRequirements.length > 0
  const preferredCourseIds = new Set([...explicitPlannedCourseIds, ...completedCourseIds])
  const activeCourseIds = hasPathRequirements ? expandPrerequisiteClosure(candidateCourseIds(pathRequirements), preferredCourseIds) : new Set<string>()
  const directRequiredCourseIds = hasPathRequirements ? directRequirementCourseIds(pathRequirements) : new Set<string>()
  const downstreamGraph = hasPathRequirements ? buildDownstreamGraph(activeCourseIds) : new Map<string, Set<string>>()
  const rankedPathCourses = hasPathRequirements ? buildRankedPathCourses(activeCourseIds, explicitPlannedCourseIds, completedCourseIds, directRequiredCourseIds, downstreamGraph) : []
  const rankedPathAssignmentCourses = hasPathRequirements ? buildRankedPathCourses(activeCourseIds, explicitPlannedCourseIds, new Set<string>(), directRequiredCourseIds, downstreamGraph) : []
  const generalDownstreamGraph = buildDownstreamGraph(explicitPlannedCourseIds)
  const rankedGeneralCourses = buildRankedPathCourses(explicitPlannedCourseIds, new Set<string>(), completedCourseIds, new Set<string>(), generalDownstreamGraph)
  const rankedPathCourseById = new Map(rankedPathCourses.map((course, index) => [course.courseId, { ...course, rank: index }]))
  const rankedGeneralCourseById = new Map(rankedGeneralCourses.map((course, index) => [course.courseId, { ...course, rank: index }]))
  const { assignments, courseOptions, selectedTargetKeys } = buildPathAssignments(
    plan,
    completedCourseIds,
    pathRequirements,
    rankedPathAssignmentCourses,
    directRequiredCourseIds,
    selection?.targetCourses,
    selection?.reservedCourseIds,
    new Set(programRequirements.map(requirement => requirement.id)),
  )
  const suggestions = new Map<string, ScheduledSuggestion>()
  const selectedEntries: SelectedEntry[] = []
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
            const assignedCourseId = assignments.get(key)
            const isCompleted = completed.has(key) || (assignedCourseId ? completed.has(`course:${assignedCourseId}`) : false)
            if (isCompleted || selectedInTerm.has(key)) return []
            const candidate = assignedCourseId
              ? resolveAssignedCourseCandidate(assignedCourseId, completedCourseIds, suggestedTerm ?? term.term, courseOptions.get(key)?.prerequisites)
              : resolveSlotCandidate(slot, completedCourseIds, suggestedTerm ?? term.term)
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

  return { credits, suggestions, assignments, courseOptions, selectedTargetKeys, isCourseReady, isHighPriority }
}

export function buildRegistrationPlan(plan: CurriculumPlan, completed: ReadonlySet<string>, selection?: ScheduleSelection): RegistrationPlan {
  const schedule = buildSuggestedSchedule(plan, completed, selection)
  const completedCourseIds = new Set([...completed]
    .filter(key => key.startsWith('course:'))
    .map(key => key.slice('course:'.length)))
  for (const courseId of selection?.assumedCompletedCourseIds ?? []) completedCourseIds.add(courseId)
  const slots = plan.years.flatMap(year => year.terms.flatMap(term => term.slots))
  const courses = slots.flatMap(slot => {
    const suggestion = schedule.suggestions.get(progressKey(slot))
    if (!suggestion) return []
    const key = progressKey(slot)
    const assignedCourseId = schedule.assignments.get(key)
    const courseId = suggestion.courseId ?? assignedCourseId ?? (slot.type === 'course' ? slot.courseId : undefined)
    return [{
      key,
      slot,
      courseId,
      label: courseId ? getCourse(courseId)?.code ?? slotLabel(slot) : slotLabel(slot),
      credits: slot.credits,
      category: presentationCategory(slot, assignedCourseId, schedule.courseOptions.get(key)),
      kind: suggestion.kind,
      priority: (suggestion.kind === 'stretch' ? 'stretch' : schedule.isHighPriority(slot) ? 'high' : 'regular') as RegistrationCourse['priority'],
      downstreamCount: 0,
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

  const downstreamCounts = new Map<string, number>()
  for (const edge of edges) downstreamCounts.set(edge.sourceCourseId, (downstreamCounts.get(edge.sourceCourseId) ?? 0) + 1)
  for (const course of courses) course.downstreamCount = course.courseId ? downstreamCounts.get(course.courseId) ?? 0 : 0
  const upcomingCourses = slots.flatMap(slot => {
    const key = progressKey(slot)
    if (completed.has(key) || schedule.suggestions.has(key)) return []
    const courseId = schedule.assignments.get(key) ?? (slot.type === 'course' ? slot.courseId : undefined)
    return [{
      key,
      label: courseId ? getCourse(courseId)?.code ?? slotLabel(slot) : slotLabel(slot),
      credits: slot.credits,
      prerequisiteCount: prerequisiteCount(getCourse(courseId ?? '')?.prerequisites ?? []),
      isAvailableNow: !courseId || (
        prerequisitesMet(getCourse(courseId)?.prerequisites ?? [], completedCourseIds) &&
        isCourseOffered(courseId, selection?.currentTerm ?? 'fall')
      ),
    }]
  })

  return { credits: schedule.credits, courses, edges, upcomingCourses }
}

/** Re-packs remaining plan slots into the earliest valid term without changing degree requirements. */
export function buildCompactedSchedule(
  plan: CurriculumPlan,
  completed: ReadonlySet<string>,
  maximumCredits: number,
  degreeType: DegreeType,
  selection?: ScheduleSelection,
): CompactedSchedule {
  const baseSchedule = buildSuggestedSchedule(plan, completed, selection)
  const completedCourseIds = completedCourseIdsFor(selection, completed)
  const orderedSlots = plan.years.flatMap(year => year.terms.flatMap(term => term.slots))
  const plannedConcreteCourseIds = new Set([
    ...orderedSlots.flatMap(slot => slot.type === 'course' ? [slot.courseId] : []),
    ...baseSchedule.assignments.values(),
  ])
  const assumedExternalPrerequisiteIds = new Set(
    [...plannedConcreteCourseIds]
      .flatMap(courseId => [...prerequisiteCourseIds(getCourse(courseId)?.prerequisites ?? [])])
      .filter(courseId => !plannedConcreteCourseIds.has(courseId)),
  )
  const originalOrder = new Map(orderedSlots.map((slot, index) => [progressKey(slot), index]))
  const completedSlots = orderedSlots.filter(slot => isSlotCompleted(slot, completed, baseSchedule.assignments))
  const remaining = orderedSlots.filter(slot => !isSlotCompleted(slot, completed, baseSchedule.assignments))
  const terms: CompactedTerm[] = []
  const scheduledCourseIds = new Set<string>()
  const scheduledChoiceTerms = new Map<string, number>()
  const previousChoiceByKey = buildPreviousChoiceKeys(orderedSlots)
  let termIndex = 0

  while (completedSlots.length > 0 || remaining.length > 0) {
    const term: 'fall' | 'spring' = termIndex % 2 === 0 ? 'fall' : 'spring'
    const availableBeforeTerm = new Set([...completedCourseIds, ...assumedExternalPrerequisiteIds, ...scheduledCourseIds])
    const scheduledThisTerm: PlanSlot[] = []
    const courseIdsThisTerm: string[] = []
    let credits = 0

    while (completedSlots.length > 0) {
      const completedSlot = completedSlots.find(slot => credits + slot.credits <= maximumCredits)
      if (!completedSlot) break
      completedSlots.splice(completedSlots.indexOf(completedSlot), 1)
      scheduledThisTerm.push(completedSlot)
      credits += completedSlot.credits
    }
    let madeProgress = true

    while (madeProgress) {
      madeProgress = false
      const candidateBundle = [...remaining]
        .sort((left, right) => (originalOrder.get(progressKey(left)) ?? 0) - (originalOrder.get(progressKey(right)) ?? 0))
        .map(slot => compactedCorequisiteBundle(slot, remaining, baseSchedule.assignments))
        .find(bundle => credits + bundle.reduce((total, slot) => total + slot.credits, 0) <= maximumCredits && bundle.every(slot => canCompactSlot(
          slot,
          term,
          termIndex,
          degreeType,
          availableBeforeTerm,
          completed,
          baseSchedule.assignments,
          baseSchedule.courseOptions,
          previousChoiceByKey,
          scheduledChoiceTerms,
        )))
      if (!candidateBundle) continue

      for (const candidate of candidateBundle) {
        remaining.splice(remaining.indexOf(candidate), 1)
        scheduledThisTerm.push(candidate)
        credits += candidate.credits
        const key = progressKey(candidate)
        if (candidate.type === 'choice') scheduledChoiceTerms.set(key, termIndex)
        const courseId = baseSchedule.assignments.get(key) ?? (candidate.type === 'course' ? candidate.courseId : undefined)
        if (courseId) courseIdsThisTerm.push(courseId)
        else if (candidate.type === 'choice') courseIdsThisTerm.push(...candidate.alternatives.filter(alternative => getCourse(alternative)))
      }
      madeProgress = true
    }

    if (scheduledThisTerm.length > 0) {
      terms.push({ year: Math.floor(termIndex / 2) + 1, term, slots: sortSlotsForPresentation(scheduledThisTerm, baseSchedule.assignments, baseSchedule.courseOptions, completed), credits })
      courseIdsThisTerm.forEach(courseId => scheduledCourseIds.add(courseId))
    }
    termIndex += 1
    if (termIndex > 24) throw new Error(`Unable to place compacted plan slots: ${remaining.map(progressKey).join(', ')}`)
  }

  return {
    terms,
    assignments: baseSchedule.assignments,
    courseOptions: baseSchedule.courseOptions,
    selectedTargetKeys: baseSchedule.selectedTargetKeys,
  }
}

function compactedCorequisiteBundle(slot: PlanSlot, remaining: readonly PlanSlot[], assignments: ReadonlyMap<string, string>): PlanSlot[] {
  const courseId = assignments.get(progressKey(slot)) ?? (slot.type === 'course' ? slot.courseId : undefined)
  if (!courseId) return [slot]
  const corequisiteIds = new Set(courseCorequisiteIds(courseId))
  return [slot, ...remaining.filter(candidate => {
    if (candidate === slot) return false
    const candidateCourseId = assignments.get(progressKey(candidate)) ?? (candidate.type === 'course' ? candidate.courseId : undefined)
    return Boolean(candidateCourseId && (corequisiteIds.has(candidateCourseId) || courseCorequisiteIds(candidateCourseId).includes(courseId)))
  })]
}

/** Category used consistently for course colors and left-to-right presentation. */
export function presentationCategory(slot: PlanSlot, assignedCourseId?: string, courseOptions?: PathSlotOptions): PresentationCategory {
  if (assignedCourseId || courseOptions?.required) return 'concentration-required'
  return slot.category
}

export function presentationCategoryRank(category: PresentationCategory): number {
  switch (category) {
    case 'cst': return 0
    case 'concentration-required': return 1
    case 'elective': return 2
    case 'math': return 3
    case 'ge-lower':
    case 'ge-upper': return 4
  }
}

export function sortSlotsForPresentation(slots: readonly PlanSlot[], assignments: ReadonlyMap<string, string> = new Map(), courseOptions: ReadonlyMap<string, PathSlotOptions> = new Map(), completed?: ReadonlySet<string>): PlanSlot[] {
  return slots
    .map((slot, index) => ({
      slot,
      index,
      category: presentationCategory(slot, assignments.get(progressKey(slot)), courseOptions.get(progressKey(slot))),
      completed: completed ? isSlotCompleted(slot, completed, assignments) : false,
    }))
    .sort((left, right) => Number(right.completed) - Number(left.completed) || presentationCategoryRank(left.category) - presentationCategoryRank(right.category) || left.index - right.index)
    .map(entry => entry.slot)
}

function completedCourseIdsFor(selection: ScheduleSelection | undefined, completed: ReadonlySet<string>): Set<string> {
  const courseIds = new Set([...completed]
    .filter(key => key.startsWith('course:'))
    .map(key => key.slice('course:'.length)))
  for (const courseId of selection?.assumedCompletedCourseIds ?? []) courseIds.add(courseId)
  return courseIds
}

function isSlotCompleted(slot: PlanSlot, completed: ReadonlySet<string>, assignments: ReadonlyMap<string, string>): boolean {
  const key = progressKey(slot)
  const assignedCourseId = assignments.get(key)
  return completed.has(key) || completed.has(assignedCourseId ? `course:${assignedCourseId}` : key)
}

function buildPreviousChoiceKeys(slots: readonly PlanSlot[]): Map<string, string> {
  const latestByAlternatives = new Map<string, string>()
  const previous = new Map<string, string>()
  for (const slot of slots) {
    if (slot.type !== 'choice') continue
    const alternatives = [...slot.alternatives].sort().join('|')
    const prior = latestByAlternatives.get(alternatives)
    if (prior) previous.set(progressKey(slot), prior)
    latestByAlternatives.set(alternatives, progressKey(slot))
  }
  return previous
}

function canCompactSlot(
  slot: PlanSlot,
  term: 'fall' | 'spring',
  termIndex: number,
  degreeType: DegreeType,
  completedCourseIds: ReadonlySet<string>,
  completed: ReadonlySet<string>,
  assignments: ReadonlyMap<string, string>,
  courseOptions: ReadonlyMap<string, PathSlotOptions>,
  previousChoiceByKey: ReadonlyMap<string, string>,
  scheduledChoiceTerms: ReadonlyMap<string, number>,
): boolean {
  const key = progressKey(slot)
  const previousChoice = previousChoiceByKey.get(key)
  if (previousChoice && scheduledChoiceTerms.get(previousChoice) === termIndex) return false
  if (previousChoice && !scheduledChoiceTerms.has(previousChoice) && !completed.has(previousChoice)) return false

  const assignedCourseId = assignments.get(key)
  if (assignedCourseId) return isCompactedCourseAvailable(assignedCourseId, term, termIndex, degreeType, completedCourseIds, courseOptions.get(key)?.prerequisites)
  if (slot.type === 'course') return isCompactedCourseAvailable(slot.courseId, term, termIndex, degreeType, completedCourseIds)
  if (slot.type === 'requirement' && !courseOptions.has(key)) return true

  if (slot.type === 'choice' && !courseOptions.has(key) && !slot.alternatives.every(alternative => getCourse(alternative))) return true
  const options: PathSlotOptions | undefined = courseOptions.get(key) ?? (slot.type === 'choice' ? { label: 'Course choice', courseIds: slot.alternatives } : undefined)
  return Boolean(options?.courseIds.some(courseId => isCompactedCourseAvailable(courseId, term, termIndex, degreeType, completedCourseIds, options.prerequisites)))
}

function isCompactedCourseAvailable(
  courseId: string,
  term: 'fall' | 'spring',
  termIndex: number,
  degreeType: DegreeType,
  completedCourseIds: ReadonlySet<string>,
  additionalPrerequisites: readonly unknown[] = [],
): boolean {
  const course = getCourse(courseId)
  if (!course || !isCourseOffered(courseId, term)) return false
  if (course.minimumStanding === 'junior' && degreeType !== 'ast-to-bs' && termIndex < 4) return false
  const completedWithCorequisites = new Set([...completedCourseIds, ...courseCorequisiteIds(courseId)])
  return prerequisitesMet([...course.prerequisites, ...additionalPrerequisites], completedWithCorequisites)
}

function buildPathAssignments(
  plan: CurriculumPlan,
  completedCourseIds: ReadonlySet<string>,
  pathRequirements: Requirement[],
  rankedPathCourses: RankedCourse[],
  directRequiredCourseIds: ReadonlySet<string>,
  targetCourses?: ReadonlyMap<string, string>,
  reservedCourseIds?: ReadonlyMap<string, readonly string[]>,
  creditSelectableRequirementIds: ReadonlySet<string> = new Set(),
): { assignments: Map<string, string>; courseOptions: Map<string, PathSlotOptions>; selectedTargetKeys: Set<string> } {
  const assignments = new Map<string, string>()
  const courseOptions = buildChoiceOptions(plan)
  const selectedTargetKeys = new Set<string>()

  if (pathRequirements.length > 0) {
    const projectedCourseIds = new Set(completedCourseIds)
    const usedPathCourseIds = new Set<string>()
    const requiredPathCourses = rankedPathCourses.filter(course => directRequiredCourseIds.has(course.courseId))
    const remainingSlots: { slot: Extract<PlanSlot, { type: 'requirement' }>; term: 'fall' | 'spring' }[] = []

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
          const derivedRequirementId = requirementIdForDerivedSlot(slot)
          if (derivedRequirementId && creditSelectableRequirementIds.has(derivedRequirementId)) {
            remainingSlots.push({ slot, term: term.term })
            continue
          }
          const courseId = pickGenericCourse(slot, courseIdsCompletedBeforeTerm, requiredPathCourses, usedPathCourseIds, term.term)
          if (!courseId) {
            remainingSlots.push({ slot, term: term.term })
            continue
          }
          assignments.set(progressKey(slot), courseId)
          usedPathCourseIds.add(courseId)
          courseIdsTakenThisTerm.push(courseId)
        }
        courseIdsTakenThisTerm.forEach(courseId => projectedCourseIds.add(courseId))
      }
    }

    const optionGroups = pathOptionGroups(pathRequirements, creditSelectableRequirementIds)
      .sort((left, right) => Number(Boolean(right.required)) - Number(Boolean(left.required)))
    const projectedByTerm = projectedCoursesBeforeTerms(plan, completedCourseIds, assignments)
    const unassignedSlots = [...remainingSlots]
    for (const optionGroup of optionGroups) {
      const slotIndex = unassignedSlots.findIndex(({ slot, term }) => {
        const derivedRequirementId = requirementIdForDerivedSlot(slot)
        if (derivedRequirementId) return optionGroup.requirementId === derivedRequirementId
        if (optionGroup.requirementId) return false
        const projectedCourseIds = projectedByTerm.get(progressKey(slot)) ?? completedCourseIds
        return prerequisitesMet(optionGroup.prerequisites ?? [], projectedCourseIds) && optionGroup.courseIds.some(courseId => {
          const course = getCourse(courseId)
          return course && isCourseOffered(courseId, term) && prerequisitesMet(course.prerequisites, projectedCourseIds)
        })
      })
      if (slotIndex < 0) continue
      const [target] = unassignedSlots.splice(slotIndex, 1)
      if (target) courseOptions.set(progressKey(target.slot), optionGroup)
    }

    const electiveFallback = electiveFallbackOption(pathRequirements)
    if (electiveFallback) {
      for (const { slot } of unassignedSlots) courseOptions.set(progressKey(slot), electiveFallback)
    }
  }

  const unavailableCourseIds = new Set([
    ...assignments.values(),
    ...[...(reservedCourseIds ?? new Map()).values()].flat(),
  ])
  for (const [slotKey, courseId] of targetCourses ?? []) {
    const options = courseOptions.get(slotKey)
    if (!options || !options.courseIds.includes(courseId) || unavailableCourseIds.has(courseId)) continue
    assignments.set(slotKey, courseId)
    selectedTargetKeys.add(slotKey)
    unavailableCourseIds.add(courseId)
  }
  filterUnavailableOptions(courseOptions, assignments, unavailableCourseIds, reservedCourseIds)

  return { assignments, courseOptions, selectedTargetKeys }
}

function buildChoiceOptions(plan: CurriculumPlan): Map<string, PathSlotOptions> {
  const options = new Map<string, PathSlotOptions>()
  for (const year of plan.years) {
    for (const term of year.terms) {
      for (const slot of term.slots) {
        if (slot.type !== 'choice' || !slot.alternatives.every(courseId => getCourse(courseId))) continue
        options.set(progressKey(slot), { label: courseOptionLabel(slot.alternatives, 'Course choice'), courseIds: slot.alternatives })
      }
    }
  }
  return options
}

function filterUnavailableOptions(optionsBySlot: Map<string, PathSlotOptions>, assignments: ReadonlyMap<string, string>, unavailableCourseIds: ReadonlySet<string>, reservedCourseIds: ReadonlyMap<string, readonly string[]> = new Map()) {
  for (const [slotKey, options] of optionsBySlot) {
    const selectedCourseId = assignments.get(slotKey)
    const selectedForSlot = new Set(reservedCourseIds.get(slotKey) ?? [])
    optionsBySlot.set(slotKey, {
      ...options,
      courseIds: options.courseIds.filter(courseId => courseId === selectedCourseId || selectedForSlot.has(courseId) || !unavailableCourseIds.has(courseId)),
    })
  }
}

function pathOptionGroups(requirements: Requirement[], creditSelectableRequirementIds: ReadonlySet<string> = new Set()): PathSlotOptions[] {
  return requirements.flatMap<PathSlotOptions>(requirement => {
    const courseIds = requirementCourseIds(requirement)
    if (requirement.completion.kind === 'all') return []
    if (requirement.completion.kind === 'choose') {
      return Array.from({ length: requirement.completion.count }, () => ({
        label: courseOptionLabel(courseIds, requirement.optionLabel ?? 'Concentration course option'),
        courseIds,
        required: true,
        ...(requirement.prerequisites ? { prerequisites: requirement.prerequisites } : {}),
      }))
    }
    const requiredCredits = requirement.completion.credits
    const slotCount = Math.ceil(requiredCredits / 4)
    return Array.from({ length: slotCount }, () => ({
      label: requirement.optionLabel ?? 'Concentration elective option',
      courseIds,
      ...(creditSelectableRequirementIds.has(requirement.id) ? {
        minimumCredits: Math.min(4, requiredCredits),
        requirementId: requirement.id,
      } : {}),
    }))
  })
}

function requirementIdForDerivedSlot(slot: Extract<PlanSlot, { type: 'requirement' }>): string | undefined {
  const match = /^derived-(.+)-\d+$/.exec(slot.slotId)
  return match?.[1]
}

function projectedCoursesBeforeTerms(plan: CurriculumPlan, completedCourseIds: ReadonlySet<string>, assignments: ReadonlyMap<string, string>): Map<string, Set<string>> {
  const projected = new Set(completedCourseIds)
  const beforeTerm = new Map<string, Set<string>>()
  for (const year of plan.years) {
    for (const term of year.terms) {
      const takenThisTerm: string[] = []
      for (const slot of term.slots) {
        beforeTerm.set(progressKey(slot), new Set(projected))
        const courseId = assignments.get(progressKey(slot)) ?? (slot.type === 'course' ? slot.courseId : undefined)
        if (courseId) takenThisTerm.push(courseId)
      }
      takenThisTerm.forEach(courseId => projected.add(courseId))
    }
  }
  return beforeTerm
}

function courseOptionLabel(courseIds: readonly string[], fallback: string): string {
  if (courseIds.length !== 2) return fallback
  return courseIds.map(courseId => getCourse(courseId)?.code ?? courseId).join(' or ')
}

function electiveFallbackOption(requirements: Requirement[]): PathSlotOptions | undefined {
  const requirement = requirements.find(candidate => candidate.completion.kind === 'minimumCredits')
  if (!requirement) return undefined
  return {
    label: requirement.optionLabel ?? 'Concentration elective option',
    courseIds: requirementCourseIds(requirement),
  }
}

function resolvePathRequirements(selection?: ScheduleSelection): Requirement[] {
  if (!selection) return []
  const catalogVersion = selection.catalogVersion ?? defaultCatalogVersion
  return [
    ...concentrationRequirements(selection.programId ?? defaultProgramId, selection.concentrationId, catalogVersion),
    ...minorRequirements(selection.minorId, catalogVersion),
  ]
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

  return { consumePathCourse: false }
}

function resolveAssignedCourseCandidate(
  courseId: string,
  projectedCourseIds: ReadonlySet<string>,
  term: 'fall' | 'spring',
  additionalPrerequisites: readonly unknown[] = [],
): { courseId: string; consumePathCourse: boolean } | undefined {
  const course = getCourse(courseId)
  if (!course || !isCourseOffered(course.id, term) || !prerequisitesMet([...course.prerequisites, ...additionalPrerequisites], projectedCourseIds)) return undefined
  return { courseId: course.id, consumePathCourse: false }
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
