import { useState } from 'react'
import './AdditionalCourse.css'

export interface AdditionalCourse {
  id: string
  code: string
  name?: string
  credits: number
}

export function AdditionalCourseCell({ course, onSelect }: { course: AdditionalCourse; onSelect: () => void }) {
  return <button className="additional-course-cell" style={{ gridColumn: `span ${course.credits}` }} type="button" onClick={onSelect}>
    <span>{course.code}</span>
    {course.name && <span className="additional-course-name">{course.name}</span>}
    <span className="additional-course-credits">{course.credits} credits</span>
  </button>
}

export function AdditionalCoursePlaceholder({ credits, onSelect }: { credits: number; onSelect: () => void }) {
  return <button className="additional-course-placeholder" style={{ gridColumn: `span ${credits}` }} type="button" onClick={onSelect}>
    <span>Extra coursework</span>
    <span>{credits} credits to reach 15</span>
  </button>
}

export function AdditionalCourseAdd({ onSelect }: { onSelect: () => void }) {
  return <button className="additional-course-add" type="button" onClick={onSelect} aria-label="Add extra coursework">+</button>
}

interface AdditionalCourseModalProps {
  courses: readonly AdditionalCourse[]
  maximumCredits: number
  onAdd: (course: Omit<AdditionalCourse, 'id'>) => void
  onRemove: (courseId: string) => void
  onClose: () => void
}

export function AdditionalCourseModal({ courses, maximumCredits, onAdd, onRemove, onClose }: AdditionalCourseModalProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [credits, setCredits] = useState(Math.min(3, maximumCredits))
  const canAdd = code.trim().length > 0 && credits >= 1 && credits <= maximumCredits

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="course-modal additional-course-modal" role="dialog" aria-modal="true" aria-labelledby="additional-course-title" onMouseDown={event => event.stopPropagation()}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="Close extra coursework">×</button>
      <p className="modal-kind">Additional coursework</p>
      <h2 id="additional-course-title">Track extra coursework</h2>
      <p>Use this for classes outside the degree plan, including future electives or minor coursework. It contributes to the 120-credit graduation goal.</p>
      {courses.length > 0 && <ul className="additional-course-list">
        {courses.map(course => <li key={course.id}><span><strong>{course.code}</strong>{course.name ? ` — ${course.name}` : ''} ({course.credits} credits)</span><button type="button" onClick={() => onRemove(course.id)}>Remove</button></li>)}
      </ul>}
      {maximumCredits > 0 ? <form className="additional-course-form" onSubmit={event => {
        event.preventDefault()
        if (!canAdd) return
        onAdd({ code: code.trim(), ...(name.trim() ? { name: name.trim() } : {}), credits })
        setCode('')
        setName('')
        setCredits(Math.min(3, maximumCredits - credits))
      }}>
        <label>Course code<input value={code} onChange={event => setCode(event.target.value)} placeholder="e.g. ART 200" required /></label>
        <label>Course name <span>(optional)</span><input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Introduction to Art" /></label>
        <label>Credits<input type="number" min="1" max={maximumCredits} value={credits} onChange={event => setCredits(Number(event.target.value))} required /></label>
        <button type="submit" disabled={!canAdd}>Add coursework</button>
      </form> : <p className="additional-course-capacity">This term is already at the 18-credit maximum.</p>}
    </section>
  </div>
}
