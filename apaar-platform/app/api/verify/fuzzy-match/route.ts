import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import {
  generateProvisionalAffidavit,
  runDiscrepancyScan,
  runPreFlightFuzzyMatch,
  scanDuplicateEnrolments,
  type DiscrepancyProfile,
  type EnrolmentRecord,
  type MatchClassification,
} from "@/lib/fuzzyMatcher";
import { PRESET_AICTE_CASES, SAMPLE_DISCREPANCY_PROFILE, SAMPLE_ENROLMENTS, SAMPLE_GHOST_CANDIDATES } from "@/lib/fuzzySamples";
import { NS } from "@/lib/store";
import { actorOf, guard } from "@/lib/guard";
import { HttpError, jsonError, parseWith, readJson } from "@/lib/http";

type DecisionKind = "ACCEPTED" | "REJECTED" | "FIXED";

interface Decision {
  caseId: string;
  decision: DecisionKind;
  reason?: string;
  suggestedFix?: string;
  decidedAt: string;
  decidedBy: string;
}

type Decisions = Record<string, Decision>;

/** Which decisions make sense for which kind of case. A hard reject can only be rejected. */
const ALLOWED_DECISIONS: Record<MatchClassification, DecisionKind[]> = {
  EXACT_MATCH: [],
  AUTO_FIXABLE: ["FIXED", "REJECTED"],
  SOFT_MISMATCH_REVIEW: ["ACCEPTED", "REJECTED"],
  HARD_REJECT: ["REJECTED"],
};

const person = z.object({
  name: z.string().min(1).max(120),
  dob: z.string().min(1).max(20),
  gender: z.string().max(10).optional(),
  guardianName: z.string().max(120).optional(),
  source: z.enum(["ERP", "DIGILOCKER", "E_KYC"]),
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RESOLVE"), caseId: z.string().max(20), decision: z.enum(["ACCEPTED", "REJECTED", "FIXED"]), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("AFFIDAVIT"), caseId: z.string().max(20) }),
  z.object({ action: z.literal("DISCREPANCY_SCAN"), profile: z.custom<DiscrepancyProfile>().optional() }),
  z.object({ action: z.literal("COLLISION_SCAN"), enrolments: z.custom<EnrolmentRecord[]>().optional() }),
  z.object({
    action: z.literal("MATCH"),
    records: z.array(z.object({ id: z.string().max(40).optional(), studentRoll: z.string().max(40).optional(), erp: person, digilocker: person })).max(200).optional(),
    erp: person.optional(),
    digilocker: person.optional(),
  }),
]);

const analysed = () => PRESET_AICTE_CASES.map((c) => ({ ...c, analysis: runPreFlightFuzzyMatch(c.erp, c.digilocker) }));

export async function GET(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["REGISTRAR", "AICTE"], scope: "fuzzy" });
    const records = analysed();
    const decisions = (await store.get<Decisions>(NS.fuzzy, "decisions")) ?? {};

    const summary = {
      totalRecords: records.length,
      exactMatches: records.filter((p) => p.analysis.classification === "EXACT_MATCH").length,
      autoFixable: records.filter((p) => p.analysis.classification === "AUTO_FIXABLE").length,
      softMismatches: records.filter((p) => p.analysis.classification === "SOFT_MISMATCH_REVIEW").length,
      hardRejects: records.filter((p) => p.analysis.classification === "HARD_REJECT").length,
    };

    return NextResponse.json({
      success: true,
      engine: "AICTE Pre-Flight Fuzzy Matcher v3.1 (identity confidence + literal API acceptance + discrepancy flags)",
      summary,
      // The AICTE officer sees the national picture and flagged cases, not each college's name queue.
      records: session!.role === "REGISTRAR" ? records : [],
      decisions: session!.role === "REGISTRAR" ? decisions : {},
      discrepancyFlags: runDiscrepancyScan(SAMPLE_DISCREPANCY_PROFILE),
      collisionFlags: scanDuplicateEnrolments(SAMPLE_ENROLMENTS),
      ghostCandidates: SAMPLE_GHOST_CANDIDATES,
    });
  } catch (err) {
    return jsonError(err, "Failed to load the match queue");
  }
}

export async function POST(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["REGISTRAR", "AICTE"], scope: "fuzzy" });
    const body = parseWith(Body, await readJson(req));
    const readOnly = body.action === "DISCREPANCY_SCAN" || body.action === "COLLISION_SCAN";
    if (!readOnly && session!.role !== "REGISTRAR") throw new HttpError(403, "Only a registrar can do this.");

    switch (body.action) {
      case "DISCREPANCY_SCAN":
        return NextResponse.json({ success: true, flags: runDiscrepancyScan(body.profile ?? SAMPLE_DISCREPANCY_PROFILE) });

      case "COLLISION_SCAN":
        return NextResponse.json({ success: true, flags: scanDuplicateEnrolments(body.enrolments ?? SAMPLE_ENROLMENTS) });

      case "AFFIDAVIT": {
        const found = PRESET_AICTE_CASES.find((c) => c.id === body.caseId);
        if (!found) throw new HttpError(404, "Unknown caseId.");
        const analysis = runPreFlightFuzzyMatch(found.erp, found.digilocker);
        return NextResponse.json({
          success: true,
          caseId: found.id,
          affidavit: generateProvisionalAffidavit({
            studentName: found.erp.name,
            studentRoll: found.studentRoll,
            institution: found.institution,
            erpName: found.erp.name,
            digilockerName: found.digilocker.name,
            dob: found.erp.dob,
            discrepancies: analysis.discrepancies,
          }),
        });
      }

      case "RESOLVE": {
        const found = PRESET_AICTE_CASES.find((c) => c.id === body.caseId);
        if (!found) throw new HttpError(404, "Unknown caseId.");
        const analysis = runPreFlightFuzzyMatch(found.erp, found.digilocker);
        const allowed = ALLOWED_DECISIONS[analysis.classification];
        if (!allowed.includes(body.decision)) {
          throw new HttpError(
            400,
            allowed.length === 0 ? "This record already matches. No decision is needed." : `A ${analysis.classification.toLowerCase().replace(/_/g, " ")} case can only be: ${allowed.join(", ")}.`
          );
        }
        const actor = actorOf(session!);
        const decision: Decision = {
          caseId: found.id,
          decision: body.decision,
          reason: body.reason,
          suggestedFix: body.decision === "FIXED" ? analysis.suggestedFixes[0]?.text : undefined,
          decidedAt: new Date().toISOString(),
          decidedBy: actor.label,
        };
        await store.update<Decisions, void>(NS.fuzzy, "decisions", (cur) => ({ value: { ...(cur ?? {}), [found.id]: decision }, result: undefined }));
        await appendAudit(store, {
          type: "FUZZY_DECISION",
          subject: found.id,
          action: `FUZZY_${body.decision}`,
          actorRole: actor.role,
          actor: actor.label,
          detail: `${body.decision} on ${found.id} (${analysis.classification}, ${analysis.sameIdentityConfidence}% same person).${decision.suggestedFix ? ` ${decision.suggestedFix}` : ""}${body.reason ? ` Reason: ${body.reason}` : ""}`,
        });
        return NextResponse.json({ success: true, decision });
      }

      case "MATCH": {
        if (body.records) {
          const results = body.records.map((item) => ({
            id: item.id ?? `REC-${Math.random().toString(36).substring(7).toUpperCase()}`,
            studentRoll: item.studentRoll ?? "UNKNOWN",
            analysis: runPreFlightFuzzyMatch(item.erp, item.digilocker),
          }));
          return NextResponse.json({ success: true, batchSize: results.length, results });
        }
        if (!body.erp || !body.digilocker) throw new HttpError(400, "Provide 'records', or both 'erp' and 'digilocker'.");
        return NextResponse.json({ success: true, analysis: runPreFlightFuzzyMatch(body.erp, body.digilocker) });
      }
    }
  } catch (err) {
    return jsonError(err, "Failed to process fuzzy match request");
  }
}
