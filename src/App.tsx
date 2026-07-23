import { useEffect, useState } from 'react'
import './App.css'
import { CourseCell, CourseModal } from './components/CourseBox'
import { curriculumPlan, progressKey, type PlanSlot } from './models/Curriculum'

const progressStorageKey = 'courseguide-completed-v1'

function readCompleted(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(progressStorageKey) ?? '[]')
    return new Set(Array.isArray(value) && value.every(item => typeof item === 'string') ? value : [])
  } catch {
    return new Set()
  }
}

function App() {
  const [selectedSlot, setSelectedSlot] = useState<PlanSlot | null>(null)
  const [completed, setCompleted] = useState<Set<string>>(() => readCompleted())

  useEffect(() => {
    localStorage.setItem(progressStorageKey, JSON.stringify([...completed]))
  }, [completed])

  const updateCompletion = (slot: PlanSlot, isCompleted: boolean) => {
    const key = progressKey(slot)
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

  return (
    <main className="planner">
      <header className="planner-header">
        <div><p className="eyebrow">Computer Science</p><h1>Curriculum planner</h1><p>Explore the suggested course sequence and mark completed coursework.</p></div>
        <button className="reset-button" type="button" onClick={resetProgress}>Reset progress</button>
      </header>
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
                    {term.slots.map(slot => <CourseCell key={progressKey(slot)} slot={slot} completed={completed.has(progressKey(slot))} onSelect={() => setSelectedSlot(slot)} />)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {selectedSlot && <CourseModal slot={selectedSlot} completed={completed.has(progressKey(selectedSlot))} onClose={() => setSelectedSlot(null)} onCompletedChange={isCompleted => updateCompletion(selectedSlot, isCompleted)} />}
    </main>
  )
}

export default App
