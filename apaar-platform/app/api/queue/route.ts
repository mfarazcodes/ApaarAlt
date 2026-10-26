import { NextResponse } from "next/server";
import { z } from "zod";
import { actorOf, guard } from "@/lib/guard";
import { jsonError, parseWith, readJson } from "@/lib/http";
import { MAX_ATTEMPTS, BACKOFF_BASE_MS, BACKOFF_CAP_MS, drainJobs, enqueueJob, listJobs, requeueJob, setNadOnline } from "@/lib/jobs";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ENQUEUE"), label: z.string().trim().max(80).optional(), records: z.number().int().min(1).max(5000).default(120) }),
  z.object({ action: z.literal("SET_NAD"), online: z.boolean() }),
  z.object({ action: z.literal("REQUEUE"), id: z.string().max(20) }),
  z.object({ action: z.literal("DRAIN") }),
]);

const config = { maxAttempts: MAX_ATTEMPTS, backoffBaseMs: BACKOFF_BASE_MS, backoffCapMs: BACKOFF_CAP_MS };

/** The sync retry queue. Registrar only. A cron can drain it through /api/queue/drain. */
export async function GET(req: Request) {
  try {
    const { store } = await guard(req, { roles: ["REGISTRAR"], scope: "queue" });
    return NextResponse.json({ success: true, ...(await listJobs(store)), config, serverTime: new Date().toISOString() });
  } catch (err) {
    return jsonError(err, "Failed to read the queue");
  }
}

export async function POST(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["REGISTRAR"], scope: "queue" });
    const body = parseWith(Body, await readJson(req));
    const actor = actorOf(session!);

    switch (body.action) {
      case "ENQUEUE":
        await enqueueJob(store, { label: body.label, records: body.records }, actor);
        break;
      case "SET_NAD":
        await setNadOnline(store, body.online, actor);
        break;
      case "REQUEUE":
        await requeueJob(store, body.id, actor);
        break;
      case "DRAIN": {
        const drained = await drainJobs(store, actor);
        return NextResponse.json({ success: true, drained, ...(await listJobs(store)), config, serverTime: new Date().toISOString() });
      }
    }
    return NextResponse.json({ success: true, ...(await listJobs(store)), config, serverTime: new Date().toISOString() });
  } catch (err) {
    return jsonError(err, "Failed to update the queue");
  }
}
