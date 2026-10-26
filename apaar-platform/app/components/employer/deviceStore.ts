import type { TrustedKey } from "@/lib/qrVerify";

/**
 * What the verifier keeps on its own device so it can work with no network:
 * the issuer's public keys (localStorage) and a queue of offline checks waiting to be reported (IndexedDB).
 */

const KEYS = "apaar-issuer-keys";

export interface CachedKeys {
  keys: TrustedKey[];
  fetchedAt: string;
  verifierId: string | null;
}

export function saveKeys(keys: TrustedKey[], verifierId: string | null): CachedKeys {
  const cached: CachedKeys = { keys, fetchedAt: new Date().toISOString(), verifierId };
  try {
    localStorage.setItem(KEYS, JSON.stringify(cached));
  } catch {
    /* storage can be blocked; this visit still works online */
  }
  return cached;
}

export function loadKeys(): CachedKeys | null {
  try {
    const raw = localStorage.getItem(KEYS);
    return raw ? (JSON.parse(raw) as CachedKeys) : null;
  } catch {
    return null;
  }
}

/* ── Offline event queue (IndexedDB) ─────────────────────────────────── */

export interface OfflineEvent {
  id: string;
  /** Who was signed in on this device. Events are only reported under the same verifier. */
  verifierId: string;
  cid: string;
  status: "AUTHENTIC" | "EXPIRED" | "INVALID_SIGNATURE" | "NOT_FOUND";
  checkedAt: string;
  kid?: string;
  engine?: "webcrypto" | "noble";
}

const DB_NAME = "apaar-verifier";
const STORE = "events";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const newEventId = () => `evt-${crypto.randomUUID()}`;

export async function queueEvent(e: OfflineEvent): Promise<void> {
  await tx("readwrite", (s) => s.put(e));
}

export async function pendingEvents(verifierId?: string): Promise<OfflineEvent[]> {
  const all = await tx<OfflineEvent[]>("readonly", (s) => s.getAll());
  return verifierId ? all.filter((e) => e.verifierId === verifierId) : all;
}

export async function removeEvents(ids: string[]): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      ids.forEach((id) => t.objectStore(STORE).delete(id));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}
