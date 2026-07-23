import { useEffect, useRef } from 'react'
import type { PlanSlot } from '../models/Curriculum'
import { getCourse, prerequisiteText, slotLabel } from '../models/Curriculum'
import './CourseBox.css'

export function CourseCell({ slot, completed, onSelect }: { slot: PlanSlot; completed: boolean; onSelect: () => void }) {
  return (
    <button
      className={`course-cell category-${slot.category}${completed ? ' is-completed' : ''}`}
      style={{ gridColumn: `span ${slot.credits}` }}
      onClick={onSelect}
      type="button"
    >
      <span>{slotLabel(slot)}</span>
      <span className="course-cell-credits">{slot.credits} credits</span>
    </button>
  )
}

export function CourseModal({ slot, completed, onClose, onCompletedChange }: {
  slot: PlanSlot
  completed: boolean
  onClose: () => void
  onCompletedChange: (completed: boolean) => void
}) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const course = slot.type === 'course' ? getCourse(slot.courseId) : undefined

  useEffect(() => {
    closeButton.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="course-modal" role="dialog" aria-modal="true" aria-labelledby="course-modal-title" onMouseDown={event => event.stopPropagation()}>
        <button ref={closeButton} className="modal-close" onClick={onClose} type="button" aria-label="Close course details">×</button>
        <p className="modal-kind">{slot.type === 'course' ? 'Course' : slot.type === 'choice' ? 'Choice requirement' : 'Requirement'}</p>
        <h2 id="course-modal-title">{slotLabel(slot)}</h2>
        <p><strong>Credits:</strong> {slot.credits}</p>
        {course ? (
          <>
            <p className="course-name">{course.name}</p>
            <p>{course.description ?? 'Course details are coming soon.'}</p>
            {course.prerequisites.length > 0 && <><h3>Prerequisites</h3><ul>{course.prerequisites.map((prerequisite, index) => <li key={index}>{prerequisiteText(prerequisite)}</li>)}</ul></>}
            {course.prerequisiteNotes.length > 0 && <ul>{course.prerequisiteNotes.map(note => <li key={note}>{note}</li>)}</ul>}
            {course.placeholder && <p className="placeholder-note">Catalog details for this course are still being added.</p>}
          </>
        ) : <p>{slot.type === 'course' ? 'Course details are coming soon.' : slot.guidance}</p>}
        {slot.type === 'choice' && <p><strong>Alternatives:</strong> {slotLabel(slot)}</p>}
        <label className="taken-control"><input type="checkbox" checked={completed} onChange={event => onCompletedChange(event.target.checked)} /> Mark as taken</label>
      </section>
    </div>
  )
}
