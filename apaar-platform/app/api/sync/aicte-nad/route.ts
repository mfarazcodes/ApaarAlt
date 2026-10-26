import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_CSV_BYTES, MAX_CSV_ROWS, CsvLimitError, parseCsv, type RawRow } from "@/lib/csv";
import { HttpError, jsonError, parseWith, readJson } from "@/lib/http";
import {
  SAMPLE_COLLEGES,
  SAMPLE_DIPLOMAS,
  SAMPLE_MESSY_ERP_CSV,
  SAMPLE_PROBLEM_CSV,
  SAMPLE_REVALUATION_CSV,
  SAMPLE_TARGET_SYLLABUS,
  calculateInstitutionCompliance,
  calculateLateralEntryOverlap,
  computeComplianceScore,
  detectSchemaMapping,
  diffCourses,
  forecastCredits,
  normalizeCourseRow,
  pickField,
  processStudentSemesterRecord,
  simulateNepExit,
  stripGovernmentIds,
  validateSwayamCap,
  type InstitutionMeta,
  type NADStudentRecord,
  type PriorSummary,
  type ProgrammeIntake,
  type SyllabusTopic,
} from "@/lib/nadSyncEngine";
import { tokenizeDemographicId } from "@/lib/tokenization";

/** Demo state kept on globalThis so dev hot-reloads do not wipe it. */
interface SyncState {
  meta: InstitutionMeta;
  programmes: ProgrammeIntake[];
  students: NADStudentRecord[];
}
const g = globalThis as typeof globalThis & { __apaarSyncState?: SyncState };

const PROGRAMME_BY_CODE: Record<string, { programme: string; program: string }> = {
  CS: { programme: "Computer Science", program: "B.Tech Computer Science & Engineering" },
  EC: { programme: "Electronics & Comm.", program: "B.Tech Electronics & Communication" },
  ME: { programme: "Mechanical", program: "B.Tech Mechanical & Mechatronics" },
  CE: { programme: "Civil", program: "B.Tech Civil Engineering" },
  EE: { programme: "Electrical", program: "B.Tech Electrical Engineering" },
};

const programmeFor = (roll: string) => PROGRAMME_BY_CODE[roll.split("-")[1] ?? ""] ?? { programme: "Other", program: "B.Tech" };

function groupByRoll(rows: RawRow[]): Record<string, RawRow[]> {
  const grouped: Record<string, RawRow[]> = {};
  for (const r of rows) {
    const roll = pickField(r, "rollNumber") ?? "UNKNOWN-ROLL";
    (grouped[roll] ??= []).push(r);
  }
  return grouped;
}

const SEED_PRIORS: Record<string, PriorSummary> = {
  "2023-CS-041": { creditsEarned: 82, creditsRegistered: 82, gradePoints: 82 * 8.8 },
  "2023-ME-112": { creditsEarned: 78, creditsRegistered: 78, gradePoints: 78 * 8.4 },
};

function state(): SyncState {
  if (g.__apaarSyncState) return g.__apaarSyncState;

  const students: NADStudentRecord[] = [];
  for (const [roll, rows] of Object.entries(groupByRoll(parseCsv(SAMPLE_MESSY_ERP_CSV).rows))) {
    students.push(
      processStudentSemesterRecord({
        studentRoll: roll,
        studentName: (pickField(rows[0], "studentName") ?? "Student").replace(/["']/g, ""),
        abcAccountId: pickField(rows[0], "abcId") ?? "ABC-PENDING",
        apaarToken: tokenizeDemographicId(roll, "STUDENT_ROLL", "NIST-DEMO").vaultToken,
        program: programmeFor(roll).program,
        semester: 5,
        academicYear: "2024-25",
        rows,
        prior: SEED_PRIORS[roll] ?? null,
      })
    );
  }

  g.__apaarSyncState = {
    meta: {
      institutionCode: "AICTE-DEMO-0001",
      institutionName: "Vindhya Institute of Technology (sample data)",
      aicteApprovalReference: "AICTE/EOA/2024-25/DEMO-0001",
      academicYear: "2024-25",
    },
    // Start-of-year figures. They add up to 1,200 approved, 1,180 enrolled, 1,148 verified, 1,120 ABC seeded.
    programmes: [
      { programme: "Computer Science", approvedIntake: 360, erpEnrolled: 362, verified: 354, abcSeeded: 350 },
      { programme: "Electronics & Comm.", approvedIntake: 240, erpEnrolled: 236, verified: 228, abcSeeded: 220 },
      { programme: "Mechanical", approvedIntake: 240, erpEnrolled: 231, verified: 221, abcSeeded: 214 },
      { programme: "Civil", approvedIntake: 180, erpEnrolled: 176, verified: 173, abcSeeded: 169 },
      { programme: "Electrical", approvedIntake: 180, erpEnrolled: 175, verified: 172, abcSeeded: 167 },
    ],
    students,
  };
  return g.__apaarSyncState;
}

const complianceOf = (s: SyncState) => calculateInstitutionCompliance(s.programmes, s.meta);

/* ── Request schemas ─────────────────────────────────────────────────── */

const credits = z.number().min(0).max(1000);

const sheetFields = {
  csvText: z.string().max(MAX_CSV_BYTES).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).max(MAX_CSV_ROWS).optional(),
  semester: z.number().int().min(1).max(12).default(5),
  academicYear: z.string().regex(/^d{4}-d{2}$/, "Academic year looks like 2024-25").optional(),
  program: z.string().min(1).max(80).optional(),
  backlogRule: z.enum(["REPLACE_FAILED_ATTEMPT", "KEEP_ALL_ATTEMPTS"]).optional(),
};

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("VALIDATE_SWAYAM"), totalCredits: credits.default(160), swayamCredits: credits.default(0) }),
  z.object({ action: z.literal("NEP_EXIT"), earnedCredits: credits.default(0), vocationalCredits: credits.default(0) }),
  z.object({
    action: z.literal("FORECAST"),
    earnedCredits: credits.default(0),
    totalCredits: credits.default(160),
    scheduledRemaining: z.array(credits).max(12).default([]),
    swayamUsed: credits.default(0),
  }),
  z.object({
    action: z.literal("LATERAL_ENTRY"),
    diploma: z.string().max(20).optional(),
    topics: z.array(z.object({ topic: z.string().min(1).max(120), credits: z.number().min(0).max(20) })).max(60).optional(),
  }),
  z.object({ action: z.literal("MAP_SCHEMA"), ...sheetFields }),
  z.object({ action: z.literal("PREVIEW"), ...sheetFields }),
  z.object({ action: z.literal("SYNC"), acknowledgeIssues: z.boolean().default(false), ...sheetFields }),
]);

export async function GET() {
  const s = state();
  return NextResponse.json({
    success: true,
    engine: "Unified AICTE-NAD Sync Engine v4.0",
    compliance: complianceOf(s),
    sampleMessyCsv: SAMPLE_MESSY_ERP_CSV,
    sampleRevaluationCsv: SAMPLE_REVALUATION_CSV,
    sampleProblemCsv: SAMPLE_PROBLEM_CSV,
    syncedStudents: s.students,
    leaderboard: SAMPLE_COLLEGES.map((c) => ({ ...c, ...computeComplianceScore(c) })).sort((a, b) => b.score - a.score),
    diplomaSamples: Object.entries(SAMPLE_DIPLOMAS).map(([key, v]) => ({ key, label: v.label })),
  });
}

export async function POST(req: Request) {
  try {
    const raw = (await readJson(req, MAX_CSV_BYTES + 4096)) as Record<string, unknown>;
    const body = parseWith(Body, { action: "SYNC", ...raw });

    switch (body.action) {
      case "VALIDATE_SWAYAM":
        return NextResponse.json({ success: true, result: validateSwayamCap(body.totalCredits, body.swayamCredits) });

      case "NEP_EXIT":
        return NextResponse.json({ success: true, result: simulateNepExit(body.earnedCredits, body.vocationalCredits) });

      case "FORECAST":
        return NextResponse.json({
          success: true,
          result: forecastCredits({
            earnedCredits: body.earnedCredits,
            totalCredits: body.totalCredits,
            scheduledRemaining: body.scheduledRemaining,
            swayamUsed: body.swayamUsed,
          }),
        });

      case "LATERAL_ENTRY": {
        const prior: SyllabusTopic[] | undefined = body.topics ?? (body.diploma ? SAMPLE_DIPLOMAS[body.diploma]?.syllabus : undefined);
        if (!prior) throw new HttpError(400, "Provide 'topics' or a known 'diploma' key.");
        return NextResponse.json({ success: true, result: calculateLateralEntryOverlap(prior, SAMPLE_TARGET_SYLLABUS) });
      }
    }

    // Everything below works on an uploaded marksheet.
    if (body.csvText === undefined && body.rows === undefined) throw new HttpError(400, "Provide either 'csvText' or 'rows'.");
    let parsed: { headers: string[]; rows: RawRow[]; warnings: string[] };
    try {
      parsed = body.csvText !== undefined ? parseCsv(body.csvText) : { headers: Object.keys(body.rows?.[0] ?? {}), rows: body.rows ?? [], warnings: [] };
    } catch (e) {
      throw new HttpError(e instanceof CsvLimitError ? 413 : 400, e instanceof Error ? e.message : "Could not read the CSV.");
    }
    if (parsed.rows.length === 0) throw new HttpError(400, "No valid rows found in the marksheet.");

    const mapping = detectSchemaMapping(parsed.headers);
    // Government-ID columns are dropped here, before anything is stored or echoed.
    const rows = parsed.rows.map(stripGovernmentIds);

    if (body.action === "MAP_SCHEMA") {
      return NextResponse.json({
        success: true,
        mapping,
        parserWarnings: parsed.warnings,
        preview: rows.slice(0, 5).map((r) => normalizeCourseRow(r)),
        rowCount: rows.length,
      });
    }

    if (mapping.missingRequired.length > 0) {
      throw new HttpError(400, `Cannot map this sheet to NAD. Missing: ${mapping.missingRequired.join(", ")}.`);
    }

    const dryRun = body.action === "PREVIEW";
    const s = state();
    const academicYear = body.academicYear ?? s.meta.academicYear;

    const results = Object.entries(groupByRoll(rows)).map(([roll, studentRows]) => {
      const first = studentRows[0];
      const existing = s.students.find((x) => x.studentRoll === roll);
      const record = processStudentSemesterRecord({
        studentRoll: roll,
        studentName: (pickField(first, "studentName") ?? "Unnamed student").replace(/["']/g, ""),
        abcAccountId: pickField(first, "abcId") ?? "ABC-PENDING",
        apaarToken: existing?.apaarToken ?? tokenizeDemographicId(roll, "STUDENT_ROLL", "NIST-DEMO").vaultToken,
        program: body.program ?? existing?.program ?? programmeFor(roll).program,
        semester: body.semester,
        academicYear,
        rows: studentRows,
        // A student new to NAD has no prior record. Nothing is invented.
        prior: existing ? existing.priorSummary : null,
        existingHistory: existing?.history,
        backlogRule: body.backlogRule ?? existing?.backlogRule,
      });
      const sameSemester = existing?.semester === body.semester;
      return {
        record,
        diff: diffCourses(sameSemester && existing ? existing.courses : [], record.courses),
        isNew: !existing,
      };
    });

    const blockingIssues = results.flatMap((r) =>
      r.record.rowIssues.filter((i) => i.excluded).map((i) => ({ studentRoll: r.record.studentRoll, ...i }))
    );
    const acknowledged = body.action === "SYNC" && body.acknowledgeIssues;

    if (body.action === "SYNC" && blockingIssues.length > 0 && !acknowledged) {
      throw new HttpError(
        400,
        `${blockingIssues.length} row(s) cannot be graded or credited. Fix the sheet, or confirm to sync the rest and leave these out.`,
        { blockingIssues }
      );
    }

    if (!dryRun) {
      for (const { record, isNew } of results) {
        const idx = s.students.findIndex((x) => x.studentRoll === record.studentRoll);
        if (idx >= 0) s.students[idx] = record;
        else s.students.push(record);

        // Only students new to NAD move the headline counts, so re-syncing never inflates them.
        if (isNew) {
          const name = programmeFor(record.studentRoll).programme;
          let row = s.programmes.find((p) => p.programme === name);
          if (!row) {
            row = { programme: name, approvedIntake: 0, erpEnrolled: 0, verified: 0, abcSeeded: 0 };
            s.programmes.push(row);
          }
          row.erpEnrolled += 1;
          if (record.syncStatus !== "HELD_FOR_REVIEW") {
            row.verified += 1;
            row.abcSeeded += 1;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      message: dryRun
        ? `Previewed ${rows.length} ERP rows for ${results.length} students. Nothing was written to NAD.`
        : `Mapped ${rows.length} ERP rows for ${results.length} students into the NAD credit schema.${blockingIssues.length ? ` ${blockingIssues.length} row(s) were left out.` : ""}`,
      mapping,
      parserWarnings: parsed.warnings,
      blockingIssues,
      results: results.map((r) => ({ student: r.record, diff: r.diff, isNew: r.isNew })),
      updatedCompliance: complianceOf(s),
    });
  } catch (err) {
    return jsonError(err, "Failed to execute AICTE-NAD sync");
  }
}
