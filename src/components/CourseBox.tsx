import type { CSSProperties } from 'react'

import type { Curriculum, CurriculumItem, Semester, Course } from '../models/Curriculum'
import "./CourseBox.css"

export function CurriculumItemBox({
  item,
  onClick
}: {
  item: CurriculumItem;
  onClick: () => void;
}) {
  return (
    <button
      className={`course-box ${item.styleName}`}
      style={{ "--columns": item.credits } as CSSProperties}
      onClick={onClick}
    >
      {item.title}
    </button>
  );
}

export function SemesterView({ semester }: { semester: Semester }) {
  return (
    <>
      <h2>{semester.name}</h2>

      <div className="curriculum-row">
        {semester.courses.map(course => (
          <CurriculumItemBox
            key={course.title}
            item={course}
          />
        ))}
      </div>
    </>
  );
}

export function CurriculumItemCell({
  item
}: {
  item: CurriculumItem;
}) {
  return (
    <td
      className={`curriculum-item ${item.styleName}`}
      colSpan={item.credits}
    >
      {item.title}
    </td>
  );
}

export function SemesterRow({
  semester
}: {
  semester: Semester;
}) {
  return (
    <tr>
      <th scope="row">{semester.name}</th>

      {semester.courses.map((course, index) => (
        <CurriculumItemCell
          key={`${course.title}-${index}`}
          item={course}
        />
      ))}
    </tr>
  );
}

export function CurriculumView({
  curriculum
}: {
  curriculum: Curriculum;
}) {
  return (
    <table className="curriculum-table">
      <tbody>
        {curriculum.semesters.map(semester => (
          <SemesterRow
            key={semester.name}
            semester={semester}
          />
        ))}
      </tbody>
    </table>
  );
}


export function CourseModal({
  course,
  onClose
}: {
  course: Course;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="course-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-modal-title"
        onClick={event => event.stopPropagation()}
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close course details"
        >
          ×
        </button>

        <h2 id="course-modal-title">{course.title}</h2>

        <p>
          <strong>Credits:</strong> {course.credits}
        </p>

        <p>
          {course.description ?? "No description is available."}
        </p>

        {course.prereqs && course.prereqs.length > 0 && (
          <>
            <h3>Prerequisites</h3>

            <ul>
              {course.prereqs.map(prereq => (
                <li key={typeof prereq === "string" ? prereq : prereq.title}>
                  {typeof prereq === "string" ? prereq : prereq.title}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
