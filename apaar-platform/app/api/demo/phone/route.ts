import { NextResponse } from "next/server";
import { z } from "zod";
import { getLedger, respondToRequest, revokeShare } from "@/lib/consentEngine";
import { demoMode } from "@/lib/config";
import { guard } from "@/lib/guard";
import { HttpError, jsonError, parseWith, readJson } from "@/lib/http";
import { studentForToken } from "@/lib/students";

/**
 * DEMO ONLY. Stands in for the student answering on their own phone, so one person can play both sides.
 * It is off unless DEMO_MODE is on. It can only answer requests that this verifier itself made, and the
 * audit trail records the actor as the simulator, never as the student.
 */
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("REPLY"), holderToken: z.string().max(80), requestId: z.string().max(20), approve: z.boolean(), via: z.enum(["SMS", "WHATSAPP"]).default("SMS") }),
  z.object({ action: z.literal("STOP"), holderToken: z.string().max(80), shareId: z.string().max(20) }),
]);

export async function POST(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["VERIFIER"], scope: "demo-phone" });
    if (!demoMode()) throw new HttpError(404, "Not found.");
    const body = parseWith(Body, await readJson(req));

    const student = studentForToken(body.holderToken);
    if (!student) throw new HttpError(404, "No student for that credential.");
    const actor = { role: "DEMO_SIMULATOR" as const, label: "Phone simulator (demo)" };

    const ledger = await getLedger(store, student.id);
    if (body.action === "REPLY") {
      const request = ledger.requests.find((r) => r.requestId === body.requestId);
      if (!request || request.verifierId !== session!.verifierId) throw new HttpError(404, "No such request from your organisation.");
      const r = await respondToRequest(store, student.id, body.requestId, body.approve, body.via, actor);
      return NextResponse.json({ success: true, request: r.request });
    }

    const share = ledger.shares.find((s) => s.shareId === body.shareId);
    if (!share || share.verifierId !== session!.verifierId) throw new HttpError(404, "No such share for your organisation.");
    await revokeShare(store, student.id, body.shareId, actor);
    return NextResponse.json({ success: true });
  } catch (err) {
    return jsonError(err, "Phone simulator failed");
  }
}
