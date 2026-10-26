import { NextResponse } from "next/server";
import { z } from "zod";
import { verifierFromApiKey, apiKeyFor } from "@/lib/apiKeys";
import { verifyCredential } from "@/lib/credentials";
import { guard } from "@/lib/guard";
import { HttpError, jsonError, parseWith, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

const BULK_MAX_ITEMS = 100;
const PER_MINUTE = 30;

const Item = z
  .object({ qr: z.string().max(4096).optional(), apaarId: z.string().max(40).optional() })
  .refine((v) => v.qr?.trim() || v.apaarId?.trim(), { message: "Each item needs a qr or an apaarId." });

const Body = z.object({ items: z.array(Item).min(1).max(BULK_MAX_ITEMS) });

/**
 * Bulk verification for employers and universities. Authenticate with an `x-api-key` header, or with a signed-in
 * verifier session. Each item goes through the same checks as a single verification, so consent still applies per
 * student: a plain credential returns no claims unless that student shared with the caller.
 */
export async function POST(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: "PUBLIC", scope: "bulk" });

    let verifierId = verifierFromApiKey(req.headers.get("x-api-key"));
    if (!verifierId) {
      if (req.headers.get("x-api-key")) throw new HttpError(401, "That API key is not valid.");
      if (!session) throw new HttpError(401, "Send an x-api-key header, or sign in as a verifier.");
      if (session.role !== "VERIFIER" || !session.verifierId) throw new HttpError(403, "Only a verifier can use bulk verification.");
      verifierId = session.verifierId;
    }

    // The caller's own allowance, on top of the per-IP limit in guard().
    const allowance = await rateLimit(store, `bulk:verifier:${verifierId}`, { limit: PER_MINUTE, windowMs: 60_000 });
    if (!allowance.allowed) throw new HttpError(429, "Too many bulk requests. Please slow down.", { retryAfterSec: allowance.retryAfterSec });

    const { items } = parseWith(Body, await readJson(req, 1024 * 1024));

    const results = [];
    for (const [index, item] of items.entries()) {
      try {
        const r = await verifyCredential(store, { mode: "ONLINE", qr: item.qr, apaarId: item.apaarId, verifierId });
        // A trimmed view. The APAAR ID is never echoed, and neither is anything beyond the consented claims.
        results.push({
          index,
          status: r.status,
          headline: r.headline,
          detail: r.detail,
          credentialId: r.credentialId,
          expiresAt: r.expiresAt,
          consent: r.consent.state,
          claims: r.claims,
          identity: r.identity,
        });
      } catch (e) {
        results.push({ index, status: "ERROR", error: e instanceof Error ? e.message : "Could not verify this item." });
      }
    }
    return NextResponse.json({ success: true, count: results.length, results });
  } catch (err) {
    return jsonError(err, "Bulk verification failed");
  }
}

/** The signed-in verifier's key, to paste into a script. */
export async function GET(req: Request) {
  try {
    const { session } = await guard(req, { roles: ["VERIFIER"], scope: "bulk" });
    return NextResponse.json({
      success: true,
      apiKey: apiKeyFor(session!.verifierId!),
      limits: { maxItemsPerCall: BULK_MAX_ITEMS, callsPerMinute: PER_MINUTE },
      docs: "/api/docs",
    });
  } catch (err) {
    return jsonError(err, "Failed to load the API key");
  }
}
