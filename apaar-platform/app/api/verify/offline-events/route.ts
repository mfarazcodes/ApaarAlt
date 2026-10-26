import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { guard } from "@/lib/guard";
import { jsonError, parseWith, readJson } from "@/lib/http";
import { NS } from "@/lib/store";

const Event = z.object({
  id: z.string().min(8).max(60),
  cid: z.string().max(40),
  status: z.enum(["AUTHENTIC", "EXPIRED", "INVALID_SIGNATURE", "NOT_FOUND"]),
  checkedAt: z.string().datetime(),
  kid: z.string().max(40).optional(),
  engine: z.enum(["webcrypto", "noble"]).optional(),
});

const Body = z.object({ events: z.array(Event).min(1).max(50) });

const SEEN_LIMIT = 5000;

/**
 * A verifier device that checked QRs offline reports them here once it is back online, so the audit log
 * still shows what was verified. Each event has a client-made id, and an id seen before is ignored,
 * so a retried upload never writes twice. The server records that the check was offline and unable to
 * see revocation. It does not re-verify anything.
 */
export async function POST(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["VERIFIER"], scope: "offline-events" });
    const { events } = parseWith(Body, await readJson(req));

    const fresh = await store.update<{ ids: string[] }, typeof events>(NS.credentials, "offline-event-ids", (cur) => {
      const seen = new Set(cur?.ids ?? []);
      const accepted = events.filter((e) => !seen.has(e.id));
      accepted.forEach((e) => seen.add(e.id));
      return { value: { ids: [...seen].slice(-SEEN_LIMIT) }, result: accepted };
    });

    for (const e of fresh) {
      await appendAudit(store, {
        type: "VERIFICATION",
        subject: e.cid,
        action: "OFFLINE_VERIFICATION",
        actorRole: "VERIFIER",
        actor: session!.name,
        detail: `Checked offline on a device at ${e.checkedAt}: ${e.status}${e.kid ? ` (key ${e.kid})` : ""}. Revocation was not checked.`,
      });
    }
    return NextResponse.json({ success: true, recorded: fresh.length, duplicates: events.length - fresh.length });
  } catch (err) {
    return jsonError(err, "Failed to record offline verifications");
  }
}
