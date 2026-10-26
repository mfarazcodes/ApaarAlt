import { NextResponse } from "next/server";
import { z } from "zod";
import { KNOWN_VERIFIERS } from "@/lib/consentEngine";
import { listSampleCredentials, verifierKeySet, verifyCredential } from "@/lib/credentials";
import { guard } from "@/lib/guard";
import { HttpError, jsonError, parseWith, readJson } from "@/lib/http";

const Body = z
  .object({
    mode: z.enum(["ONLINE", "OFFLINE"]).default("ONLINE"),
    qr: z.string().max(4096).optional(),
    apaarId: z.string().max(40).optional(),
  })
  .refine((v) => v.qr?.trim() || v.apaarId?.trim(), { message: "Provide a Smart QR payload or an APAAR ID." });

export async function GET(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["VERIFIER"], scope: "credential" });
    return NextResponse.json({
      success: true,
      engine: "Smart Credential Verifier v2.0 (Ed25519, consent-gated, key ids)",
      you: KNOWN_VERIFIERS.find((v) => v.id === session!.verifierId) ?? null,
      samples: await listSampleCredentials(store),
      // The set a verifier caches so it can check signatures with no network.
      keys: verifierKeySet(),
    });
  } catch (err) {
    return jsonError(err, "Failed to load the verifier");
  }
}

export async function POST(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["VERIFIER"], scope: "credential" });
    const body = parseWith(Body, await readJson(req));
    if (!session!.verifierId) throw new HttpError(403, "This session is not linked to a verifier.");

    // The verifier identity is the session's. A body can never name another verifier.
    const result = await verifyCredential(store, { mode: body.mode, qr: body.qr, apaarId: body.apaarId, verifierId: session!.verifierId });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    return jsonError(err, "Verification failed");
  }
}
