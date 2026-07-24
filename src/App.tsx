import { useEffect, useState } from 'react'
import './App.css'
import { CourseCell, CourseModal } from './components/CourseBox'
import { curriculumPlan, getCourse, prerequisitesMet, progressKey, programs, summarizePlanCredits, type PlanSlot } from './models/Curriculum'
import { buildSuggestedSchedule } from './models/Scheduling'

const progressStorageKey = 'courseguide-completed-v1'
const concentrationStorageKey = 'courseguide-concentration-v1'
const targetCoursesStorageKey = 'courseguide-target-courses-v1'
const activeProgramId = 'bs-computer-science'

function targetCourseKey(concentrationId: string, slotKey: string): string {
  return `${concentrationId}:${slotKey}`
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
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

function readTargetCourses(): Map<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(targetCoursesStorageKey) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return new Map()
    return new Map(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'))
  } catch {
    return new Map()
  }
}

function App() {
  const [selectedSlot, setSelectedSlot] = useState<PlanSlot | null>(null)
  const [completed, setCompleted] = useState<Set<string>>(() => readCompleted())
  const [selectedConcentration, setSelectedConcentration] = useState<string | null>(() => readConcentration())
  const [targetCourses, setTargetCourses] = useState<Map<string, string>>(() => readTargetCourses())

  useEffect(() => {
    localStorage.setItem(progressStorageKey, JSON.stringify([...completed]))
  }, [completed])

  useEffect(() => {
    localStorage.setItem(concentrationStorageKey, JSON.stringify(selectedConcentration))
  }, [selectedConcentration])

  useEffect(() => {
    localStorage.setItem(targetCoursesStorageKey, JSON.stringify(Object.fromEntries(targetCourses)))
  }, [targetCourses])

  const updateCompletion = (slot: PlanSlot, isCompleted: boolean, resolvedCourseId?: string | null) => {
    const key = resolvedCourseId ? `course:${resolvedCourseId}` : progressKey(slot)
    setCompleted(current => {
      const next = new Set(current)
      if (isCompleted) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const resetProgress = () => {
    if (window.confirm('Reset all saved course progress on this device?')) setCompleted(new Set())
  }

  const selectTargetCourse = (slot: PlanSlot, courseId: string) => {
    const targetScope = slot.type === 'choice' ? 'general' : activeConcentrationId
    if (!targetScope) return
    setTargetCourses(current => {
      const next = new Map(current)
      next.set(targetCourseKey(targetScope, progressKey(slot)), courseId)
      return next
    })
    setSelectedSlot(null)
  }

  const activeProgram = programs.programs[activeProgramId]
  const planCredits = summarizePlanCredits(curriculumPlan)
  const activeConcentrationId = selectedConcentration && activeProgram.concentrations[selectedConcentration] ? selectedConcentration : null
  const activeTargetCourses = new Map(
    [...targetCourses]
      .filter(([key]) => key.startsWith('general:') || (activeConcentrationId ? key.startsWith(`${activeConcentrationId}:`) : false))
      .map(([key, courseId]) => [key.slice(key.indexOf(':') + 1), courseId]),
  )
  const suggestedSchedule = buildSuggestedSchedule(curriculumPlan, completed, {
    programId: activeProgramId,
    concentrationId: activeConcentrationId,
    targetCourses: activeTargetCourses,
  })
  const completedCourseIds = new Set([...completed]
    .filter(key => key.startsWith('course:'))
    .map(key => key.slice('course:'.length)))
  const selectedSuggestion = selectedSlot ? suggestedSchedule.suggestions.get(progressKey(selectedSlot)) ?? null : null
  const selectedAssignedCourseId = selectedSlot ? suggestedSchedule.assignments.get(progressKey(selectedSlot)) : undefined
  const selectedPathOptions = selectedSlot ? suggestedSchedule.pathOptions.get(progressKey(selectedSlot)) ?? suggestedSchedule.choiceOptions.get(progressKey(selectedSlot)) : undefined
  const resolvedCourseId = selectedSuggestion?.courseId ?? selectedAssignedCourseId ?? (selectedSlot?.type === 'course' ? selectedSlot.courseId : null)
  const selectedPrerequisitesMet = resolvedCourseId ? prerequisitesMet(getCourse(resolvedCourseId)?.prerequisites ?? [], completedCourseIds) : selectedSlot ? suggestedSchedule.isCourseReady(selectedSlot) : undefined

  return (
    <main className="planner">
      <header className="planner-header">
        <div><p className="eyebrow">Computer Science</p><h1>Curriculum planner</h1><p>Explore the suggested course sequence and mark completed coursework.</p></div>
        <div className="header-actions">
          <button className="reset-button" type="button" onClick={resetProgress}>Reset progress</button>
        </div>
      </header>
      <section className="credit-summary" aria-label="Curriculum credit summary">
        <strong>{planCredits.total} planned credits</strong>
        <span>{planCredits.major} major/core</span>
        <span>{planCredits.lowerDivisionGeneralEducation} lower-division GE</span>
        <span>{planCredits.upperDivisionGeneralEducation} upper-division GE</span>
      </section>
      <section className="path-picker" aria-label="Program concentration">
        <span className="legend-title">Path</span>
        <button className={`path-button${activeConcentrationId === null ? ' is-selected' : ''}`} type="button" onClick={() => setSelectedConcentration(null)}>No concentration</button>
        {Object.entries(activeProgram.concentrations).map(([concentrationId, concentration]) => (
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
      {suggestedSchedule.suggestions.size > 0 && <section className="next-term" aria-live="polite"><strong>Suggested schedule:</strong> {suggestedSchedule.credits} credits. Courses are selected by year, term, then prerequisite priority. Later-plan courses are included only when they are available now and their prerequisites are already complete. Green courses unlock later planned courses; red courses are optional stretch additions that bring the total to 16–18 credits.{activeConcentrationId && <> The {activeProgram.concentrations[activeConcentrationId].title} path fills the elective slots shown later in the plan.</>}</section>}
      <section className="legend" aria-label="Course category legend">
        <span className="legend-title">Course groups</span>
        <span className="category-cst">CST</span><span className="category-math">Math</span><span className="category-ge-lower">Lower-division GE</span><span className="category-ge-upper">Upper-division GE</span><span className="category-concentration-required">Concentration requirement</span><span className="category-elective">Elective</span>
      </section>
      <p className="scroll-hint">Scroll horizontally to see the complete 18-credit grid on smaller screens.</p>
      <div className="curriculum-scroll">
        <div className="curriculum-grid" role="table" aria-label="Suggested curriculum plan">
          <div className="grid-header" role="row">
            <span>Year</span><span>Term</span>
            <div className="credit-heading"><strong>Suggested credits</strong><div className="credit-numbers" aria-label="Credit positions">{Array.from({ length: 18 }, (_, index) => <span key={index}>{index + 1}</span>)}</div></div>
          </div>
          {curriculumPlan.years.map(year => (
            <div className="year-group" role="rowgroup" key={year.year}>
              <div className="year-label" role="rowheader">{year.year}</div>
              {year.terms.map(term => (
                <div className="term-row" role="row" key={`${year.year}-${term.term}`}>
                  <div className="term-label" role="rowheader">{term.term}</div>
                  <div className="credit-grid" role="cell">
                    {term.slots.map(slot => {
                      const assignedCourseId = suggestedSchedule.assignments.get(progressKey(slot))
                      const pathOptions = suggestedSchedule.pathOptions.get(progressKey(slot)) ?? suggestedSchedule.choiceOptions.get(progressKey(slot))
                      const isCompleted = completed.has(assignedCourseId ? `course:${assignedCourseId}` : progressKey(slot))
                      const suggestion = suggestedSchedule.suggestions.get(progressKey(slot)) ?? null
                      return <CourseCell key={progressKey(slot)} slot={slot} assignedCourseId={assignedCourseId} pathOptions={pathOptions} selectedTarget={suggestedSchedule.selectedTargetKeys.has(progressKey(slot))} completed={isCompleted} suggestion={suggestion} highPriority={suggestedSchedule.isHighPriority(slot) && !isCompleted} onSelect={() => setSelectedSlot(slot)} />
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {selectedSlot && <CourseModal slot={selectedSlot} resolvedCourseId={resolvedCourseId} pathOptions={selectedPathOptions} completed={completed.has(resolvedCourseId ? `course:${resolvedCourseId}` : progressKey(selectedSlot))} prerequisitesMet={selectedPrerequisitesMet} onClose={() => setSelectedSlot(null)} onCompletedChange={isCompleted => updateCompletion(selectedSlot, isCompleted, resolvedCourseId)} onTargetCourseSelect={courseId => selectTargetCourse(selectedSlot, courseId)} />}
    </main>
  )
}

export default App
