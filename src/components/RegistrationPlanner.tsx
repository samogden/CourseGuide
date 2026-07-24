import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { AcademicTerm, PlanSlot } from '../models/Curriculum'
import { getCourse } from '../models/Curriculum'
import type { RegistrationPlan } from '../models/Scheduling'
import './RegistrationPlanner.css'

interface RegistrationPlannerProps {
  plan: RegistrationPlan
  currentTerm: AcademicTerm
  onCurrentTermChange: (term: AcademicTerm) => void
  onCourseSelect: (slot: PlanSlot) => void
}

export function RegistrationPlanner({ plan, currentTerm, onCurrentTermChange, onCourseSelect }: RegistrationPlannerProps) {
  const sourceNodes: Node[] = plan.courses.map((course, index) => ({
    id: `source:${course.courseId ?? course.key}`,
    position: { x: index * 190, y: 0 },
    data: { label: `${course.label}\n${course.credits} credits` },
    style: {
      background: course.kind === 'stretch' ? '#fee2e2' : '#dcfce7',
      border: `2px solid ${course.kind === 'stretch' ? '#dc2626' : '#16a34a'}`,
      borderRadius: '0.5rem',
      fontWeight: 700,
      textAlign: 'center',
      whiteSpace: 'pre-line',
      width: 160,
    },
  }))
  const futureCourseIds = [...new Set(plan.edges.map(edge => edge.targetCourseId))]
  const futureNodes: Node[] = futureCourseIds.map((courseId, index) => {
    const course = getCourse(courseId)
    return {
      id: `future:${courseId}`,
      position: { x: index * 190, y: 170 },
      data: { label: `${course?.code ?? courseId}\n${course?.units ?? 0} credits` },
      style: {
        background: '#f8fafc',
        border: '1px solid #94a3b8',
        borderRadius: '0.5rem',
        color: '#475569',
        textAlign: 'center',
        whiteSpace: 'pre-line',
        width: 160,
      },
    }
  })
  const edges: Edge[] = plan.edges.map(edge => ({
    id: `${edge.sourceCourseId}-${edge.targetCourseId}`,
    source: `source:${edge.sourceCourseId}`,
    target: `future:${edge.targetCourseId}`,
    animated: true,
  }))

  return (
    <section className="registration-planner" aria-label="Registration planner">
      <div className="registration-header">
        <div>
          <p className="eyebrow">Registration planner</p>
          <h2>Classes to sign up for</h2>
          <p>{plan.credits} suggested credits for the upcoming term. Mark a class taken to refresh this plan.</p>
        </div>
        <label className="term-picker">Upcoming term
          <select value={currentTerm} onChange={event => onCurrentTermChange(event.target.value as AcademicTerm)}>
            <option value="fall">Fall</option>
            <option value="spring">Spring</option>
          </select>
        </label>
      </div>
      <div className="registration-courses">
        {plan.courses.map(course => (
          <button className={`registration-course${course.kind === 'stretch' ? ' is-stretch' : ''}`} key={course.key} type="button" onClick={() => onCourseSelect(course.slot)}>
            <span>{course.kind === 'stretch' ? '16+ credits' : 'Suggested now'}</span>
            <strong>{course.label}</strong>
            <small>{course.credits} credits</small>
          </button>
        ))}
      </div>
      {plan.edges.length > 0 ? <div className="dependency-graph" aria-label="Courses unlocked by the current plan">
        <ReactFlow nodes={[...sourceNodes, ...futureNodes]} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}>
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div> : <p className="dependency-empty">No direct upcoming prerequisite connections are available yet.</p>}
    </section>
  )
}
