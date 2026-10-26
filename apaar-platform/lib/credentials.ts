import { getActiveShare, getConsentLedger, type ShareScope } from "./consentEngine";
import { signSmartQr, tokenizeDemographicId, verifySmartQr } from "./tokenization";

/**
 * Smart Credential issuing and verification.
 *
 * - Credentials are Ed25519-signed QR payloads that carry boolean claims only, never marksheets or ID numbers.
 * - OFFLINE verification checks the signature and expiry and nothing else. It cannot see revocation.
 * - ONLINE verification also reads the revocation registry and requires an active, unexpired student consent share.
 */

export type CredentialStatus =
  | "AUTHENTIC"
  | "REVOKED"
  | "SUPERSEDED"
  | "EXPIRED"
  | "INVALID_SIGNATURE"
  | "NOT_FOUND";

export interface MinimalClaims {
  degreeVerified: boolean;
  degreeLabel: string;
  cgpaAtLeast75: boolean;
  eoaActive: boolean;
  internshipCompleted: boolean;
}

export interface CredentialPayload {
  v: 1;
  cid: string;
  holder: string; // vault token
  ver: string;
  iat: string;
  exp: string;
  iss: string;
  claims: MinimalClaims;
}

interface RegistryEntry {
  cid: string;
  status: "ACTIVE" | "REVOKED" | "SUPERSEDED";
  supersededBy?: string;
  supersededByVersion?: string;
  reason?: string;
}

export interface DisclosedClaim {
  key: string;
  label: string;
  value: boolean;
}

export interface VerificationCheck {
  name: string;
  passed: boolean | null; // null = not performed in this mode
  note: string;
}

export interface VerificationResult {
  mode: "ONLINE" | "OFFLINE";
  status: CredentialStatus;
  headline: string;
  detail: string;
  credentialId?: string;
  version?: string;
  issuedAt?: string;
  expiresAt?: string;
  supersededBy?: string;
  identity: string;
  holderToken?: string;
  claims: DisclosedClaim[] | null;
  consent: {
    state: "GRANTED" | "NOT_GRANTED" | "OPTED_OUT" | "NOT_CHECKED_OFFLINE";
    shareId?: string;
    expiresAt?: string;
    pendingRequestId?: string;
  };
  checks: VerificationCheck[];
  limitations: string[];
}

const ISSUER = "APAAR-Bridge-Issuer-01";
const DAY_MS = 86_400_000;

const REDACTED = "[Aadhaar Redacted]";

type CredentialStore = {
  registry: Map<string, RegistryEntry>;
  qrs: Map<string, string>; // credential id -> signed QR
};
const g = globalThis as typeof globalThis & { __apaarCredentials?: CredentialStore };

function demoHolderToken(): string {
  return getConsentLedger().apaarToken;
}

function issue(
  store: CredentialStore,
  opts: { cid: string; ver: string; iat: Date; exp: Date; claims: MinimalClaims; entry: Omit<RegistryEntry, "cid"> }
): void {
  const payload: CredentialPayload = {
    v: 1,
    cid: opts.cid,
    holder: demoHolderToken(),
    ver: opts.ver,
    iat: opts.iat.toISOString(),
    exp: opts.exp.toISOString(),
    iss: ISSUER,
    claims: opts.claims,
  };
  store.qrs.set(opts.cid, signSmartQr(payload));
  store.registry.set(opts.cid, { cid: opts.cid, ...opts.entry });
}

function credentials(): CredentialStore {
  if (g.__apaarCredentials) return g.__apaarCredentials;
  const store: CredentialStore = { registry: new Map(), qrs: new Map() };
  g.__apaarCredentials = store;

  const now = Date.now();
  const degree: MinimalClaims = {
    degreeVerified: true,
    degreeLabel: "B.Tech CSE Verified",
    cgpaAtLeast75: true,
    eoaActive: true,
    internshipCompleted: true,
  };

  issue(store, {
    cid: "CRED-RKV-2024-V2",
    ver: "2.0",
    iat: new Date(now - 20 * DAY_MS),
    exp: new Date(now + 340 * DAY_MS),
    claims: degree,
    entry: { status: "ACTIVE" },
  });
  issue(store, {
    cid: "CRED-RKV-2024-V1",
    ver: "1.0",
    iat: new Date(now - 120 * DAY_MS),
    exp: new Date(now + 240 * DAY_MS),
    claims: { ...degree, cgpaAtLeast75: false },
    entry: { status: "SUPERSEDED", supersededBy: "CRED-RKV-2024-V2", supersededByVersion: "2.0", reason: "CGPA corrected after revaluation" },
  });
  issue(store, {
    cid: "CRED-RKV-ERR-0007",
    ver: "1.0",
    iat: new Date(now - 60 * DAY_MS),
    exp: new Date(now + 300 * DAY_MS),
    claims: degree,
    entry: { status: "REVOKED", reason: "Issued in error: wrong programme code" },
  });
  issue(store, {
    cid: "CRED-RKV-INT-2023",
    ver: "1.0",
    iat: new Date("2023-07-01T00:00:00Z"),
    exp: new Date("2024-06-30T00:00:00Z"),
    claims: { ...degree, degreeVerified: false, degreeLabel: "Internship certificate", cgpaAtLeast75: false },
    entry: { status: "ACTIVE" },
  });
  return store;
}

export interface SampleCredential {
  cid: string;
  label: string;
  expected: CredentialStatus;
  qr: string;
}

export function listSampleCredentials(): SampleCredential[] {
  const store = credentials();
  const rows: [string, string, CredentialStatus][] = [
    ["CRED-RKV-2024-V2", "Current degree credential (v2.0)", "AUTHENTIC"],
    ["CRED-RKV-2024-V1", "Earlier credential (v1.0)", "SUPERSEDED"],
    ["CRED-RKV-ERR-0007", "Credential issued in error", "REVOKED"],
    ["CRED-RKV-INT-2023", "Internship certificate (lapsed)", "EXPIRED"],
  ];
  return rows.map(([cid, label, expected]) => ({ cid, label, expected, qr: store.qrs.get(cid) ?? "" }));
}

const CLAIM_LABELS: Record<keyof Omit<MinimalClaims, "degreeLabel">, string> = {
  degreeVerified: "Degree",
  cgpaAtLeast75: "CGPA >= 7.5",
  eoaActive: "AICTE EoA Active",
  internshipCompleted: "Internship Completed",
};

const CLAIM_SCOPE: Record<keyof Omit<MinimalClaims, "degreeLabel">, ShareScope> = {
  degreeVerified: "DEGREE_STATUS",
  cgpaAtLeast75: "CGPA_BAND",
  eoaActive: "EOA_STATUS",
  internshipCompleted: "INTERNSHIP_STATUS",
};

function discloseClaims(claims: MinimalClaims, allowed?: ShareScope[]): DisclosedClaim[] {
  return (Object.keys(CLAIM_LABELS) as (keyof typeof CLAIM_LABELS)[])
    .filter((k) => !allowed || allowed.includes(CLAIM_SCOPE[k]))
    .map((k) => ({
      key: k,
      label: k === "degreeVerified" ? `${claims.degreeLabel}` : CLAIM_LABELS[k],
      value: claims[k],
    }));
}

const HEADLINES: Record<CredentialStatus, string> = {
  AUTHENTIC: "AUTHENTIC",
  REVOKED: "REVOKED",
  SUPERSEDED: "SUPERSEDED",
  EXPIRED: "EXPIRED",
  INVALID_SIGNATURE: "INVALID SIGNATURE",
  NOT_FOUND: "NOT FOUND",
};

function base(mode: VerificationResult["mode"], status: CredentialStatus, detail: string): VerificationResult {
  return {
    mode,
    status,
    headline: HEADLINES[status],
    detail,
    identity: REDACTED,
    claims: null,
    consent: { state: mode === "OFFLINE" ? "NOT_CHECKED_OFFLINE" : "NOT_GRANTED" },
    checks: [],
    limitations: [],
  };
}

export interface VerifyInput {
  mode: "ONLINE" | "OFFLINE";
  qr?: string;
  apaarId?: string;
  verifierId?: string;
  publicKeyPem?: string;
}

export function verifyCredential(input: VerifyInput): VerificationResult {
  const { mode } = input;
  const store = credentials();
  let qr = input.qr?.trim();

  // Lookup by APAAR ID is an online registry call. The raw ID is tokenized and never echoed.
  if (!qr && input.apaarId) {
    if (mode === "OFFLINE") {
      return {
        ...base(mode, "NOT_FOUND", "Offline mode can only read a scanned QR. An APAAR ID lookup needs the network."),
        limitations: ["Switch to online mode to look up by APAAR ID."],
      };
    }
    const token = tokenizeDemographicId(input.apaarId, "APAAR", "NIST-DEMO").vaultToken;
    if (token !== demoHolderToken()) {
      return base(mode, "NOT_FOUND", "No credential is registered for that APAAR ID.");
    }
    qr = store.qrs.get("CRED-RKV-2024-V2");
  }
  if (!qr) return base(mode, "NOT_FOUND", "Provide a Smart QR payload or an APAAR ID.");

  const parsed = verifySmartQr<CredentialPayload>(qr, input.publicKeyPem);
  const checks: VerificationCheck[] = [
    { name: "Ed25519 signature", passed: parsed.signatureValid, note: parsed.signatureValid ? "Signed by the APAAR issuer key." : (parsed.error ?? "Failed.") },
  ];
  if (!parsed.signatureValid || !parsed.payload) {
    return { ...base(mode, "INVALID_SIGNATURE", parsed.error ?? "The QR could not be verified."), checks };
  }

  const p = parsed.payload;
  const expired = new Date(p.exp).getTime() < Date.now();
  checks.push({ name: "Validity window", passed: !expired, note: expired ? `Expired on ${p.exp.slice(0, 10)}.` : `Valid until ${p.exp.slice(0, 10)}.` });

  const result: VerificationResult = {
    ...base(mode, "AUTHENTIC", ""),
    credentialId: p.cid,
    version: p.ver,
    issuedAt: p.iat,
    expiresAt: p.exp,
    holderToken: p.holder,
    checks,
  };

  // Revocation and supersession exist only in the online registry.
  let entry: RegistryEntry | undefined;
  if (mode === "ONLINE") {
    entry = store.registry.get(p.cid);
    checks.push({
      name: "Revocation registry",
      passed: !entry || entry.status === "ACTIVE",
      note: !entry || entry.status === "ACTIVE" ? "Not revoked or superseded." : `${entry.status}${entry.reason ? `: ${entry.reason}` : ""}.`,
    });
  } else {
    checks.push({ name: "Revocation registry", passed: null, note: "Not available offline." });
    result.limitations.push("Offline check proves the QR is genuine and unexpired. It cannot tell whether the credential was revoked or replaced since it was issued.");
  }

  if (entry?.status === "REVOKED") {
    return { ...result, status: "REVOKED", headline: HEADLINES.REVOKED, detail: entry.reason ?? "This credential was withdrawn by the issuer." };
  }
  if (entry?.status === "SUPERSEDED") {
    return {
      ...result,
      status: "SUPERSEDED",
      headline: `SUPERSEDED BY v${entry.supersededByVersion ?? "(newer)"}`,
      detail: `${entry.reason ?? "A newer credential replaced this one."} Ask the holder for the current QR.`,
      supersededBy: entry.supersededBy,
    };
  }
  if (expired) {
    return { ...result, status: "EXPIRED", headline: HEADLINES.EXPIRED, detail: `This credential lapsed on ${p.exp.slice(0, 10)}.` };
  }

  result.detail = "Signature, validity and registry checks passed.";

  // OFFLINE: the holder showing the QR is the consent act, and the QR carries only what they chose to embed.
  if (mode === "OFFLINE") {
    result.claims = discloseClaims(p.claims);
    return result;
  }

  // ONLINE: a live, unexpired student share is required, and it limits which claims are visible.
  const ledger = getConsentLedger();
  const verifierId = input.verifierId ?? "";
  if (ledger.apaarStatus === "NOGEN_OPTED_OUT") {
    result.consent = { state: "OPTED_OUT" };
    result.checks.push({ name: "Student consent", passed: false, note: "The student opted out (NOGEN). No claims are released." });
    return result;
  }
  const share = getActiveShare(verifierId);
  if (!share) {
    const pending = ledger.requests.find((r) => r.verifierId === verifierId && r.status === "PENDING");
    result.consent = { state: "NOT_GRANTED", pendingRequestId: pending?.requestId };
    result.checks.push({ name: "Student consent", passed: false, note: "No active consent from the student for this verifier. Claims are withheld." });
    return result;
  }
  result.consent = { state: "GRANTED", shareId: share.shareId, expiresAt: share.expiresAt };
  result.checks.push({ name: "Student consent", passed: true, note: `Share ${share.shareId} is active until ${share.expiresAt.slice(0, 10)}.` });
  result.claims = discloseClaims(p.claims, share.scopes);
  return result;
}
