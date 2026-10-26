import { appendAudit, type AuditActorRole, type AuditEntry, type AuditInput, type AuditType } from "./audit";
import { HttpError } from "./errors";
import { NS, type Store } from "./store/types";
import { STUDENTS, apaarTokenFor, findStudent, isMinor, type StudentRecord } from "./students";
import { hmacHex } from "./tokenization";

/**
 * DPDP-Act-2023 consent engine, one ledger per student.
 *
 * - Granular, revocable purposes plus time-bound verifier shares that end on their own.
 * - Section 9(1): a person under 18 needs a parent or guardian's verifiable consent before any grant.
 *   Minor status is derived from the date of birth on the student record. A student cannot switch it off.
 * - Section 9(3): behavioural tracking of students is locked to DISABLED. An attempt to change it is
 *   refused and the attempt itself is written to the audit chain.
 * - NOGEN opt-out: a non-punitive withdrawal from APAAR. It revokes every active share and issues a signed receipt.
 *
 * Every change is appended to the shared audit chain (lib/audit.ts). The actor is passed in by the route from the
 * session. It is never read from a request body.
 */

export type APAARStatus = "ACTIVE" | "NOGEN_OPTED_OUT";

export interface ConsentPurposes {
  abcCreditSync: boolean;
  aicteEnrolmentCount: boolean;
  employerVerification: boolean;
  behavioralTracking: boolean; // MUST ALWAYS BE FALSE: Section 9(3) DPDP Act
}

export const PURPOSE_KEYS = ["abcCreditSync", "aicteEnrolmentCount", "employerVerification", "behavioralTracking"] as const;

export type ShareScope = "DEGREE_STATUS" | "INTERNSHIP_STATUS" | "CGPA_BAND" | "EOA_STATUS";

export const SHARE_SCOPE_LABELS: Record<ShareScope, string> = {
  DEGREE_STATUS: "Degree status",
  INTERNSHIP_STATUS: "Internship status",
  CGPA_BAND: "CGPA band (yes/no)",
  EOA_STATUS: "AICTE EoA status",
};

export const SHARE_SCOPES = Object.keys(SHARE_SCOPE_LABELS) as ShareScope[];
export const DEFAULT_SHARE_SCOPES: ShareScope[] = [...SHARE_SCOPES];
export const DEFAULT_SHARE_DAYS = 30;

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
  days: number;
  grantedAt: string;
  expiresAt: string;
  revokedAt?: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  expiryLogged?: boolean;
  /** View-only: false when the share is ACTIVE but paused by the employer-verification switch or a NOGEN opt-out. */
  effective?: boolean;
}

export interface ShareRequest {
  requestId: string;
  verifierId: string;
  verifierName: string;
  scopes: ShareScope[];
  days: number;
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
  status: "OPEN" | "RESOLVED" | "REJECTED";
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface NogenReceipt {
  receiptId: string;
  studentId: string;
  issuedAt: string;
  statement: string;
  legalBasis: string[];
  sharesRevoked: number;
  auditSeq: number;
  auditHash: string;
  signature: string; // HMAC over the receipt fields
}

export interface GuardianState {
  coSign: "NOT_REQUIRED" | "PENDING" | "SIGNED";
  guardianName: string;
  signedAt?: string;
}

interface StoredLedger {
  studentId: string;
  apaarStatus: APAARStatus;
  guardian: GuardianState;
  purposes: ConsentPurposes;
  shares: ConsentShare[];
  requests: ShareRequest[];
  disputes: DataDispute[];
  nogenReceipt: NogenReceipt | null;
  lastUpdated: string;
}

/** What the API returns: the stored ledger plus fields derived from the student record. */
export interface StudentConsentLedger extends StoredLedger {
  studentName: string;
  studentRoll: string;
  identityDisplay: string; // always a redaction label
  apaarToken: string;
  isMinor: boolean;
}

export interface Actor {
  role: AuditActorRole;
  label: string;
}

const DAY_MS = 86_400_000;

function student(id: string): StudentRecord {
  const s = findStudent(id);
  if (!s) throw new HttpError(404, `No student '${id}'.`);
  return s;
}

function freshLedger(s: StudentRecord): StoredLedger {
  const minor = isMinor(s.dob);
  const optedOut = Boolean(s.startsOptedOut);
  return {
    studentId: s.id,
    apaarStatus: optedOut ? "NOGEN_OPTED_OUT" : "ACTIVE",
    guardian: { coSign: minor ? "PENDING" : "NOT_REQUIRED", guardianName: s.guardianName },
    purposes: { abcCreditSync: !optedOut, aicteEnrolmentCount: true, employerVerification: !optedOut, behavioralTracking: false },
    shares: [],
    requests: [],
    disputes: [],
    nogenReceipt: null,
    lastUpdated: new Date().toISOString(),
  };
}

const sharePaused = (l: StoredLedger) => l.apaarStatus === "NOGEN_OPTED_OUT" || !l.purposes.employerVerification;

/** Adds the derived fields and works out lapsed shares and requests at read time. Writes nothing. */
function toView(l: StoredLedger, s: StudentRecord, now = Date.now()): StudentConsentLedger {
  const shares = l.shares.map((sh) => {
    const status: ConsentShare["status"] = sh.status === "ACTIVE" && new Date(sh.expiresAt).getTime() <= now ? "EXPIRED" : sh.status;
    return { ...sh, status, effective: status === "ACTIVE" && !sharePaused(l) };
  });
  const requests = l.requests.map((r) => (r.status === "PENDING" && new Date(r.expiresAt).getTime() <= now ? { ...r, status: "EXPIRED" as const } : r));
  return {
    ...l,
    shares,
    requests,
    studentName: s.name,
    studentRoll: s.roll,
    identityDisplay: "[Aadhaar Redacted]",
    apaarToken: apaarTokenFor(s),
    isMinor: isMinor(s.dob),
  };
}

/** Read-only. Never creates a ledger and never writes to the audit chain. */
export async function getLedger(store: Store, studentId: string): Promise<StudentConsentLedger> {
  const s = student(studentId);
  const stored = (await store.get<StoredLedger>(NS.consent, studentId)) ?? freshLedger(s);
  return toView(stored, s);
}

type Emit = (e: Omit<AuditInput, "type" | "subject" | "actorRole" | "actor"> & { type?: AuditType }) => void;

/**
 * Runs one change against a student's ledger atomically, then appends the audit entries it produced.
 * Lapsed shares are settled here (on a write) and logged once, so a plain GET never writes.
 */
async function mutate<R>(
  store: Store,
  studentId: string,
  actor: Actor,
  fn: (l: StoredLedger, s: StudentRecord, emit: Emit) => R
): Promise<{ result: R; entries: AuditEntry[] }> {
  const s = student(studentId);
  const events: AuditInput[] = [];
  const emitAs = (a: Actor): Emit => (e) => events.push({ type: "CONSENT", subject: studentId, actorRole: a.role, actor: a.label, ...e });
  const system: Actor = { role: "SYSTEM", label: "System timer" };

  const result = await store.update<StoredLedger, R>(NS.consent, studentId, (cur) => {
    const l = cur ?? freshLedger(s);
    if (!cur) emitAs(system)({ action: "LEDGER_CREATED", detail: s.startsOptedOut ? "Consent ledger opened. This sample student starts opted out of APAAR (NOGEN), so nothing is shared. Behavioural tracking is locked off." : "Consent ledger opened with the default purposes. Behavioural tracking is locked off." });

    // Age can change the guardian requirement over time.
    const minor = isMinor(s.dob);
    if (minor && l.guardian.coSign === "NOT_REQUIRED") l.guardian.coSign = "PENDING";
    if (!minor) l.guardian.coSign = "NOT_REQUIRED";

    const now = Date.now();
    for (const sh of l.shares) {
      if (sh.status === "ACTIVE" && new Date(sh.expiresAt).getTime() <= now) {
        sh.status = "EXPIRED";
        if (!sh.expiryLogged) {
          sh.expiryLogged = true;
          emitAs(system)({ action: "SHARE_EXPIRED", purposeModified: `share:${sh.shareId}`, newValue: false, detail: `Share ${sh.shareId} for ${sh.verifierName} expired and access ended automatically.` });
        }
      }
    }
    for (const r of l.requests) if (r.status === "PENDING" && new Date(r.expiresAt).getTime() <= now) r.status = "EXPIRED";

    const out = fn(l, s, emitAs(actor));
    l.lastUpdated = new Date().toISOString();
    return { value: l, result: out };
  });

  const entries: AuditEntry[] = [];
  for (const e of events) entries.push(await appendAudit(store, e));
  return { result, entries };
}

/** The statutory gates every grant must pass. */
function assertCanGrant(l: StoredLedger, s: StudentRecord) {
  if (l.apaarStatus === "NOGEN_OPTED_OUT") throw new HttpError(409, "Student is in NOGEN (opted-out) status. Re-enrol in APAAR before granting any consent.");
  if (isMinor(s.dob) && l.guardian.coSign !== "SIGNED") {
    throw new HttpError(403, "Guardian co-sign required: Section 9(1) of the DPDP Act requires verifiable consent from a parent or guardian before processing a child's data.");
  }
}

/** The same gates every grant passes, for callers that issue a QR rather than a share. Read-only. */
export async function assertStudentCanShare(store: Store, studentId: string): Promise<void> {
  const l = await getLedger(store, studentId);
  if (l.apaarStatus === "NOGEN_OPTED_OUT") throw new HttpError(409, "Student is in NOGEN (opted-out) status. Re-enrol in APAAR before sharing anything.");
  if (l.isMinor && l.guardian.coSign !== "SIGNED") {
    throw new HttpError(403, "Guardian co-sign required: Section 9(1) of the DPDP Act requires verifiable consent from a parent or guardian before processing a child's data.");
  }
}

/* ── Purposes ────────────────────────────────────────────────────────── */

export async function updatePurpose(store: Store, studentId: string, purpose: string, allow: boolean, actor: Actor): Promise<StudentConsentLedger> {
  if (!(PURPOSE_KEYS as readonly string[]).includes(purpose)) throw new HttpError(400, `Unknown purpose '${purpose}'.`);
  const key = purpose as keyof ConsentPurposes;

  const { result } = await mutate(store, studentId, actor, (l, s, emit) => {
    // Section 9(3) lock: record the attempt, then refuse after the entry is written.
    if (key === "behavioralTracking") {
      emit({
        action: "BEHAVIORAL_TRACKING_BLOCKED",
        purposeModified: key,
        newValue: false,
        detail: "An attempt to change behavioural tracking was refused. Section 9(3) of the DPDP Act prohibits tracking or behavioural monitoring of children and students.",
      });
      return { refused: "Statutory lock: Section 9(3) of the DPDP Act prohibits behavioural tracking, profiling and targeted advertising aimed at students. This purpose cannot be enabled." };
    }
    if (allow) assertCanGrant(l, s);
    else if (l.apaarStatus === "NOGEN_OPTED_OUT") throw new HttpError(409, "Student is in NOGEN (opted-out) status. Re-enrol in APAAR before changing purposes.");

    l.purposes[key] = allow;
    emit({ action: allow ? "GRANT" : "REVOKE", purposeModified: key, newValue: allow, detail: `Consent ${allow ? "granted" : "withdrawn"} for purpose '${key}'.` });
    return { refused: null as string | null };
  });
  if (result.refused) throw new HttpError(400, result.refused);
  return getLedger(store, studentId);
}

/* ── Time-bound shares ───────────────────────────────────────────────── */

export async function grantShare(
  store: Store,
  studentId: string,
  opts: { verifierId: string; scopes?: ShareScope[]; days?: number },
  actor: Actor
): Promise<{ ledger: StudentConsentLedger; share: ConsentShare }> {
  const verifier = KNOWN_VERIFIERS.find((v) => v.id === opts.verifierId);
  if (!verifier) throw new HttpError(400, `Unknown verifier '${opts.verifierId}'.`);

  const { result } = await mutate(store, studentId, actor, (l, s, emit) => {
    assertCanGrant(l, s);
    const existing = l.shares.find((x) => x.verifierId === verifier.id && x.status === "ACTIVE");
    if (existing) return existing;

    const days = Math.min(365, Math.max(1, Math.round(opts.days ?? DEFAULT_SHARE_DAYS)));
    const grantedAt = new Date();
    const share: ConsentShare = {
      shareId: `SHR-${String(l.shares.length + 1).padStart(3, "0")}`,
      verifierId: verifier.id,
      verifierName: verifier.name,
      scopes: opts.scopes?.length ? opts.scopes : DEFAULT_SHARE_SCOPES,
      days,
      grantedAt: grantedAt.toISOString(),
      expiresAt: new Date(grantedAt.getTime() + days * DAY_MS).toISOString(),
      status: "ACTIVE",
    };
    l.shares.push(share);
    emit({
      action: "SHARE_GRANTED",
      purposeModified: `share:${share.shareId}`,
      newValue: true,
      detail: `Shared ${share.scopes.map((x) => SHARE_SCOPE_LABELS[x]).join(", ")} with ${verifier.name} for ${days} days. Access ends automatically on ${share.expiresAt.slice(0, 10)}.`,
    });
    return share;
  });
  return { ledger: await getLedger(store, studentId), share: result };
}

export async function revokeShare(store: Store, studentId: string, shareId: string, actor: Actor): Promise<{ ledger: StudentConsentLedger; share: ConsentShare }> {
  const { result } = await mutate(store, studentId, actor, (l, _s, emit) => {
    const share = l.shares.find((x) => x.shareId === shareId);
    if (!share) throw new HttpError(404, `No share with id '${shareId}'.`);
    if (share.status !== "ACTIVE") throw new HttpError(409, `Share ${shareId} is already ${share.status.toLowerCase()}.`);
    share.status = "REVOKED";
    share.revokedAt = new Date().toISOString();
    emit({ action: "SHARE_REVOKED", purposeModified: `share:${share.shareId}`, newValue: false, detail: `Sharing with ${share.verifierName} withdrawn before expiry.` });
    return share;
  });
  return { ledger: await getLedger(store, studentId), share: result };
}

/** The live share for a verifier, or undefined. Read-only. */
export async function getActiveShare(store: Store, studentId: string, verifierId: string): Promise<ConsentShare | undefined> {
  const l = await getLedger(store, studentId);
  return l.shares.find((x) => x.verifierId === verifierId && x.effective);
}

/* ── Verifier requests ───────────────────────────────────────────────── */

export async function createShareRequest(
  store: Store,
  studentId: string,
  opts: { verifierId: string; scopes?: ShareScope[]; purpose?: string; days?: number },
  actor: Actor
): Promise<{ request: ShareRequest }> {
  const verifier = KNOWN_VERIFIERS.find((v) => v.id === opts.verifierId);
  if (!verifier) throw new HttpError(400, `Unknown verifier '${opts.verifierId}'.`);

  const { result } = await mutate(store, studentId, actor, (l, _s, emit) => {
    const pending = l.requests.find((r) => r.verifierId === verifier.id && r.status === "PENDING");
    if (pending) return pending;

    const scopes = opts.scopes?.length ? opts.scopes : DEFAULT_SHARE_SCOPES;
    const days = Math.min(365, Math.max(1, Math.round(opts.days ?? DEFAULT_SHARE_DAYS)));
    const createdAt = new Date();
    const request: ShareRequest = {
      requestId: `REQ-${String(l.requests.length + 1).padStart(3, "0")}`,
      verifierId: verifier.id,
      verifierName: verifier.name,
      scopes,
      days,
      purpose: opts.purpose ?? "Employment verification",
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + DAY_MS).toISOString(),
      status: "PENDING",
      messageText: `APAAR: ${verifier.name} asks to verify ${scopes.map((x) => SHARE_SCOPE_LABELS[x]).join(", ")} for ${days} days. Reply YES to allow or NO to refuse. No marksheet or ID number is shared.`,
    };
    l.requests.push(request);
    emit({ action: "SHARE_REQUESTED", purposeModified: `request:${request.requestId}`, detail: `${verifier.name} asked for access for '${request.purpose}'. Waiting for the student's answer.` });
    return request;
  });
  return { request: result };
}

export async function respondToRequest(
  store: Store,
  studentId: string,
  requestId: string,
  approve: boolean,
  via: ShareRequest["respondedVia"],
  actor: Actor
): Promise<{ ledger: StudentConsentLedger; request: ShareRequest; share?: ConsentShare }> {
  let granted: ConsentShare | undefined;
  const { result } = await mutate(store, studentId, actor, (l, s, emit) => {
    const request = l.requests.find((r) => r.requestId === requestId);
    if (!request) throw new HttpError(404, `No request with id '${requestId}'.`);
    if (request.status !== "PENDING") throw new HttpError(409, `Request ${requestId} is already ${request.status.toLowerCase()}.`);

    if (approve) {
      // Throws (leaving the request pending) when the guardian gate or NOGEN blocks the grant.
      assertCanGrant(l, s);
      const verifier = KNOWN_VERIFIERS.find((v) => v.id === request.verifierId)!;
      const grantedAt = new Date();
      const share: ConsentShare = {
        shareId: `SHR-${String(l.shares.length + 1).padStart(3, "0")}`,
        verifierId: verifier.id,
        verifierName: verifier.name,
        scopes: request.scopes,
        days: request.days,
        grantedAt: grantedAt.toISOString(),
        expiresAt: new Date(grantedAt.getTime() + request.days * DAY_MS).toISOString(),
        status: "ACTIVE",
      };
      l.shares.push(share);
      request.status = "APPROVED";
      granted = share;
      emit({
        action: "SHARE_GRANTED",
        purposeModified: `share:${share.shareId}`,
        newValue: true,
        detail: `Allowed ${verifier.name} to see ${share.scopes.map((x) => SHARE_SCOPE_LABELS[x]).join(", ")} for ${request.days} days, answering by ${via ?? "APP"}.`,
      });
    } else {
      request.status = "DENIED";
      emit({ action: "SHARE_DENIED", purposeModified: `request:${request.requestId}`, newValue: false, detail: `Student refused ${request.verifierName}'s request.` });
    }
    request.respondedAt = new Date().toISOString();
    request.respondedVia = via;
    return request;
  });
  return { ledger: await getLedger(store, studentId), request: result, share: granted };
}

/* ── Guardian co-sign (Section 9(1)) ─────────────────────────────────── */

export async function setGuardianCoSign(store: Store, studentId: string, sign: boolean, actor: Actor): Promise<StudentConsentLedger> {
  await mutate(store, studentId, actor, (l, s, emit) => {
    if (!isMinor(s.dob)) throw new HttpError(409, "Guardian co-sign only applies when the student is under 18.");
    if (sign === (l.guardian.coSign === "SIGNED")) throw new HttpError(409, `Guardian co-sign is already ${sign ? "signed" : "not signed"}.`);

    if (sign) {
      l.guardian.coSign = "SIGNED";
      l.guardian.signedAt = new Date().toISOString();
      emit({ action: "GUARDIAN_COSIGN", purposeModified: "guardianCoSign", newValue: true, detail: "Parent or guardian gave verifiable consent under Section 9(1)." });
      return;
    }
    // Withdrawing guardian consent ends everything that depended on it.
    for (const sh of l.shares.filter((x) => x.status === "ACTIVE")) {
      sh.status = "REVOKED";
      sh.revokedAt = new Date().toISOString();
    }
    l.guardian.coSign = "PENDING";
    delete l.guardian.signedAt;
    emit({ action: "GUARDIAN_COSIGN_WITHDRAWN", purposeModified: "guardianCoSign", newValue: false, detail: "Guardian withdrew consent. All active shares were revoked." });
  });
  return getLedger(store, studentId);
}

/* ── NOGEN opt-out ───────────────────────────────────────────────────── */

export async function toggleOptOutNogen(
  store: Store,
  studentId: string,
  optOut: boolean,
  actor: Actor
): Promise<{ ledger: StudentConsentLedger; receipt: NogenReceipt | null }> {
  if (!optOut) {
    await mutate(store, studentId, actor, (l, _s, emit) => {
      l.apaarStatus = "ACTIVE";
      l.purposes.abcCreditSync = true;
      l.purposes.aicteEnrolmentCount = true;
      l.purposes.employerVerification = true;
      l.purposes.behavioralTracking = false;
      l.nogenReceipt = null;
      emit({ action: "OPT_IN_RESTORE", purposeModified: "NOGEN_STATUS", newValue: false, detail: "Student chose to re-enrol in APAAR. Shares must be granted again." });
    });
    return { ledger: await getLedger(store, studentId), receipt: null };
  }

  const { result: sharesRevoked, entries } = await mutate(store, studentId, actor, (l, _s, emit) => {
    let revoked = 0;
    for (const sh of l.shares.filter((x) => x.status === "ACTIVE")) {
      sh.status = "REVOKED";
      sh.revokedAt = new Date().toISOString();
      revoked++;
      emit({ action: "SHARE_REVOKED", purposeModified: `share:${sh.shareId}`, newValue: false, detail: `Share with ${sh.verifierName} ended by NOGEN opt-out.` });
    }
    l.apaarStatus = "NOGEN_OPTED_OUT";
    l.purposes.abcCreditSync = false;
    l.purposes.employerVerification = false;
    emit({ action: "OPT_OUT_NOGEN", purposeModified: "NOGEN_STATUS", newValue: true, detail: "Student withdrew from APAAR (NOGEN). Opting out must not lead to denial of admission, examination or services." });
    return revoked;
  });

  const s = student(studentId);
  const optOutEntry = entries[entries.length - 1];
  const receiptId = `NOGEN-${optOutEntry.timestamp.slice(0, 10).replace(/-/g, "")}-${optOutEntry.sha256Hash.slice(0, 8).toUpperCase()}`;
  const receipt: NogenReceipt = {
    receiptId,
    studentId,
    issuedAt: optOutEntry.timestamp,
    statement: `${s.name} (${s.roll}) opted out of APAAR on ${optOutEntry.timestamp.slice(0, 10)}. All verifier shares were revoked and cloud sync stopped. Services must not be withheld because of this choice.`,
    legalBasis: [
      "Digital Personal Data Protection Act, 2023: right to withdraw consent",
      "Puttaswamy (Aadhaar) 2018: identity schemes may not be forced as a condition of services",
    ],
    sharesRevoked,
    auditSeq: optOutEntry.seq,
    auditHash: optOutEntry.sha256Hash,
    signature: hmacHex(`${receiptId}|${studentId}|${optOutEntry.timestamp}|${optOutEntry.sha256Hash}`, "nogen-receipt"),
  };
  await store.update<StoredLedger, void>(NS.consent, studentId, (cur) => {
    if (!cur) return { value: undefined, result: undefined };
    cur.nogenReceipt = receipt;
    return { value: cur, result: undefined };
  });
  return { ledger: await getLedger(store, studentId), receipt };
}

/* ── Disputes ────────────────────────────────────────────────────────── */

export async function raiseDispute(
  store: Store,
  studentId: string,
  opts: { field: string; claimedValue: string; reason: string },
  actor: Actor
): Promise<{ ledger: StudentConsentLedger; dispute: DataDispute }> {
  const { result } = await mutate(store, studentId, actor, (l, _s, emit) => {
    const raisedAt = new Date();
    const dispute: DataDispute = {
      ticketId: `DSP-${String(l.disputes.length + 1).padStart(4, "0")}`,
      field: opts.field.trim(),
      claimedValue: opts.claimedValue.trim(),
      reason: opts.reason.trim(),
      raisedAt: raisedAt.toISOString(),
      acknowledgeBy: new Date(raisedAt.getTime() + 2 * DAY_MS).toISOString(), // platform SLA, not a statutory period
      status: "OPEN",
    };
    l.disputes.push(dispute);
    emit({ type: "DISPUTE", action: "DISPUTE_RAISED", purposeModified: `dispute:${dispute.ticketId}:${dispute.field}`, detail: `Student disputes '${dispute.field}' and asks for correction (DPDP Act right to correction and grievance redressal).` });
    return dispute;
  });
  return { ledger: await getLedger(store, studentId), dispute: result };
}

export interface DisputeRow extends DataDispute {
  studentId: string;
  studentName: string;
  studentRoll: string;
  /** View-only: the acknowledgement deadline has passed and the ticket is still open. */
  overdue: boolean;
}

/** Every dispute across students, newest first. Read-only. For the registrar's inbox. */
export async function listAllDisputes(store: Store): Promise<DisputeRow[]> {
  const rows: DisputeRow[] = [];
  const now = Date.now();
  for (const s of STUDENTS) {
    const l = await getLedger(store, s.id);
    for (const d of l.disputes) {
      rows.push({ ...d, studentId: s.id, studentName: s.name, studentRoll: s.roll, overdue: d.status === "OPEN" && new Date(d.acknowledgeBy).getTime() < now });
    }
  }
  return rows.sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
}

/** The registrar closes a ticket with a written reason. The student sees the outcome in their wallet. */
export async function resolveDispute(
  store: Store,
  studentId: string,
  ticketId: string,
  decision: "RESOLVED" | "REJECTED",
  resolution: string,
  actor: Actor
): Promise<DataDispute> {
  const { result } = await mutate(store, studentId, actor, (l, _s, emit) => {
    const d = l.disputes.find((x) => x.ticketId === ticketId);
    if (!d) throw new HttpError(404, `No dispute ${ticketId}.`);
    if (d.status !== "OPEN") throw new HttpError(409, `Dispute ${ticketId} is already ${d.status.toLowerCase()}.`);
    d.status = decision;
    d.resolution = resolution.trim();
    d.resolvedAt = new Date().toISOString();
    d.resolvedBy = actor.label;
    emit({ type: "DISPUTE", action: `DISPUTE_${decision}`, purposeModified: `dispute:${d.ticketId}:${d.field}`, newValue: decision === "RESOLVED", detail: `${actor.label} ${decision === "RESOLVED" ? "resolved" : "rejected"} the dispute about '${d.field}'. Reason: ${d.resolution}` });
    return d;
  });
  return result;
}

/* ── Helpers for other modules ───────────────────────────────────────── */

export const allStudentIds = () => STUDENTS.map((s) => s.id);
