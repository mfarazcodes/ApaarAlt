import crypto from "crypto";
import { NS, type Store } from "./store/types";
import { getIssuerKeySet, signText, verifyText, type IssuerKey } from "./tokenization";

/**
 * One tamper-evident log for everything that matters: consent, fuzzy-match decisions, NAD syncs, grade
 * changes and disputes.
 *
 * Each entry stores SHA-256 over its own fields and the entry before it. The chain head (last sequence
 * number and hash) is signed with the issuer's Ed25519 key after every append. That closes the gap a plain
 * hash chain leaves open: someone with database access can recompute every hash after an edit, or cut off
 * the end of the log, but cannot re-sign the head without the key.
 */

export type AuditType = "CONSENT" | "FUZZY_DECISION" | "NAD_SYNC" | "GRADE_CHANGE" | "DISPUTE" | "SYSTEM";
export type AuditActorRole = "STUDENT" | "GUARDIAN" | "REGISTRAR" | "AICTE" | "VERIFIER" | "SYSTEM" | "DEMO_SIMULATOR";

export const AUDIT_TYPES: AuditType[] = ["CONSENT", "FUZZY_DECISION", "NAD_SYNC", "GRADE_CHANGE", "DISPUTE", "SYSTEM"];

export interface AuditInput {
  type: AuditType;
  /** A pseudonymous subject: a student id, a case id, or SYSTEM. Never a name or an ID number. */
  subject: string;
  action: string;
  actorRole: AuditActorRole;
  /** Taken from the session on the server. Never from a request body. */
  actor: string;
  detail: string;
  purposeModified?: string;
  newValue?: boolean;
}

export interface AuditEntry extends AuditInput {
  logId: string;
  seq: number;
  timestamp: string;
  previousHash: string;
  sha256Hash: string;
}

export interface ChainHead {
  seq: number;
  hash: string;
  signature: string;
  kid: string;
  signedAt: string;
}

export interface ChainDoc {
  entries: AuditEntry[];
  head: ChainHead | null;
}

export const GENESIS_HASH = "0".repeat(64);
const CHAIN_KEY = "main";

/** JSON of an ordered tuple, so no field value can be confused with a separator. */
export function computeEntryHash(previousHash: string, e: Omit<AuditEntry, "sha256Hash" | "previousHash" | "logId">): string {
  const tuple = [previousHash, e.seq, e.timestamp, e.type, e.subject, e.action, e.actorRole, e.actor, e.detail, e.purposeModified ?? null, e.newValue ?? null];
  return crypto.createHash("sha256").update(JSON.stringify(tuple)).digest("hex");
}

const headText = (seq: number, hash: string) => `apaar-audit-head:${seq}:${hash}`;

export async function appendAudit(store: Store, input: AuditInput): Promise<AuditEntry> {
  return store.update<ChainDoc, AuditEntry>(NS.audit, CHAIN_KEY, (cur) => {
    const doc: ChainDoc = cur ?? { entries: [], head: null };
    const previous = doc.entries[doc.entries.length - 1];
    const seq = (previous?.seq ?? 0) + 1;
    const body = { ...input, seq, timestamp: new Date().toISOString() };
    const previousHash = previous?.sha256Hash ?? GENESIS_HASH;
    const entry: AuditEntry = { ...body, logId: `AUDIT-${String(seq).padStart(4, "0")}`, previousHash, sha256Hash: computeEntryHash(previousHash, body) };
    doc.entries.push(entry);
    const { signature, kid } = signText(headText(seq, entry.sha256Hash));
    doc.head = { seq, hash: entry.sha256Hash, signature, kid, signedAt: entry.timestamp };
    return { value: doc, result: entry };
  });
}

export async function readChain(store: Store): Promise<ChainDoc> {
  return (await store.get<ChainDoc>(NS.audit, CHAIN_KEY)) ?? { entries: [], head: null };
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  brokenAtIndex?: number;
  reason?: string;
  head: "valid" | "invalid" | "missing" | "unknown-key" | "mismatch" | "not-checked";
  headKid?: string;
}

/**
 * Recomputes every hash and link, then checks that the signed head matches the last entry.
 * `head` is optional so a caller can verify a set of entries on their own, for example a tampered copy.
 */
export function verifyChain(entries: AuditEntry[], head?: ChainHead | null, keySet?: Pick<IssuerKey, "kid" | "publicKeyPem">[]): ChainVerification {
  let expectedPrevious = GENESIS_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.previousHash !== expectedPrevious) {
      return { valid: false, checked: i, brokenAtIndex: i, reason: `${e.logId}: the link to the entry before it does not match.`, head: "not-checked" };
    }
    if (computeEntryHash(e.previousHash, e) !== e.sha256Hash) {
      return { valid: false, checked: i, brokenAtIndex: i, reason: `${e.logId}: contents no longer match the stored hash. The entry was altered.`, head: "not-checked" };
    }
    expectedPrevious = e.sha256Hash;
  }

  if (head === undefined) return { valid: true, checked: entries.length, head: "not-checked" };
  if (head === null) {
    return entries.length === 0
      ? { valid: true, checked: 0, head: "missing" }
      : { valid: false, checked: entries.length, reason: "The log has entries but no signed head.", head: "missing" };
  }

  const last = entries[entries.length - 1];
  if (!last || last.seq !== head.seq || last.sha256Hash !== head.hash) {
    return {
      valid: false,
      checked: entries.length,
      reason: `The signed head says entry ${head.seq} is the last, but the log ends at ${last ? last.seq : 0}. Entries were removed or added after the head was signed.`,
      head: "mismatch",
      headKid: head.kid,
    };
  }
  const keys = keySet ?? getIssuerKeySet();
  if (!keys.some((k) => k.kid === head.kid)) {
    return { valid: false, checked: entries.length, reason: `The head was signed with key '${head.kid}', which is not a known key.`, head: "unknown-key", headKid: head.kid };
  }
  if (!verifyText(headText(head.seq, head.hash), head.signature, head.kid, keys)) {
    return { valid: false, checked: entries.length, reason: "The head signature does not verify. The log was rewritten without the signing key.", head: "invalid", headKid: head.kid };
  }
  return { valid: true, checked: entries.length, head: "valid", headKid: head.kid };
}

export interface AuditQuery {
  type?: AuditType;
  subject?: string;
  limit?: number;
}

export async function listAudit(store: Store, q: AuditQuery = {}): Promise<{ entries: AuditEntry[]; total: number; chain: ChainVerification }> {
  const doc = await readChain(store);
  const chain = verifyChain(doc.entries, doc.head);
  let entries = doc.entries;
  if (q.type) entries = entries.filter((e) => e.type === q.type);
  if (q.subject) entries = entries.filter((e) => e.subject === q.subject);
  const total = entries.length;
  return { entries: q.limit ? entries.slice(-q.limit) : entries, total, chain };
}
