import { SCHEMA_SQL } from "./schema";
import type { Store } from "./types";

/**
 * The only thing the store needs from a Postgres driver. postgres.js backs it in production, and
 * PGlite (Postgres compiled to WebAssembly) backs it in tests, so the same SQL runs in both.
 */
export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<R>(fn: (tx: Pick<SqlClient, "query">) => Promise<R>): Promise<R>;
}

export class PostgresStore implements Store {
  readonly kind = "postgres" as const;
  private ready: Promise<void> | null = null;

  constructor(private sql: SqlClient) {}

  /** Creates the table on first use. Safe to call on every request. */
  private init(): Promise<void> {
    this.ready ??= (async () => {
      for (const statement of SCHEMA_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
        await this.sql.query(statement);
      }
    })();
    return this.ready;
  }

  async get<T>(ns: string, key: string): Promise<T | undefined> {
    await this.init();
    const rows = await this.sql.query<{ value: T }>("SELECT value FROM kv WHERE ns = $1 AND key = $2", [ns, key]);
    return rows[0]?.value;
  }

  async set<T>(ns: string, key: string, value: T): Promise<void> {
    await this.update<T, void>(ns, key, () => ({ value, result: undefined }));
  }

  async update<T, R>(ns: string, key: string, fn: (current: T | undefined) => { value: T | undefined; result: R }): Promise<R> {
    await this.init();
    return this.sql.transaction(async (tx) => {
      // An advisory lock serialises writers even when the row does not exist yet, which FOR UPDATE cannot do.
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${ns}:${key}`]);
      const rows = await tx.query<{ value: T }>("SELECT value FROM kv WHERE ns = $1 AND key = $2", [ns, key]);
      const { value, result } = fn(rows[0]?.value);
      if (value !== undefined) {
        await tx.query(
          `INSERT INTO kv (ns, key, value) VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (ns, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [ns, key, JSON.stringify(value)]
        );
      }
      return result;
    });
  }

  async list<T>(ns: string): Promise<{ key: string; value: T }[]> {
    await this.init();
    return this.sql.query<{ key: string; value: T }>("SELECT key, value FROM kv WHERE ns = $1 ORDER BY key", [ns]);
  }

  async delete(ns: string, key: string): Promise<void> {
    await this.init();
    await this.sql.query("DELETE FROM kv WHERE ns = $1 AND key = $2", [ns, key]);
  }

  async clear(namespaces: string[]): Promise<void> {
    await this.init();
    await this.sql.query("DELETE FROM kv WHERE ns = ANY($1::text[])", [namespaces]);
  }
}
