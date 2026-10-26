import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit, type AuditInput } from "@/lib/audit";
import { CsvLimitError, MAX_CSV_BYTES, MAX_CSV_ROWS, parseCsv, type RawRow } from "@/lib/csv";
import { actorOf, guard } from "@/lib/guard";
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
  type CourseDiff,
  type InstitutionMeta,
  type NADStudentRecord,
  type PriorSummary,
  type ProgrammeIntake,
  type SyllabusTopic,
} from "@/lib/nadSyncEngine";
import { complianceOf, groupByRoll, programmeFor, readState, seedState, tokenFor, type SyncState } from "@/lib/syncState";
import { NS } from "@/lib/store";

/* ── Request schemas ─────────────────────────────────────────────────── */

const credits = z.number().min(0).max(1000);

const sheetFields = {
  csvText: z.string().max(MAX_CSV_BYTES).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).max(MAX_CSV_ROWS).optional(),
  semester: z.number().int().min(1).max(12).default(5),
  academicYear: z.string().regex(/^\d{4}-\d{2}$/, "Academic year looks like 2024-25").optional(),
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

/** Calculators any signed-in role may use. Everything that reads or writes a college's data is registrar-only. */
const CALCULATORS = new Set(["VALIDATE_SWAYAM", "NEP_EXIT", "FORECAST", "LATERAL_ENTRY"]);

export async function GET(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["REGISTRAR", "AICTE"], scope: "sync" });
    const s = await readState(store);
    const registrar = session!.role === "REGISTRAR";
    return NextResponse.json({
      success: true,
      engine: "Unified AICTE-NAD Sync Engine v4.1",
      compliance: complianceOf(s),
      leaderboard: SAMPLE_COLLEGES.map((c) => ({ ...c, ...computeComplianceScore(c) })).sort((a, b) => b.score - a.score),
      // Student-level data and the sample sheets are for the registrar only.
      ...(registrar
        ? {
            sampleMessyCsv: SAMPLE_MESSY_ERP_CSV,
            sampleRevaluationCsv: SAMPLE_REVALUATION_CSV,
            sampleProblemCsv: SAMPLE_PROBLEM_CSV,
            syncedStudents: s.students,
            diplomaSamples: Object.entries(SAMPLE_DIPLOMAS).map(([key, v]) => ({ key, label: v.label })),
          }
        : {}),
    });
  } catch (err) {
    return jsonError(err, "Failed to read sync state");
  }
}

export async function POST(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["STUDENT", "REGISTRAR", "AICTE"], scope: "sync" });
    const raw = (await readJson(req, MAX_CSV_BYTES + 4096)) as Record<string, unknown>;
    const body = parseWith(Body, { action: "SYNC", ...raw });

    if (!CALCULATORS.has(body.action) && session!.role !== "REGISTRAR") {
      throw new HttpError(403, "Only a registrar can upload or sync marksheets.");
    }

    switch (body.action) {
      case "VALIDATE_SWAYAM":
        return NextResponse.json({ success: true, result: validateSwayamCap(body.totalCredits, body.swayamCredits) });
      case "NEP_EXIT":
        return NextResponse.json({ success: true, result: simulateNepExit(body.earnedCredits, body.vocationalCredits) });
      case "FORECAST":
        return NextResponse.json({
          success: true,
          result: forecastCredits({ earnedCredits: body.earnedCredits, totalCredits: body.totalCredits, scheduledRemaining: body.scheduledRemaining, swayamUsed: body.swayamUsed }),
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
      return NextResponse.json({ success: true, mapping, parserWarnings: parsed.warnings, preview: rows.slice(0, 5).map((r) => normalizeCourseRow(r)), rowCount: rows.length });
    }
    if (mapping.missingRequired.length > 0) throw new HttpError(400, `Cannot map this sheet to NAD. Missing: ${mapping.missingRequired.join(", ")}.`);

    const dryRun = body.action === "PREVIEW";
    const actor = actorOf(session!);
    const grouped = Object.entries(groupByRoll(rows));

    // One pass builds the records. For SYNC it runs inside the update, so it reads and writes the same state atomically.
    const build = (s: SyncState) =>
      grouped.map(([roll, studentRows]) => {
        const first = studentRows[0];
        const existing = s.students.find((x) => x.studentRoll === roll);
        const record = processStudentSemesterRecord({
          studentRoll: roll,
          studentName: (pickField(first, "studentName") ?? "Unnamed student").replace(/["']/g, ""),
          abcAccountId: pickField(first, "abcId") ?? "ABC-PENDING",
          apaarToken: existing?.apaarToken ?? tokenFor(roll),
          program: body.program ?? existing?.program ?? programmeFor(roll).program,
          semester: body.semester,
          academicYear: body.academicYear ?? s.meta.academicYear,
          rows: studentRows,
          // A student new to NAD has no prior record. Nothing is invented.
          prior: existing ? existing.priorSummary : null,
          existingHistory: existing?.history,
          backlogRule: body.backlogRule ?? existing?.backlogRule,
        });
        const sameSemester = existing?.semester === body.semester;
        return { record, diff: diffCourses(sameSemester && existing ? existing.courses : [], record.courses), isNew: !existing };
      });

    type Built = ReturnType<typeof build>;
    const blockingOf = (results: Built) =>
      results.flatMap((r) => r.record.rowIssues.filter((i) => i.excluded).map((i) => ({ studentRoll: r.record.studentRoll, ...i })));

    if (dryRun) {
      const s = await readState(store);
      const results = build(s);
      return NextResponse.json({
        success: true,
        dryRun: true,
        message: `Previewed ${rows.length} ERP rows for ${results.length} students. Nothing was written to NAD.`,
        mapping,
        parserWarnings: parsed.warnings,
        blockingIssues: blockingOf(results),
        results: results.map((r) => ({ student: r.record, diff: r.diff, isNew: r.isNew })),
        updatedCompliance: complianceOf(s),
      });
    }

    const acknowledged = body.action === "SYNC" && body.acknowledgeIssues;
    await readState(store); // make sure the seed exists before the atomic update

    const outcome = await store.update<SyncState, { results: Built; blocking: ReturnType<typeof blockingOf>; state: SyncState; written: boolean }>(NS.sync, "state", (cur) => {
      const s = cur ?? seedState();
      const results = build(s);
      const blocking = blockingOf(results);
      // Refuse before changing anything. The registrar must confirm that the excluded rows are intentionally left out.
      if (blocking.length > 0 && !acknowledged) return { value: undefined, result: { results, blocking, state: s, written: false } };

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
      return { value: s, result: { results, blocking, state: s, written: true } };
    });

    if (!outcome.written) {
      throw new HttpError(400, `${outcome.blocking.length} row(s) cannot be graded or credited. Fix the sheet, or confirm to sync the rest and leave these out.`, { blockingIssues: outcome.blocking });
    }

    // Audit: one entry per student for the sync, and one per changed grade so a revaluation is traceable.
    for (const { record, diff, isNew } of outcome.results) {
      const changed = diff.filter((d: CourseDiff) => d.change !== "UNCHANGED");
      const base: Pick<AuditInput, "actorRole" | "actor" | "subject"> = { actorRole: actor.role, actor: actor.label, subject: record.apaarToken };
      await appendAudit(store, {
        ...base,
        type: "NAD_SYNC",
        action: "NAD_SYNC",
        detail: `Semester ${record.semester} synced: ${record.courses.length} courses (${changed.length} changed), ${record.rowIssues.filter((r) => r.excluded).length} row(s) left out${isNew ? ", new to NAD" : ""}. SGPA ${record.sgpa ?? "n/a"}.`,
      });
      for (const d of diff) {
        if (d.change === "CHANGED" && d.before && d.after && d.before.letterGrade !== d.after.letterGrade) {
          await appendAudit(store, { ...base, type: "GRADE_CHANGE", action: "GRADE_CHANGE", detail: `${d.courseCode}: ${d.before.letterGrade} to ${d.after.letterGrade} in semester ${record.semester}.` });
        }
      }
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      message: `Mapped ${rows.length} ERP rows for ${outcome.results.length} students into the NAD credit schema.${outcome.blocking.length ? ` ${outcome.blocking.length} row(s) were left out.` : ""}`,
      mapping,
      parserWarnings: parsed.warnings,
      blockingIssues: outcome.blocking,
      results: outcome.results.map((r) => ({ student: r.record, diff: r.diff, isNew: r.isNew })),
      updatedCompliance: complianceOf(outcome.state),
    });
  } catch (err) {
    return jsonError(err, "Failed to execute AICTE-NAD sync");
  }
}
