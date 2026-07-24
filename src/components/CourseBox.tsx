import { useEffect, useRef } from 'react'
import type { PlanSlot } from '../models/Curriculum'
import { getCourse, prerequisiteText, slotLabel } from '../models/Curriculum'
import './CourseBox.css'

import type { ScheduledSuggestion } from '../models/Scheduling'

export function CourseCell({ slot, assignedCourseId, completed, suggestion, highPriority, onSelect }: { slot: PlanSlot; assignedCourseId?: string; completed: boolean; suggestion: ScheduledSuggestion | null; highPriority: boolean; onSelect: () => void }) {
  const courseId = suggestion?.courseId ?? assignedCourseId
  const label = courseId && slot.type !== 'course' ? getCourse(courseId)?.code ?? slotLabel(slot) : slotLabel(slot)
  return (
    <button
      className={`course-cell category-${slot.category}${completed ? ' is-completed' : ''}${suggestion ? ` is-suggested is-${suggestion.kind}` : ''}${assignedCourseId ? ' is-path-assigned' : ''}${highPriority ? ' is-high-priority' : ''}`}
      style={{ gridColumn: `span ${slot.credits}` }}
      onClick={onSelect}
      type="button"
    >
      {highPriority && <span className="course-status priority-status">High priority</span>}
      {suggestion && <span className="course-status">{suggestion.kind === 'stretch' ? '16+ credits' : 'Suggested next'}</span>}
      {assignedCourseId && !suggestion && <span className="course-status path-status">Path course</span>}
      <span>{label}</span>
      <span className="course-cell-credits">{slot.credits} credits</span>
    </button>
  )
}

export function CourseModal({ slot, resolvedCourseId, completed, prerequisitesMet, onClose, onCompletedChange }: {
  slot: PlanSlot
  resolvedCourseId?: string | null
  completed: boolean
  prerequisitesMet?: boolean
  onClose: () => void
  onCompletedChange: (completed: boolean) => void
}) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const course = resolvedCourseId ? getCourse(resolvedCourseId) : slot.type === 'course' ? getCourse(slot.courseId) : undefined

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
        <h2 id="course-modal-title">{course?.code ?? slotLabel(slot)}</h2>
        <p><strong>Credits:</strong> {slot.credits}</p>
        {slot.type !== 'course' && <p className="modal-slot-label"><strong>Requirement:</strong> {slotLabel(slot)}</p>}
        {course ? (
          <>
            <p className="course-name">{course.name}</p>
            <p>{course.description ?? 'Course details are coming soon.'}</p>
            {course.prerequisites.length > 0 && <><h3>Prerequisites</h3><ul>{course.prerequisites.map((prerequisite, index) => <li key={index}>{prerequisiteText(prerequisite)}</li>)}</ul></>}
            {course.prerequisites.length > 0 && !completed && <p className={prerequisitesMet ? 'prerequisite-status is-met' : 'prerequisite-status is-unmet'}>{prerequisitesMet ? 'Prerequisites met — this course is available to take.' : 'Prerequisites are not yet met.'}</p>}
            {course.prerequisiteNotes.length > 0 && <ul>{course.prerequisiteNotes.map(note => <li key={note}>{note}</li>)}</ul>}
            {course.placeholder && <p className="placeholder-note">Catalog details for this course are still being added.</p>}
          </>
        ) : <p>{slot.type === 'course' ? 'Course details are coming soon.' : slot.guidance}</p>}
        {slot.type === 'choice' && <p><strong>Alternatives:</strong> {slotLabel(slot)}</p>}
        <button className="taken-control" type="button" onClick={() => {
          onCompletedChange(!completed)
          onClose()
        }}>
          {completed ? 'Mark as untaken' : 'Mark as taken'}
        </button>
      </section>
    </div>
  )
}
