import { DEFAULT_BACKLOG_RULE, computeCumulative, type BacklogRule, type CourseAttempt } from "./nadSyncEngine";

/** Sample academic record for the Digital Twin. The student and institution are fictional. */

export interface TwinCourse {
  code: string;
  title: string;
  credits: number;
  grade: "O" | "A+" | "A" | "B+" | "B" | "C" | "P" | "F";
  skills: string[]; // ids from SKILLS in skillMap.ts
  swayam?: boolean; // earned through a SWAYAM MOOC
  backlogClearedFrom?: number; // semester the first attempt was failed in
}

export interface TwinInternship {
  org: string;
  weeks: number;
  mode: "ONSITE" | "REMOTE";
  skills: string[];
}

export interface TwinCertificate {
  title: string;
  issuer: string;
  skills: string[];
}

export interface TwinSemester {
  semester: number;
  year: number;
  status: "COMPLETED" | "PLANNED";
  courses: TwinCourse[];
  internships: TwinInternship[];
  certificates: TwinCertificate[];
  backlogs: { code: string; title: string; failedGrade: "F"; clearedInSemester?: number }[];
}

export const PROGRAM_TOTAL_CREDITS = 160;

export const STUDENT_PROFILE = {
  label: "Rahul K.V.",
  program: "B.Tech Computer Science & Engineering",
  institution: "Vindhya Institute of Technology (sample data)",
  rollNumber: "2023-CS-041",
};

export const TWIN: TwinSemester[] = [
  {
    semester: 1,
    year: 1,
    status: "COMPLETED",
    courses: [
      { code: "MA101", title: "Engineering Mathematics I", credits: 4, grade: "A", skills: ["statistics"] },
      { code: "PH101", title: "Engineering Physics", credits: 3, grade: "A+", skills: ["electronics"] },
      { code: "CS101", title: "Programming in C", credits: 4, grade: "O", skills: ["c"] },
      { code: "EE101", title: "Basic Electrical Engineering", credits: 3, grade: "B+", skills: ["electronics"] },
      { code: "ME101", title: "Engineering Graphics", credits: 2, grade: "A", skills: [] },
      { code: "HS101", title: "Communication Skills", credits: 2, grade: "A+", skills: ["comms"] },
      { code: "PH101L", title: "Physics Laboratory", credits: 1, grade: "A+", skills: ["sensors"] },
      { code: "CS101L", title: "C Programming Laboratory", credits: 2, grade: "O", skills: ["c"] },
    ],
    internships: [],
    certificates: [],
    backlogs: [],
  },
  {
    semester: 2,
    year: 1,
    status: "COMPLETED",
    courses: [
      { code: "MA102", title: "Engineering Mathematics II", credits: 4, grade: "A", skills: ["statistics"] },
      { code: "CY101", title: "Engineering Chemistry", credits: 3, grade: "B+", skills: [] },
      { code: "CS102", title: "Data Structures", credits: 4, grade: "A+", skills: [] },
      { code: "EC102", title: "Digital Logic Design", credits: 4, grade: "A", skills: ["digital"] },
      { code: "CE101", title: "Environmental Science", credits: 2, grade: "A+", skills: [] },
      { code: "ME102", title: "Workshop Practice", credits: 2, grade: "O", skills: [] },
      { code: "CS102L", title: "Data Structures Laboratory", credits: 2, grade: "A+", skills: [] },
    ],
    internships: [],
    certificates: [],
    backlogs: [],
  },
  {
    semester: 3,
    year: 2,
    status: "COMPLETED",
    courses: [
      { code: "MA201", title: "Discrete Mathematics", credits: 4, grade: "A+", skills: [] },
      { code: "CS201", title: "Object Oriented Programming", credits: 4, grade: "O", skills: [] },
      { code: "CS202", title: "Computer Organization", credits: 3, grade: "A", skills: ["coa"] },
      { code: "CS203", title: "Database Management Systems", credits: 4, grade: "A+", skills: ["databases", "sql"] },
      { code: "MA202", title: "Probability & Statistics", credits: 3, grade: "A", skills: ["statistics"] },
      { code: "CS201L", title: "OOP Laboratory", credits: 2, grade: "O", skills: [] },
      { code: "CS203L", title: "DBMS Laboratory", credits: 2, grade: "A+", skills: ["sql", "databases"] },
    ],
    internships: [],
    certificates: [
      { title: "Data Structures & Algorithms (Elite)", issuer: "NPTEL", skills: [] },
    ],
    backlogs: [],
  },
  {
    semester: 4,
    year: 2,
    status: "COMPLETED",
    courses: [
      { code: "CS301", title: "Design & Analysis of Algorithms", credits: 4, grade: "A", skills: [] },
      { code: "CS302", title: "Systems Programming", credits: 4, grade: "A+", skills: ["linux", "scripting"] },
      { code: "CS303", title: "Software Engineering", credits: 3, grade: "A", skills: ["cicd"] },
      { code: "CS304", title: "Computer Networks", credits: 3, grade: "A", skills: ["networking"] },
      { code: "HS301", title: "Constitution of India", credits: 1, grade: "A+", skills: [] },
      { code: "CS302L", title: "Systems Laboratory", credits: 2, grade: "O", skills: ["linux"] },
      { code: "CS304L", title: "Networks Laboratory", credits: 2, grade: "A", skills: ["networking"] },
      { code: "CS305", title: "Theory of Computation", credits: 3, grade: "F", skills: [] },
    ],
    internships: [{ org: "TechNova Labs", weeks: 8, mode: "ONSITE", skills: ["linux", "scripting"] }],
    certificates: [],
    backlogs: [{ code: "CS305", title: "Theory of Computation", failedGrade: "F", clearedInSemester: 5 }],
  },
  {
    semester: 5,
    year: 3,
    status: "COMPLETED",
    courses: [
      { code: "CS401", title: "Operating Systems & Kernels", credits: 4, grade: "A+", skills: ["linux"] },
      { code: "CS402", title: "Compiler Design & Automata", credits: 4, grade: "A", skills: [] },
      { code: "AI402", title: "Machine Learning & DPDP Privacy", credits: 3, grade: "O", skills: ["ml", "python"] },
      { code: "HS401", title: "Professional Ethics in AI", credits: 2, grade: "A+", skills: ["comms"] },
      { code: "CS401L", title: "OS Systems Laboratory", credits: 2, grade: "O", skills: ["linux"] },
      { code: "PE401", title: "Computer Graphics", credits: 3, grade: "A", skills: [] },
      { code: "OE401", title: "Cloud Fundamentals", credits: 3, grade: "A+", skills: ["cloud"] },
      { code: "CS305", title: "Theory of Computation (supplementary)", credits: 3, grade: "C", skills: [], backlogClearedFrom: 4 },
    ],
    internships: [],
    certificates: [{ title: "Linux Essentials", issuer: "Linux Foundation", skills: ["linux"] }],
    backlogs: [],
  },
  {
    semester: 6,
    year: 3,
    status: "COMPLETED",
    courses: [
      { code: "CS501", title: "Distributed Systems", credits: 4, grade: "A+", skills: ["distsys"] },
      { code: "CS502", title: "Cloud Computing", credits: 4, grade: "O", skills: ["cloud"] },
      { code: "CS503", title: "Information Security", credits: 3, grade: "A", skills: ["security"] },
      { code: "CS504", title: "Data Mining", credits: 3, grade: "A+", skills: ["datamining", "python"] },
      { code: "SW501", title: "Internet of Things (SWAYAM)", credits: 3, grade: "A", skills: ["iot", "sensors"], swayam: true },
      { code: "CS505", title: "Mini Project", credits: 2, grade: "O", skills: ["scripting"] },
      { code: "CS502L", title: "Cloud Laboratory", credits: 2, grade: "O", skills: ["cloud", "iac"] },
    ],
    internships: [{ org: "DataBridge Systems", weeks: 6, mode: "REMOTE", skills: ["python", "cloud"] }],
    certificates: [
      { title: "Cloud Practitioner", issuer: "Cloud vendor certification", skills: ["cloud", "security"] },
    ],
    backlogs: [],
  },
  {
    semester: 7,
    year: 4,
    status: "PLANNED",
    courses: [
      { code: "CS601", title: "Major Project Phase I", credits: 6, grade: "A", skills: [] },
      { code: "OE601", title: "Open Elective", credits: 3, grade: "A", skills: [] },
      { code: "IN601", title: "Industry Internship", credits: 3, grade: "A", skills: [] },
    ],
    internships: [],
    certificates: [],
    backlogs: [],
  },
  {
    semester: 8,
    year: 4,
    status: "PLANNED",
    courses: [{ code: "CS602", title: "Major Project Phase II", credits: 8, grade: "A", skills: [] }],
    internships: [],
    certificates: [],
    backlogs: [],
  },
];

const GRADE_POINTS: Record<TwinCourse["grade"], number> = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, P: 4, F: 0 };

const earnedIn = (s: TwinSemester) => s.courses.filter((c) => c.grade !== "F").reduce((n, c) => n + c.credits, 0);

/** SGPA from the semester's own course grades (credit-weighted, failed courses included). Null for a planned semester. */
export function semesterSgpa(sem: TwinSemester): number | null {
  if (sem.status !== "COMPLETED") return null;
  const registered = sem.courses.reduce((n, c) => n + c.credits, 0);
  if (registered === 0) return null;
  const points = sem.courses.reduce((n, c) => n + GRADE_POINTS[c.grade] * c.credits, 0);
  return Math.round((points / registered) * 100) / 100;
}

function completedAttempts(twin: TwinSemester[]): CourseAttempt[] {
  return twin
    .filter((s) => s.status === "COMPLETED")
    .flatMap((s) =>
      s.courses.map((c) => ({
        semester: s.semester,
        courseCode: c.code,
        letterGrade: c.grade,
        gradePoints: GRADE_POINTS[c.grade],
        creditsRegistered: c.credits,
        creditsEarned: c.grade === "F" ? 0 : c.credits,
      }))
    );
}

export interface TwinTotals {
  creditsEarned: number;
  cgpa: number;
  swayamCredits: number;
  completedThrough: number;
  scheduledRemaining: number[];
}

/** Totals over COMPLETED semesters only, using the same attempt and backlog rules as the NAD engine. */
export function twinTotals(twin: TwinSemester[] = TWIN, rule: BacklogRule = DEFAULT_BACKLOG_RULE): TwinTotals {
  const done = twin.filter((s) => s.status === "COMPLETED");
  const cumulative = computeCumulative(null, completedAttempts(twin), rule);
  return {
    creditsEarned: cumulative.creditsEarned,
    cgpa: cumulative.cgpa ?? 0,
    swayamCredits: done.flatMap((s) => s.courses).filter((c) => c.swayam).reduce((n, c) => n + c.credits, 0),
    completedThrough: done.length ? done[done.length - 1].semester : 0,
    scheduledRemaining: twin.filter((s) => s.status === "PLANNED").map((s) => s.courses.reduce((n, c) => n + c.credits, 0)),
  };
}

/** Credits actually earned through the given semester. Planned semesters add nothing. */
export function creditsThroughSemester(n: number, twin: TwinSemester[] = TWIN): number {
  return computeCumulative(null, completedAttempts(twin.filter((s) => s.semester <= n))).creditsEarned;
}

/** Credits if every planned course up to the given semester is also cleared. A projection, never eligibility. */
export function projectedCreditsThrough(n: number, twin: TwinSemester[] = TWIN): number {
  return creditsThroughSemester(n, twin) + twin.filter((s) => s.status === "PLANNED" && s.semester <= n).reduce((sum, s) => sum + earnedIn(s), 0);
}

export { earnedIn as semesterCreditsEarned };
