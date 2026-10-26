import { NextResponse } from "next/server";
import {
  generateProvisionalAffidavit,
  runDiscrepancyScan,
  runPreFlightFuzzyMatch,
  scanDuplicateEnrolments,
  type DiscrepancyProfile,
  type EnrolmentRecord,
  type StudentDemographicRecord,
} from "@/lib/fuzzyMatcher";
import {
  PRESET_AICTE_CASES,
  SAMPLE_DISCREPANCY_PROFILE,
  SAMPLE_ENROLMENTS,
  SAMPLE_GHOST_CANDIDATES,
} from "@/lib/fuzzySamples";

interface MatchItem {
  id?: string;
  studentRoll?: string;
  erp: StudentDemographicRecord;
  digilocker: StudentDemographicRecord;
}

const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const message = (e: unknown) => (e instanceof Error ? e.message : "Failed to process fuzzy match request");

export async function GET() {
  const records = PRESET_AICTE_CASES.map((item) => ({
    ...item,
    analysis: runPreFlightFuzzyMatch(item.erp, item.digilocker),
  }));

  return NextResponse.json({
    success: true,
    engine: "AICTE Pre-Flight Fuzzy Matcher v3.0 (identity confidence + literal API acceptance + discrepancy flags)",
    summary: {
      totalRecords: records.length,
      exactMatches: records.filter((p) => p.analysis.classification === "EXACT_MATCH").length,
      autoFixable: records.filter((p) => p.analysis.classification === "AUTO_FIXABLE").length,
      softMismatches: records.filter((p) => p.analysis.classification === "SOFT_MISMATCH_REVIEW").length,
      hardRejects: records.filter((p) => p.analysis.classification === "HARD_REJECT").length,
    },
    records,
    discrepancyFlags: runDiscrepancyScan(SAMPLE_DISCREPANCY_PROFILE),
    collisionFlags: scanDuplicateEnrolments(SAMPLE_ENROLMENTS),
    ghostCandidates: SAMPLE_GHOST_CANDIDATES,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === "DISCREPANCY_SCAN") {
      const profile: DiscrepancyProfile = body.profile ?? SAMPLE_DISCREPANCY_PROFILE;
      return NextResponse.json({ success: true, flags: runDiscrepancyScan(profile) });
    }

    if (body.action === "COLLISION_SCAN") {
      const enrolments: EnrolmentRecord[] = Array.isArray(body.enrolments) ? body.enrolments : SAMPLE_ENROLMENTS;
      return NextResponse.json({ success: true, flags: scanDuplicateEnrolments(enrolments) });
    }

    if (body.action === "AFFIDAVIT") {
      const found = PRESET_AICTE_CASES.find((c) => c.id === body.caseId);
      if (!found) return fail("Unknown caseId.");
      const analysis = runPreFlightFuzzyMatch(found.erp, found.digilocker);
      const affidavit = generateProvisionalAffidavit({
        studentName: found.erp.name,
        studentRoll: found.studentRoll,
        institution: found.institution,
        erpName: found.erp.name,
        digilockerName: found.digilocker.name,
        dob: found.erp.dob,
        discrepancies: analysis.discrepancies,
      });
      return NextResponse.json({ success: true, caseId: found.id, affidavit });
    }

    if (Array.isArray(body.records)) {
      const results = (body.records as MatchItem[]).map((item) => ({
        id: item.id ?? `REC-${Math.random().toString(36).substring(7).toUpperCase()}`,
        studentRoll: item.studentRoll ?? "UNKNOWN",
        erp: item.erp,
        digilocker: item.digilocker,
        analysis: runPreFlightFuzzyMatch(item.erp, item.digilocker),
      }));
      return NextResponse.json({ success: true, batchSize: results.length, results });
    }

    if (!body.erp || !body.digilocker) {
      return fail("Missing required fields 'erp' and 'digilocker' in request body.");
    }
    return NextResponse.json({
      success: true,
      erp: body.erp,
      digilocker: body.digilocker,
      analysis: runPreFlightFuzzyMatch(body.erp, body.digilocker),
    });
  } catch (err) {
    return fail(message(err), 500);
  }
}
