import { NextResponse } from "next/server";
import { appendAudit } from "@/lib/audit";
import { demoMode } from "@/lib/config";
import { actorOf, guard } from "@/lib/guard";
import { HttpError, jsonError } from "@/lib/http";
import { DEMO_NAMESPACES } from "@/lib/store";

/** Wipes demo data (consent, credentials, sync state, audit trail) so a demo can start clean. Demo mode only. */
export async function POST(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["REGISTRAR", "AICTE"], scope: "reset", rate: { limit: 5, windowMs: 60_000 } });
    if (!demoMode()) throw new HttpError(404, "Not found.");

    await store.clear(DEMO_NAMESPACES);
    const actor = actorOf(session!);
    // The new chain starts with a record of who reset it, so the wipe itself is never invisible.
    await appendAudit(store, { type: "SYSTEM", subject: "SYSTEM", action: "DEMO_RESET", actorRole: actor.role, actor: actor.label, detail: "Demo data was reset." });
    return NextResponse.json({ success: true, message: "Demo data reset." });
  } catch (err) {
    return jsonError(err, "Reset failed");
  }
}
