
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

export { CurriculumItem, Course, Option, GeneralEducation, Elective };

/*

interface AbstractCourse extends CurriculumItem { };

class Course implements AbstractCourse {
  department: DepartmentPrefix;
  number: string;
  credits: number;
  description?: string;
  raw_prereqs: string[] = [];
  // prerequisites: CurriculumItem[] = [];

  constructor(code: string, credits: number, description?: string, prereqs: string[] = []) {

    console.log(code)
    const match = code.match(/^([a-zA-Z]+) *(\d+)[a-zA-Z]*$/)

    if (!match) {
      throw new Error(`Invalid course code: ${code}`);
    }

    const [, rawPrefix, number] = match;
    const prefix = rawPrefix.toUpperCase();

    if (!departments.includes(prefix as DepartmentPrefix)) {
      throw new Error(`Invalid course code: ${code}`);
    }

    this.department = prefix as DepartmentPrefix;
    this.number = number.padStart(3, "0")
    this.credits = credits;

    this.description = description;
    this.raw_prereqs = prereqs; // Note, we'll have to go through afterwards and change strings to courses
  }

  static fromObject(code: string, data: CourseData): Course {
    return new Course(code, data.units, data.description, data.prereqs);
  }

  get title(): string {
    return `${this.department} ${this.number}`;
  }

  get styleName(): string {
    return this.department.toLowerCase();
  }
}


class CourseRequirement implements CurriculumItem {
  public title: string
  public credits: number
  public kind: RequirementKind

  constructor(
    title: string,
    credits: number,
    kind: RequirementKind
  ) {
    this.title = title
    this.credits = credits
    this.kind = kind
  }

  get styleName(): string {
    return this.kind.toLowerCase();
  }
}

class CourseChoice implements CurriculumItem {
  title: string;
  credits: number;
  options: string[];
  constructor(
    title: string,
    credits: number,
    options: string[]
  ) {
    this.title = title;
    this.credits = credits;
    this.options = options;
  }

  get styleName(): string {
    return "choice";
  }
}

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


// export type { CurriculumItem };
// export { Course, CourseRequirement, CourseChoice };
// export { allCourses };
