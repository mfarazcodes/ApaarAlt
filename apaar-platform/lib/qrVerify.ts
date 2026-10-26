import { ed25519 } from "@noble/curves/ed25519.js";
import { evaluateOffline, type CredentialPayload, type VerificationResult } from "./credentialModel";

/**
 * Smart QR signature checking that runs in the browser and in Node, with no network and no database.
 * It tries WebCrypto's native Ed25519 first and falls back to a pure-JS implementation where that is missing.
 */

const QR_PREFIX = "APAARQR1";

export interface TrustedKey {
  kid: string;
  publicKeyPem: string;
}

export interface LocalVerification {
  signatureValid: boolean;
  payload: CredentialPayload | null;
  kid?: string;
  error?: string;
  engine?: "webcrypto" | "noble";
}

export function b64urlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The 32-byte key at the end of an Ed25519 SubjectPublicKeyInfo PEM. */
export function pemToRawEd25519(pem: string): Uint8Array {
  const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return der.slice(-32);
}

const encoder = new TextEncoder();

export async function verifyEd25519(
  message: Uint8Array,
  signature: Uint8Array,
  publicKeyPem: string,
  opts: { forceFallback?: boolean } = {}
): Promise<{ ok: boolean; engine: "webcrypto" | "noble" }> {
  const raw = pemToRawEd25519(publicKeyPem);
  const subtle = globalThis.crypto?.subtle;
  if (subtle && !opts.forceFallback) {
    try {
      const key = await subtle.importKey("raw", raw as BufferSource, { name: "Ed25519" }, false, ["verify"]);
      return { ok: await subtle.verify("Ed25519", key, signature as BufferSource, message as BufferSource), engine: "webcrypto" };
    } catch {
      // Ed25519 is not supported by this browser's WebCrypto. Use the fallback below.
    }
  }
  try {
    return { ok: ed25519.verify(signature, message, raw), engine: "noble" };
  } catch {
    return { ok: false, engine: "noble" };
  }
}

/** Verifies `APAARQR1.<payload>.<signature>` against the trusted keys. Picks the key by the payload's kid. */
export async function verifyQrLocally(qr: string, keys: TrustedKey[], opts: { forceFallback?: boolean } = {}): Promise<LocalVerification> {
  const parts = qr.trim().split(".");
  if (parts.length !== 3 || parts[0] !== QR_PREFIX) return { signatureValid: false, payload: null, error: "Not an APAAR Smart QR payload." };

  try {
    const claimed = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as CredentialPayload;
    const candidates = claimed.kid ? keys.filter((k) => k.kid === claimed.kid) : keys;
    if (candidates.length === 0) {
      return {
        signatureValid: false,
        payload: null,
        kid: claimed.kid,
        error: keys.length === 0 ? "No issuer keys are stored on this device yet. Open the verifier once while online to cache them." : `Unknown signing key '${claimed.kid}'. The key may have been rotated out, or this QR is not from APAAR.`,
      };
    }
    const message = encoder.encode(`${parts[0]}.${parts[1]}`);
    const signature = b64urlToBytes(parts[2]);
    for (const key of candidates) {
      const { ok, engine } = await verifyEd25519(message, signature, key.publicKeyPem, opts);
      if (ok) return { signatureValid: true, payload: claimed, kid: key.kid, engine };
    }
    return { signatureValid: false, payload: null, kid: claimed.kid, error: "Signature does not match. The QR was altered or was not issued by APAAR." };
  } catch {
    return { signatureValid: false, payload: null, error: "Malformed QR payload." };
  }
}

/** The whole offline verdict: signature, then expiry, from the cached keys. Never touches the network. */
export async function verifyOffline(qr: string, keys: TrustedKey[], opts: { now?: number; forceFallback?: boolean } = {}): Promise<VerificationResult> {
  const local = await verifyQrLocally(qr, keys, opts);
  return evaluateOffline(local, local.engine, opts.now);
}
