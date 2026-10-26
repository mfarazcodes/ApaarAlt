/**
 * The Postgres schema. db/001_init.sql carries the same statement for people who run migrations by hand;
 * a test keeps the two identical.
 */
export const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS kv (
  ns         text        NOT NULL,
  key        text        NOT NULL,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ns, key)
);
CREATE INDEX IF NOT EXISTS kv_ns_idx ON kv (ns);`;
