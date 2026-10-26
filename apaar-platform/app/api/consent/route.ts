import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit, listAudit } from "@/lib/audit";
import { issuePresentation } from "@/lib/credentials";
import {
  KNOWN_VERIFIERS,
  PURPOSE_KEYS,
  SHARE_SCOPES,
  SHARE_SCOPE_LABELS,
  createShareRequest,
  getLedger,
  grantShare,
  raiseDispute,
  respondToRequest,
  revokeShare,
  setGuardianCoSign,
  toggleOptOutNogen,
  updatePurpose,
} from "@/lib/consentEngine";
import { actorOf, guard } from "@/lib/guard";
import { HttpError, jsonError, parseWith, readJson } from "@/lib/http";
import type { Role } from "@/lib/personas";
import { studentForToken } from "@/lib/students";

const scopes = z.array(z.enum(SHARE_SCOPES as [string, ...string[]])).min(1).max(SHARE_SCOPES.length).optional();
const days = z.number().int().min(1).max(365).optional();

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("TOGGLE_OPT_OUT"), optOut: z.boolean() }),
  z.object({ action: z.literal("UPDATE_PURPOSE"), purpose: z.enum(PURPOSE_KEYS), allow: z.boolean() }),
  z.object({ action: z.literal("GRANT_SHARE"), verifierId: z.string().max(40), scopes, days }),
  z.object({ action: z.literal("REVOKE_SHARE"), shareId: z.string().max(20) }),
  z.object({ action: z.literal("RESPOND_REQUEST"), requestId: z.string().max(20), approve: z.boolean(), via: z.enum(["SMS", "WHATSAPP", "APP"]).default("APP") }),
  z.object({ action: z.literal("GUARDIAN_COSIGN"), sign: z.boolean() }),
  z.object({ action: z.literal("RAISE_DISPUTE"), field: z.string().min(1).max(60), claimedValue: z.string().max(200).default(""), reason: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("REQUEST_ACCESS"), holderToken: z.string().min(1).max(80), scopes, days, purpose: z.string().max(120).optional() }),
  z.object({ action: z.literal("CREATE_QR"), scopes: z.array(z.enum(SHARE_SCOPES as [string, ...string[]])).min(1).max(SHARE_SCOPES.length), days: z.number().int().min(1).max(365) }),
]);

/** Who may do what. The role comes from the signed session cookie. */
const ALLOWED: Record<z.infer<typeof Body>["action"], Role[]> = {
  TOGGLE_OPT_OUT: ["STUDENT"],
  UPDATE_PURPOSE: ["STUDENT"],
  GRANT_SHARE: ["STUDENT"],
  REVOKE_SHARE: ["STUDENT"],
  RESPOND_REQUEST: ["STUDENT"],
  RAISE_DISPUTE: ["STUDENT"],
  GUARDIAN_COSIGN: ["GUARDIAN"],
  REQUEST_ACCESS: ["VERIFIER"],
  CREATE_QR: ["STUDENT"],
};

export async function GET(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["STUDENT", "GUARDIAN"], scope: "consent" });
    const studentId = session!.studentId!;
    const [ledger, audit] = await Promise.all([getLedger(store, studentId), listAudit(store, { subject: studentId, limit: 12 })]);
    return NextResponse.json({
      success: true,
      engine: "DPDP Act (2023) Consent Ledger v3.0",
      legalReference: {
        dpdpAct: "Digital Personal Data Protection Act, 2023: consent, children (s.9), withdrawal and grievance",
        puttaswamy: "Puttaswamy (Aadhaar) 2018: identity schemes may not be forced as a condition of services",
      },
      verifiers: KNOWN_VERIFIERS,
      scopeLabels: SHARE_SCOPE_LABELS,
      chain: audit.chain,
      recentAudit: audit.entries,
      ledger,
      viewer: { role: session!.role, name: session!.name },
    });
  } catch (err) {
    return jsonError(err, "Failed to read the consent ledger");
  }
}

export async function POST(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["STUDENT", "GUARDIAN", "VERIFIER"], scope: "consent" });
    const body = parseWith(Body, await readJson(req));
    if (!ALLOWED[body.action].includes(session!.role)) {
      throw new HttpError(403, `The ${session!.role.toLowerCase()} role cannot ${body.action.toLowerCase().replace(/_/g, " ")}.`);
    }
    const actor = actorOf(session!);

    if (body.action === "REQUEST_ACCESS") {
      // A verifier can only ask on its own behalf, and only for a student whose credential it has seen.
      const target = studentForToken(body.holderToken);
      if (!target) throw new HttpError(404, "No student for that credential.");
      if (!session!.verifierId) throw new HttpError(403, "This session is not linked to a verifier.");
      const result = await createShareRequest(store, target.id, { verifierId: session!.verifierId, scopes: body.scopes as never, days: body.days, purpose: body.purpose }, actor);
      return NextResponse.json({ success: true, request: result.request });
    }

    const studentId = session!.studentId;
    if (!studentId) throw new HttpError(403, "This session is not linked to a student.");

    switch (body.action) {
      case "TOGGLE_OPT_OUT": {
        const r = await toggleOptOutNogen(store, studentId, body.optOut, actor);
        return NextResponse.json({
          success: true,
          message: body.optOut ? "Opted out. APAAR status is now NOGEN, every share was revoked, and services cannot be withheld." : "Re-enrolled in APAAR.",
          ledger: r.ledger,
          receipt: r.receipt,
        });
      }
      case "UPDATE_PURPOSE":
        return NextResponse.json({ success: true, ledger: await updatePurpose(store, studentId, body.purpose, body.allow, actor) });
      case "GRANT_SHARE": {
        const r = await grantShare(store, studentId, { verifierId: body.verifierId, scopes: body.scopes as never, days: body.days }, actor);
        return NextResponse.json({ success: true, ledger: r.ledger, share: r.share });
      }
      case "REVOKE_SHARE": {
        const r = await revokeShare(store, studentId, body.shareId, actor);
        return NextResponse.json({ success: true, ledger: r.ledger, share: r.share });
      }
      case "RESPOND_REQUEST": {
        const r = await respondToRequest(store, studentId, body.requestId, body.approve, body.via, actor);
        return NextResponse.json({ success: true, ledger: r.ledger, request: r.request, share: r.share });
      }
      case "GUARDIAN_COSIGN":
        return NextResponse.json({ success: true, ledger: await setGuardianCoSign(store, studentId, body.sign, actor) });
      case "CREATE_QR": {
        const presentation = await issuePresentation(store, studentId, body.scopes as never, body.days);
        await appendAudit(store, {
          type: "CONSENT",
          subject: studentId,
          action: "QR_CREATED",
          actorRole: actor.role,
          actor: actor.label,
          purposeModified: `qr:${presentation.cid}`,
          newValue: true,
          detail: `Created a Smart QR with ${presentation.claimLabels.join(", ")} for ${body.days} days. It ends on ${presentation.expiresAt.slice(0, 10)} or sooner if the credential it was cut from is revoked.`,
        });
        return NextResponse.json({ success: true, presentation });
      }
      case "RAISE_DISPUTE": {
        const r = await raiseDispute(store, studentId, { field: body.field, claimedValue: body.claimedValue, reason: body.reason }, actor);
        return NextResponse.json({ success: true, ledger: r.ledger, dispute: r.dispute });
      }
    }
  } catch (err) {
    return jsonError(err, "Failed to process consent request");
  }
}
