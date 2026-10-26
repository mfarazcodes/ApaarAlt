import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { HttpError, jsonError } from "@/lib/http";
import { drainJobs } from "@/lib/jobs";
import { pruneRateLimits } from "@/lib/ratelimit";

const SYSTEM = { role: "SYSTEM" as const, label: "Queue worker (cron)" };

function bearerMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The cron entry point. Call it on a schedule with `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends
 * this header itself). With no CRON_SECRET set, only a signed-in registrar can drain, so a missing setting
 * fails closed. It also prunes old rate-limit counters.
 */
async function handle(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: "PUBLIC", scope: "queue-drain", rate: { limit: 30, windowMs: 60_000 } });
    const secret = process.env.CRON_SECRET;
    const viaCron = Boolean(secret) && bearerMatches(req.headers.get("authorization"), secret as string);

    if (!viaCron) {
      if (req.headers.get("authorization")) throw new HttpError(401, "That cron credential is not valid.");
      if (!session) throw new HttpError(401, "Sign in as a registrar, or send the cron secret.");
      if (session.role !== "REGISTRAR") throw new HttpError(403, "Only a registrar can run the queue.");
    }

    const drained = await drainJobs(store, viaCron ? SYSTEM : { role: "REGISTRAR", label: session!.name });
    const pruned = viaCron ? await pruneRateLimits(store) : 0;
    return NextResponse.json({ success: true, drained, prunedRateLimits: pruned });
  } catch (err) {
    return jsonError(err, "Failed to run the queue");
  }
}

export const GET = handle;
export const POST = handle;
