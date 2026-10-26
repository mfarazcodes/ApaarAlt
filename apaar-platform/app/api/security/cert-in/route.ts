import { NextResponse } from "next/server";
import {
  generateBreachAlert,
  getIssuerPublicKeyPem,
  getSecurityStatus,
  recordThirdPartyQuery,
  tokenizeDemographicId,
  type BreachType,
  type IdType,
} from "@/lib/tokenization";

const ID_TYPES: IdType[] = ["AADHAAR", "PAN", "APAAR", "DIGILOCKER_URI", "STUDENT_ROLL"];
const BREACH_TYPES: BreachType[] = ["UNAUTHORISED_ACCESS", "DATA_EXFILTRATION", "RANSOMWARE", "CREDENTIAL_LEAK", "OTHER"];

const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET() {
  return NextResponse.json({
    success: true,
    engine: "CERT-In / DPB Incident Alerts & Zero-PII Vault Monitor v3.0",
    status: getSecurityStatus(),
    issuerPublicKeyPem: getIssuerPublicKeyPem(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // The raw ID is hashed and dropped. The response never contains any part of it.
    if (body.action === "TOKENIZE") {
      const rawId = String(body.rawId ?? "").trim();
      if (!rawId) return fail("Missing required parameter 'rawId'.");
      const idType: IdType = ID_TYPES.includes(body.idType) ? body.idType : "AADHAAR";
      return NextResponse.json({
        success: true,
        message: "Vault token generated. The raw ID was not stored or returned.",
        tokenized: tokenizeDemographicId(rawId, idType, String(body.salt ?? "")),
      });
    }

    if (body.action === "SIMULATE_QUERY") {
      const burstCount = Math.min(50, Math.max(1, Number(body.burstCount || 1)));
      let last = recordThirdPartyQuery();
      for (let i = 1; i < burstCount; i++) last = recordThirdPartyQuery();
      return NextResponse.json({
        success: true,
        burstSent: burstCount,
        allowed: last.allowed,
        queriesInLastMinute: last.queriesInWindow,
        status: last.status,
      });
    }

    if (body.action === "BREACH_ALERT") {
      const incidentType: BreachType = BREACH_TYPES.includes(body.incidentType) ? body.incidentType : "OTHER";
      const alert = generateBreachAlert({
        incidentType,
        detectedAt: typeof body.detectedAt === "string" ? body.detectedAt : undefined,
        affectedPrincipals: Number(body.affectedPrincipals) || 0,
        dataCategories: Array.isArray(body.dataCategories) ? body.dataCategories.map(String) : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
      });
      return NextResponse.json({ success: true, alert });
    }

    return fail("Invalid action. Expected 'TOKENIZE', 'SIMULATE_QUERY' or 'BREACH_ALERT'.");
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Failed to process security request", 500);
  }
}
