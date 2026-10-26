import { NextResponse } from "next/server";
import {
  SAMPLE_COLLEGES,
  SAMPLE_DIPLOMAS,
  SAMPLE_MESSY_ERP_CSV,
  SAMPLE_REVALUATION_CSV,
  SAMPLE_TARGET_SYLLABUS,
  calculateAICTECompliance,
  calculateLateralEntryOverlap,
  computeComplianceScore,
  csvHeaders,
  detectSchemaMapping,
  diffCourses,
  forecastCredits,
  normalizeCourseRow,
  parseMessyCSV,
  pickField,
  processStudentSemesterRecord,
  simulateNepExit,
  validateSwayamCap,
  type NADStudentRecord,
  type RawRow,
  type SyllabusTopic,
} from "@/lib/nadSyncEngine";
import { tokenizeDemographicId } from "@/lib/tokenization";

/** Demo state kept on globalThis so dev hot-reloads do not wipe it. */
interface SyncState {
  counts: { approvedIntake: number; totalErpEnrolled: number; verifiedEnrolment: number; abcSeededCount: number };
  students: NADStudentRecord[];
}
const g = globalThis as typeof globalThis & { __apaarSyncState?: SyncState };

const PROGRAMS: Record<string, string> = {
  CS: "B.Tech Computer Science & Engineering",
  ME: "B.Tech Mechanical & Mechatronics",
  EC: "B.Tech Electronics & Communication",
  EE: "B.Tech Electrical Engineering",
};

function programFor(roll: string): string {
  const code = roll.split("-")[1];
  return PROGRAMS[code] ?? "B.Tech";
}

function groupByRoll(rows: RawRow[]): Record<string, RawRow[]> {
  const grouped: Record<string, RawRow[]> = {};
  for (const r of rows) {
    const roll = pickField(r, "rollNumber") ?? "STUDENT-TEMP";
    (grouped[roll] ??= []).push(r);
  }
  return grouped;
}

function state(): SyncState {
  if (g.__apaarSyncState) return g.__apaarSyncState;
  const seeded: NADStudentRecord[] = [];
  const priors: Record<string, [number, number]> = { "2023-CS-041": [82, 8.8], "2023-ME-112": [78, 8.4] };
  for (const [roll, rows] of Object.entries(groupByRoll(parseMessyCSV(SAMPLE_MESSY_ERP_CSV)))) {
    const [credits, cgpa] = priors[roll] ?? [75, 8.2];
    seeded.push(
      processStudentSemesterRecord(
        roll,
        (pickField(rows[0], "studentName") ?? "Student").replace(/["']/g, ""),
        pickField(rows[0], "abcId") ?? "ABC-PENDING",
        tokenizeDemographicId(roll, "STUDENT_ROLL", "NIST-DEMO").vaultToken,
        programFor(roll),
        5,
        "2024-25",
        credits,
        cgpa,
        rows
      )
    );
  }
  g.__apaarSyncState = {
    counts: { approvedIntake: 1200, totalErpEnrolled: 1180, verifiedEnrolment: 1148, abcSeededCount: 1120 },
    students: seeded,
  };
  return g.__apaarSyncState;
}

const complianceOf = (s: SyncState) =>
  calculateAICTECompliance(s.counts.approvedIntake, s.counts.totalErpEnrolled, s.counts.verifiedEnrolment, s.counts.abcSeededCount);

const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET() {
  const s = state();
  return NextResponse.json({
    success: true,
    engine: "Unified AICTE-NAD Sync Engine v3.2",
    compliance: complianceOf(s),
    sampleMessyCsv: SAMPLE_MESSY_ERP_CSV,
    sampleRevaluationCsv: SAMPLE_REVALUATION_CSV,
    syncedStudents: s.students,
    leaderboard: SAMPLE_COLLEGES.map((c) => ({ ...c, ...computeComplianceScore(c) })).sort((a, b) => b.score - a.score),
    diplomaSamples: Object.entries(SAMPLE_DIPLOMAS).map(([key, v]) => ({ key, label: v.label })),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action: string = body.action ?? "SYNC";

    if (action === "VALIDATE_SWAYAM") {
      return NextResponse.json({ success: true, result: validateSwayamCap(Number(body.totalCredits) || 160, Number(body.swayamCredits) || 0) });
    }

    if (action === "NEP_EXIT") {
      return NextResponse.json({ success: true, result: simulateNepExit(Number(body.earnedCredits) || 0, Number(body.vocationalCredits) || 0) });
    }

    if (action === "FORECAST") {
      const scheduled = Array.isArray(body.scheduledRemaining) ? body.scheduledRemaining.map(Number) : [];
      return NextResponse.json({
        success: true,
        result: forecastCredits({
          earnedCredits: Number(body.earnedCredits) || 0,
          totalCredits: Number(body.totalCredits) || 160,
          scheduledRemaining: scheduled,
          swayamUsed: Number(body.swayamUsed) || 0,
        }),
      });
    }

    if (action === "LATERAL_ENTRY") {
      const prior: SyllabusTopic[] | undefined = Array.isArray(body.topics) ? body.topics : SAMPLE_DIPLOMAS[body.diploma as string]?.syllabus;
      if (!prior) return fail("Provide 'topics' or a known 'diploma' key.");
      return NextResponse.json({ success: true, result: calculateLateralEntryOverlap(prior, SAMPLE_TARGET_SYLLABUS) });
    }

    // Everything below works on an uploaded marksheet.
    let rawRows: RawRow[] = [];
    let headers: string[] = [];
    if (typeof body.csvText === "string") {
      rawRows = parseMessyCSV(body.csvText);
      headers = csvHeaders(body.csvText);
    } else if (Array.isArray(body.rows)) {
      rawRows = body.rows;
      headers = Object.keys(rawRows[0] ?? {});
    } else {
      return fail("Please provide either 'csvText' or 'rows' array.");
    }
    if (rawRows.length === 0) return fail("No valid rows found in provided marksheet payload.");

    const mapping = detectSchemaMapping(headers);

    if (action === "MAP_SCHEMA") {
      return NextResponse.json({
        success: true,
        mapping,
        preview: rawRows.slice(0, 5).map((r) => normalizeCourseRow(r)),
        rowCount: rawRows.length,
      });
    }

    if (mapping.missingRequired.length > 0) {
      return fail(`Cannot map this sheet to NAD. Missing: ${mapping.missingRequired.join(", ")}.`);
    }

    // action SYNC (or "PREVIEW" to see the diff without writing)
    const dryRun = action === "PREVIEW";
    const s = state();
    const semester = Number(body.semester) || 5;
    const results: { record: NADStudentRecord; diff: ReturnType<typeof diffCourses>; isNew: boolean }[] = [];

    for (const [roll, studentRows] of Object.entries(groupByRoll(rawRows))) {
      const first = studentRows[0];
      const existing = s.students.find((x) => x.studentRoll === roll);
      // Re-uploading a semester replaces it; a new semester builds on the stored totals.
      const sameSemester = existing?.semester === semester;
      const priorCredits = existing ? (sameSemester ? existing.priorAccumulatedCredits : existing.updatedCumulativeCredits) : 75;
      const priorCgpa = existing ? (sameSemester ? existing.priorCgpa : existing.cgpa) : 8.2;

      const record = processStudentSemesterRecord(
        roll,
        (pickField(first, "studentName") ?? "AICTE Student").replace(/["']/g, ""),
        pickField(first, "abcId") ?? "ABC-PENDING",
        existing?.apaarToken ?? tokenizeDemographicId(roll, "STUDENT_ROLL", "NIST-DEMO").vaultToken,
        existing?.program ?? programFor(roll),
        semester,
        "2024-25",
        priorCredits,
        priorCgpa,
        studentRows
      );
      results.push({
        record,
        diff: diffCourses(sameSemester && existing ? existing.courses : [], record.courses),
        isNew: !existing,
      });
    }

    if (!dryRun) {
      for (const { record, isNew } of results) {
        const idx = s.students.findIndex((x) => x.studentRoll === record.studentRoll);
        if (idx >= 0) s.students[idx] = record;
        else s.students.push(record);
        // Only students new to NAD move the headline counts, so re-syncing never inflates them.
        if (isNew) {
          s.counts.verifiedEnrolment = Math.min(s.counts.approvedIntake, s.counts.verifiedEnrolment + 1);
          s.counts.abcSeededCount = Math.min(s.counts.approvedIntake, s.counts.abcSeededCount + 1);
        }
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      message: dryRun
        ? `Previewed ${rawRows.length} ERP rows for ${results.length} students. Nothing was written to NAD.`
        : `Mapped ${rawRows.length} ERP rows for ${results.length} students into the NAD credit schema.`,
      mapping,
      results: results.map((r) => ({ student: r.record, diff: r.diff, isNew: r.isNew })),
      updatedCompliance: complianceOf(s),
      allStudents: s.students,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Failed to execute AICTE-NAD sync", 500);
  }
}
