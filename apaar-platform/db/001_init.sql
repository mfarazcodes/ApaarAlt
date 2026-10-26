-- Same statement as lib/store/schema.ts. The store also creates it automatically on first use.
CREATE TABLE IF NOT EXISTS kv (
  ns         text        NOT NULL,
  key        text        NOT NULL,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ns, key)
);
CREATE INDEX IF NOT EXISTS kv_ns_idx ON kv (ns);
