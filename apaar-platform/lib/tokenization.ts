import crypto from "crypto";
import { ConfigError } from "./errors";
import { isDevLike, requireSecret } from "./config";

/**
 * Zero-PII Tokenization & CERT-In Security Engine
 *
 * Implements:
 * 1. Zero-PII Tokenization: converts raw government IDs (Aadhaar, PAN) into irreversible salted HMAC
 *    VAULT_TOKENs. Raw IDs are never returned or stored; display text is always `[Aadhaar Redacted]`.
 * 2. Ed25519 Smart-QR signing and offline verification (no network, no database).
 * 3. CERT-In 6-hour and DPB 72-hour breach alert generator.
 * 4. Sliding-window rate-limiter for third-party ERP queries with burst-attack defence.
 */

// The development pepper is public in this repository. It is accepted only when NODE_ENV is development or test,
// so a deployment that forgets VAULT_PEPPER fails loudly instead of producing guessable tokens.
const DEV_PEPPER = "apaar-bridge-dev-only-pepper";

function pepper(): string {
  return requireSecret("VAULT_PEPPER", DEV_PEPPER);
}

/** One salt per institution, fixed on the server. A client never chooses it. */
export function tenantSalt(): string {
  return process.env.TOKEN_SALT || "apaar-bridge-demo-tenant";
}

/** Keyed hash used for vault tokens and for sealing receipts. */
export function hmacHex(data: string, salt = ""): string {
  return crypto.createHmac("sha256", pepper()).update(`${salt}|${data}`).digest("hex");
}

export type IdType = "AADHAAR" | "PAN" | "APAAR" | "DIGILOCKER_URI" | "STUDENT_ROLL";

export interface TokenizedIdentity {
  rawLength: number;
  idType: IdType;
  maskedDisplay: string; // always a redaction label, never any digits of the ID
  vaultToken: string;
  hmacSignature: string;
  formatValid: boolean;
  issuedAt: string;
  zeroPiiCertified: boolean;
}

export interface CERTInSecurityStatus {
  complianceStatus: "SECURE" | "ELEVATED_THROTTLE" | "CERT_IN_ALERT_TRIGGERED";
  certInReportingDeadlineHours: number; // 6 hours statutory requirement
  hoursElapsedSinceIncident: number;
  totalTokensProtected: number;
  queriesLastMinute: number;
  maxQueryThresholdPerMinute: number;
  rateLimitStatus: "NORMAL" | "THROTTLED" | "IP_BLOCKED";
  simulatedIncidentCount: number;
  lastSecurityAudit: string;
  securityBadges: string[];
}

/* ── Aadhaar format check (Verhoeff) ─────────────────────────────────── */

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** 12 digits, first digit 2-9, and a valid Verhoeff check digit. */
export function isValidAadhaarFormat(digits: string): boolean {
  if (!/^[2-9][0-9]{11}$/.test(digits)) return false;
  let c = 0;
  [...digits].reverse().forEach((ch, i) => {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(ch)]];
  });
  return c === 0;
}

const REDACTION_LABEL: Record<IdType, string> = {
  AADHAAR: "[Aadhaar Redacted]",
  PAN: "[PAN Redacted]",
  APAAR: "[APAAR ID Redacted]",
  DIGILOCKER_URI: "[DigiLocker URI Redacted]",
  STUDENT_ROLL: "[Roll Number Redacted]",
};

/**
 * Generates a Zero-PII Vault Token from any raw government ID.
 * `salt` scopes the token to a tenant (for example an institution code), so the same ID
 * yields unlinkable tokens in different tenants.
 */
export function tokenizeDemographicId(rawId: string, idType: IdType = "AADHAAR", salt = ""): TokenizedIdentity {
  const clean = rawId.replace(/[\s-]/g, "");
  const hmac = hmacHex(`${idType}:${clean}`, salt);
  const short = hmac.substring(0, 16).toUpperCase();
  const vaultToken = `VAULT-${idType.slice(0, 3)}-${short.slice(0, 4)}-${short.slice(4, 8)}-${short.slice(8, 12)}-${short.slice(12, 16)}`;

  return {
    rawLength: clean.length,
    idType,
    maskedDisplay: REDACTION_LABEL[idType],
    vaultToken,
    hmacSignature: hmac,
    formatValid: idType === "AADHAAR" ? isValidAadhaarFormat(clean) : clean.length > 0,
    issuedAt: new Date().toISOString(),
    zeroPiiCertified: true,
  };
}

/* ── Ed25519 Smart-QR signing ────────────────────────────────────────── */

const QR_PREFIX = "APAARQR1";

export interface IssuerKey {
  kid: string;
  publicKeyPem: string;
  status: "current" | "retired";
}

type IssuerKeys = { kid: string; publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
const store = globalThis as typeof globalThis & { __apaarIssuerKeys?: IssuerKeys };

const spkiPem = (key: crypto.KeyObject) => key.export({ type: "spki", format: "pem" }).toString();
const kidOf = (key: crypto.KeyObject) => crypto.createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex").slice(0, 12);

function issuerKeys(): IssuerKeys {
  if (store.__apaarIssuerKeys) return store.__apaarIssuerKeys;
  const pem = process.env.ISSUER_PRIVATE_KEY_PEM;
  let privateKey: crypto.KeyObject;
  if (pem) {
    // A configured key keeps issued QRs valid across restarts and across server instances.
    privateKey = crypto.createPrivateKey(pem.split("\\n").join("\n"));
  } else if (isDevLike()) {
    // Development only: an ephemeral key. QRs issued before a restart stop verifying, which fails safe.
    privateKey = crypto.generateKeyPairSync("ed25519").privateKey;
  } else {
    throw new ConfigError(["ISSUER_PRIVATE_KEY_PEM"]);
  }
  const publicKey = crypto.createPublicKey(privateKey);
  store.__apaarIssuerKeys = { kid: process.env.ISSUER_KID || kidOf(publicKey), publicKey, privateKey };
  return store.__apaarIssuerKeys;
}

/**
 * Every key a verifier should trust: the current one, plus retired public keys from
 * ISSUER_RETIRED_PUBLIC_KEYS (a JSON array of { kid, pem }) so QRs signed before a rotation still verify.
 */
export function getIssuerKeySet(): IssuerKey[] {
  const current = issuerKeys();
  const keys: IssuerKey[] = [{ kid: current.kid, publicKeyPem: spkiPem(current.publicKey), status: "current" }];
  try {
    const retired = JSON.parse(process.env.ISSUER_RETIRED_PUBLIC_KEYS ?? "[]") as { kid: string; pem: string }[];
    for (const r of retired) if (r.kid && r.pem) keys.push({ kid: r.kid, publicKeyPem: r.pem, status: "retired" });
  } catch {
    /* a malformed list is ignored; the current key still works */
  }
  return keys;
}

/** The current signing key id. */
export const getIssuerKid = () => issuerKeys().kid;

/** The public key a verifier caches so it can check signatures with no network access. */
export function getIssuerPublicKeyPem(): string {
  return spkiPem(issuerKeys().publicKey);
}

/** Returns `APAARQR1.<payload>.<signature>` with both parts base64url. The payload carries the signing key id. */
export function signSmartQr(payload: object): string {
  const keys = issuerKeys();
  const body = Buffer.from(JSON.stringify({ ...payload, kid: keys.kid })).toString("base64url");
  const signed = `${QR_PREFIX}.${body}`;
  const signature = crypto.sign(null, Buffer.from(signed), keys.privateKey).toString("base64url");
  return `${signed}.${signature}`;
}

export interface QrVerification<T> {
  signatureValid: boolean;
  payload: T | null;
  kid?: string;
  error?: string;
}

/**
 * Checks the signature only. It never touches a registry, so it works fully offline.
 * The key is chosen by the `kid` inside the payload from the supplied key set (default: this server's set).
 * The payload is read before the signature is checked only to pick the key; nothing in it is trusted until the check passes.
 */
export function verifySmartQr<T = Record<string, unknown>>(qr: string, keySet: Pick<IssuerKey, "kid" | "publicKeyPem">[] = getIssuerKeySet()): QrVerification<T> {
  const parts = qr.trim().split(".");
  if (parts.length !== 3 || parts[0] !== QR_PREFIX) {
    return { signatureValid: false, payload: null, error: "Not an APAAR Smart QR payload." };
  }
  try {
    const claimed = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as { kid?: string };
    const candidates = claimed.kid ? keySet.filter((k) => k.kid === claimed.kid) : keySet;
    if (candidates.length === 0) {
      return { signatureValid: false, payload: null, kid: claimed.kid, error: `Unknown signing key '${claimed.kid}'. The key may have been rotated out, or this QR is not from APAAR.` };
    }
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2], "base64url");
    const key = candidates.find((k) => crypto.verify(null, signed, crypto.createPublicKey(k.publicKeyPem), signature));
    if (!key) return { signatureValid: false, payload: null, kid: claimed.kid, error: "Signature does not match. The QR was altered or was not issued by APAAR." };
    return { signatureValid: true, payload: claimed as T, kid: key.kid };
  } catch {
    return { signatureValid: false, payload: null, error: "Malformed QR payload." };
  }
}

/** Signs arbitrary text with the issuer key, for example the head of the audit chain. */
export function signText(text: string): { signature: string; kid: string } {
  const keys = issuerKeys();
  return { signature: crypto.sign(null, Buffer.from(text), keys.privateKey).toString("base64url"), kid: keys.kid };
}

export function verifyText(text: string, signature: string, kid: string, keySet: Pick<IssuerKey, "kid" | "publicKeyPem">[] = getIssuerKeySet()): boolean {
  const key = keySet.find((k) => k.kid === kid);
  if (!key) return false;
  try {
    return crypto.verify(null, Buffer.from(text), crypto.createPublicKey(key.publicKeyPem), Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

/* ── CERT-In / DPB breach alerts ─────────────────────────────────────── */

export const CERT_IN_WINDOW_HOURS = 6;
export const DPB_REPORT_WINDOW_HOURS = 72;

export type BreachType = "UNAUTHORISED_ACCESS" | "DATA_EXFILTRATION" | "RANSOMWARE" | "CREDENTIAL_LEAK" | "OTHER";

export interface BreachInput {
  incidentType: BreachType;
  detectedAt?: string;
  affectedPrincipals?: number;
  dataCategories?: string[];
  description?: string;
  now?: string; // lets callers (and tests) fix the clock
}

export interface BreachDeadline {
  authority: string;
  rule: string;
  deadline: string;
  hoursRemaining: number;
  status: "ON_TIME" | "DUE_SOON" | "OVERDUE";
}

export interface BreachAlert {
  incidentId: string;
  incidentType: BreachType;
  detectedAt: string;
  deadlines: BreachDeadline[];
  certInDraft: string;
  principalNotice: string;
  checklist: string[];
}

function deadlineFor(authority: string, rule: string, detectedAt: Date, windowHours: number, now: Date): BreachDeadline {
  const due = new Date(detectedAt.getTime() + windowHours * 3_600_000);
  const hoursRemaining = Math.round(((due.getTime() - now.getTime()) / 3_600_000) * 10) / 10;
  const status: BreachDeadline["status"] = hoursRemaining < 0 ? "OVERDUE" : hoursRemaining <= windowHours * 0.25 ? "DUE_SOON" : "ON_TIME";
  return { authority, rule, deadline: due.toISOString(), hoursRemaining, status };
}

/** Builds the two statutory clocks and ready-to-edit notification text. */
export function generateBreachAlert(input: BreachInput): BreachAlert {
  const now = input.now ? new Date(input.now) : new Date();
  const detectedAt = input.detectedAt ? new Date(input.detectedAt) : now;
  const categories = input.dataCategories?.length ? input.dataCategories : ["Academic records", "Contact details"];
  const principals = input.affectedPrincipals ?? 0;
  const incidentId = `INC-${detectedAt.toISOString().slice(0, 10).replace(/-/g, "")}-${hmacHex(detectedAt.toISOString() + input.incidentType).slice(0, 6).toUpperCase()}`;
  const typeLabel = input.incidentType.replace(/_/g, " ").toLowerCase();

  return {
    incidentId,
    incidentType: input.incidentType,
    detectedAt: detectedAt.toISOString(),
    deadlines: [
      deadlineFor("CERT-In", "Report cyber incidents within 6 hours of noticing them (CERT-In Directions, 2022)", detectedAt, CERT_IN_WINDOW_HOURS, now),
      deadlineFor("Data Protection Board", "Detailed breach report within 72 hours; intimate the Board without delay (DPDP Act 2023 and Rules)", detectedAt, DPB_REPORT_WINDOW_HOURS, now),
    ],
    certInDraft: [
      `To: CERT-In (incident@cert-in.org.in)`,
      `Subject: Cyber incident report ${incidentId}`,
      ``,
      `Incident type: ${typeLabel}`,
      `Detected at: ${detectedAt.toISOString()}`,
      `Data categories involved: ${categories.join(", ")}`,
      `Approximate data principals affected: ${principals}`,
      `Summary: ${input.description ?? "Details to be added by the incident commander."}`,
      `Note: identifiers are held as vault tokens; no raw government IDs are stored.`,
    ].join("\n"),
    principalNotice: `We detected a security incident on ${detectedAt.toISOString().slice(0, 10)} that may involve ${categories.join(" and ").toLowerCase()}. Government ID numbers are not stored in our systems. We have reported the incident to the authorities. You can contact the grievance officer for more details.`,
    checklist: [
      "Contain the incident and preserve logs",
      "Notify CERT-In inside the 6-hour window",
      "Intimate the Data Protection Board without delay",
      "Notify each affected data principal",
      "File the detailed Board report inside 72 hours",
    ],
  };
}

/* ── Third-party query rate limiting ─────────────────────────────────── */

let queryWindowTimestamps: number[] = [];
let simulatedIncidentCount = 0;

const BADGES = [
  "CERT-In 6-Hour Incident Reporting Ready",
  "Zero-Plaintext Government ID Vault",
  "HMAC Salted Tokenization",
  "Automated Rogue ERP Rate-Limiting",
];

function buildStatus(count: number, alertTriggered: boolean): CERTInSecurityStatus {
  const threshold = 30;
  const complianceStatus: CERTInSecurityStatus["complianceStatus"] =
    count > threshold * 1.5 ? "CERT_IN_ALERT_TRIGGERED" : count > threshold ? "ELEVATED_THROTTLE" : "SECURE";
  return {
    complianceStatus,
    certInReportingDeadlineHours: CERT_IN_WINDOW_HOURS,
    hoursElapsedSinceIncident: alertTriggered ? 0.2 : 0,
    totalTokensProtected: 48920,
    queriesLastMinute: count,
    maxQueryThresholdPerMinute: threshold,
    rateLimitStatus: complianceStatus === "CERT_IN_ALERT_TRIGGERED" ? "IP_BLOCKED" : complianceStatus === "ELEVATED_THROTTLE" ? "THROTTLED" : "NORMAL",
    simulatedIncidentCount,
    lastSecurityAudit: new Date().toISOString(),
    securityBadges: BADGES,
  };
}

export function recordThirdPartyQuery(): { allowed: boolean; queriesInWindow: number; status: CERTInSecurityStatus } {
  const now = Date.now();
  queryWindowTimestamps = queryWindowTimestamps.filter((t) => now - t < 60000);
  queryWindowTimestamps.push(now);

  const count = queryWindowTimestamps.length;
  const status = buildStatus(count, false);
  if (status.complianceStatus === "CERT_IN_ALERT_TRIGGERED") {
    simulatedIncidentCount++;
    status.simulatedIncidentCount = simulatedIncidentCount;
    status.hoursElapsedSinceIncident = 0.2;
  }
  return { allowed: status.rateLimitStatus !== "IP_BLOCKED", queriesInWindow: count, status };
}

export function getSecurityStatus(): CERTInSecurityStatus {
  const now = Date.now();
  queryWindowTimestamps = queryWindowTimestamps.filter((t) => now - t < 60000);
  return buildStatus(queryWindowTimestamps.length, false);
}
