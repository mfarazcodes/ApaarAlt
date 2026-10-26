/**
 * Unified AICTE-NAD Sync Engine
 *
 * Turns incompatible college ERP marksheets into the credit schema the National Academic Depository
 * (NAD) / Academic Bank of Credits (ABC) expects.
 *
 * Capabilities:
 * 1. Column mapping: an inspectable mapping from arbitrary ERP headers onto NAD fields.
 * 2. Row validation: every row is checked, and a row that cannot be graded or credited is reported and
 *    excluded. The engine never invents a grade, a credit value, a course code or a prior record.
 * 3. SGPA / CGPA from attempt history, with a configurable backlog rule.
 * 4. Diff against what NAD already holds.
 * 5. Per-programme AICTE intake compliance, rolled up to the institution.
 * 6. SWAYAM credit cap, lateral-entry overlap and NEP exit simulation (policy constants below).
 */

import { jaroWinkler } from "./fuzzyMatcher";
import type { RawRow } from "./csv";

export type { RawRow };

export type LetterGrade = "O" | "A+" | "A" | "B+" | "B" | "C" | "P" | "F";

export interface NADCourseCredit {
  courseCode: string;
  courseTitle: string;
  courseCategory: "BASIC_SCIENCES" | "CORE_ENGINEERING" | "ELECTIVE" | "HUMANITIES" | "LAB_PRACTICAL";
  creditsRegistered: number;
  creditsEarned: number;
  letterGrade: LetterGrade;
  gradePoints: number; // 10, 9, 8, 7, 6, 5, 4, 0
}

/* ── Row validation ──────────────────────────────────────────────────── */

export type RowIssueCode =
  | "MISSING_GRADE"
  | "ABSENT"
  | "INCOMPLETE"
  | "WITHDRAWN"
  | "UNPARSEABLE_MARKS"
  | "MARKS_OUT_OF_RANGE"
  | "UNKNOWN_GRADE"
  | "MISSING_COURSE_CODE"
  | "MISSING_CREDITS"
  | "UNPARSEABLE_CREDITS"
  | "MISSING_TITLE"
  | "GRADE_MISMATCH";

export interface RowIssue {
  code: RowIssueCode;
  severity: "BLOCKING" | "WARNING";
  message: string;
}

export interface NormalizedRow {
  courseCode: string | null;
  courseTitle: string | null;
  /** Null when any blocking issue was found. The row is then excluded from SGPA and credits. */
  course: NADCourseCredit | null;
  issues: RowIssue[];
}

export interface RowIssueReport {
  rowNumber: number; // 1-based position within the student's rows
  courseCode: string | null;
  courseTitle: string | null;
  excluded: boolean;
  issues: RowIssue[];
}

/**
 * Maps an institution's own grade strings onto NAD letter grades. Extend or replace it per institution.
 * A string that is not here is reported as UNKNOWN_GRADE. It is never guessed.
 */
export type GradeScale = Record<string, LetterGrade>;

export const DEFAULT_GRADE_SCALE: GradeScale = {
  O: "O",
  OUTSTANDING: "O",
  "A+": "A+",
  EXCELLENT: "A+",
  A: "A",
  "VERY GOOD": "A",
  "B+": "B+",
  GOOD: "B+",
  B: "B",
  "ABOVE AVERAGE": "B",
  C: "C",
  AVERAGE: "C",
  P: "P",
  PASS: "P",
  F: "F",
  FAIL: "F",
  FAILED: "F",
};

const POINTS: Record<LetterGrade, number> = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, P: 4, F: 0 };

const ABSENT_MARKERS = new Set(["AB", "ABS", "ABSENT", "ABSENTEE"]);
const INCOMPLETE_MARKERS = new Set(["I", "INC", "INCOMPLETE"]);
const WITHDRAWN_MARKERS = new Set(["W", "WD", "WITHDRAWN"]);

const blocking = (code: RowIssueCode, message: string): RowIssue => ({ code, severity: "BLOCKING", message });
const warning = (code: RowIssueCode, message: string): RowIssue => ({ code, severity: "WARNING", message });

/** A marker such as AB or W in a marks or grade column. Returns null when the text is not a marker. */
function markerIssue(text: string): RowIssue | null {
  const t = text.trim().toUpperCase();
  if (ABSENT_MARKERS.has(t)) return blocking("ABSENT", "Student was absent. No grade can be assigned.");
  if (INCOMPLETE_MARKERS.has(t)) return blocking("INCOMPLETE", "Result is incomplete. No grade can be assigned yet.");
  if (WITHDRAWN_MARKERS.has(t)) return blocking("WITHDRAWN", "Student withdrew from the course. No grade can be assigned.");
  return null;
}

// Letter grade to UGC grade point mapping
export function mapMarksToGradePoint(marksObtained: number, maxMarks = 100): { grade: LetterGrade; points: number } {
  const pct = (marksObtained / maxMarks) * 100;
  if (pct >= 90) return { grade: "O", points: 10 };
  if (pct >= 80) return { grade: "A+", points: 9 };
  if (pct >= 70) return { grade: "A", points: 8 };
  if (pct >= 60) return { grade: "B+", points: 7 };
  if (pct >= 50) return { grade: "B", points: 6 };
  if (pct >= 45) return { grade: "C", points: 5 };
  if (pct >= 40) return { grade: "P", points: 4 };
  return { grade: "F", points: 0 };
}

/** Null for a string the scale does not know. */
export function gradeStringToGradePoint(
  gradeStr: string,
  scale: GradeScale = DEFAULT_GRADE_SCALE
): { grade: LetterGrade; points: number } | null {
  const grade = scale[gradeStr.trim().toUpperCase()];
  return grade ? { grade, points: POINTS[grade] } : null;
}

/* ── Schema mapper ───────────────────────────────────────────────────── */

export type NadField =
  | "rollNumber"
  | "studentName"
  | "abcId"
  | "courseCode"
  | "courseTitle"
  | "credits"
  | "marks"
  | "maxMarks"
  | "grade";

/** Every spelling of a column that legacy ERPs are known to use. */
export const FIELD_ALIASES: Record<NadField, string[]> = {
  rollNumber: ["roll_no", "roll", "rollno", "roll_number", "student_id", "enrolment_no", "enrollment_no", "reg_no"],
  studentName: ["student_name", "name", "stud_name", "candidate_name"],
  abcId: ["abc_id", "abc_account_id", "abc_no"],
  courseCode: ["course_code", "sub_code", "sub_cd", "subject_code", "course_id", "paper_code"],
  courseTitle: ["course_title", "subj_desc", "sub_name", "subject_name", "course_name", "subject", "paper_name"],
  credits: ["credits", "credit", "cr_reg", "cr", "credits_reg", "credits_registered", "max_credits"],
  marks: ["marks_obtained", "marks_obt", "marks", "score", "obtained_marks"],
  maxMarks: ["max_marks", "total_marks", "out_of", "full_marks"],
  grade: ["grade", "letter_grade", "grd"],
};

/**
 * Columns that hold a government ID. They are never mapped or stored. The upload path drops them,
 * and the mapper reports them so the registrar knows they were ignored on purpose.
 */
export const GOVERNMENT_ID_COLUMNS = ["apaar_id", "apaarid", "aadhaar", "aadhar", "aadhaar_no", "aadhaar_number", "uid", "pan", "pan_no"];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIAS_LOOKUP: { field: NadField; alias: string }[] = (Object.keys(FIELD_ALIASES) as NadField[]).flatMap(
  (field) => FIELD_ALIASES[field].map((alias) => ({ field, alias: squash(alias) }))
);

const GOV_ID_SQUASHED = new Set(GOVERNMENT_ID_COLUMNS.map(squash));

export const isGovernmentIdColumn = (header: string) => GOV_ID_SQUASHED.has(squash(header));

/** First non-blank value among the row's columns that map to `field`. */
export function pickField(raw: RawRow, field: NadField): string | undefined {
  const wanted = new Set(FIELD_ALIASES[field].map(squash));
  for (const [key, value] of Object.entries(raw)) {
    if (!wanted.has(squash(key))) continue;
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text !== "") return text;
  }
  return undefined;
}

/** A copy of the row without any government-ID columns. */
export function stripGovernmentIds(raw: RawRow): RawRow {
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !isGovernmentIdColumn(key)));
}

export interface ColumnMapping {
  source: string;
  target: NadField | null;
  confidence: number; // 0 - 1
  method: "alias" | "fuzzy" | "unmapped" | "government-id";
}

export interface SchemaMappingResult {
  mappings: ColumnMapping[];
  missingRequired: NadField[];
  warnings: string[];
}

const FUZZY_MAP_THRESHOLD = 0.85;

/** Maps raw CSV headers onto NAD fields: exact alias first, then Jaro-Winkler against known aliases. */
export function detectSchemaMapping(headers: string[]): SchemaMappingResult {
  const mappings: ColumnMapping[] = headers.map((source) => {
    if (isGovernmentIdColumn(source)) return { source, target: null, confidence: 0, method: "government-id" as const };

    const key = squash(source);
    const exact = ALIAS_LOOKUP.find((a) => a.alias === key);
    if (exact) return { source, target: exact.field, confidence: 1, method: "alias" as const };

    let best: { field: NadField; score: number } | null = null;
    for (const a of ALIAS_LOOKUP) {
      const score = jaroWinkler(key, a.alias);
      if (!best || score > best.score) best = { field: a.field, score };
    }
    if (best && best.score >= FUZZY_MAP_THRESHOLD) {
      return { source, target: best.field, confidence: Math.round(best.score * 100) / 100, method: "fuzzy" as const };
    }
    return { source, target: null, confidence: 0, method: "unmapped" as const };
  });

  const present = new Set(mappings.map((m) => m.target).filter(Boolean));
  const missingRequired: NadField[] = [];
  if (!present.has("rollNumber")) missingRequired.push("rollNumber");
  if (!present.has("courseCode")) missingRequired.push("courseCode");
  if (!present.has("credits")) missingRequired.push("credits");
  if (!present.has("marks") && !present.has("grade")) missingRequired.push("marks");

  const warnings: string[] = [];
  if (present.has("marks") && !present.has("maxMarks")) warnings.push("No max-marks column found; marks are read as out of 100.");
  mappings
    .filter((m) => m.method === "fuzzy")
    .forEach((m) => warnings.push(`'${m.source}' was matched to ${m.target} by similarity (${Math.round(m.confidence * 100)}%). Please confirm.`));
  mappings
    .filter((m) => m.method === "government-id")
    .forEach((m) => warnings.push(`'${m.source}' looks like a government ID. It is ignored and never stored.`));

  return { mappings, missingRequired, warnings };
}

/* ── Row normalisation ───────────────────────────────────────────────── */

function inferCategory(code: string): NADCourseCredit["courseCategory"] {
  const upper = code.toUpperCase();
  if (upper.startsWith("BS") || upper.startsWith("MA") || upper.startsWith("PH")) return "BASIC_SCIENCES";
  if (upper.includes("LAB") || upper.endsWith("P")) return "LAB_PRACTICAL";
  if (upper.startsWith("HS") || upper.startsWith("ENG")) return "HUMANITIES";
  if (upper.startsWith("OE") || upper.startsWith("PE")) return "ELECTIVE";
  return "CORE_ENGINEERING";
}

/**
 * Standardizes one messy ERP row into NAD format, or says exactly why it cannot.
 * Nothing is defaulted: a blank grade, an unreadable mark or a missing credit value is an issue.
 * Credits of 0 (audit or non-credit courses) are valid.
 */
export function normalizeCourseRow(raw: RawRow, scale: GradeScale = DEFAULT_GRADE_SCALE): NormalizedRow {
  const issues: RowIssue[] = [];

  const code = pickField(raw, "courseCode") ?? null;
  if (!code) issues.push(blocking("MISSING_COURSE_CODE", "Course code is blank."));

  const title = pickField(raw, "courseTitle") ?? null;
  if (!title) issues.push(warning("MISSING_TITLE", "Course title is blank."));

  let credits: number | null = null;
  const creditsText = pickField(raw, "credits");
  if (creditsText === undefined) {
    issues.push(blocking("MISSING_CREDITS", "Credits are blank."));
  } else {
    const n = Number(creditsText);
    if (!Number.isFinite(n) || n < 0) issues.push(blocking("UNPARSEABLE_CREDITS", `Credits '${creditsText}' is not a valid number.`));
    else credits = n;
  }

  const marksText = pickField(raw, "marks");
  const gradeText = pickField(raw, "grade");
  let gradeInfo: { grade: LetterGrade; points: number } | null = null;
  let gradeProblem = false;

  if (marksText !== undefined) {
    const marker = markerIssue(marksText);
    const n = Number(marksText);
    if (marker) {
      issues.push(marker);
      gradeProblem = true;
    } else if (!Number.isFinite(n)) {
      issues.push(blocking("UNPARSEABLE_MARKS", `Marks '${marksText}' could not be read as a number.`));
      gradeProblem = true;
    } else {
      const max = Number(pickField(raw, "maxMarks") ?? 100);
      if (!Number.isFinite(max) || max <= 0) {
        issues.push(blocking("UNPARSEABLE_MARKS", "Max marks is not a positive number."));
        gradeProblem = true;
      } else if (n < 0 || n > max) {
        issues.push(blocking("MARKS_OUT_OF_RANGE", `Marks ${n} are outside 0 to ${max}.`));
        gradeProblem = true;
      } else {
        gradeInfo = mapMarksToGradePoint(n, max);
      }
    }
  }

  if (gradeInfo && gradeText !== undefined) {
    const stated = gradeStringToGradePoint(gradeText, scale);
    if (stated && stated.grade !== gradeInfo.grade) {
      issues.push(warning("GRADE_MISMATCH", `Marks give ${gradeInfo.grade} but the grade column says ${stated.grade}. Marks were used.`));
    }
  } else if (!gradeInfo && !gradeProblem && gradeText !== undefined) {
    const marker = markerIssue(gradeText);
    if (marker) {
      issues.push(marker);
    } else {
      const mapped = gradeStringToGradePoint(gradeText, scale);
      if (mapped) gradeInfo = mapped;
      else issues.push(blocking("UNKNOWN_GRADE", `Grade '${gradeText}' is not in this institution's grade scale.`));
    }
  } else if (marksText === undefined && gradeText === undefined) {
    issues.push(blocking("MISSING_GRADE", "Neither marks nor a grade were provided."));
  }

  const hasBlocking = issues.some((i) => i.severity === "BLOCKING");
  if (hasBlocking || !code || credits === null || !gradeInfo) {
    return { courseCode: code, courseTitle: title, course: null, issues };
  }

  return {
    courseCode: code,
    courseTitle: title,
    course: {
      courseCode: code,
      courseTitle: title ?? code,
      courseCategory: inferCategory(code),
      creditsRegistered: credits,
      creditsEarned: gradeInfo.points > 0 ? credits : 0,
      letterGrade: gradeInfo.grade,
      gradePoints: gradeInfo.points,
    },
    issues,
  };
}

/* ── Diff against NAD ────────────────────────────────────────────────── */

export interface CourseDiff {
  courseCode: string;
  courseTitle: string;
  change: "ADDED" | "CHANGED" | "UNCHANGED" | "REMOVED";
  fields: string[]; // which fields differ, for CHANGED
  before?: NADCourseCredit;
  after?: NADCourseCredit;
}

/** Compares an uploaded marksheet with the courses NAD already holds for the same semester. */
export function diffCourses(existing: NADCourseCredit[], incoming: NADCourseCredit[]): CourseDiff[] {
  const out: CourseDiff[] = [];
  const before = new Map(existing.map((c) => [c.courseCode, c]));
  const seen = new Set<string>();

  for (const after of incoming) {
    seen.add(after.courseCode);
    const prior = before.get(after.courseCode);
    if (!prior) {
      out.push({ courseCode: after.courseCode, courseTitle: after.courseTitle, change: "ADDED", fields: [], after });
      continue;
    }
    const fields: string[] = [];
    if (prior.letterGrade !== after.letterGrade) fields.push("letterGrade");
    if (prior.creditsRegistered !== after.creditsRegistered) fields.push("creditsRegistered");
    if (prior.creditsEarned !== after.creditsEarned) fields.push("creditsEarned");
    out.push({
      courseCode: after.courseCode,
      courseTitle: after.courseTitle,
      change: fields.length ? "CHANGED" : "UNCHANGED",
      fields,
      before: prior,
      after,
    });
  }
  for (const prior of existing) {
    if (!seen.has(prior.courseCode)) {
      out.push({ courseCode: prior.courseCode, courseTitle: prior.courseTitle, change: "REMOVED", fields: [], before: prior });
    }
  }
  return out;
}

/* ── SGPA, CGPA and attempt history ──────────────────────────────────── */

/** One attempt at one course. A failed course that is retaken has two attempts. */
export interface CourseAttempt {
  semester: number;
  courseCode: string;
  letterGrade: LetterGrade;
  gradePoints: number; // points per credit, 0 to 10
  creditsRegistered: number;
  creditsEarned: number;
}

/** Totals imported from before this system held attempt-level data. Null means no prior record. */
export interface PriorSummary {
  creditsEarned: number;
  creditsRegistered: number;
  /** Sum of (grade points x credits) over the prior courses. */
  gradePoints: number;
}

/**
 * How a retaken course counts toward CGPA.
 * - REPLACE_FAILED_ATTEMPT: only the latest attempt counts (the common policy; confirm yours).
 * - KEEP_ALL_ATTEMPTS: every attempt counts.
 * Earned credits always count a course once.
 */
export type BacklogRule = "REPLACE_FAILED_ATTEMPT" | "KEEP_ALL_ATTEMPTS";
export const DEFAULT_BACKLOG_RULE: BacklogRule = "REPLACE_FAILED_ATTEMPT";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Cumulative {
  creditsEarned: number;
  creditsRegistered: number;
  /** Null when there is nothing to average. */
  cgpa: number | null;
}

export function computeCumulative(
  prior: PriorSummary | null,
  attempts: CourseAttempt[],
  rule: BacklogRule = DEFAULT_BACKLOG_RULE
): Cumulative {
  const byCourse = new Map<string, CourseAttempt[]>();
  for (const a of attempts) byCourse.set(a.courseCode, [...(byCourse.get(a.courseCode) ?? []), a]);

  let earned = prior?.creditsEarned ?? 0;
  let registered = prior?.creditsRegistered ?? 0;
  let points = prior?.gradePoints ?? 0;

  for (const list of byCourse.values()) {
    const ordered = [...list].sort((x, y) => x.semester - y.semester);
    earned += Math.max(...ordered.map((a) => a.creditsEarned));
    const counted = rule === "REPLACE_FAILED_ATTEMPT" ? [ordered[ordered.length - 1]] : ordered;
    for (const a of counted) {
      registered += a.creditsRegistered;
      points += a.gradePoints * a.creditsRegistered;
    }
  }
  return { creditsEarned: earned, creditsRegistered: registered, cgpa: registered > 0 ? round2(points / registered) : null };
}

export interface NADStudentRecord {
  studentRoll: string;
  studentName: string;
  abcAccountId: string; // an ABC account label, never a government ID
  apaarToken: string;
  program: string;
  semester: number;
  academicYear: string;
  courses: NADCourseCredit[]; // rows that passed validation
  rowIssues: RowIssueReport[]; // rows with any issue, flagged excluded when blocking
  semesterCreditsEarned: number;
  semesterCreditsRegistered: number;
  sgpa: number | null;
  priorSummary: PriorSummary | null;
  hasPriorRecord: boolean;
  history: CourseAttempt[]; // attempts held here, all semesters
  backlogRule: BacklogRule;
  priorAccumulatedCredits: number; // credits earned before this semester
  updatedCumulativeCredits: number;
  cgpa: number | null;
  nadSyncTimestamp: string;
  syncStatus: "SYNCED_TO_NAD" | "PARTIAL_CREDIT" | "HELD_FOR_REVIEW";
}

export interface SemesterInput {
  studentRoll: string;
  studentName: string;
  abcAccountId: string;
  apaarToken: string;
  program: string;
  semester: number;
  academicYear: string;
  rows: RawRow[];
  prior: PriorSummary | null;
  /** Attempts already held for this student, any semester. Re-submitting a semester replaces its attempts. */
  existingHistory?: CourseAttempt[];
  backlogRule?: BacklogRule;
  gradeScale?: GradeScale;
}

/** Calculates SGPA and the running totals for one student's semester upload. */
export function processStudentSemesterRecord(input: SemesterInput): NADStudentRecord {
  const rule = input.backlogRule ?? DEFAULT_BACKLOG_RULE;
  const normalized = input.rows.map((r) => normalizeCourseRow(r, input.gradeScale));
  const courses = normalized.flatMap((n) => (n.course ? [n.course] : []));

  const rowIssues: RowIssueReport[] = normalized
    .map((n, i) => ({
      rowNumber: i + 1,
      courseCode: n.courseCode,
      courseTitle: n.courseTitle,
      excluded: n.course === null,
      issues: n.issues,
    }))
    .filter((r) => r.issues.length > 0);

  let creditPoints = 0;
  let registered = 0;
  let earned = 0;
  for (const c of courses) {
    registered += c.creditsRegistered;
    earned += c.creditsEarned;
    creditPoints += c.gradePoints * c.creditsRegistered;
  }
  const sgpa = registered > 0 ? round2(creditPoints / registered) : null;

  const attempts: CourseAttempt[] = courses.map((c) => ({
    semester: input.semester,
    courseCode: c.courseCode,
    letterGrade: c.letterGrade,
    gradePoints: c.gradePoints,
    creditsRegistered: c.creditsRegistered,
    creditsEarned: c.creditsEarned,
  }));
  const others = (input.existingHistory ?? []).filter((a) => a.semester !== input.semester);
  const history = [...others, ...attempts];

  const before = computeCumulative(input.prior, others, rule);
  const after = computeCumulative(input.prior, history, rule);
  const excluded = rowIssues.some((r) => r.excluded);

  return {
    studentRoll: input.studentRoll,
    studentName: input.studentName,
    abcAccountId: input.abcAccountId,
    apaarToken: input.apaarToken,
    program: input.program,
    semester: input.semester,
    academicYear: input.academicYear,
    courses,
    rowIssues,
    semesterCreditsEarned: earned,
    semesterCreditsRegistered: registered,
    sgpa,
    priorSummary: input.prior,
    hasPriorRecord: input.prior !== null || others.length > 0,
    history,
    backlogRule: rule,
    priorAccumulatedCredits: before.creditsEarned,
    updatedCumulativeCredits: after.creditsEarned,
    cgpa: after.cgpa,
    nadSyncTimestamp: new Date().toISOString(),
    syncStatus: excluded ? "HELD_FOR_REVIEW" : earned === registered ? "SYNCED_TO_NAD" : "PARTIAL_CREDIT",
  };
}

/* ── Per-programme AICTE intake compliance ───────────────────────────── */

export interface ProgrammeIntake {
  programme: string;
  approvedIntake: number;
  erpEnrolled: number;
  verified: number;
  abcSeeded: number;
}

export type ComplianceStatus = "HEALTHY_OPTIMAL" | "OVER_INTAKE_PENALTY_RISK" | "UNDER_ENROLMENT_RISK" | "NO_APPROVED_INTAKE";

export interface ProgrammeCompliance extends ProgrammeIntake {
  enrolmentPercentage: number | null; // verified / approved
  abcSeedingPercentage: number | null;
  overBy: number; // ERP enrolled above approved intake
  status: ComplianceStatus;
  notice: string;
}

export interface InstitutionMeta {
  institutionCode: string;
  institutionName: string;
  aicteApprovalReference: string;
  academicYear: string;
}

export interface AICTEIntakeCompliance extends InstitutionMeta {
  approvedIntake: number;
  totalErpEnrolled: number;
  verifiedEnrolment: number;
  abcSeededCount: number;
  unverifiedGhostCount: number; // in the ERP but without a verified identity
  enrolmentPercentage: number | null;
  abcSeedingPercentage: number | null;
  complianceStatus: ComplianceStatus;
  aicteNotice: string;
  overIntakeProgrammes: string[];
  programmes: ProgrammeCompliance[];
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** AICTE approves intake per programme, so over-admission is judged per programme. */
export function calculateProgrammeCompliance(p: ProgrammeIntake): ProgrammeCompliance {
  const overBy = Math.max(0, p.erpEnrolled - p.approvedIntake);
  const enrolmentPercentage = pct(p.verified, p.approvedIntake);
  let status: ComplianceStatus = "HEALTHY_OPTIMAL";
  let notice = "Within the approved intake.";

  if (p.approvedIntake <= 0) {
    status = "NO_APPROVED_INTAKE";
    notice = "No approved intake on record for this programme, so compliance cannot be judged.";
  } else if (overBy > 0) {
    status = "OVER_INTAKE_PENALTY_RISK";
    notice = `${p.programme}: ${overBy} more students enrolled than the approved intake of ${p.approvedIntake}.`;
  } else if (enrolmentPercentage !== null && enrolmentPercentage < 60) {
    status = "UNDER_ENROLMENT_RISK";
    notice = `${p.programme}: verified enrolment is below 60% of the approved intake.`;
  }
  return { ...p, enrolmentPercentage, abcSeedingPercentage: pct(p.abcSeeded, p.approvedIntake), overBy, status, notice };
}

/** Rolls programmes up to the institution. Any over-intake programme makes the institution at risk. */
export function calculateInstitutionCompliance(programmes: ProgrammeIntake[], meta: InstitutionMeta): AICTEIntakeCompliance {
  const rows = programmes.map(calculateProgrammeCompliance);
  const sum = (key: keyof Omit<ProgrammeIntake, "programme">) => rows.reduce((n, r) => n + r[key], 0);
  const approved = sum("approvedIntake");
  const enrolled = sum("erpEnrolled");
  const verified = sum("verified");
  const seeded = sum("abcSeeded");
  const over = rows.filter((r) => r.status === "OVER_INTAKE_PENALTY_RISK");
  const noIntake = rows.filter((r) => r.status === "NO_APPROVED_INTAKE");

  let complianceStatus: ComplianceStatus = "HEALTHY_OPTIMAL";
  let aicteNotice = "Every programme is within its approved intake. ABC credit ledger verified.";
  if (over.length > 0) {
    complianceStatus = "OVER_INTAKE_PENALTY_RISK";
    aicteNotice = `Over approved intake: ${over.map((r) => `${r.programme} (+${r.overBy})`).join(", ")}. Supernumerary seat verification is required.`;
  } else if (approved <= 0) {
    complianceStatus = "NO_APPROVED_INTAKE";
    aicteNotice = "No approved intake is on record, so compliance cannot be judged.";
  } else if (noIntake.length > 0) {
    complianceStatus = "NO_APPROVED_INTAKE";
    aicteNotice = `No approved intake on record for: ${noIntake.map((r) => r.programme).join(", ")}.`;
  } else if ((pct(verified, approved) ?? 0) < 60) {
    complianceStatus = "UNDER_ENROLMENT_RISK";
    aicteNotice = "Verified enrolment is below 60% of the approved intake. Seat rationalisation may apply in a later EoA cycle.";
  }

  return {
    ...meta,
    approvedIntake: approved,
    totalErpEnrolled: enrolled,
    verifiedEnrolment: verified,
    abcSeededCount: seeded,
    unverifiedGhostCount: Math.max(0, enrolled - verified),
    enrolmentPercentage: pct(verified, approved),
    abcSeedingPercentage: pct(seeded, approved),
    complianceStatus,
    aicteNotice,
    overIntakeProgrammes: over.map((r) => r.programme),
    programmes: rows,
  };
}

/* ── National compliance score (leaderboard) ─────────────────────────── */

export interface CollegeSnapshot {
  code: string;
  name: string;
  state: string;
  approvedIntake: number;
  erpEnrolled: number;
  verified: number;
  abcSeeded: number;
  flagsOpen: number;
  flagsResolved: number;
}

export interface ComplianceScore {
  score: number; // 0 - 100
  band: "GREEN" | "AMBER" | "RED" | "UNRATED";
  breakdown: { label: string; weight: number; value: number }[];
  note?: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

/**
 * Transparent weighted score: verification 35%, intake fit 25%, ABC seeding 25%, flag resolution 15%.
 * Intake fit is 100 inside 60-100% utilisation and falls off outside that band.
 * A college with no approved intake on record is UNRATED, not scored.
 */
export function computeComplianceScore(c: CollegeSnapshot): ComplianceScore {
  if (!(c.approvedIntake > 0)) {
    return { score: 0, band: "UNRATED", breakdown: [], note: "No approved intake on record." };
  }
  const verification = c.erpEnrolled > 0 ? (c.verified / c.erpEnrolled) * 100 : 0;
  const utilisation = (c.verified / c.approvedIntake) * 100;
  const intakeFit = utilisation > 100 ? clamp(100 - (utilisation - 100) * 4) : utilisation >= 60 ? 100 : clamp((utilisation / 60) * 100);
  const seeding = c.verified > 0 ? (c.abcSeeded / c.verified) * 100 : 0;
  const totalFlags = c.flagsOpen + c.flagsResolved;
  const resolution = totalFlags > 0 ? (c.flagsResolved / totalFlags) * 100 : 100;

  const breakdown = [
    { label: "Identity verification", weight: 35, value: clamp(verification) },
    { label: "Intake fit", weight: 25, value: clamp(intakeFit) },
    { label: "ABC credit seeding", weight: 25, value: clamp(seeding) },
    { label: "Flag resolution", weight: 15, value: clamp(resolution) },
  ];
  const score = Math.round(breakdown.reduce((sum, b) => sum + (b.value * b.weight) / 100, 0));
  return { score, band: score >= 85 ? "GREEN" : score >= 70 ? "AMBER" : "RED", breakdown };
}

/** Fictional institutions: sample data for the demo leaderboard. */
export const SAMPLE_COLLEGES: CollegeSnapshot[] = [
  { code: "DEMO-0001", name: "Vindhya Institute of Technology", state: "Madhya Pradesh", approvedIntake: 1200, erpEnrolled: 1180, verified: 1148, abcSeeded: 1120, flagsOpen: 3, flagsResolved: 41 },
  { code: "DEMO-0002", name: "Sahyadri College of Engineering", state: "Karnataka", approvedIntake: 900, erpEnrolled: 905, verified: 861, abcSeeded: 790, flagsOpen: 9, flagsResolved: 30 },
  { code: "DEMO-0003", name: "Kaveri Polytechnic & Engineering", state: "Tamil Nadu", approvedIntake: 600, erpEnrolled: 548, verified: 502, abcSeeded: 441, flagsOpen: 14, flagsResolved: 22 },
  { code: "DEMO-0004", name: "Brahmaputra Institute of Technology", state: "Assam", approvedIntake: 480, erpEnrolled: 470, verified: 301, abcSeeded: 210, flagsOpen: 26, flagsResolved: 8 },
  { code: "DEMO-0005", name: "Thar Engineering University", state: "Rajasthan", approvedIntake: 1500, erpEnrolled: 1604, verified: 1566, abcSeeded: 1490, flagsOpen: 7, flagsResolved: 55 },
  { code: "DEMO-0006", name: "Konkan Technical Campus", state: "Maharashtra", approvedIntake: 720, erpEnrolled: 690, verified: 655, abcSeeded: 640, flagsOpen: 2, flagsResolved: 34 },
];

/* ── Policy constants ────────────────────────────────────────────────────
 * Each constant records where it comes from. `assumption` means the value is a modelling choice
 * that needs confirming against the current regulation before real use.
 */

export interface PolicyConstant<T> {
  value: T;
  source: string;
  status: "sourced" | "assumption";
}

export const POLICY = {
  swayamCapPercent: {
    value: 40,
    source: "UGC (Credit Framework for Online Learning Courses through SWAYAM) Regulations: up to 40% of a programme's courses through SWAYAM.",
    status: "sourced",
  } as PolicyConstant<number>,
  lateralEntryMinOverlap: {
    value: 70,
    source: "Project threshold for the demo. No regulation was found that fixes a 70% syllabus overlap.",
    status: "assumption",
  } as PolicyConstant<number>,
  nepCertificateCredits: {
    value: 40,
    source: "UGC credit framework under NEP 2020: certificate after the first year.",
    status: "sourced",
  } as PolicyConstant<number>,
  nepDiplomaCredits: {
    value: 80,
    source: "UGC credit framework under NEP 2020: diploma after the second year.",
    status: "sourced",
  } as PolicyConstant<number>,
  programmeCredits: {
    value: 160,
    source: "Typical 4-year B.Tech credit total. Varies by institution and programme.",
    status: "assumption",
  } as PolicyConstant<number>,
  vocationalCredits: {
    value: 4,
    source: "UGC credit framework: additional skill or vocational credits for the first two exits.",
    status: "sourced",
  } as PolicyConstant<number>,
  abcCreditValidityYears: {
    value: 7,
    source: "Academic Bank of Credits regulations: credits remain valid for a limited period. Confirm the current figure.",
    status: "assumption",
  } as PolicyConstant<number>,
} as const;

/* ── SWAYAM MOOC credit cap ──────────────────────────────────────────── */

export const SWAYAM_CAP_PERCENT = POLICY.swayamCapPercent.value;

export interface SwayamCapResult {
  capPercent: number;
  capCredits: number;
  usedCredits: number;
  usedPercent: number;
  remainingCredits: number;
  valid: boolean;
  message: string;
}

export function validateSwayamCap(totalProgrammeCredits: number, swayamCredits: number): SwayamCapResult {
  const capCredits = Math.floor((totalProgrammeCredits * SWAYAM_CAP_PERCENT) / 100);
  const usedPercent = totalProgrammeCredits > 0 ? Math.round((swayamCredits / totalProgrammeCredits) * 1000) / 10 : 0;
  const valid = swayamCredits <= capCredits;
  return {
    capPercent: SWAYAM_CAP_PERCENT,
    capCredits,
    usedCredits: swayamCredits,
    usedPercent,
    remainingCredits: Math.max(0, capCredits - swayamCredits),
    valid,
    message: valid
      ? `${swayamCredits} of ${capCredits} permitted SWAYAM credits used (${usedPercent}% of the programme).`
      : `${swayamCredits} SWAYAM credits is ${usedPercent}% of the programme. The ${SWAYAM_CAP_PERCENT}% cap allows at most ${capCredits}; ${swayamCredits - capCredits} credits cannot be counted.`,
  };
}

/* ── Lateral entry syllabus overlap ──────────────────────────────────── */

export const LATERAL_ENTRY_MIN_OVERLAP = POLICY.lateralEntryMinOverlap.value;

export interface SyllabusTopic {
  topic: string;
  credits: number;
}

export interface LateralEntryResult {
  overlapPercent: number;
  threshold: number;
  thresholdIsAssumption: boolean;
  eligible: boolean;
  matchedCredits: number;
  totalCredits: number;
  matched: { target: string; source: string; similarity: number; credits: number }[];
  gaps: { topic: string; credits: number }[];
  bridgeCredits: number;
}

function topicSimilarity(a: string, b: string): number {
  const ta = a.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const tb = b.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const jw = jaroWinkler(ta.join(""), tb.join(""));
  const shared = ta.filter((t) => tb.includes(t)).length;
  const smaller = Math.min(ta.length, tb.length);
  // Containment only counts when the shorter title has at least two words ("Data Structures" in "Data Structures and Algorithms").
  const containment = smaller >= 2 ? (shared / smaller) * 0.95 : 0;
  return Math.max(jw, containment);
}

/** Credit-weighted share of the target syllabus that the earlier qualification already covers. */
export function calculateLateralEntryOverlap(
  priorSyllabus: SyllabusTopic[],
  targetSyllabus: SyllabusTopic[],
  threshold = LATERAL_ENTRY_MIN_OVERLAP
): LateralEntryResult {
  const matched: LateralEntryResult["matched"] = [];
  const gaps: LateralEntryResult["gaps"] = [];

  for (const target of targetSyllabus) {
    let best: { source: string; similarity: number } | null = null;
    for (const prior of priorSyllabus) {
      const similarity = topicSimilarity(target.topic, prior.topic);
      if (!best || similarity > best.similarity) best = { source: prior.topic, similarity };
    }
    if (best && best.similarity >= 0.85) {
      matched.push({ target: target.topic, source: best.source, similarity: Math.round(best.similarity * 100) / 100, credits: target.credits });
    } else {
      gaps.push({ topic: target.topic, credits: target.credits });
    }
  }

  const totalCredits = targetSyllabus.reduce((s, t) => s + t.credits, 0);
  const matchedCredits = matched.reduce((s, m) => s + m.credits, 0);
  const overlapPercent = totalCredits > 0 ? Math.round((matchedCredits / totalCredits) * 1000) / 10 : 0;

  return {
    overlapPercent,
    threshold,
    thresholdIsAssumption: POLICY.lateralEntryMinOverlap.status === "assumption",
    eligible: overlapPercent >= threshold,
    matchedCredits,
    totalCredits,
    matched,
    gaps,
    bridgeCredits: gaps.reduce((s, g) => s + g.credits, 0),
  };
}

export const SAMPLE_TARGET_SYLLABUS: SyllabusTopic[] = [
  { topic: "Engineering Mathematics I", credits: 4 },
  { topic: "Engineering Physics", credits: 3 },
  { topic: "Programming in C", credits: 4 },
  { topic: "Basic Electrical Engineering", credits: 3 },
  { topic: "Engineering Graphics", credits: 2 },
  { topic: "Data Structures", credits: 4 },
  { topic: "Digital Logic Design", credits: 4 },
  { topic: "Object Oriented Programming", credits: 4 },
  { topic: "Discrete Mathematics", credits: 4 },
  { topic: "Database Management Systems", credits: 4 },
  { topic: "Computer Organization", credits: 3 },
  { topic: "Environmental Science", credits: 2 },
];

export const SAMPLE_DIPLOMAS: Record<string, { label: string; syllabus: SyllabusTopic[] }> = {
  CSE: {
    label: "Diploma in Computer Engineering",
    syllabus: [
      { topic: "Engineering Mathematics", credits: 4 },
      { topic: "Engineering Physics", credits: 3 },
      { topic: "Programming in C", credits: 4 },
      { topic: "Basic Electrical Engineering", credits: 3 },
      { topic: "Engineering Graphics", credits: 2 },
      { topic: "Data Structures using C", credits: 4 },
      { topic: "Digital Logic Design", credits: 4 },
      { topic: "Object Oriented Programming", credits: 4 },
      { topic: "Database Management Systems", credits: 4 },
      { topic: "Computer Organization", credits: 3 },
    ],
  },
  MECH: {
    label: "Diploma in Mechanical Engineering",
    syllabus: [
      { topic: "Engineering Mathematics", credits: 4 },
      { topic: "Engineering Physics", credits: 3 },
      { topic: "Engineering Graphics", credits: 2 },
      { topic: "Basic Electrical Engineering", credits: 3 },
      { topic: "Programming in C", credits: 4 },
      { topic: "Thermodynamics", credits: 4 },
      { topic: "Manufacturing Processes", credits: 4 },
    ],
  },
};

/* ── NEP 2020 Multiple Entry / Exit ──────────────────────────────────── */

export const NEP_EXIT_LEVELS = [
  { level: "UG_CERTIFICATE", label: "UG Certificate", afterYear: 1, minCredits: POLICY.nepCertificateCredits.value, needsVocational: true },
  { level: "UG_DIPLOMA", label: "UG Diploma", afterYear: 2, minCredits: POLICY.nepDiplomaCredits.value, needsVocational: true },
  { level: "DEGREE", label: "B.Tech Degree", afterYear: 4, minCredits: POLICY.programmeCredits.value, needsVocational: false },
] as const;

export const VOCATIONAL_CREDITS_REQUIRED = POLICY.vocationalCredits.value;
export const ABC_CREDIT_VALIDITY_YEARS = POLICY.abcCreditValidityYears.value;

export interface NepExitOption {
  level: (typeof NEP_EXIT_LEVELS)[number]["level"];
  label: string;
  afterYear: number;
  minCredits: number;
  eligible: boolean;
  creditShortfall: number;
  vocationalShortfall: number;
}

export interface NepExitResult {
  earnedCredits: number;
  vocationalCredits: number;
  options: NepExitOption[];
  highestEligible: NepExitOption | null;
  nextMilestone: NepExitOption | null;
  reEntry: { abcValidityYears: number; note: string };
}

/** Eligibility is judged only on credits actually earned. Pass projected credits to a separate call and label them. */
export function simulateNepExit(earnedCredits: number, vocationalCredits = 0): NepExitResult {
  const options: NepExitOption[] = NEP_EXIT_LEVELS.map((l) => {
    const creditShortfall = Math.max(0, l.minCredits - earnedCredits);
    const vocationalShortfall = l.needsVocational ? Math.max(0, VOCATIONAL_CREDITS_REQUIRED - vocationalCredits) : 0;
    return {
      level: l.level,
      label: l.label,
      afterYear: l.afterYear,
      minCredits: l.minCredits,
      eligible: creditShortfall === 0 && vocationalShortfall === 0,
      creditShortfall,
      vocationalShortfall,
    };
  });
  const eligible = options.filter((o) => o.eligible);
  return {
    earnedCredits,
    vocationalCredits,
    options,
    highestEligible: eligible.length ? eligible[eligible.length - 1] : null,
    nextMilestone: options.find((o) => !o.eligible) ?? null,
    reEntry: {
      abcValidityYears: ABC_CREDIT_VALIDITY_YEARS,
      note: `Credits stay in the Academic Bank of Credits for about ${ABC_CREDIT_VALIDITY_YEARS} years (assumption: confirm the current rule), so a student can re-enter and continue from the last exit point.`,
    },
  };
}

/* ── Credit completion forecaster ────────────────────────────────────── */

export interface CreditForecastInput {
  earnedCredits: number;
  totalCredits: number;
  /** Credits the curriculum schedules for each remaining semester. */
  scheduledRemaining: number[];
  swayamUsed?: number;
}

export interface CreditForecast {
  earnedCredits: number;
  totalCredits: number;
  scheduledCredits: number;
  projectedAtGraduation: number;
  shortfall: number;
  onTrack: boolean;
  recommendedSwayam: number;
  swayam: SwayamCapResult;
}

export function forecastCredits(input: CreditForecastInput): CreditForecast {
  const scheduledCredits = input.scheduledRemaining.reduce((s, c) => s + c, 0);
  const projectedAtGraduation = input.earnedCredits + scheduledCredits;
  const shortfall = Math.max(0, input.totalCredits - projectedAtGraduation);
  const swayam = validateSwayamCap(input.totalCredits, input.swayamUsed ?? 0);
  return {
    earnedCredits: input.earnedCredits,
    totalCredits: input.totalCredits,
    scheduledCredits,
    projectedAtGraduation,
    shortfall,
    onTrack: shortfall === 0,
    recommendedSwayam: Math.min(shortfall, swayam.remainingCredits),
    swayam,
  };
}

/**
 * Sample messy ERP marksheet CSV to showcase heterogeneous parsing. The ABC IDs here are
 * made-up labels and deliberately share no digits with any demo APAAR ID.
 */
export const SAMPLE_MESSY_ERP_CSV = `roll_no,student_name,abc_id,sub_cd,subj_desc,cr_reg,marks_obt,max_marks
2023-CS-041,"Rahul K.V.","ABC-DEMO-0041","CS501","Operating Systems & Kernels",4,88,100
2023-CS-041,"Rahul K.V.","ABC-DEMO-0041","CS502","Compiler Design & Automata",4,76,100
2023-CS-041,"Rahul K.V.","ABC-DEMO-0041","AI302","Machine Learning & DPDP Privacy",3,92,100
2023-CS-041,"Rahul K.V.","ABC-DEMO-0041","HS201","Professional Ethics in AI",2,84,100
2023-CS-041,"Rahul K.V.","ABC-DEMO-0041","CS501P","OS Systems Laboratory",2,95,100
2023-ME-112,"Lakshmi Priya S","ABC-DEMO-0112","ME501","Thermodynamics & Heat Transfer",4,81,100
2023-ME-112,"Lakshmi Priya S","ABC-DEMO-0112","ME502","Fluid Mechanics Laboratory",2,89,100
2023-ME-112,"Lakshmi Priya S","ABC-DEMO-0112","MA301","Computational Numerical Methods",4,68,100`;

/** A revaluation re-upload for the same semester: one grade changed, one course added, one dropped. */
export const SAMPLE_REVALUATION_CSV = `roll_no,student_name,abc_id,sub_cd,subj_desc,cr_reg,marks_obt,max_marks
2023-CS-041,"Rahul K.V.","ABC-DEMO-0041","CS501","Operating Systems & Kernels",4,88,100
2023-CS-041,"Rahul K.V.","ABC-DEMO-0041","CS502","Compiler Design & Automata",4,83,100
2023-CS-041,"Rahul K.V.","ABC-DEMO-0041","AI302","Machine Learning & DPDP Privacy",3,92,100
2023-CS-041,"Rahul K.V.","ABC-DEMO-0041","CS501P","OS Systems Laboratory",2,95,100
2023-CS-041,"Rahul K.V.","ABC-DEMO-0041","CS503","Computer Networks",3,79,100`;

/** A sheet with the problems the validator must catch: absent, blank, unknown grade, bad marks, 0 credits. */
export const SAMPLE_PROBLEM_CSV = `roll_no,student_name,abc_id,sub_cd,subj_desc,cr_reg,marks_obt,max_marks,grade
2023-EC-062,"Mohd Faraz","ABC-DEMO-0062","EC501","Signals & Systems",4,AB,100,
2023-EC-062,"Mohd Faraz","ABC-DEMO-0062","EC502","Control Systems",4,,,
2023-EC-062,"Mohd Faraz","ABC-DEMO-0062","EC503","Antenna Theory",3,,,D
2023-EC-062,"Mohd Faraz","ABC-DEMO-0062","EC504","Seminar (audit)",0,,,P
2023-EC-062,"Mohd Faraz","ABC-DEMO-0062","EC505","Digital Communication",4,74,100,`;
