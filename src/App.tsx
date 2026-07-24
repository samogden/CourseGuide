import { useEffect, useState } from 'react'
import './App.css'
import { CourseCell, CourseModal } from './components/CourseBox'
import { curriculumPlan, getCourse, prerequisitesMet, progressKey, programs, type PlanSlot } from './models/Curriculum'
import { buildSuggestedSchedule } from './models/Scheduling'

const progressStorageKey = 'courseguide-completed-v1'
const concentrationStorageKey = 'courseguide-concentration-v1'
const activeProgramId = 'bs-computer-science'

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

function App() {
  const [selectedSlot, setSelectedSlot] = useState<PlanSlot | null>(null)
  const [completed, setCompleted] = useState<Set<string>>(() => readCompleted())
  const [selectedConcentration, setSelectedConcentration] = useState<string | null>(() => readConcentration())

  useEffect(() => {
    localStorage.setItem(progressStorageKey, JSON.stringify([...completed]))
  }, [completed])

  useEffect(() => {
    localStorage.setItem(concentrationStorageKey, JSON.stringify(selectedConcentration))
  }, [selectedConcentration])

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

  const activeProgram = programs.programs[activeProgramId]
  const activeConcentrationId = selectedConcentration && activeProgram.concentrations[selectedConcentration] ? selectedConcentration : null
  const suggestedSchedule = buildSuggestedSchedule(curriculumPlan, completed, {
    programId: activeProgramId,
    concentrationId: activeConcentrationId,
  })
  const completedCourseIds = new Set([...completed]
    .filter(key => key.startsWith('course:'))
    .map(key => key.slice('course:'.length)))
  const selectedSuggestion = selectedSlot ? suggestedSchedule.suggestions.get(progressKey(selectedSlot)) ?? null : null
  const selectedAssignedCourseId = selectedSlot ? suggestedSchedule.assignments.get(progressKey(selectedSlot)) : undefined
  const selectedPathOptions = selectedSlot ? suggestedSchedule.pathOptions.get(progressKey(selectedSlot)) : undefined
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
      {suggestedSchedule.suggestions.size > 0 && <section className="next-term" aria-live="polite"><strong>Suggested next schedule:</strong> {suggestedSchedule.credits} credits. Courses are selected by year, term, then prerequisite priority. Green courses unlock later planned courses; red courses are optional stretch additions that bring the total to 16–18 credits.{activeConcentrationId && <> The {activeProgram.concentrations[activeConcentrationId].title} path fills the elective slots shown later in the plan.</>}</section>}
      <section className="legend" aria-label="Course category legend">
        <span className="legend-title">Course groups</span>
        <span className="category-cst">CST</span><span className="category-math">Math</span><span className="category-ge-lower">Lower-division GE</span><span className="category-ge-upper">Upper-division GE</span><span className="category-elective-prereq">Elective pre-req</span><span className="category-elective">Elective</span>
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
                      const pathOptions = suggestedSchedule.pathOptions.get(progressKey(slot))
                      const isCompleted = completed.has(assignedCourseId ? `course:${assignedCourseId}` : progressKey(slot))
                      const suggestion = suggestedSchedule.suggestions.get(progressKey(slot)) ?? null
                      return <CourseCell key={progressKey(slot)} slot={slot} assignedCourseId={assignedCourseId} pathOptions={pathOptions} completed={isCompleted} suggestion={suggestion} highPriority={suggestedSchedule.isHighPriority(slot) && !isCompleted} onSelect={() => setSelectedSlot(slot)} />
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {selectedSlot && <CourseModal slot={selectedSlot} resolvedCourseId={resolvedCourseId} pathOptions={selectedPathOptions} completed={completed.has(resolvedCourseId ? `course:${resolvedCourseId}` : progressKey(selectedSlot))} prerequisitesMet={selectedPrerequisitesMet} onClose={() => setSelectedSlot(null)} onCompletedChange={isCompleted => updateCompletion(selectedSlot, isCompleted, resolvedCourseId)} />}
    </main>
  )
}

export default App
