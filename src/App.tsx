import { lazy, Suspense, useEffect, useState } from 'react'
import './App.css'
import { AdditionalCourseAdd, AdditionalCourseCell, AdditionalCourseModal, AdditionalCoursePlaceholder, type AdditionalCourse } from './components/AdditionalCourse'
import { CourseCell, CourseModal } from './components/CourseBox'
import { ReadinessAssessment } from './components/ReadinessAssessment'
import { TransferReadiness } from './components/TransferReadiness'
import { getAssessmentPack } from './models/Assessments'
import { catalogVersions, defaultCatalogVersion, degreeYearLabel, getCourse, planForDegreeType, prerequisitesMet, progressKey, remainingPlanCredits, summarizePlanCredits, transferAssumedCourseIds, type AcademicTerm, type DegreeType, type PlanSlot } from './models/Curriculum'
import { buildCompactedSchedule, buildRegistrationPlan, buildSuggestedSchedule, sortSlotsForPresentation } from './models/Scheduling'
import { buildPreparationTerms, preparationCredits } from './models/TransferPreparation'

const progressStorageKey = 'courseguide-completed-v1'
const concentrationStorageKey = 'courseguide-concentration-v1'
const catalogVersionStorageKey = 'courseguide-catalog-version-v1'
const targetCoursesStorageKey = 'courseguide-target-courses-v1'
const degreeTypeStorageKey = 'courseguide-degree-type-v1'
const transferPreparationStorageKey = 'courseguide-transfer-preparation-v1'
const additionalCoursesStorageKey = 'courseguide-additional-courses-v1'
const activeProgramId = 'bs-computer-science'
const RegistrationPlanner = lazy(() => import('./components/RegistrationPlanner').then(module => ({ default: module.RegistrationPlanner })))

function targetCourseKey(catalogVersion: string, degreeType: DegreeType, scope: string, slotKey: string): string {
  return `${catalogVersion}/${degreeType}/${scope}:${slotKey}`
}

function targetScopeForSlot(slot: PlanSlot, concentrationId: string | null): string | null {
  return slot.type === 'choice' ? 'general' : concentrationId
}

function linkedChoiceSlots(plan: ReturnType<typeof planForDegreeType>, slot: PlanSlot): PlanSlot[] {
  if (slot.type !== 'choice' || slot.alternatives.length !== 2) return []
  const alternativesKey = [...slot.alternatives].sort().join('|')
  return plan.years.flatMap(year => year.terms.flatMap(term => term.slots))
    .filter((candidate): candidate is Extract<PlanSlot, { type: 'choice' }> =>
      candidate.type === 'choice' &&
      progressKey(candidate) !== progressKey(slot) &&
      [...candidate.alternatives].sort().join('|') === alternativesKey)
}

function readCompleted(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(progressStorageKey) ?? '[]')
    return new Set(Array.isArray(value) && value.every(item => typeof item === 'string') ? value : [])
  } catch {
    return new Set()
  }
}

function readConcentration(): string | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(concentrationStorageKey) ?? 'null')
    return typeof value === 'string' ? value : 'general'
  } catch {
    return 'general'
  }
}

function readCatalogVersion(): string {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(catalogVersionStorageKey) ?? JSON.stringify(defaultCatalogVersion))
    return typeof value === 'string' && catalogVersions[value] ? value : defaultCatalogVersion
  } catch {
    return defaultCatalogVersion
  }
}

function readTargetCourses(): Map<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(targetCoursesStorageKey) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return new Map()
    return new Map(Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
      .map(([key, courseId]) => [key.includes('/bs/') || key.includes('/ast-to-bs/') ? key : key.replace(/^([^/]+)\//, '$1/bs/'), courseId]))
  } catch {
    return new Map()
  }
}

function readDegreeType(): DegreeType {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(degreeTypeStorageKey) ?? '"bs"')
    return value === 'ast-to-bs' ? value : 'bs'
  } catch {
    return 'bs'
  }
}

function readTransferPreparation(): Map<string, string[]> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(transferPreparationStorageKey) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return new Map()
    const entries: [string, string[]][] = []
    for (const [key, courseIds] of Object.entries(value)) {
      if (Array.isArray(courseIds)) entries.push([key, courseIds.filter((courseId): courseId is string => typeof courseId === 'string')])
    }
    return new Map(entries)
  } catch {
    return new Map()
  }
}

function readAdditionalCourses(): Map<string, AdditionalCourse[]> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(additionalCoursesStorageKey) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return new Map()
    return new Map(Object.entries(value).flatMap(([termKey, courses]) => {
      if (!Array.isArray(courses)) return []
      const validCourses = courses.flatMap(course => {
        if (!course || typeof course !== 'object') return []
        const { id, code, name, credits } = course as Record<string, unknown>
        if (typeof id !== 'string' || typeof code !== 'string' || typeof credits !== 'number' || !Number.isFinite(credits) || credits <= 0 || credits > 18) return []
        return [{ id, code, credits, ...(typeof name === 'string' ? { name } : {}) }]
      })
      return [[termKey, validCourses] as [string, AdditionalCourse[]]]
    }))
  } catch {
    return new Map()
  }
}

function App() {
  const [selectedSlot, setSelectedSlot] = useState<PlanSlot | null>(null)
  const [assessmentCourseId, setAssessmentCourseId] = useState<string | null>(null)
  const [completed, setCompleted] = useState<Set<string>>(() => readCompleted())
  const [selectedConcentration, setSelectedConcentration] = useState<string | null>(() => readConcentration())
  const [selectedCatalogVersion, setSelectedCatalogVersion] = useState<string>(() => readCatalogVersion())
  const [degreeType, setDegreeType] = useState<DegreeType>(() => readDegreeType())
  const [targetCourses, setTargetCourses] = useState<Map<string, string>>(() => readTargetCourses())
  const [transferPreparation, setTransferPreparation] = useState<Map<string, string[]>>(() => readTransferPreparation())
  const [additionalCourses, setAdditionalCourses] = useState<Map<string, AdditionalCourse[]>>(() => readAdditionalCourses())
  const [additionalCourseTerm, setAdditionalCourseTerm] = useState<{ key: string; label: string; plannedCredits: number } | null>(null)
  const [transferReadinessOpen, setTransferReadinessOpen] = useState(false)
  const [activeView, setActiveView] = useState<'roadmap' | 'registration' | 'compacted'>('roadmap')
  const [registrationTerm, setRegistrationTerm] = useState<AcademicTerm>('fall')
  const [compactedCreditLimit, setCompactedCreditLimit] = useState(15)

  useEffect(() => {
    localStorage.setItem(progressStorageKey, JSON.stringify([...completed]))
  }, [completed])

  useEffect(() => {
    localStorage.setItem(concentrationStorageKey, JSON.stringify(selectedConcentration))
  }, [selectedConcentration])

  useEffect(() => {
    localStorage.setItem(catalogVersionStorageKey, JSON.stringify(selectedCatalogVersion))
  }, [selectedCatalogVersion])

  useEffect(() => {
    localStorage.setItem(targetCoursesStorageKey, JSON.stringify(Object.fromEntries(targetCourses)))
  }, [targetCourses])

  useEffect(() => {
    localStorage.setItem(degreeTypeStorageKey, JSON.stringify(degreeType))
  }, [degreeType])

  useEffect(() => {
    localStorage.setItem(transferPreparationStorageKey, JSON.stringify(Object.fromEntries(transferPreparation)))
  }, [transferPreparation])

  useEffect(() => {
    localStorage.setItem(additionalCoursesStorageKey, JSON.stringify(Object.fromEntries(additionalCourses)))
  }, [additionalCourses])

  const updateCompletion = (slot: PlanSlot, isCompleted: boolean, resolvedCourseId?: string | null) => {
    setCompleted(current => {
      const next = new Set(current)
      const slotKey = progressKey(slot)
      const courseKey = resolvedCourseId ? `course:${resolvedCourseId}` : null
      if (isCompleted) {
        if (slot.type !== 'course') next.add(slotKey)
        if (courseKey) next.add(courseKey)
      } else {
        if (slot.type !== 'course') next.delete(slotKey)
        if (courseKey) next.delete(courseKey)
      }
      return next
    })
  }

  const resetPlanner = () => {
    if (!window.confirm('Reset all saved planner progress, course choices, and transfer preparation on this device?')) return
    setCompleted(new Set())
    setTargetCourses(new Map())
    setTransferPreparation(new Map())
    setAdditionalCourses(new Map())
    setSelectedConcentration('general')
    setSelectedCatalogVersion(defaultCatalogVersion)
    setDegreeType('bs')
    setActiveView('roadmap')
    setRegistrationTerm('fall')
    setCompactedCreditLimit(15)
    setSelectedSlot(null)
    setAssessmentCourseId(null)
    setTransferReadinessOpen(false)
    setAdditionalCourseTerm(null)
  }

  const updateTransferPreparation = (courseId: string, included: boolean) => {
    setTransferPreparation(current => {
      const next = new Map(current)
      const selected = new Set(next.get(`${selectedCatalogVersion}/ast-to-bs`) ?? [])
      if (included) selected.add(courseId)
      else selected.delete(courseId)
      next.set(`${selectedCatalogVersion}/ast-to-bs`, [...selected])
      return next
    })
  }

  const updateTransferCompletion = (courseId: string, isCompleted: boolean) => {
    setCompleted(current => {
      const next = new Set(current)
      if (isCompleted) next.add(`course:${courseId}`)
      else next.delete(`course:${courseId}`)
      return next
    })
  }

  const addAdditionalCourse = (termKey: string, course: Omit<AdditionalCourse, 'id'>) => {
    setAdditionalCourses(current => {
      const next = new Map(current)
      const existing = next.get(termKey) ?? []
      next.set(termKey, [...existing, { ...course, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` }])
      return next
    })
  }

  const removeAdditionalCourse = (termKey: string, courseId: string) => {
    setAdditionalCourses(current => {
      const next = new Map(current)
      const remaining = (next.get(termKey) ?? []).filter(course => course.id !== courseId)
      if (remaining.length > 0) next.set(termKey, remaining)
      else next.delete(termKey)
      return next
    })
  }

  const selectTargetCourse = (slot: PlanSlot, courseId: string) => {
    const targetScope = targetScopeForSlot(slot, activeConcentrationId)
    if (!targetScope) return
    setTargetCourses(current => {
      const next = new Map(current)
      next.set(targetCourseKey(selectedCatalogVersion, degreeType, targetScope, progressKey(slot)), courseId)
      if (slot.type === 'choice') {
        const pairedCourseId = slot.alternatives.find(alternative => alternative !== courseId)
        if (pairedCourseId) {
          for (const pairedSlot of linkedChoiceSlots(activePlan, slot)) {
            next.set(targetCourseKey(selectedCatalogVersion, degreeType, targetScope, progressKey(pairedSlot)), pairedCourseId)
          }
        }
      }
      return next
    })
  }

  const clearTargetCourse = (slot: PlanSlot) => {
    const targetScope = targetScopeForSlot(slot, activeConcentrationId)
    if (!targetScope) return
    setTargetCourses(current => {
      const next = new Map(current)
      next.delete(targetCourseKey(selectedCatalogVersion, degreeType, targetScope, progressKey(slot)))
      if (slot.type === 'choice') {
        for (const pairedSlot of linkedChoiceSlots(activePlan, slot)) {
          next.delete(targetCourseKey(selectedCatalogVersion, degreeType, targetScope, progressKey(pairedSlot)))
        }
      }
      return next
    })
    setSelectedSlot(null)
  }

  const activeCatalog = catalogVersions[selectedCatalogVersion] ?? catalogVersions[defaultCatalogVersion]
  const activeProgram = activeCatalog.programs[activeProgramId]
  const activePlan = planForDegreeType(degreeType)
  const planCredits = summarizePlanCredits(activePlan)
  const activeConcentrationId = selectedConcentration && activeProgram.concentrations[selectedConcentration] ? selectedConcentration : null
  const activeTargetCourses = new Map(
    [...targetCourses]
      .filter(([key]) => key.startsWith(`${selectedCatalogVersion}/${degreeType}/general:`) || (activeConcentrationId ? key.startsWith(`${selectedCatalogVersion}/${degreeType}/${activeConcentrationId}:`) : false))
      .map(([key, courseId]) => [key.slice(key.indexOf(':') + 1), courseId]),
  )
  const suggestedSchedule = buildSuggestedSchedule(activePlan, completed, {
    programId: activeProgramId,
    catalogVersion: selectedCatalogVersion,
    concentrationId: activeConcentrationId,
    targetCourses: activeTargetCourses,
    ...(degreeType === 'ast-to-bs' ? { assumedCompletedCourseIds: transferAssumedCourseIds } : {}),
  })
  const registrationPlan = buildRegistrationPlan(activePlan, completed, {
    programId: activeProgramId,
    catalogVersion: selectedCatalogVersion,
    concentrationId: activeConcentrationId,
    targetCourses: activeTargetCourses,
    currentTerm: registrationTerm,
    ...(degreeType === 'ast-to-bs' ? { assumedCompletedCourseIds: transferAssumedCourseIds } : {}),
  })
  const compactedSchedule = buildCompactedSchedule(activePlan, completed, compactedCreditLimit, degreeType, {
    programId: activeProgramId,
    catalogVersion: selectedCatalogVersion,
    concentrationId: activeConcentrationId,
    targetCourses: activeTargetCourses,
    ...(degreeType === 'ast-to-bs' ? { assumedCompletedCourseIds: transferAssumedCourseIds } : {}),
  })
  const compactedYears = Array.from(new Set(compactedSchedule.terms.map(term => term.year))).map(year => ({
    year,
    terms: compactedSchedule.terms.filter(term => term.year === year),
  }))
  const completedCourseIds = new Set([...completed]
    .filter(key => key.startsWith('course:'))
    .map(key => key.slice('course:'.length)))
  const selectedSuggestion = selectedSlot ? suggestedSchedule.suggestions.get(progressKey(selectedSlot)) ?? null : null
  const selectedAssignedCourseId = selectedSlot ? suggestedSchedule.assignments.get(progressKey(selectedSlot)) : undefined
  const selectedCourseOptions = selectedSlot ? suggestedSchedule.courseOptions.get(progressKey(selectedSlot)) : undefined
  const resolvedCourseId = selectedSuggestion?.courseId ?? selectedAssignedCourseId ?? (selectedSlot?.type === 'course' ? selectedSlot.courseId : null)
  const selectedPrerequisitesMet = resolvedCourseId ? prerequisitesMet(getCourse(resolvedCourseId)?.prerequisites ?? [], completedCourseIds) : selectedSlot ? suggestedSchedule.isCourseReady(selectedSlot) : undefined
  const preparationKey = `${selectedCatalogVersion}/ast-to-bs`
  const preparationCourseIds = new Set(transferPreparation.get(preparationKey) ?? [])
  const preparationTerms = degreeType === 'ast-to-bs' ? buildPreparationTerms(preparationCourseIds) : []
  const preparationRemainingCredits = degreeType === 'ast-to-bs' ? preparationCredits(preparationCourseIds, completed) : 0
  const remainingCredits = remainingPlanCredits(activePlan, completed, suggestedSchedule.assignments) + preparationRemainingCredits
  const semestersAtFifteen = Math.ceil(remainingCredits / 15)
  const semestersAtEighteen = Math.ceil(remainingCredits / 18)
  const additionalCourseView = activeView === 'compacted' ? 'compacted' : 'roadmap'
  const additionalCourseScope = `${selectedCatalogVersion}/${degreeType}/${additionalCourseView}`
  const additionalCredits = [...additionalCourses]
    .filter(([key]) => key.startsWith(`${selectedCatalogVersion}/${degreeType}/`))
    .flatMap(([, courses]) => courses)
    .reduce((total, course) => total + course.credits, 0)
  const transferCredits = degreeType === 'ast-to-bs' ? 60 : 0
  const graduationCredits = planCredits.total + transferCredits + additionalCredits
  const graduationCreditsRemaining = Math.max(0, 120 - graduationCredits)
  const additionalTermKey = (termId: string) => `${additionalCourseScope}/${termId}`
  const renderAdditionalCoursework = (termId: string, label: string, plannedCredits: number) => {
    const key = additionalTermKey(termId)
    const courses = additionalCourses.get(key) ?? []
    const addedCredits = courses.reduce((total, course) => total + course.credits, 0)
    const totalCredits = plannedCredits + addedCredits
    const placeholderCredits = Math.max(0, 15 - totalCredits)
    const canAdd = totalCredits < 18
    const open = () => setAdditionalCourseTerm({ key, label, plannedCredits })
    return <>
      {courses.map(course => <AdditionalCourseCell key={course.id} course={course} onSelect={open} />)}
      {placeholderCredits > 0 && <AdditionalCoursePlaceholder credits={placeholderCredits} onSelect={open} />}
      {placeholderCredits === 0 && canAdd && <AdditionalCourseAdd onSelect={open} />}
    </>
  }

  return (
    <main className="planner">
      <header className="planner-header">
        <div><p className="eyebrow">Computer Science</p><h1>Curriculum planner</h1><p>Explore the suggested course sequence and mark completed coursework.</p></div>
        <div className="header-actions">
          <button className="reset-button" type="button" onClick={resetPlanner}>Reset planner</button>
        </div>
      </header>
      <section className="credit-summary" aria-label="Curriculum credit summary">
        <strong>{graduationCredits} of 120 credits tracked</strong>
        <span>{graduationCreditsRemaining > 0 ? `${graduationCreditsRemaining} additional credits needed` : '120-credit goal met'}</span>
        <span>{planCredits.total} degree-plan credits</span>
        {degreeType === 'ast-to-bs' && <span>60 assumed transfer credits</span>}
        {additionalCredits > 0 && <span>{additionalCredits} extra coursework credits</span>}
        <span>{planCredits.major} major/core</span>
        <span>{planCredits.lowerDivisionGeneralEducation} lower-division GE</span>
        <span>{planCredits.upperDivisionGeneralEducation} upper-division GE</span>
      </section>
      <section className="catalog-controls" aria-label="Catalog and planner view">
        <label className="catalog-picker">Catalog version
          <select value={selectedCatalogVersion} onChange={event => setSelectedCatalogVersion(event.target.value)}>{Object.entries(catalogVersions).map(([catalogVersion, catalog]) => <option key={catalogVersion} value={catalogVersion}>{catalog.title}</option>)}</select>
        </label>
        <nav className="view-picker" aria-label="Planner view">
          <button className={`path-button${activeView === 'registration' ? ' is-selected' : ''}`} type="button" onClick={() => setActiveView('registration')}>Registration planner</button>
          <button className={`path-button${activeView === 'roadmap' ? ' is-selected' : ''}`} type="button" onClick={() => setActiveView('roadmap')}>Roadmap</button>
          <button className={`path-button${activeView === 'compacted' ? ' is-selected' : ''}`} type="button" onClick={() => setActiveView('compacted')}>Compacted</button>
        </nav>
      </section>
      <section className="degree-picker" aria-label="Degree type">
        <span className="legend-title">Degree</span>
        <button className={`path-button${degreeType === 'bs' ? ' is-selected' : ''}`} type="button" onClick={() => setDegreeType('bs')}>B.S.</button>
        <button className={`path-button${degreeType === 'ast-to-bs' ? ' is-selected' : ''}`} type="button" onClick={() => setDegreeType('ast-to-bs')}>AS-T to B.S.</button>
        {degreeType === 'ast-to-bs' && <button className="transfer-readiness-button" type="button" onClick={() => setTransferReadinessOpen(true)}>Check transfer readiness</button>}
      </section>
      <section className="path-picker" aria-label="Program concentration">
        <span className="legend-title">Path</span>
        {Object.entries(activeProgram.concentrations)
          .sort(([leftId, left], [rightId, right]) => {
            if (leftId === 'general') return -1
            if (rightId === 'general') return 1
            return left.title.localeCompare(right.title)
          })
          .map(([concentrationId, concentration]) => (
          <button
            key={concentrationId}
            className={`path-button${activeConcentrationId === concentrationId ? ' is-selected' : ''}`}
            type="button"
            onClick={() => setSelectedConcentration(concentrationId)}
          >
            {concentration.title}
          </button>
        ))}
      </section>
      {activeView === 'registration' && <Suspense fallback={<p className="planner-loading">Loading registration planner…</p>}><RegistrationPlanner plan={registrationPlan} currentTerm={registrationTerm} onCurrentTermChange={setRegistrationTerm} onCourseSelect={setSelectedSlot} /></Suspense>}
      {activeView === 'roadmap' && suggestedSchedule.suggestions.size > 0 && <section className="next-term" aria-live="polite"><strong>Suggested schedule:</strong> {suggestedSchedule.credits} credits. <strong>{remainingCredits} planned credits remain</strong> — about {semestersAtFifteen} semesters at 15 credits per term, or {semestersAtEighteen} at 18.</section>}
      {activeView === 'compacted' && <section className="compacted-controls" aria-label="Compacted schedule settings">
        <label htmlFor="compacted-credit-limit">Maximum credits per term <strong>{compactedCreditLimit}</strong></label>
        <input id="compacted-credit-limit" type="range" min="12" max="18" value={compactedCreditLimit} onChange={event => setCompactedCreditLimit(Number(event.target.value))} />
        <p>Courses are placed in the earliest fall or spring term that meets their prerequisites, offering pattern, and standing requirements.</p>
      </section>}
      <section className="legend" aria-label="Course category legend">
        <span className="legend-title">Course groups</span>
        <span className="category-cst">Core</span><span className="category-math">Math</span><span className="category-ge-lower">Lower-division GE</span><span className="category-ge-upper">Upper-division GE</span><span className="category-concentration-required">Concentration requirement</span><span className="category-elective">Elective</span><span className="additional-course-legend">Extra coursework</span><span className="offering-legend">Limited-term offering</span>
      </section>
      {activeView === 'roadmap' && <><p className="scroll-hint">Scroll horizontally to see the complete 18-credit grid on smaller screens.</p>
      <div className="curriculum-scroll">
        <div className="curriculum-grid" role="table" aria-label="Suggested curriculum plan">
          <div className="grid-header" role="row">
            <span>Year</span><span>Term</span>
            <div className="credit-heading"><strong>Suggested credits</strong><div className="credit-numbers" aria-label="Credit positions">{Array.from({ length: 18 }, (_, index) => <span key={index}>{index + 1}</span>)}</div></div>
          </div>
          {preparationTerms.map((term, index) => (
            <div className="year-group preparation-year-group" role="rowgroup" key={`preparation-${index}`}>
              <div className="year-label" role="rowheader">Preparation</div>
              <div className="term-row" role="row">
                <div className="term-label" role="rowheader">{term.term}</div>
                <div className="credit-grid" role="cell">
                  {sortSlotsForPresentation(term.slots).map(slot => {
                    const isCompleted = completed.has(progressKey(slot))
                    return <CourseCell key={progressKey(slot)} slot={slot} selectedTarget={false} completed={isCompleted} suggestion={null} highPriority={false} onSelect={() => setSelectedSlot(slot)} />
                  })}
                </div>
              </div>
            </div>
          ))}
          {activePlan.years.map(year => (
            <div className="year-group" role="rowgroup" key={year.year}>
              <div className="year-label" role="rowheader">{degreeYearLabel(degreeType, year.year)}</div>
              {year.terms.map(term => (
                <div className="term-row" role="row" key={`${year.year}-${term.term}`}>
                  <div className="term-label" role="rowheader">{term.term}</div>
                  <div className="credit-grid" role="cell">
                    {sortSlotsForPresentation(term.slots, suggestedSchedule.assignments, suggestedSchedule.courseOptions).map(slot => {
                      const assignedCourseId = suggestedSchedule.assignments.get(progressKey(slot))
                      const courseOptions = suggestedSchedule.courseOptions.get(progressKey(slot))
                      const isCompleted = completed.has(assignedCourseId ? `course:${assignedCourseId}` : progressKey(slot))
                      const suggestion = suggestedSchedule.suggestions.get(progressKey(slot)) ?? null
                      return <CourseCell key={progressKey(slot)} slot={slot} assignedCourseId={assignedCourseId} courseOptions={courseOptions} selectedTarget={suggestedSchedule.selectedTargetKeys.has(progressKey(slot))} completed={isCompleted} suggestion={suggestion} highPriority={suggestedSchedule.isHighPriority(slot) && !isCompleted} onSelect={() => setSelectedSlot(slot)} />
                    })}
                    {renderAdditionalCoursework(`${year.year}-${term.term}`, `${degreeYearLabel(degreeType, year.year)} ${term.term}`, term.slots.reduce((total, slot) => total + slot.credits, 0))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      </>}
      {activeView === 'compacted' && <><p className="scroll-hint">Scroll horizontally to see the complete 18-credit grid on smaller screens.</p>
      <div className="curriculum-scroll">
        <div className="curriculum-grid" role="table" aria-label="Compacted curriculum plan">
          <div className="grid-header" role="row">
            <span>Year</span><span>Term</span>
            <div className="credit-heading"><strong>Planned credits</strong><div className="credit-numbers" aria-label="Credit positions">{Array.from({ length: 18 }, (_, index) => <span key={index}>{index + 1}</span>)}</div></div>
          </div>
          {preparationTerms.map((term, index) => (
            <div className="year-group preparation-year-group" role="rowgroup" key={`compacted-preparation-${index}`}>
              <div className="year-label" role="rowheader">Preparation</div>
              <div className="term-row" role="row">
                <div className="term-label" role="rowheader">{term.term}</div>
                <div className="credit-grid" role="cell">
                  {sortSlotsForPresentation(term.slots, new Map(), new Map(), completed).map(slot => <CourseCell key={progressKey(slot)} slot={slot} selectedTarget={false} completed={completed.has(progressKey(slot))} suggestion={null} highPriority={false} onSelect={() => setSelectedSlot(slot)} />)}
                </div>
              </div>
            </div>
          ))}
          {compactedYears.map(year => (
            <div className="year-group compacted-year-group" role="rowgroup" key={year.year}>
              <div className="year-label" style={{ gridRow: `span ${year.terms.length}` }} role="rowheader">{year.year}{year.year === 1 ? 'st' : year.year === 2 ? 'nd' : year.year === 3 ? 'rd' : 'th'} year</div>
              {year.terms.map(term => (
                <div className="term-row" role="row" key={`${term.year}-${term.term}`}>
                  <div className="term-label" role="rowheader">{term.term} · {term.credits}</div>
                  <div className="credit-grid" role="cell">
                    {sortSlotsForPresentation(term.slots, compactedSchedule.assignments, compactedSchedule.courseOptions, completed).map(slot => {
                      const assignedCourseId = compactedSchedule.assignments.get(progressKey(slot))
                      const courseOptions = compactedSchedule.courseOptions.get(progressKey(slot))
                      const isCompleted = completed.has(assignedCourseId ? `course:${assignedCourseId}` : progressKey(slot))
                      return <CourseCell key={progressKey(slot)} slot={slot} assignedCourseId={assignedCourseId} courseOptions={courseOptions} selectedTarget={compactedSchedule.selectedTargetKeys.has(progressKey(slot))} completed={isCompleted} suggestion={null} highPriority={false} onSelect={() => setSelectedSlot(slot)} />
                    })}
                    {renderAdditionalCoursework(`${term.year}-${term.term}`, `${term.year}${term.year === 1 ? 'st' : term.year === 2 ? 'nd' : term.year === 3 ? 'rd' : 'th'} year ${term.term}`, term.credits)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      </>}
      {selectedSlot && !assessmentCourseId && <CourseModal slot={selectedSlot} resolvedCourseId={resolvedCourseId} courseOptions={selectedCourseOptions} selectedTarget={suggestedSchedule.selectedTargetKeys.has(progressKey(selectedSlot))} completed={completed.has(progressKey(selectedSlot)) || completed.has(resolvedCourseId ? `course:${resolvedCourseId}` : progressKey(selectedSlot))} prerequisitesMet={selectedPrerequisitesMet} assessmentAvailable={Boolean(resolvedCourseId && getAssessmentPack(resolvedCourseId))} onClose={() => setSelectedSlot(null)} onCompletedChange={isCompleted => {
        if (isCompleted && selectedSlot.type !== 'course' && resolvedCourseId && selectedCourseOptions) selectTargetCourse(selectedSlot, resolvedCourseId)
        updateCompletion(selectedSlot, isCompleted, resolvedCourseId)
      }} onTargetCourseSelect={courseId => selectTargetCourse(selectedSlot, courseId)} onTargetCourseClear={() => clearTargetCourse(selectedSlot)} onOpenAssessment={() => resolvedCourseId && setAssessmentCourseId(resolvedCourseId)} />}
      {additionalCourseTerm && <AdditionalCourseModal
        courses={additionalCourses.get(additionalCourseTerm.key) ?? []}
        maximumCredits={Math.max(0, 18 - additionalCourseTerm.plannedCredits - (additionalCourses.get(additionalCourseTerm.key) ?? []).reduce((total, course) => total + course.credits, 0))}
        onAdd={course => addAdditionalCourse(additionalCourseTerm.key, course)}
        onRemove={courseId => removeAdditionalCourse(additionalCourseTerm.key, courseId)}
        onClose={() => setAdditionalCourseTerm(null)}
      />}
      {assessmentCourseId && <ReadinessAssessment courseId={assessmentCourseId} onClose={() => setAssessmentCourseId(null)} />}
      {transferReadinessOpen && !assessmentCourseId && <TransferReadiness
        completed={completed}
        preparationCourseIds={preparationCourseIds}
        onClose={() => setTransferReadinessOpen(false)}
        onCompletedChange={updateTransferCompletion}
        onPreparationChange={updateTransferPreparation}
        onOpenAssessment={courseId => {
          setTransferReadinessOpen(false)
          setAssessmentCourseId(courseId)
        }}
      />}
    </main>
  )
}

export default App
