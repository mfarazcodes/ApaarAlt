import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import { MemoryStore, PostgresStore, type SqlClient, type Store } from "@/lib/store";
import { SCHEMA_SQL } from "@/lib/store/schema";

// PGlite is real Postgres compiled to WebAssembly, so the PostgresStore SQL runs for real here.
const pg = new PGlite();
const client: SqlClient = {
  query: async <T,>(text: string, params?: unknown[]) => (await pg.query(text, params)).rows as T[],
  transaction: (fn) =>
    pg.transaction((tx) => fn({ query: async <T,>(text: string, params?: unknown[]) => (await tx.query(text, params)).rows as T[] })),
};

afterAll(() => pg.close());

const stores: [string, () => Store][] = [
  ["MemoryStore", () => new MemoryStore()],
  ["PostgresStore (PGlite)", () => new PostgresStore(client)],
];

describe.each(stores)("%s", (_name, make) => {
  it("round-trips a document and returns undefined for a missing one", async () => {
    const s = make();
    expect(await s.get("t1", "missing")).toBeUndefined();
    await s.set("t1", "a", { n: 1, nested: { ok: true } });
    expect(await s.get("t1", "a")).toEqual({ n: 1, nested: { ok: true } });
  });

  it("never hands out a reference to stored state", async () => {
    const s = make();
    await s.set("t2", "a", { list: [1] });
    const doc = (await s.get<{ list: number[] }>("t2", "a"))!;
    doc.list.push(2);
    expect((await s.get<{ list: number[] }>("t2", "a"))!.list).toEqual([1]);
  });

  it("makes concurrent updates to one key atomic: 50 parallel increments all land", async () => {
    const s = make();
    await Promise.all(
      Array.from({ length: 50 }, () =>
        s.update<{ n: number }, void>("t3", "counter", (cur) => ({ value: { n: (cur?.n ?? 0) + 1 }, result: undefined }))
      )
    );
    expect((await s.get<{ n: number }>("t3", "counter"))!.n).toBe(50);
  });

  it("returns the updater's result and creates the document when it did not exist", async () => {
    const s = make();
    const result = await s.update<{ id: number }, string>("t4", "new", (cur) => ({ value: { id: (cur?.id ?? 0) + 7 }, result: cur ? "existing" : "created" }));
    expect(result).toBe("created");
    expect(await s.get("t4", "new")).toEqual({ id: 7 });
  });

  it("leaves a document untouched when the updater returns undefined", async () => {
    const s = make();
    await s.set("t5", "a", { keep: true });
    await s.update("t5", "a", () => ({ value: undefined, result: null }));
    expect(await s.get("t5", "a")).toEqual({ keep: true });
  });

  it("does not stall later updates after one throws, and does not write the failed one", async () => {
    const s = make();
    await s.set("t6", "a", { n: 1 });
    await expect(
      s.update("t6", "a", () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    await s.update<{ n: number }, void>("t6", "a", (cur) => ({ value: { n: cur!.n + 1 }, result: undefined }));
    expect(await s.get("t6", "a")).toEqual({ n: 2 });
  });

  it("lists one namespace in key order, and deletes", async () => {
    const s = make();
    await s.set("t7", "b", 2);
    await s.set("t7", "a", 1);
    await s.set("other", "z", 9);
    expect(await s.list<number>("t7")).toEqual([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ]);
    await s.delete("t7", "a");
    expect((await s.list("t7")).map((r) => r.key)).toEqual(["b"]);
  });

  it("clears only the namespaces it is told to", async () => {
    const s = make();
    await s.set("c1", "a", 1);
    await s.set("c2", "a", 2);
    await s.set("keep", "a", 3);
    await s.clear(["c1", "c2"]);
    expect(await s.get("c1", "a")).toBeUndefined();
    expect(await s.get("c2", "a")).toBeUndefined();
    expect(await s.get("keep", "a")).toBe(3);
  });
});

describe("db/001_init.sql", () => {
  it("carries the same statement as the schema constant", () => {
    const file = readFileSync("db/001_init.sql", "utf8");
    const normalize = (t: string) => t.replace(/--.*$/gm, "").replace(/\s+/g, " ").replace(/;\s*$/, "").trim();
    expect(normalize(file)).toBe(normalize(SCHEMA_SQL));
  });
});
