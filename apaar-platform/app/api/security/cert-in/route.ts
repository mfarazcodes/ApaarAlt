import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/guard";
import { HttpError, jsonError, parseWith, readJson } from "@/lib/http";
import { generateBreachAlert, getSecurityStatus, recordThirdPartyQuery, tenantSalt, tokenizeDemographicId, type BreachType, type IdType } from "@/lib/tokenization";

const ID_TYPES = ["AADHAAR", "PAN", "APAAR", "DIGILOCKER_URI", "STUDENT_ROLL"] as const satisfies readonly IdType[];
const BREACH_TYPES = ["UNAUTHORISED_ACCESS", "DATA_EXFILTRATION", "RANSOMWARE", "CREDENTIAL_LEAK", "OTHER"] as const satisfies readonly BreachType[];

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("TOKENIZE"), rawId: z.string().min(1).max(60), idType: z.enum(ID_TYPES).default("AADHAAR") }),
  z.object({ action: z.literal("SIMULATE_QUERY"), burstCount: z.number().int().min(1).max(50).default(1) }),
  z.object({
    action: z.literal("BREACH_ALERT"),
    incidentType: z.enum(BREACH_TYPES).default("OTHER"),
    detectedAt: z.string().datetime().optional(),
    affectedPrincipals: z.number().int().min(0).max(100_000_000).default(0),
    dataCategories: z.array(z.string().max(60)).max(10).optional(),
    description: z.string().max(1000).optional(),
  }),
]);

const ROLES_FOR: Record<z.infer<typeof Body>["action"], ("AICTE" | "REGISTRAR")[]> = {
  TOKENIZE: ["REGISTRAR"],
  SIMULATE_QUERY: ["AICTE"],
  BREACH_ALERT: ["AICTE", "REGISTRAR"],
};

export async function GET(req: Request) {
  try {
    await guard(req, { roles: ["AICTE", "REGISTRAR"], scope: "certin" });
    return NextResponse.json({ success: true, engine: "CERT-In / DPB Incident Alerts & Zero-PII Vault Monitor v3.1", status: getSecurityStatus() });
  } catch (err) {
    return jsonError(err, "Failed to read security status");
  }
}

export async function POST(req: Request) {
  try {
    const { session } = await guard(req, { roles: ["AICTE", "REGISTRAR"], scope: "certin" });
    const body = parseWith(Body, await readJson(req));
    if (!(ROLES_FOR[body.action] as string[]).includes(session!.role)) throw new HttpError(403, `The ${session!.role.toLowerCase()} role cannot do this.`);

    switch (body.action) {
      case "TOKENIZE": {
        // The raw ID is hashed with a server-held salt and dropped. Only the token and a redaction label come back.
        const t = tokenizeDemographicId(body.rawId, body.idType, tenantSalt());
        return NextResponse.json({
          success: true,
          message: "Vault token generated. The raw ID was not stored or returned.",
          tokenized: { idType: t.idType, maskedDisplay: t.maskedDisplay, vaultToken: t.vaultToken, formatValid: t.formatValid, issuedAt: t.issuedAt, zeroPiiCertified: t.zeroPiiCertified },
        });
      }
      case "SIMULATE_QUERY": {
        // A labelled simulator. It exercises the in-memory limiter below, not the real request limiter.
        let last = recordThirdPartyQuery();
        for (let i = 1; i < body.burstCount; i++) last = recordThirdPartyQuery();
        return NextResponse.json({ success: true, simulated: true, burstSent: body.burstCount, allowed: last.allowed, queriesInLastMinute: last.queriesInWindow, status: last.status });
      }
      case "BREACH_ALERT":
        return NextResponse.json({
          success: true,
          alert: generateBreachAlert({
            incidentType: body.incidentType,
            detectedAt: body.detectedAt,
            affectedPrincipals: body.affectedPrincipals,
            dataCategories: body.dataCategories,
            description: body.description,
          }),
        });
    }
  } catch (err) {
    return jsonError(err, "Failed to process security request");
  }
}
