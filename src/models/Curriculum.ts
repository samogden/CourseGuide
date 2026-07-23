
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
