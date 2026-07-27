import { useEffect, useRef } from 'react'
import { getAssessmentPack } from '../models/Assessments'
import { getCourse, transferReadinessCourseIds } from '../models/Curriculum'
import './TransferReadiness.css'

interface TransferReadinessProps {
  completed: ReadonlySet<string>
  preparationCourseIds: ReadonlySet<string>
  onClose: () => void
  onCompletedChange: (courseId: string, completed: boolean) => void
  onPreparationChange: (courseId: string, included: boolean) => void
  onOpenAssessment: (courseId: string) => void
}

export function TransferReadiness({ completed, preparationCourseIds, onClose, onCompletedChange, onPreparationChange, onOpenAssessment }: TransferReadinessProps) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButton.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="transfer-readiness-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-readiness-title" onMouseDown={event => event.stopPropagation()}>
      <button ref={closeButton} className="modal-close" onClick={onClose} type="button" aria-label="Close transfer readiness">×</button>
      <p className="modal-kind">Optional transfer preparation</p>
      <h2 id="transfer-readiness-title">Check transfer readiness</h2>
      <p>Your AS-T coursework is assumed to meet these lower-division requirements. Use these optional self-checks to decide whether you would like to refresh a topic before beginning the upper-division sequence.</p>
      <p className="transfer-readiness-note">This never changes enrollment or adds a course automatically. Adding a refresher creates optional preparation terms before your transfer roadmap.</p>
      <div className="transfer-readiness-list">
        {transferReadinessCourseIds.map(courseId => {
          const course = getCourse(courseId)
          const isCompleted = completed.has(`course:${courseId}`)
          const isIncluded = preparationCourseIds.has(courseId)
          const assessment = getAssessmentPack(courseId)
          return <article key={courseId} className="transfer-readiness-card">
            <div>
              <h3>{course?.code ?? courseId}</h3>
              <p>{course?.name ?? 'Lower-division course'}</p>
              <p className={isCompleted ? 'readiness-state is-completed' : 'readiness-state'}>{isCompleted ? 'Marked completed / confident' : 'Transfer credit assumed'}</p>
            </div>
            <div className="transfer-readiness-actions">
              {assessment
                ? <button className="assessment-control" type="button" onClick={() => onOpenAssessment(courseId)}>Take self-check</button>
                : <span className="assessment-coming-soon">Assessment coming soon</span>}
              <button className="transfer-control" type="button" onClick={() => onCompletedChange(courseId, !isCompleted)}>{isCompleted ? 'Mark as not completed' : 'Mark completed / confident'}</button>
              <button className={isIncluded ? 'remove-preparation-control' : 'add-preparation-control'} type="button" onClick={() => onPreparationChange(courseId, !isIncluded)}>{isIncluded ? 'Remove from preparation' : 'Add to preparation'}</button>
            </div>
          </article>
        })}
      </div>
    </section>
  </div>
}
