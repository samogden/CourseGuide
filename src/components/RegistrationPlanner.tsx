import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { AcademicTerm, PlanSlot } from '../models/Curriculum'
import { getCourse, prerequisiteCount } from '../models/Curriculum'
import type { RegistrationPlan } from '../models/Scheduling'
import './RegistrationPlanner.css'

interface RegistrationPlannerProps {
  plan: RegistrationPlan
  currentTerm: AcademicTerm
  onCurrentTermChange: (term: AcademicTerm) => void
  onCourseSelect: (slot: PlanSlot) => void
}

export function RegistrationPlanner({ plan, currentTerm, onCurrentTermChange, onCourseSelect }: RegistrationPlannerProps) {
  const orderedCourses = [...plan.courses].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'stretch' ? 1 : -1
    return left.kind === 'standard' ? right.downstreamCount - left.downstreamCount || left.label.localeCompare(right.label) : 0
  })
  const sourceNodes: Node[] = orderedCourses.map((course, index) => ({
    id: `source:${course.courseId ?? course.key}`,
    ariaLabel: `Open ${course.label}`,
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
      cursor: 'pointer',
    },
  }))
  const futureCourseIds = [...new Set(plan.edges.map(edge => edge.targetCourseId))].sort((left, right) => {
    const leftCount = prerequisiteCount(getCourse(left)?.prerequisites ?? [])
    const rightCount = prerequisiteCount(getCourse(right)?.prerequisites ?? [])
    return rightCount - leftCount || left.localeCompare(right)
  })
  const futureNodes: Node[] = futureCourseIds.map((courseId, index) => {
    const course = getCourse(courseId)
    return {
      id: `future:${courseId}`,
      ariaLabel: `Open ${course?.code ?? courseId}`,
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
        cursor: 'pointer',
      },
    }
  })
  const edges: Edge[] = plan.edges.map(edge => ({
    id: `${edge.sourceCourseId}-${edge.targetCourseId}`,
    source: `source:${edge.sourceCourseId}`,
    target: `future:${edge.targetCourseId}`,
    animated: true,
  }))
  const sourceCourseByNodeId = new Map(orderedCourses.map(course => [`source:${course.courseId ?? course.key}`, course]))
  const futureSlotByNodeId = new Map(plan.edges.map(edge => [`future:${edge.targetCourseId}`, edge.targetSlot]))

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
      {plan.edges.length > 0 ? <div className="dependency-graph" aria-label="Courses unlocked by the current plan">
        <ReactFlow nodes={[...sourceNodes, ...futureNodes]} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} onNodeClick={(_, node) => {
          const sourceCourse = sourceCourseByNodeId.get(node.id)
          if (sourceCourse) onCourseSelect(sourceCourse.slot)
          else {
            const futureSlot = futureSlotByNodeId.get(node.id)
            if (futureSlot) onCourseSelect(futureSlot)
          }
        }} proOptions={{ hideAttribution: true }}>
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div> : <p className="dependency-empty">No direct upcoming prerequisite connections are available yet.</p>}
      <section className="upcoming-courses" aria-label="Upcoming courses">
        <h3>Upcoming courses</h3>
        <p>Other roadmap classes to keep in view while planning ahead.</p>
        <div>{[...plan.upcomingCourses]
          .sort((left, right) => Number(right.isAvailableNow) - Number(left.isAvailableNow) || right.prerequisiteCount - left.prerequisiteCount || left.label.localeCompare(right.label))
          .map(course => <span className={course.isAvailableNow ? 'is-available' : 'is-blocked'} key={course.key}>{course.isAvailableNow ? 'Could take now' : 'Prerequisites needed'} · {course.label} <small>{course.credits} credits</small></span>)}</div>
      </section>
    </section>
  )
}
