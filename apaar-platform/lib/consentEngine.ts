import crypto from "crypto";
import { hmacHex, tokenizeDemographicId } from "./tokenization";

/**
 * DPDP-Act-2023 Consent Engine
 *
 * Implements:
 * 1. Granular, revocable purposes plus time-bound verifier shares (default 30 days) that expire on their own.
 * 2. Section 9(1): a person under 18 needs verifiable consent from a parent or guardian before any grant.
 * 3. Section 9(3): behavioural tracking of children and students is locked to DISABLED. Any attempt to
 *    enable it is refused and the attempt itself is written to the ledger.
 * 4. NOGEN opt-out: a non-punitive withdrawal from APAAR. It revokes every active share and issues a signed receipt.
 * 5. A tamper-evident ledger: each entry stores SHA-256(previousHash | timestamp | studentId | action | detail).
 *    `verifyAuditChain` recomputes the chain and reports the first broken link.
 *
 * State lives in process memory (on globalThis so dev hot-reloads keep it). Swap for a database in production.
 */

export type APAARStatus = "ACTIVE" | "NOGEN_OPTED_OUT" | "PENDING_CONSENT";

export interface ConsentPurposes {
  abcCreditSync: boolean; // Sync grades & credits to the National Academic Depository
  aicteEnrolmentCount: boolean; // Include student in AICTE institutional intake headcount
  employerVerification: boolean; // Permit consent-gated credential verification by hiring entities
  behavioralTracking: boolean; // MUST ALWAYS BE FALSE - Section 9(3) DPDP Act
}

export type AuditAction =
  | "GRANT"
  | "REVOKE"
  | "OPT_OUT_NOGEN"
  | "OPT_IN_RESTORE"
  | "INITIAL_LEDGER_CREATION"
  | "SHARE_REQUESTED"
  | "SHARE_GRANTED"
  | "SHARE_REVOKED"
  | "SHARE_EXPIRED"
  | "SHARE_DENIED"
  | "MINOR_STATUS_SET"
  | "GUARDIAN_COSIGN"
  | "GUARDIAN_COSIGN_WITHDRAWN"
  | "DISPUTE_RAISED"
  | "BEHAVIORAL_TRACKING_BLOCKED";

export interface ConsentAuditEntry {
  logId: string;
  timestamp: string;
  studentId: string; // Tokenized VAULT_ID
  action: AuditAction;
  purposeModified?: string;
  newValue?: boolean;
  actor: string;
  legalNotice: string;
  previousHash: string;
  sha256Hash: string;
}

export type ShareScope = "DEGREE_STATUS" | "INTERNSHIP_STATUS" | "CGPA_BAND" | "EOA_STATUS";

export const SHARE_SCOPE_LABELS: Record<ShareScope, string> = {
  DEGREE_STATUS: "Degree status",
  INTERNSHIP_STATUS: "Internship status",
  CGPA_BAND: "CGPA band (yes/no)",
  EOA_STATUS: "AICTE EoA status",
};

export const DEFAULT_SHARE_SCOPES: ShareScope[] = ["DEGREE_STATUS", "INTERNSHIP_STATUS", "CGPA_BAND", "EOA_STATUS"];

export interface Verifier {
  id: string;
  name: string;
  type: "EMPLOYER" | "BANK" | "UNIVERSITY";
}

export const KNOWN_VERIFIERS: Verifier[] = [
  { id: "VRF-ACME", name: "Acme Cloud Pvt Ltd (demo)", type: "EMPLOYER" },
  { id: "VRF-FINSERVE", name: "FinServe Bank HR (demo)", type: "BANK" },
  { id: "VRF-GLOBAL", name: "Global Campus Admissions (demo)", type: "UNIVERSITY" },
];

export interface ConsentShare {
  shareId: string;
  verifierId: string;
  verifierName: string;
  scopes: ShareScope[];
  grantedAt: string;
  expiresAt: string;
  revokedAt?: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  expiryLogged?: boolean;
}

export interface ShareRequest {
  requestId: string;
  verifierId: string;
  verifierName: string;
  scopes: ShareScope[];
  purpose: string;
  createdAt: string;
  expiresAt: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "EXPIRED";
  respondedAt?: string;
  respondedVia?: "SMS" | "WHATSAPP" | "APP";
  messageText: string;
}

export interface DataDispute {
  ticketId: string;
  field: string;
  claimedValue: string;
  reason: string;
  raisedAt: string;
  acknowledgeBy: string;
  status: "OPEN";
}

export interface NogenReceipt {
  receiptId: string;
  studentId: string;
  issuedAt: string;
  statement: string;
  legalBasis: string[];
  sharesRevoked: number;
  ledgerHeadHash: string;
  signature: string; // HMAC over the receipt fields
}

export interface GuardianState {
  coSign: "NOT_REQUIRED" | "PENDING" | "SIGNED";
  guardianName: string;
  signedAt?: string;
}

export interface StudentConsentLedger {
  studentId: string;
  studentName: string;
  studentRoll: string;
  identityDisplay: string; // always a redaction label
  apaarToken: string;
  apaarStatus: APAARStatus;
  isMinor: boolean;
  guardian: GuardianState;
  purposes: ConsentPurposes;
  shares: ConsentShare[];
  requests: ShareRequest[];
  disputes: DataDispute[];
  nogenReceipt: NogenReceipt | null;
  lastUpdated: string;
  auditTrail: ConsentAuditEntry[];
}

/**
 * Computes SHA-256 cryptographic hash of audit block
 */
export function computeAuditHash(
  previousHash: string,
  timestamp: string,
  studentId: string,
  action: string,
  purposeModified?: string,
  newValue?: boolean,
  actor = "",
  legalNotice = ""
): string {
  // actor and legalNotice are sealed too, so rewriting who acted or what the notice said breaks the chain.
  const payload = `${previousHash}|${timestamp}|${studentId}|${action}|${purposeModified || ""}|${newValue !== undefined ? newValue : ""}|${actor}|${legalNotice}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

const GENESIS_HASH = "0".repeat(64);
const DAY_MS = 86_400_000;
const STUDENT_ID = "VAULT-STU-8821-X9";

export interface ChainVerification {
  valid: boolean;
  checked: number;
  brokenAtIndex?: number;
  reason?: string;
}

/** Recomputes every hash and link. Reports the first entry that does not verify. */
export function verifyAuditChain(entries: ConsentAuditEntry[]): ChainVerification {
  let expectedPrevious = GENESIS_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.previousHash !== expectedPrevious) {
      return { valid: false, checked: i, brokenAtIndex: i, reason: `${e.logId}: previous-hash link does not match the entry before it.` };
    }
    const recomputed = computeAuditHash(e.previousHash, e.timestamp, e.studentId, e.action, e.purposeModified, e.newValue, e.actor, e.legalNotice);
    if (recomputed !== e.sha256Hash) {
      return { valid: false, checked: i, brokenAtIndex: i, reason: `${e.logId}: contents no longer match the stored hash. The entry was altered.` };
    }
    expectedPrevious = e.sha256Hash;
  }
  return { valid: true, checked: entries.length };
}

function createDefaultLedger(): StudentConsentLedger {
  const timestamp = "2024-09-01T10:00:00.000Z";
  const actor = "STUDENT_SELF (Aadhaar OTP e-Sign)";
  const legalNotice = "Initial DPDP notice accepted with granular academic purpose selection.";
  const sha256Hash = computeAuditHash(GENESIS_HASH, timestamp, STUDENT_ID, "INITIAL_LEDGER_CREATION", undefined, undefined, actor, legalNotice);
  return {
    studentId: STUDENT_ID,
    studentName: "Rahul K.V.",
    studentRoll: "2023-CS-041",
    identityDisplay: "[Aadhaar Redacted]",
    apaarToken: tokenizeDemographicId("948120416672", "APAAR", "NIST-DEMO").vaultToken,
    apaarStatus: "ACTIVE",
    isMinor: false,
    guardian: { coSign: "NOT_REQUIRED", guardianName: "K. Satyanarayana" },
    purposes: {
      abcCreditSync: true,
      aicteEnrolmentCount: true,
      employerVerification: true,
      behavioralTracking: false, // STRICTLY LOCKED FALSE
    },
    shares: [],
    requests: [],
    disputes: [],
    nogenReceipt: null,
    lastUpdated: timestamp,
    auditTrail: [
      {
        logId: "AUDIT-001",
        timestamp,
        studentId: STUDENT_ID,
        action: "INITIAL_LEDGER_CREATION",
        actor,
        legalNotice,
        previousHash: GENESIS_HASH,
        sha256Hash,
      },
    ],
  };
}

const store = globalThis as typeof globalThis & { __apaarConsentLedger?: StudentConsentLedger };

function live(): StudentConsentLedger {
  if (!store.__apaarConsentLedger) store.__apaarConsentLedger = createDefaultLedger();
  return store.__apaarConsentLedger;
}

/** Test and demo helper: restores the pristine ledger. */
export function resetConsentLedger(): StudentConsentLedger {
  store.__apaarConsentLedger = createDefaultLedger();
  return store.__apaarConsentLedger;
}

function appendAudit(
  l: StudentConsentLedger,
  e: { action: AuditAction; purposeModified?: string; newValue?: boolean; actor: string; legalNotice: string }
): ConsentAuditEntry {
  const timestamp = new Date().toISOString();
  const previousHash = l.auditTrail.length ? l.auditTrail[l.auditTrail.length - 1].sha256Hash : GENESIS_HASH;
  const entry: ConsentAuditEntry = {
    logId: `AUDIT-${String(l.auditTrail.length + 1).padStart(3, "0")}`,
    timestamp,
    studentId: l.studentId,
    action: e.action,
    purposeModified: e.purposeModified,
    newValue: e.newValue,
    actor: e.actor,
    legalNotice: e.legalNotice,
    previousHash,
    sha256Hash: computeAuditHash(previousHash, timestamp, l.studentId, e.action, e.purposeModified, e.newValue, e.actor, e.legalNotice),
  };
  l.auditTrail.push(entry);
  l.lastUpdated = timestamp;
  return entry;
}

/** Marks lapsed shares and requests. Each lapse is written to the ledger once. */
function refresh(l: StudentConsentLedger): void {
  const now = Date.now();
  for (const s of l.shares) {
    if (s.status === "ACTIVE" && new Date(s.expiresAt).getTime() <= now) {
      s.status = "EXPIRED";
      if (!s.expiryLogged) {
        s.expiryLogged = true;
        appendAudit(l, {
          action: "SHARE_EXPIRED",
          purposeModified: `share:${s.shareId}`,
          newValue: false,
          actor: "SYSTEM_TIMER",
          legalNotice: `Time-bound share ${s.shareId} for ${s.verifierName} expired and access ended automatically.`,
        });
      }
    }
  }
  for (const r of l.requests) {
    if (r.status === "PENDING" && new Date(r.expiresAt).getTime() <= now) r.status = "EXPIRED";
  }
}

export function getConsentLedger(): StudentConsentLedger {
  const l = live();
  refresh(l);
  return l;
}

/** The statutory gates every grant must pass. */
function assertCanGrant(l: StudentConsentLedger): void {
  if (l.apaarStatus === "NOGEN_OPTED_OUT") {
    throw new Error("Student is in NOGEN (opted-out) status. Re-enrol in APAAR before granting any consent.");
  }
  if (l.isMinor && l.guardian.coSign !== "SIGNED") {
    throw new Error(
      "Guardian co-sign required: Section 9(1) of the DPDP Act requires verifiable consent from a parent or guardian before processing a child's data."
    );
  }
}

export function updateConsentPurpose(
  purpose: keyof ConsentPurposes,
  allow: boolean,
  actor = "STUDENT_PORTAL_WEB"
): { ledger: StudentConsentLedger; auditEntry: ConsentAuditEntry } {
  const l = getConsentLedger();

  // Section 9(3) lock: record the attempt, then refuse.
  if (purpose === "behavioralTracking") {
    appendAudit(l, {
      action: "BEHAVIORAL_TRACKING_BLOCKED",
      purposeModified: purpose,
      newValue: false,
      actor,
      legalNotice: "Attempt to change behavioural tracking was refused. Section 9(3) DPDP Act prohibits tracking or behavioural monitoring of children and students.",
    });
    throw new Error(
      "Statutory lock: Section 9(3) of the DPDP Act prohibits behavioural tracking, profiling and targeted advertising aimed at students. This purpose cannot be enabled."
    );
  }

  if (allow) assertCanGrant(l);
  else if (l.apaarStatus === "NOGEN_OPTED_OUT") {
    throw new Error("Student is in NOGEN (opted-out) status. Re-enrol in APAAR before changing purposes.");
  }

  const auditEntry = appendAudit(l, {
    action: allow ? "GRANT" : "REVOKE",
    purposeModified: purpose,
    newValue: allow,
    actor,
    legalNotice: `Consent ${allow ? "GRANTED" : "REVOKED"} for purpose '${purpose}'.`,
  });
  l.purposes[purpose] = allow;
  return { ledger: l, auditEntry };
}

/* ── Time-bound shares ───────────────────────────────────────────────── */

export function grantShare(opts: {
  verifierId: string;
  scopes?: ShareScope[];
  days?: number;
  actor?: string;
}): { ledger: StudentConsentLedger; share: ConsentShare; auditEntry: ConsentAuditEntry | null } {
  const l = getConsentLedger();
  assertCanGrant(l);

  const verifier = KNOWN_VERIFIERS.find((v) => v.id === opts.verifierId);
  if (!verifier) throw new Error(`Unknown verifier '${opts.verifierId}'.`);

  const existing = l.shares.find((s) => s.verifierId === verifier.id && s.status === "ACTIVE");
  if (existing) return { ledger: l, share: existing, auditEntry: null };

  const days = Math.min(365, Math.max(1, Math.round(opts.days ?? 30)));
  const grantedAt = new Date();
  const share: ConsentShare = {
    shareId: `SHR-${String(l.shares.length + 1).padStart(3, "0")}`,
    verifierId: verifier.id,
    verifierName: verifier.name,
    scopes: opts.scopes?.length ? opts.scopes : DEFAULT_SHARE_SCOPES,
    grantedAt: grantedAt.toISOString(),
    expiresAt: new Date(grantedAt.getTime() + days * DAY_MS).toISOString(),
    status: "ACTIVE",
  };
  l.shares.push(share);
  const auditEntry = appendAudit(l, {
    action: "SHARE_GRANTED",
    purposeModified: `share:${share.shareId}`,
    newValue: true,
    actor: opts.actor ?? "STUDENT_PORTAL_WEB",
    legalNotice: `Shared ${share.scopes.map((s) => SHARE_SCOPE_LABELS[s]).join(", ")} with ${verifier.name} for ${days} days. Access ends automatically on ${share.expiresAt.slice(0, 10)}.`,
  });
  return { ledger: l, share, auditEntry };
}

export function revokeShare(
  shareId: string,
  actor = "STUDENT_PORTAL_WEB"
): { ledger: StudentConsentLedger; share: ConsentShare; auditEntry: ConsentAuditEntry } {
  const l = getConsentLedger();
  const share = l.shares.find((s) => s.shareId === shareId);
  if (!share) throw new Error(`No share with id '${shareId}'.`);
  if (share.status !== "ACTIVE") throw new Error(`Share ${shareId} is already ${share.status.toLowerCase()}.`);

  share.status = "REVOKED";
  share.revokedAt = new Date().toISOString();
  const auditEntry = appendAudit(l, {
    action: "SHARE_REVOKED",
    purposeModified: `share:${share.shareId}`,
    newValue: false,
    actor,
    legalNotice: `Sharing with ${share.verifierName} withdrawn before expiry.`,
  });
  return { ledger: l, share, auditEntry };
}

/** The live share for a verifier, or undefined when none is active or the student has opted out. */
export function getActiveShare(verifierId: string): ConsentShare | undefined {
  const l = getConsentLedger();
  if (l.apaarStatus === "NOGEN_OPTED_OUT" || !l.purposes.employerVerification) return undefined;
  return l.shares.find((s) => s.verifierId === verifierId && s.status === "ACTIVE");
}

/* ── Verifier requests (SMS / WhatsApp / app approval) ───────────────── */

export function createShareRequest(opts: {
  verifierId: string;
  scopes?: ShareScope[];
  purpose?: string;
}): { ledger: StudentConsentLedger; request: ShareRequest } {
  const l = getConsentLedger();
  const verifier = KNOWN_VERIFIERS.find((v) => v.id === opts.verifierId);
  if (!verifier) throw new Error(`Unknown verifier '${opts.verifierId}'.`);

  const pending = l.requests.find((r) => r.verifierId === verifier.id && r.status === "PENDING");
  if (pending) return { ledger: l, request: pending };

  const scopes = opts.scopes?.length ? opts.scopes : DEFAULT_SHARE_SCOPES;
  const createdAt = new Date();
  const request: ShareRequest = {
    requestId: `REQ-${String(l.requests.length + 1).padStart(3, "0")}`,
    verifierId: verifier.id,
    verifierName: verifier.name,
    scopes,
    purpose: opts.purpose ?? "Employment verification",
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + DAY_MS).toISOString(),
    status: "PENDING",
    messageText: `APAAR: ${verifier.name} asks to verify ${scopes.map((s) => SHARE_SCOPE_LABELS[s]).join(", ")} for 30 days. Reply YES to allow or NO to refuse. No marksheet or ID number is shared.`,
  };
  l.requests.push(request);
  appendAudit(l, {
    action: "SHARE_REQUESTED",
    purposeModified: `request:${request.requestId}`,
    actor: verifier.id,
    legalNotice: `${verifier.name} requested access for '${request.purpose}'. Waiting for the student's answer.`,
  });
  return { ledger: l, request };
}

export function respondToRequest(
  requestId: string,
  approve: boolean,
  via: ShareRequest["respondedVia"] = "APP"
): { ledger: StudentConsentLedger; request: ShareRequest; share?: ConsentShare } {
  const l = getConsentLedger();
  const request = l.requests.find((r) => r.requestId === requestId);
  if (!request) throw new Error(`No request with id '${requestId}'.`);
  if (request.status !== "PENDING") throw new Error(`Request ${requestId} is already ${request.status.toLowerCase()}.`);

  if (approve) {
    // Throws (and leaves the request pending) when the guardian gate or NOGEN blocks the grant.
    const { share } = grantShare({ verifierId: request.verifierId, scopes: request.scopes, actor: `STUDENT_VIA_${via}` });
    request.status = "APPROVED";
    request.respondedAt = new Date().toISOString();
    request.respondedVia = via;
    return { ledger: l, request, share };
  }

  request.status = "DENIED";
  request.respondedAt = new Date().toISOString();
  request.respondedVia = via;
  appendAudit(l, {
    action: "SHARE_DENIED",
    purposeModified: `request:${request.requestId}`,
    newValue: false,
    actor: `STUDENT_VIA_${via}`,
    legalNotice: `Student refused ${request.verifierName}'s request.`,
  });
  return { ledger: l, request };
}

/* ── Minors and guardian co-sign (Section 9(1)) ──────────────────────── */

export function setMinorStatus(isMinor: boolean): { ledger: StudentConsentLedger; auditEntry: ConsentAuditEntry } {
  const l = getConsentLedger();
  l.isMinor = isMinor;
  l.guardian.coSign = isMinor ? (l.guardian.coSign === "SIGNED" ? "SIGNED" : "PENDING") : "NOT_REQUIRED";
  if (!isMinor) delete l.guardian.signedAt;
  const auditEntry = appendAudit(l, {
    action: "MINOR_STATUS_SET",
    purposeModified: "isMinor",
    newValue: isMinor,
    actor: "STUDENT_PORTAL_WEB",
    legalNotice: isMinor
      ? "Student is under 18. Every new grant now needs the guardian's co-sign (Section 9(1))."
      : "Student is 18 or older. Guardian co-sign is no longer required.",
  });
  return { ledger: l, auditEntry };
}

export function setGuardianCoSign(sign: boolean): { ledger: StudentConsentLedger; auditEntry: ConsentAuditEntry } {
  const l = getConsentLedger();
  if (!l.isMinor) throw new Error("Guardian co-sign only applies when the student is under 18.");
  if (sign === (l.guardian.coSign === "SIGNED")) throw new Error(`Guardian co-sign is already ${sign ? "signed" : "not signed"}.`);

  if (sign) {
    l.guardian.coSign = "SIGNED";
    l.guardian.signedAt = new Date().toISOString();
    const auditEntry = appendAudit(l, {
      action: "GUARDIAN_COSIGN",
      purposeModified: "guardianCoSign",
      newValue: true,
      actor: `GUARDIAN (${l.guardian.guardianName})`,
      legalNotice: "Parent or guardian gave verifiable consent under Section 9(1).",
    });
    return { ledger: l, auditEntry };
  }

  // Withdrawing guardian consent ends everything that depended on it.
  for (const s of l.shares.filter((x) => x.status === "ACTIVE")) {
    s.status = "REVOKED";
    s.revokedAt = new Date().toISOString();
  }
  l.guardian.coSign = "PENDING";
  delete l.guardian.signedAt;
  const auditEntry = appendAudit(l, {
    action: "GUARDIAN_COSIGN_WITHDRAWN",
    purposeModified: "guardianCoSign",
    newValue: false,
    actor: `GUARDIAN (${l.guardian.guardianName})`,
    legalNotice: "Guardian withdrew consent. All active shares were revoked.",
  });
  return { ledger: l, auditEntry };
}

/* ── NOGEN opt-out ───────────────────────────────────────────────────── */

export function toggleOptOutNogen(
  optOut: boolean,
  actor = "STUDENT_PORTAL_WEB"
): { ledger: StudentConsentLedger; auditEntry: ConsentAuditEntry; receipt: NogenReceipt | null } {
  const l = getConsentLedger();

  if (optOut) {
    let sharesRevoked = 0;
    for (const s of l.shares.filter((x) => x.status === "ACTIVE")) {
      s.status = "REVOKED";
      s.revokedAt = new Date().toISOString();
      sharesRevoked++;
      appendAudit(l, {
        action: "SHARE_REVOKED",
        purposeModified: `share:${s.shareId}`,
        newValue: false,
        actor,
        legalNotice: `Share with ${s.verifierName} ended by NOGEN opt-out.`,
      });
    }
    l.apaarStatus = "NOGEN_OPTED_OUT";
    l.purposes.abcCreditSync = false;
    l.purposes.employerVerification = false;
    // Institutional headcount stays as an anonymous count only.

    const auditEntry = appendAudit(l, {
      action: "OPT_OUT_NOGEN",
      purposeModified: "NOGEN_STATUS",
      newValue: true,
      actor,
      legalNotice:
        "Student withdrew from APAAR (NOGEN). Opting out must not lead to denial of admission, examination or services.",
    });
    const issuedAt = auditEntry.timestamp;
    const receiptId = `NOGEN-${issuedAt.slice(0, 10).replace(/-/g, "")}-${auditEntry.sha256Hash.slice(0, 8).toUpperCase()}`;
    const receipt: NogenReceipt = {
      receiptId,
      studentId: l.studentId,
      issuedAt,
      statement: `${l.studentName} (${l.studentRoll}) opted out of APAAR on ${issuedAt.slice(0, 10)}. All verifier shares were revoked and cloud sync stopped. Services must not be withheld because of this choice.`,
      legalBasis: [
        "Digital Personal Data Protection Act, 2023: right to withdraw consent",
        "Puttaswamy (Aadhaar) 2018: identity schemes may not be forced as a condition of services",
      ],
      sharesRevoked,
      ledgerHeadHash: auditEntry.sha256Hash,
      signature: hmacHex(`${receiptId}|${l.studentId}|${issuedAt}|${auditEntry.sha256Hash}`, "nogen-receipt"),
    };
    l.nogenReceipt = receipt;
    return { ledger: l, auditEntry, receipt };
  }

  l.apaarStatus = "ACTIVE";
  l.purposes.abcCreditSync = true;
  l.purposes.aicteEnrolmentCount = true;
  l.purposes.employerVerification = true;
  l.purposes.behavioralTracking = false;
  l.nogenReceipt = null;
  const auditEntry = appendAudit(l, {
    action: "OPT_IN_RESTORE",
    purposeModified: "NOGEN_STATUS",
    newValue: false,
    actor,
    legalNotice: "Student chose to re-enrol in APAAR. Shares must be granted again.",
  });
  return { ledger: l, auditEntry, receipt: null };
}

/* ── Data disputes ───────────────────────────────────────────────────── */

export function raiseDispute(opts: {
  field: string;
  claimedValue: string;
  reason: string;
}): { ledger: StudentConsentLedger; dispute: DataDispute; auditEntry: ConsentAuditEntry } {
  const l = getConsentLedger();
  const field = opts.field.trim();
  const reason = opts.reason.trim();
  if (!field || !reason) throw new Error("A dispute needs the field in question and a reason.");

  const raisedAt = new Date();
  const dispute: DataDispute = {
    ticketId: `DSP-${String(l.disputes.length + 1).padStart(4, "0")}`,
    field,
    claimedValue: opts.claimedValue.trim(),
    reason,
    raisedAt: raisedAt.toISOString(),
    acknowledgeBy: new Date(raisedAt.getTime() + 2 * DAY_MS).toISOString(), // platform SLA, not a statutory period
    status: "OPEN",
  };
  l.disputes.push(dispute);
  const auditEntry = appendAudit(l, {
    action: "DISPUTE_RAISED",
    purposeModified: `dispute:${dispute.ticketId}:${field}`,
    actor: "STUDENT_PORTAL_WEB",
    legalNotice: `Student disputes '${field}' and asks for correction (DPDP Act right to correction and grievance redressal).`,
  });
  return { ledger: l, dispute, auditEntry };
}
