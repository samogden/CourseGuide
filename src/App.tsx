import { useEffect, useState } from 'react'
import './App.css'
import { CourseCell, CourseModal } from './components/CourseBox'
import { curriculumPlan, getCourse, prerequisiteCount, prerequisiteCourseIds, prerequisitesMet, progressKey, type PlanSlot } from './models/Curriculum'

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

  const completedCourseIds = new Set([...completed]
    .filter(key => key.startsWith('course:'))
    .map(key => key.slice('course:'.length)))
  const isCourseReady = (slot: PlanSlot) => slot.type !== 'course' || prerequisitesMet(getCourse(slot.courseId)?.prerequisites ?? [], completedCourseIds)
  const plannedCourses = curriculumPlan.years.flatMap((year, yearIndex) => year.terms.flatMap((term, termIndex) => term.slots
    .filter((slot): slot is Extract<PlanSlot, { type: 'course' }> => slot.type === 'course')
    .map(slot => ({ courseId: slot.courseId, order: yearIndex * 10 + termIndex }))))
  const isHighPriority = (slot: PlanSlot) => slot.type === 'course' && plannedCourses.some(course => course.order > plannedCourses.find(item => item.courseId === slot.courseId)!.order && prerequisiteCourseIds(getCourse(course.courseId)?.prerequisites ?? []).has(slot.courseId))
  const suggestedSchedule = new Map<string, 'standard' | 'stretch'>()
  let suggestedCredits = 0
  const candidates = curriculumPlan.years.flatMap((year, yearIndex) => year.terms.flatMap((term, termIndex) => term.slots.map((slot, slotIndex) => ({
    slot,
    priority: yearIndex * 10 + termIndex,
    slotIndex,
    prerequisiteCount: slot.type === 'course' ? prerequisiteCount(getCourse(slot.courseId)?.prerequisites ?? []) : 0,
  })))).filter(candidate => !completed.has(progressKey(candidate.slot)) && isCourseReady(candidate.slot))

  candidates.sort((left, right) => left.priority - right.priority || right.prerequisiteCount - left.prerequisiteCount || left.slotIndex - right.slotIndex)
  for (const candidate of candidates) {
    if (suggestedCredits + candidate.slot.credits > 18) continue
    suggestedCredits += candidate.slot.credits
    suggestedSchedule.set(progressKey(candidate.slot), suggestedCredits >= 16 ? 'stretch' : 'standard')
  }

  return (
    <main className="planner">
      <header className="planner-header">
        <div><p className="eyebrow">Computer Science</p><h1>Curriculum planner</h1><p>Explore the suggested course sequence and mark completed coursework.</p></div>
        <button className="reset-button" type="button" onClick={resetProgress}>Reset progress</button>
      </header>
      {suggestedSchedule.size > 0 && <section className="next-term" aria-live="polite"><strong>Suggested next schedule:</strong> {suggestedCredits} credits. Green courses unlock later planned courses; blue courses keep the load at 15 credits or fewer; red courses bring it to 16–18 credits.</section>}
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
                      const isCompleted = completed.has(progressKey(slot))
                      const suggestion = suggestedSchedule.get(progressKey(slot)) ?? null
                      return <CourseCell key={progressKey(slot)} slot={slot} completed={isCompleted} suggestion={suggestion} highPriority={Boolean(suggestion) && isHighPriority(slot) && !isCompleted} onSelect={() => setSelectedSlot(slot)} />
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {selectedSlot && <CourseModal slot={selectedSlot} completed={completed.has(progressKey(selectedSlot))} prerequisitesMet={isCourseReady(selectedSlot)} onClose={() => setSelectedSlot(null)} onCompletedChange={isCompleted => updateCompletion(selectedSlot, isCompleted)} />}
    </main>
  )
}

export default App
