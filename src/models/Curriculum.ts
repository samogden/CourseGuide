import { type CurriculumItem } from "./CurriculumItems";

import { allCourses } from "./CurriculumItems";


export class Semester {
  name: string;
  courses: CurriculumItem[];

  constructor(
    name: string,
    courses: CurriculumItem[]
  ) {
    this.name = name;
    this.courses = courses;
  }
}

export class Curriculum {
  semesters: Semester[];
  constructor(semesters: Semester[]) {
    this.semesters = semesters
  }
}
