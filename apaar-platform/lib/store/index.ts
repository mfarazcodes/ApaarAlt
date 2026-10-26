import postgres from "postgres";
import { MemoryStore } from "./memory";
import { PostgresStore, type SqlClient } from "./postgres";
import type { Store } from "./types";

export * from "./types";
export { MemoryStore } from "./memory";
export { PostgresStore, type SqlClient } from "./postgres";

/** Adapts postgres.js to the small SqlClient interface. */
function postgresJsClient(url: string): SqlClient {
  const sql = postgres(url, { max: 5, idle_timeout: 20, prepare: false });
  const wrap = (q: Pick<typeof sql, "unsafe">): Pick<SqlClient, "query"> => ({
    query: async <T>(text: string, params: unknown[] = []) => (await q.unsafe(text, params as never[])) as unknown as T[],
  });
  return {
    ...wrap(sql),
    transaction: (fn) => sql.begin((tx) => fn(wrap(tx))) as Promise<never>,
  };
}

const g = globalThis as typeof globalThis & { __apaarStore?: Store };

/** One store per process. Postgres when DATABASE_URL is set, otherwise in-memory. */
export function getStore(): Store {
  if (!g.__apaarStore) {
    const url = process.env.DATABASE_URL;
    g.__apaarStore = url ? new PostgresStore(postgresJsClient(url)) : new MemoryStore();
  }
  return g.__apaarStore;
}

/** For tests: swap the process store. */
export function setStore(store: Store | undefined) {
  g.__apaarStore = store;
}
