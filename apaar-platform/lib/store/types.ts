/**
 * A small document store. Every piece of demo state (consent ledgers, the credential registry,
 * sync state, the audit chain, rate-limit windows, sync jobs) is a JSON document under a namespace and a key.
 *
 * Two implementations: in-memory for local development, Postgres when DATABASE_URL is set.
 */
export interface Store {
  readonly kind: "memory" | "postgres";

  get<T>(ns: string, key: string): Promise<T | undefined>;

  set<T>(ns: string, key: string, value: T): Promise<void>;

  /**
   * Atomic read-modify-write on one document. Concurrent updates to the same key run one after another,
   * so two requests can never both read the same old value. Return the new document and a result.
   * Returning `undefined` as the value leaves the stored document untouched.
   */
  update<T, R>(ns: string, key: string, fn: (current: T | undefined) => { value: T | undefined; result: R }): Promise<R>;

  list<T>(ns: string): Promise<{ key: string; value: T }[]>;

  delete(ns: string, key: string): Promise<void>;

  /** Removes every document in these namespaces. Used by the admin "reset demo data" action. */
  clear(namespaces: string[]): Promise<void>;
}

/** Namespaces in use. Listed once so a reset can name them. */
export const NS = {
  consent: "consent",
  audit: "audit",
  credentials: "credentials",
  sync: "sync",
  fuzzy: "fuzzy",
  disputes: "disputes",
  rate: "ratelimit",
  jobs: "jobs",
} as const;

/** Namespaces that hold demo data and are wiped by a reset. Rate-limit counters are left alone. */
export const DEMO_NAMESPACES = [NS.consent, NS.audit, NS.credentials, NS.sync, NS.fuzzy, NS.disputes, NS.jobs];
