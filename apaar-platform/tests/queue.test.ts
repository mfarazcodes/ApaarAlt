import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, afterEach, afterAll } from "vitest";
import { GET as queueGet, POST as queuePost } from "@/app/api/queue/route";
import { GET as drainGet, POST as drainPost } from "@/app/api/queue/drain/route";
import { readChain } from "@/lib/audit";
import { BACKOFF_BASE_MS, BACKOFF_CAP_MS, MAX_ATTEMPTS, backoffMs, drainJobs, enqueueJob, listJobs, requeueJob, setNadOnline } from "@/lib/jobs";
import { rateLimit } from "@/lib/ratelimit";
import { seedDemoData } from "@/lib/seed";
import { MemoryStore, PostgresStore, getStore, NS, type SqlClient } from "@/lib/store";
import { call, freshStoreEachTest } from "./helpers";

freshStoreEachTest();

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

const actor = { role: "REGISTRAR" as const, label: "Test registrar" };
const T0 = Date.parse("2026-10-27T12:00:00Z");

describe("F8: backoff", () => {
  it("doubles from 2 seconds and stops at 60", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(backoffMs)).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    expect(backoffMs(0)).toBe(BACKOFF_BASE_MS);
    expect(backoffMs(99)).toBe(BACKOFF_CAP_MS);
  });
});

describe("F8: the queue engine", () => {
  it("sends a batch straight through when NAD is reachable", async () => {
    const store = getStore();
    await enqueueJob(store, { records: 120 }, actor, T0);
    const r = await drainJobs(store, actor, T0);
    expect(r).toMatchObject({ attempted: 1, succeeded: 1, retrying: 0, dead: 0 });
    expect((await listJobs(store)).jobs[0]).toMatchObject({ status: "DONE", attempts: 1 });
  });

  it("holds a batch back during an outage, retrying later and later, then dead-letters it", async () => {
    const store = getStore();
    await setNadOnline(store, false, actor);
    const job = await enqueueJob(store, { records: 50 }, actor, T0);

    let now = T0;
    const waits: number[] = [];
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const r = await drainJobs(store, actor, now);
      expect(r.retrying).toBe(1);
      const j = (await listJobs(store)).jobs.find((x) => x.id === job.id)!;
      expect(j.status).toBe("RETRYING");
      expect(j.attempts).toBe(attempt);
      waits.push(new Date(j.nextRunAt).getTime() - now);
      // Before its time, a drain leaves it alone.
      const early = await drainJobs(store, actor, now + 1);
      expect(early).toMatchObject({ attempted: 0, notYetDue: 1 });
      now = new Date(j.nextRunAt).getTime();
    }
    expect(waits).toEqual([2000, 4000, 8000, 16000]);

    const last = await drainJobs(store, actor, now);
    expect(last).toMatchObject({ attempted: 1, dead: 1, deadIds: [job.id] });
    const dead = (await listJobs(store)).jobs[0];
    expect(dead).toMatchObject({ status: "DEAD", attempts: MAX_ATTEMPTS, lastError: "NAD did not respond." });
    // A dead job is never attempted again on its own.
    expect((await drainJobs(store, actor, now + 10 * 60_000)).attempted).toBe(0);
    // A person is told: the dead-letter is in the audit log.
    expect((await readChain(store)).entries.some((e) => e.action === "SYNC_JOB_DEAD" && e.subject === job.id)).toBe(true);
  });

  it("recovers: when NAD comes back, waiting batches go through on their next run", async () => {
    const store = getStore();
    await setNadOnline(store, false, actor);
    await enqueueJob(store, { records: 10 }, actor, T0);
    await drainJobs(store, actor, T0);
    await setNadOnline(store, true, actor);
    const later = T0 + 5000;
    expect(await drainJobs(store, actor, later)).toMatchObject({ succeeded: 1 });
    expect((await listJobs(store)).jobs[0].status).toBe("DONE");
    const actions = (await readChain(store)).entries.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["NAD_OUTAGE_SIMULATED", "NAD_RESTORED"]));
  });

  it("is safe to drain from many places at once: each batch is attempted exactly once per run", async () => {
    const store = getStore();
    await setNadOnline(store, false, actor);
    for (let i = 0; i < 5; i++) await enqueueJob(store, { records: 1 }, actor, T0);
    const runs = await Promise.all(Array.from({ length: 8 }, () => drainJobs(store, actor, T0)));
    expect(runs.reduce((n, r) => n + r.attempted, 0)).toBe(5);
    expect((await listJobs(store)).jobs.every((j) => j.attempts === 1)).toBe(true);
  });

  it("lets a person put a dead job back, and refuses anything else", async () => {
    const store = getStore();
    await setNadOnline(store, false, actor);
    const job = await enqueueJob(store, { records: 1 }, actor, T0);
    let now = T0;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await drainJobs(store, actor, now);
      const j = (await listJobs(store)).jobs[0];
      now = new Date(j.nextRunAt).getTime();
    }
    expect((await listJobs(store)).jobs[0].status).toBe("DEAD");
    await requeueJob(store, job.id, actor, now);
    expect((await listJobs(store)).jobs[0]).toMatchObject({ status: "QUEUED", attempts: 0 });
    await expect(requeueJob(store, job.id, actor)).rejects.toThrow(/not dead-lettered/);
    await expect(requeueJob(store, "JOB-9999", actor)).rejects.toThrow(/No job/);
  });

  it("limits a batch's size and keeps the finished history bounded", async () => {
    const store = getStore();
    await expect(enqueueJob(store, { records: 0 }, actor)).rejects.toThrow();
    await expect(enqueueJob(store, { records: 5001 }, actor)).rejects.toThrow();
    for (let i = 0; i < 70; i++) await enqueueJob(store, { records: 1 }, actor, T0);
    await drainJobs(store, actor, T0, 100);
    expect((await listJobs(store)).jobs.length).toBeLessThanOrEqual(50);
  });
});

describe("F8: the queue routes", () => {
  it("is the registrar's alone", async () => {
    for (const as of ["student-rahul", "aicte", "verifier-acme", "guardian-meera"]) {
      expect((await call(queueGet, { as })).status, as).toBe(403);
      expect((await call(queuePost, { as, body: { action: "ENQUEUE" } })).status, as).toBe(403);
    }
    expect((await call(queueGet)).status).toBe(401);
  });

  it("runs the whole flow through the API", async () => {
    await call(queuePost, { as: "registrar", body: { action: "SET_NAD", online: false } });
    const added = await call(queuePost, { as: "registrar", body: { action: "ENQUEUE", records: 120, label: "Sem 5 batch" } });
    expect(added.json.counts.QUEUED).toBe(1);
    const drained = await call(queuePost, { as: "registrar", body: { action: "DRAIN" } });
    expect(drained.json.drained).toMatchObject({ attempted: 1, retrying: 1 });
    expect(drained.json.jobs[0]).toMatchObject({ status: "RETRYING", label: "Sem 5 batch" });
    expect(drained.json.nadOnline).toBe(false);
    expect(drained.json.config.maxAttempts).toBe(5);
  });

  it("rejects bad input with 400", async () => {
    expect((await call(queuePost, { as: "registrar", body: { action: "ENQUEUE", records: 0 } })).status).toBe(400);
    expect((await call(queuePost, { as: "registrar", body: { action: "ENQUEUE", records: 999999 } })).status).toBe(400);
    expect((await call(queuePost, { as: "registrar", body: { action: "SET_NAD" } })).status).toBe(400);
    expect((await call(queuePost, { as: "registrar", body: { action: "NOPE" } })).status).toBe(400);
    expect((await call(queuePost, { as: "registrar", body: { action: "REQUEUE", id: "JOB-0404" } })).status).toBe(404);
  });
});

describe("F8: the cron entry point fails closed", () => {
  const enqueue = () => call(queuePost, { as: "registrar", body: { action: "ENQUEUE", records: 5 } });

  it("refuses everyone but a registrar when CRON_SECRET is not set, even with a bearer header", async () => {
    delete process.env.CRON_SECRET;
    expect((await call(drainGet)).status).toBe(401);
    expect((await call(drainGet, { headers: { authorization: "Bearer anything" } })).status).toBe(401);
    expect((await call(drainGet, { headers: { authorization: "Bearer " } })).status).toBe(401);
    expect((await call(drainPost, { as: "student-rahul", body: {} })).status).toBe(403);
    expect((await call(drainPost, { as: "registrar", body: {} })).status).toBe(200);
  });

  it("accepts the right secret and no other", async () => {
    process.env.CRON_SECRET = "s3cret-for-tests";
    await enqueue();
    expect((await call(drainGet, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await call(drainGet, { headers: { authorization: "s3cret-for-tests" } })).status).toBe(401);
    const ok = await call(drainGet, { headers: { authorization: "Bearer s3cret-for-tests" } });
    expect(ok.status).toBe(200);
    expect(ok.json.drained).toMatchObject({ attempted: 1, succeeded: 1 });
  });

  it("prunes old rate-limit counters on a cron run", async () => {
    process.env.CRON_SECRET = "s3cret-for-tests";
    const store = getStore();
    await rateLimit(store, "stale-key", { limit: 5, windowMs: 1000 }, Date.now() - 3 * 60 * 60 * 1000);
    expect(await store.get(NS.rate, "stale-key")).toBeDefined();
    const r = await call(drainGet, { headers: { authorization: "Bearer s3cret-for-tests" } });
    expect(r.json.prunedRateLimits).toBeGreaterThanOrEqual(1);
    expect(await store.get(NS.rate, "stale-key")).toBeUndefined();
  });
});

describe("S7: the seed script's logic works against real Postgres and is safe to repeat", () => {
  const pg = new PGlite();
  const client: SqlClient = {
    query: async <T,>(text: string, params?: unknown[]) => (await pg.query(text, params)).rows as T[],
    transaction: (fn) => pg.transaction((tx) => fn({ query: async <T,>(text: string, params?: unknown[]) => (await tx.query(text, params)).rows as T[] })),
  };
  afterAll(() => pg.close());

  it("seeds every student, the credentials and the sync state, once", async () => {
    const store = new PostgresStore(client);
    const first = await seedDemoData(store);
    expect(first).toMatchObject({ students: 5, syncedStudents: 2 });
    expect(first.credentials).toBeGreaterThanOrEqual(7);
    expect(first.auditEntries).toBe(5); // one LEDGER_CREATED per student

    const second = await seedDemoData(store);
    expect(second).toEqual(first); // nothing duplicated, nothing logged twice

    const keys = (await store.list(NS.consent)).map((r) => r.key);
    expect(keys).toEqual(["STU-AB", "STU-IQ", "STU-MS", "STU-PL", "STU-RKV"]);
    const iq = await store.get<{ apaarStatus: string }>(NS.consent, "STU-IQ");
    expect(iq?.apaarStatus).toBe("NOGEN_OPTED_OUT");
  });

  it("gives the memory store the same result", async () => {
    const a = await seedDemoData(new MemoryStore());
    const b = await seedDemoData(new PostgresStore(client));
    expect(a).toEqual(b);
  });
});
