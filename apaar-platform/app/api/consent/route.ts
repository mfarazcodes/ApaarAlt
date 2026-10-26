import { NextResponse } from "next/server";
import {
  KNOWN_VERIFIERS,
  SHARE_SCOPE_LABELS,
  createShareRequest,
  getConsentLedger,
  grantShare,
  raiseDispute,
  respondToRequest,
  revokeShare,
  setGuardianCoSign,
  setMinorStatus,
  toggleOptOutNogen,
  updateConsentPurpose,
  verifyAuditChain,
  type ConsentAuditEntry,
  type ConsentPurposes,
  type ShareRequest,
  type ShareScope,
} from "@/lib/consentEngine";

const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

function parseScopes(value: unknown): ShareScope[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const valid = value.filter((s): s is ShareScope => typeof s === "string" && s in SHARE_SCOPE_LABELS);
  return valid.length ? valid : undefined;
}

export async function GET() {
  return NextResponse.json({
    success: true,
    engine: "DPDP Act (2023) Consent Ledger v2.0",
    legalReference: {
      dpdpAct: "Digital Personal Data Protection Act, 2023: consent (s.6), children (s.9), withdrawal and grievance",
      puttaswamy: "Puttaswamy (Aadhaar) 2018: identity schemes may not be forced as a condition of services",
      certIn: "CERT-In Directions 2022: 6-hour incident reporting",
    },
    verifiers: KNOWN_VERIFIERS,
    scopeLabels: SHARE_SCOPE_LABELS,
    chain: verifyAuditChain(getConsentLedger().auditTrail),
    ledger: getConsentLedger(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const actor: string = body.actor ?? "STUDENT_PORTAL_WEB";

    switch (body.action) {
      case "TOGGLE_OPT_OUT": {
        const optOut = Boolean(body.optOut);
        const result = toggleOptOutNogen(optOut, actor);
        return NextResponse.json({
          success: true,
          message: optOut
            ? "Opted out. APAAR status is now NOGEN, every share was revoked, and services cannot be withheld."
            : "Re-enrolled in APAAR.",
          ledger: result.ledger,
          newAuditEntry: result.auditEntry,
          receipt: result.receipt,
        });
      }

      case "UPDATE_PURPOSE": {
        const purpose = body.purpose as keyof ConsentPurposes | undefined;
        if (!purpose) return fail("Missing required parameter 'purpose'.");
        const result = updateConsentPurpose(purpose, Boolean(body.allow), actor);
        return NextResponse.json({ success: true, ledger: result.ledger, newAuditEntry: result.auditEntry });
      }

      case "GRANT_SHARE": {
        const result = grantShare({ verifierId: String(body.verifierId ?? ""), scopes: parseScopes(body.scopes), days: Number(body.days) || 30, actor });
        return NextResponse.json({ success: true, ledger: result.ledger, share: result.share });
      }

      case "REVOKE_SHARE": {
        const result = revokeShare(String(body.shareId ?? ""), actor);
        return NextResponse.json({ success: true, ledger: result.ledger, share: result.share });
      }

      case "REQUEST_ACCESS": {
        const result = createShareRequest({ verifierId: String(body.verifierId ?? ""), scopes: parseScopes(body.scopes), purpose: body.purpose });
        return NextResponse.json({ success: true, ledger: result.ledger, request: result.request });
      }

      case "RESPOND_REQUEST": {
        const via = (["SMS", "WHATSAPP", "APP"] as const).find((v) => v === body.via) as ShareRequest["respondedVia"];
        const result = respondToRequest(String(body.requestId ?? ""), Boolean(body.approve), via ?? "APP");
        return NextResponse.json({ success: true, ledger: result.ledger, request: result.request, share: result.share });
      }

      case "SET_MINOR": {
        const result = setMinorStatus(Boolean(body.isMinor));
        return NextResponse.json({ success: true, ledger: result.ledger, newAuditEntry: result.auditEntry });
      }

      case "GUARDIAN_COSIGN": {
        const result = setGuardianCoSign(Boolean(body.sign));
        return NextResponse.json({ success: true, ledger: result.ledger, newAuditEntry: result.auditEntry });
      }

      case "RAISE_DISPUTE": {
        const result = raiseDispute({ field: String(body.field ?? ""), claimedValue: String(body.claimedValue ?? ""), reason: String(body.reason ?? "") });
        return NextResponse.json({ success: true, ledger: result.ledger, dispute: result.dispute });
      }

      // Recomputes the hash chain for whatever entries the client sends, so a tampered copy is caught.
      case "VERIFY_CHAIN": {
        const entries: ConsentAuditEntry[] = Array.isArray(body.entries) ? body.entries : getConsentLedger().auditTrail;
        return NextResponse.json({ success: true, chain: verifyAuditChain(entries) });
      }

      default:
        return fail("Unknown action.");
    }
  } catch (err) {
    // Statutory refusals (Section 9) and state errors surface as 400 with a readable message.
    return fail(err instanceof Error ? err.message : "Failed to process consent request");
  }
}
