import { timingSafeEqual } from "crypto";
import { KNOWN_VERIFIERS } from "./consentEngine";
import { hmacHex } from "./tokenization";

/**
 * Demo API keys for the bulk verification endpoint. A key is `<verifierId>.<mac>`, where the mac is a keyed hash
 * of the id, so it needs no storage and a verifier can only ever act as itself.
 *
 * Limits: a key cannot be rotated or revoked on its own, because it is derived from VAULT_PEPPER. A real deployment
 * would store random keys (hashed), with a created date and a revoked flag.
 */
export function apiKeyFor(verifierId: string): string {
  return `${verifierId}.${hmacHex(`api-key:${verifierId}`, "verifier-api-key").slice(0, 40)}`;
}

/** The verifier this key belongs to, or null. Compared in constant time. */
export function verifierFromApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const verifierId = key.split(".")[0];
  if (!KNOWN_VERIFIERS.some((v) => v.id === verifierId)) return null;
  const expected = Buffer.from(apiKeyFor(verifierId));
  const given = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected) ? verifierId : null;
}
