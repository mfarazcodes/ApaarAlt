import { NextResponse } from "next/server";
import { listSampleCredentials, verifyCredential } from "@/lib/credentials";
import { KNOWN_VERIFIERS } from "@/lib/consentEngine";
import { getIssuerPublicKeyPem } from "@/lib/tokenization";

const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET() {
  return NextResponse.json({
    success: true,
    engine: "Smart Credential Verifier v1.0 (Ed25519, consent-gated)",
    verifiers: KNOWN_VERIFIERS,
    samples: listSampleCredentials(),
    issuerPublicKeyPem: getIssuerPublicKeyPem(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode = body.mode === "OFFLINE" ? "OFFLINE" : "ONLINE";
    const qr = typeof body.qr === "string" ? body.qr : undefined;
    const apaarId = typeof body.apaarId === "string" ? body.apaarId : undefined;

    if (!qr?.trim() && !apaarId?.trim()) return fail("Provide a Smart QR payload or an APAAR ID.");

    const result = verifyCredential({
      mode,
      qr,
      apaarId,
      verifierId: typeof body.verifierId === "string" ? body.verifierId : undefined,
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Verification failed", 500);
  }
}
