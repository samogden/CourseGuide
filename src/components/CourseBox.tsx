import { useEffect, useRef, useState } from 'react'
import type { PlanSlot } from '../models/Curriculum'
import { getCourse, prerequisiteText, slotLabel } from '../models/Curriculum'
import './CourseBox.css'

import { presentationCategory, type PathSlotOptions, type ScheduledSuggestion } from '../models/Scheduling'

export interface RequirementCourseSelection {
  courseId: string
  credits: number
}

export function CourseCell({ slot, assignedCourseId, courseOptions, requirementSelections = [], selectedTarget, completed, suggestion, highPriority, onSelect }: { slot: PlanSlot; assignedCourseId?: string; courseOptions?: PathSlotOptions; requirementSelections?: readonly RequirementCourseSelection[]; selectedTarget: boolean; completed: boolean; suggestion: ScheduledSuggestion | null; highPriority: boolean; onSelect: () => void }) {
  const courseId = suggestion?.courseId ?? assignedCourseId ?? (slot.type === 'course' ? slot.courseId : undefined)
  const selectedCourseLabel = requirementSelections.length > 0 ? requirementSelections.map(selection => getCourse(selection.courseId)?.code ?? selection.courseId).join(' + ') : undefined
  const label = selectedCourseLabel ?? (courseId && slot.type !== 'course' ? getCourse(courseId)?.code ?? slotLabel(slot) : courseOptions?.label ?? slotLabel(slot))
  const displayCategory = presentationCategory(slot, assignedCourseId, courseOptions)
  const offeredTerms = courseId ? getCourse(courseId)?.offeredTerms : undefined
  const offeringClass = !completed && offeredTerms?.length === 1 ? ' is-limited-offering' : ''
  const accessibleLabel = slot.type === 'choice' && courseOptions
    ? `${courseOptions.label}: ${slotLabel(slot)}`
    : undefined
  return (
    <button
      aria-label={accessibleLabel}
      className={`course-cell category-${displayCategory}${completed ? ' is-completed' : ''}${suggestion ? ` is-suggested is-${suggestion.kind}` : ''}${assignedCourseId || courseOptions ? ' is-path-assigned' : ''}${highPriority ? ' is-high-priority' : ''}${offeringClass}`}
      style={{ gridColumn: `span ${slot.credits}` }}
      onClick={onSelect}
      type="button"
    >
      {highPriority && <span className="course-status priority-status">High priority</span>}
      {suggestion && <span className="course-status">{suggestion.kind === 'stretch' ? '16+ credits' : 'Suggested next'}</span>}
      {assignedCourseId && !suggestion && <span className="course-status path-status">{selectedTarget ? 'Selected course' : 'Path course'}</span>}
      {requirementSelections.length > 0 && !assignedCourseId && <span className="course-status path-status">Coursework selected</span>}
      {courseOptions && !courseOptions.minimumCredits && !assignedCourseId && !suggestion && <span className="course-status path-status">Choose a course</span>}
      <span>{label}</span>
      <span className="course-cell-credits">{courseOptions?.minimumCredits && requirementSelections.length > 0 ? `${requirementSelections.reduce((total, selection) => total + selection.credits, 0)} of ${courseOptions.minimumCredits} credits selected` : `${slot.credits} credits`}</span>
    </button>
  )
}

export function CourseModal({ slot, resolvedCourseId, courseOptions, requirementSelections = [], selectedTarget, completed, prerequisitesMet, assessmentAvailable, onClose, onCompletedChange, onTargetCourseSelect, onTargetCourseClear, onRequirementCourseAdd, onRequirementCourseRemove, onOpenAssessment }: {
  slot: PlanSlot
  resolvedCourseId?: string | null
  courseOptions?: PathSlotOptions
  requirementSelections?: readonly RequirementCourseSelection[]
  selectedTarget: boolean
  completed: boolean
  prerequisitesMet?: boolean
  assessmentAvailable: boolean
  onClose: () => void
  onCompletedChange: (completed: boolean) => void
  onTargetCourseSelect: (courseId: string) => void
  onTargetCourseClear: () => void
  onRequirementCourseAdd: (courseId: string, credits: number) => void
  onRequirementCourseRemove: (courseId: string) => void
  onOpenAssessment: () => void
}) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const course = resolvedCourseId ? getCourse(resolvedCourseId) : slot.type === 'course' ? getCourse(slot.courseId) : undefined
  const firstOption = courseOptions?.courseIds[0]
  const [selectedOptionId, setSelectedOptionId] = useState(firstOption ?? '')
  const [selectedCredits, setSelectedCredits] = useState(() => firstOption ? getCourse(firstOption)?.units ?? slot.credits : slot.credits)
  const selectedOption = getCourse(selectedOptionId)
  const selectedCreditsTotal = requirementSelections.reduce((total, selection) => total + selection.credits, 0)
  const requiredCredits = courseOptions?.minimumCredits ?? slot.credits

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
        <h2 id="course-modal-title">{course?.code ?? courseOptions?.label ?? slotLabel(slot)}</h2>
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
        ) : <p>{courseOptions ? 'Choose one of the available courses for this requirement.' : slot.type === 'course' ? 'Course details are coming soon.' : slot.guidance}</p>}
        {courseOptions?.minimumCredits ? <>
          <h3>Selected coursework</h3>
          <p>{selectedCreditsTotal} of {requiredCredits} required credits selected.</p>
          {requirementSelections.length > 0 && <ul className="path-course-options">{requirementSelections.map(selection => {
            const selectedCourse = getCourse(selection.courseId)
            return <li key={selection.courseId}><strong>{selectedCourse?.code ?? selection.courseId}</strong>{selectedCourse ? ` — ${selectedCourse.name}` : ''} ({selection.credits} credits) <button className="option-control" type="button" onClick={() => onRequirementCourseRemove(selection.courseId)}>Remove</button></li>
          })}</ul>}
          {selectedCreditsTotal < requiredCredits && <div className="credit-course-picker">
            <label>Course
              <select value={selectedOptionId} onChange={event => {
                const courseId = event.target.value
                setSelectedOptionId(courseId)
                setSelectedCredits(getCourse(courseId)?.units ?? 1)
              }}>
                {courseOptions.courseIds.filter(courseId => !requirementSelections.some(selection => selection.courseId === courseId)).map(courseId => {
                  const option = getCourse(courseId)
                  return <option key={courseId} value={courseId}>{option?.code ?? courseId} — {option?.name}</option>
                })}
              </select>
            </label>
            <label>Credits
              <input type="number" min={selectedOption?.units ?? 1} max={Math.min(selectedOption?.maximumUnits ?? requiredCredits, requiredCredits - selectedCreditsTotal)} value={selectedCredits} onChange={event => setSelectedCredits(Number(event.target.value))} />
            </label>
            <button className="option-control" type="button" disabled={!selectedOptionId || selectedCredits < (selectedOption?.units ?? 1) || selectedCredits > Math.min(selectedOption?.maximumUnits ?? requiredCredits, requiredCredits - selectedCreditsTotal)} onClick={() => onRequirementCourseAdd(selectedOptionId, selectedCredits)}>Add course</button>
          </div>}
        </> : courseOptions && <>
          {course && <h3>Choose a different course</h3>}
          {!course && <h3>Course options</h3>}
          <ul className="path-course-options">{courseOptions.courseIds.map(courseId => {
            const option = getCourse(courseId)
            const isSelected = courseId === resolvedCourseId
            return <li key={courseId}><strong>{option?.code ?? courseId}</strong>{option ? ` — ${option.name}` : ''} ({option?.units ?? slot.credits} credits) {isSelected ? <span className="selected-option">Selected</span> : <button className="option-control" type="button" onClick={() => onTargetCourseSelect(courseId)}>Select</button>}</li>
          })}</ul>
          {selectedTarget && <button className="clear-choice-control" type="button" onClick={onTargetCourseClear}>Clear selected course</button>}
        </>}
        {slot.type === 'choice' && <p><strong>Alternatives:</strong> {slotLabel(slot)}</p>}
        {(assessmentAvailable || !courseOptions || resolvedCourseId) && <div className="course-modal-actions">
          {assessmentAvailable && <button className="assessment-control" type="button" onClick={onOpenAssessment}>Check readiness</button>}
          {(!courseOptions || resolvedCourseId) && <button className="taken-control" type="button" onClick={() => {
            onCompletedChange(!completed)
            onClose()
          }}>
            {completed ? 'Mark as untaken' : 'Mark as taken'}
          </button>}
        </div>}
      </section>
    </div>
  )
}
