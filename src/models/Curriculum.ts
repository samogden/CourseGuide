
class CurriculumItem {
  title: string;
  credits: number

  constructor(title: string, credits: number) {
    this.title = title;
    this.credits = credits;
  }
}

class Course extends CurriculumItem { };

class GeneralEducation extends CurriculumItem { };

class Option extends CurriculumItem {
  options: CurriculumItem[];
  constructor(title: string, options: CurriculumItem[]) {
    const credits: number = options.length > 0 ? Math.max(...options.map(c => c.credits)) : 0
    super(title, credits);
    this.options = options;
  }
}

class Elective extends CurriculumItem { };


export const DegreeYear = {
  Freshman: "freshman",
  Sophomore: "sophomore",
  Junior: "junior",
  Senior: "senior",
} as const;
export type DegreeYear = typeof DegreeYear[keyof typeof DegreeYear];

export const Term = {
  Fall: "fall",
  Spring: "spring",
} as const;
export type Term = typeof Term[keyof typeof Term];

export class SemesterPlan {
  degreeYear: DegreeYear;
  term: Term;
  courses: CurriculumItem[];

  constructor(
    degreeYear: DegreeYear,
    term: Term,
    courses: CurriculumItem[]
  ) {
    this.degreeYear = degreeYear;
    this.term = term;
    this.courses = courses;
  }
}

export class DegreePlan {
  semesters: Map<[DegreeYear, Term], SemesterPlan>;
  constructor(semesters: Map<[DegreeYear, Term], SemesterPlan>) {
    this.semesters = semesters
  }
}


import { parse } from "yaml"
import curriculum_plan_text from "../assets/scd-curriculum.yaml?raw"

interface CurriculumData {
  years: {
    year: DegreeYear;
    fall: string[];
    spring: string[];
  }
}

const overall_plan = parse(curriculum_plan_text) as CurriculumData
console.log(overall_plan)

const degree_plan: DegreePlan = new DegreePlan(
  overall_plan.years
)

export { overall_plan }

/*
 Loading up data from the yaml files
*/

// import { parse } from "yaml"
// import coursesText from "../assets/courses.yaml?raw"

// interface CourseData {
//   name: string;
//   units: number;
//   description?: string;
// }

// const catalog = (parse(coursesText) as {
//   courses: {
//     catalog: Record<string, CourseData>;
//   };
// }).courses.catalog;

// const allCourses: Record<string, Course> = Object.fromEntries(
//   Object.entries(catalog).map(
//     ([code, data]) => [code, Course.fromObject(code, data)]
//   )
// );

// for (const course of Object.values(allCourses)) {
//   for (const prereq_name of Object.values(course.raw_prereqs)) {
//     console.log("preque_name: " + prereq_name)
//     if (Object.keys(allCourses).includes(prereq_name)) {
//       // Then the pre-req already exists and we can just pull it out
//       course.prerequisites.push(allCourses[prereq_name])
//     } else {
//       // Then we'll have to make a dummy pre-req
//       course.prerequisites.push(new DummyCourse(prereq_name, 3))
//     }
//   }
// }
/* end loading */
