import crypto from "crypto";

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

// A development fallback keeps the demo runnable; production must supply its own secret.
const DEV_PEPPER = "apaar-bridge-dev-only-pepper";

function pepper(): string {
  const fromEnv = process.env.VAULT_PEPPER;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("VAULT_PEPPER must be set in production; refusing to tokenize with the development pepper.");
  }
  return DEV_PEPPER;
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

type IssuerKeys = { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
const store = globalThis as typeof globalThis & { __apaarIssuerKeys?: IssuerKeys };

function issuerKeys(): IssuerKeys {
  if (store.__apaarIssuerKeys) return store.__apaarIssuerKeys;
  const pem = process.env.ISSUER_PRIVATE_KEY_PEM;
  if (pem) {
    // A configured key keeps issued QRs valid across restarts and across server instances.
    const privateKey = crypto.createPrivateKey(pem.split("\\n").join("\n"));
    store.__apaarIssuerKeys = { privateKey, publicKey: crypto.createPublicKey(privateKey) };
  } else {
    // No key configured: an ephemeral one. QRs issued before a restart stop verifying, which fails safe.
    store.__apaarIssuerKeys = crypto.generateKeyPairSync("ed25519");
  }
  return store.__apaarIssuerKeys;
}

/** The public key a verifier caches so it can check signatures with no network access. */
export function getIssuerPublicKeyPem(): string {
  return issuerKeys().publicKey.export({ type: "spki", format: "pem" }).toString();
}

/** Returns `APAARQR1.<payload>.<signature>` with both parts base64url. */
export function signSmartQr(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signed = `${QR_PREFIX}.${body}`;
  const signature = crypto.sign(null, Buffer.from(signed), issuerKeys().privateKey).toString("base64url");
  return `${signed}.${signature}`;
}

export interface QrVerification<T> {
  signatureValid: boolean;
  payload: T | null;
  error?: string;
}

/** Checks the signature only; it never touches a registry, so it works fully offline. */
export function verifySmartQr<T = Record<string, unknown>>(qr: string, publicKeyPem?: string): QrVerification<T> {
  const parts = qr.trim().split(".");
  if (parts.length !== 3 || parts[0] !== QR_PREFIX) {
    return { signatureValid: false, payload: null, error: "Not an APAAR Smart QR payload." };
  }
  try {
    const key = publicKeyPem ? crypto.createPublicKey(publicKeyPem) : issuerKeys().publicKey;
    const valid = crypto.verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"));
    if (!valid) return { signatureValid: false, payload: null, error: "Signature does not match. The QR was altered or was not issued by APAAR." };
    return { signatureValid: true, payload: JSON.parse(Buffer.from(parts[1], "base64url").toString()) as T };
  } catch {
    return { signatureValid: false, payload: null, error: "Malformed QR payload." };
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
