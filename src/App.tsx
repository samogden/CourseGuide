import './App.css'

import { useState } from 'react';



import { Course, CourseChoice, CourseRequirement, allCourses } from './models/CurriculumItems'
import { Curriculum, Semester } from './models/Curriculum';
import { CurriculumItemBox, CurriculumView, CourseModal } from './components/CourseBox'

function App1() {

  const curriculum = new Curriculum([
    new Semester("Freshman Fall", [
      new Course("CST 231", 4),
      new Course("MATH 130", 4),
      new Course("GE 1", 3),
      new Course("GE 5", 4),
    ]),
    new Semester("Freshman Spring", [
      new Course("CST 238", 4),
      new Course("MATH 170", 4),
      new Course("MATH 150", 4),
      new Course("CST 217", 3),
    ]),

    new Semester("Sophmore Fall", [
      new Course("CST 237", 4),
      new Course("MATH 151", 4),
      new Course("GE 4", 3),
      new Course("GE 6", 3),
    ]),
    new Semester("Sophmore Spring", [
      new Course("GE 00", 3),
    ]),

    new Semester("Junior Fall", [
      new CourseChoice(
        "CST 370 / CST 334",
        4,
        ["CST 370", "CST 334"]
      ),
      new Course("CST 338", 4),
      new Course("CST 349", 2),
      new CourseRequirement(
        "Upper-level prerequisite",
        4,
        "prerequisite"
      )
    ]),
    new Semester("Junior Spring", [
      new Course("CST 370", 4),
      new Course("CST 300", 4),
      new Course("CST 998", 4),
      new Course("CST 999", 4),
    ]),

    new Semester("Senior Fall", [
      new CourseRequirement("CS elective", 4, "elective"),
      new CourseRequirement("CS elective", 4, "elective"),
      new CourseRequirement("CS elective", 2, "elective"),
      new CourseRequirement("GE Area 3", 4, "ge")
    ]),
    new Semester("Senior Spring", [
      new Course("CST 499", 4),
      new Course("CST 462", 4),
      new Course("GE 2", 4),
      new Course("GE 4", 4),
    ]),



  ])

  return (
    <main>
      <h1>Curriculum Plan</h1>
      <CurriculumView curriculum={curriculum} />
    </main>
  );
}

function Modal({ onClose, children }) {
  if (!open) return null;

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function App() {

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  console.log(allCourses)
  return (
    <main>
      <div>
        {
          Object.entries(allCourses)
            .map(([code, course]) => (
              <CurriculumItemBox
                item={course}
                onClick={() => setSelectedCourse(course)}
              />
            ))
        }
      </div>

      {
        selectedCourse
        &&
        (
          <Modal open={true} onClose={() => setSelectedCourse(null)}>
            <CourseModal course={selectedCourse} onClose={() => setSelectedCourse(null)} />
            <button onClick={() => setSelectedCourse(null)}>
              Close
            </button>
          </Modal>
        )
      }
    </main >
  )
}

export default App
