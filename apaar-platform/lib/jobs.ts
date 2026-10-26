import { appendAudit, type AuditActorRole } from "./audit";
import { HttpError } from "./errors";
import { NS, type Store } from "./store/types";

/**
 * A retry queue for pushing synced batches to NAD.
 *
 * A job waits until `nextRunAt`. Each attempt either succeeds, or fails and is retried after an
 * exponentially longer wait, up to MAX_ATTEMPTS, after which it is dead-lettered for a person to look at.
 *
 * `drainJobs` runs as one atomic store update, so two drains at once (a cron call and a click, or two
 * serverless instances) can never both attempt the same job. The NAD call is simulated by a switch
 * ("NAD reachable"), so an outage can be shown on demand. Swapping in a real call means taking a
 * lease on the job first, because a network call cannot run inside an atomic update.
 */

export type JobStatus = "QUEUED" | "RETRYING" | "DONE" | "DEAD";

export interface SyncJob {
  id: string;
  label: string;
  records: number;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  nextRunAt: string;
  createdAt: string;
  createdBy: string;
  lastError?: string;
  completedAt?: string;
}

interface JobsDoc {
  jobs: SyncJob[];
  seq: number;
  nadOnline: boolean;
}

export const MAX_ATTEMPTS = 5;
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_CAP_MS = 60_000;
const KEEP_FINISHED = 50;

/** How long to wait after the nth failed attempt: 2s, 4s, 8s, 16s, capped at 60s. */
export const backoffMs = (failedAttempts: number) => Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failedAttempts - 1));

const KEY = "main";
const fresh = (): JobsDoc => ({ jobs: [], seq: 0, nadOnline: true });
const pad = (n: number) => String(n).padStart(4, "0");

export interface JobsView {
  jobs: SyncJob[];
  nadOnline: boolean;
  counts: Record<JobStatus, number>;
  due: number;
}

function view(doc: JobsDoc, now = Date.now()): JobsView {
  const counts: Record<JobStatus, number> = { QUEUED: 0, RETRYING: 0, DONE: 0, DEAD: 0 };
  for (const j of doc.jobs) counts[j.status]++;
  const due = doc.jobs.filter((j) => (j.status === "QUEUED" || j.status === "RETRYING") && new Date(j.nextRunAt).getTime() <= now).length;
  return { jobs: [...doc.jobs].reverse(), nadOnline: doc.nadOnline, counts, due };
}

export async function listJobs(store: Store): Promise<JobsView> {
  return view((await store.get<JobsDoc>(NS.jobs, KEY)) ?? fresh());
}

export interface JobActor {
  role: AuditActorRole;
  label: string;
}

export async function enqueueJob(store: Store, opts: { label?: string; records: number }, actor: JobActor, now = Date.now()): Promise<SyncJob> {
  if (!Number.isInteger(opts.records) || opts.records < 1 || opts.records > 5000) throw new HttpError(400, "A batch holds between 1 and 5,000 records.");
  return store.update<JobsDoc, SyncJob>(NS.jobs, KEY, (cur) => {
    const doc = cur ?? fresh();
    doc.seq += 1;
    const job: SyncJob = {
      id: `JOB-${pad(doc.seq)}`,
      label: (opts.label?.trim() || `Batch ${doc.seq}`).slice(0, 80),
      records: opts.records,
      status: "QUEUED",
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      nextRunAt: new Date(now).toISOString(),
      createdAt: new Date(now).toISOString(),
      createdBy: actor.label,
    };
    doc.jobs.push(job);
    return { value: doc, result: job };
  });
}

/** Flips the simulated NAD connection, so an outage (and the recovery) can be shown on demand. */
export async function setNadOnline(store: Store, online: boolean, actor: JobActor): Promise<void> {
  const changed = await store.update<JobsDoc, boolean>(NS.jobs, KEY, (cur) => {
    const doc = cur ?? fresh();
    const was = doc.nadOnline;
    doc.nadOnline = online;
    return { value: doc, result: was !== online };
  });
  if (changed) {
    await appendAudit(store, {
      type: "SYSTEM",
      subject: "NAD",
      action: online ? "NAD_RESTORED" : "NAD_OUTAGE_SIMULATED",
      actorRole: actor.role,
      actor: actor.label,
      detail: online ? "The simulated NAD connection was restored. Queued batches will go through on the next run." : "A NAD outage was simulated. Batches will queue and retry with backoff.",
    });
  }
}

export interface DrainResult {
  attempted: number;
  succeeded: number;
  retrying: number;
  dead: number;
  /** Jobs waiting for their retry time, which this run left alone. */
  notYetDue: number;
  deadIds: string[];
}

/** Attempts every due job once. Atomic: concurrent drains cannot attempt the same job twice. */
export async function drainJobs(store: Store, actor: JobActor, now = Date.now(), limit = 50): Promise<DrainResult> {
  const result = await store.update<JobsDoc, DrainResult>(NS.jobs, KEY, (cur) => {
    const doc = cur ?? fresh();
    const out: DrainResult = { attempted: 0, succeeded: 0, retrying: 0, dead: 0, notYetDue: 0, deadIds: [] };

    for (const job of doc.jobs) {
      if (job.status !== "QUEUED" && job.status !== "RETRYING") continue;
      if (new Date(job.nextRunAt).getTime() > now) {
        out.notYetDue++;
        continue;
      }
      if (out.attempted >= limit) continue;

      out.attempted++;
      job.attempts += 1;
      if (doc.nadOnline) {
        job.status = "DONE";
        job.completedAt = new Date(now).toISOString();
        delete job.lastError;
        out.succeeded++;
      } else {
        job.lastError = "NAD did not respond.";
        if (job.attempts >= job.maxAttempts) {
          job.status = "DEAD";
          job.completedAt = new Date(now).toISOString();
          out.dead++;
          out.deadIds.push(job.id);
        } else {
          job.status = "RETRYING";
          job.nextRunAt = new Date(now + backoffMs(job.attempts)).toISOString();
          out.retrying++;
        }
      }
    }

    // Finished jobs are trimmed so the document does not grow forever. Live jobs are always kept.
    const finished = doc.jobs.filter((j) => j.status === "DONE" || j.status === "DEAD");
    if (finished.length > KEEP_FINISHED) {
      const drop = new Set(finished.slice(0, finished.length - KEEP_FINISHED).map((j) => j.id));
      doc.jobs = doc.jobs.filter((j) => !drop.has(j.id));
    }
    return { value: doc, result: out };
  });

  // A dead-lettered batch needs a person, so it goes in the audit log.
  for (const id of result.deadIds) {
    await appendAudit(store, {
      type: "SYSTEM",
      subject: id,
      action: "SYNC_JOB_DEAD",
      actorRole: actor.role,
      actor: actor.label,
      detail: `${id} failed ${MAX_ATTEMPTS} times and was dead-lettered. It needs a person to retry or investigate.`,
    });
  }
  return result;
}

/** Puts a dead-lettered job back in the queue with a fresh set of attempts. */
export async function requeueJob(store: Store, id: string, actor: JobActor, now = Date.now()): Promise<SyncJob> {
  const job = await store.update<JobsDoc, SyncJob | "missing" | "not-dead">(NS.jobs, KEY, (cur) => {
    const doc = cur ?? fresh();
    const j = doc.jobs.find((x) => x.id === id);
    if (!j) return { value: undefined, result: "missing" };
    if (j.status !== "DEAD") return { value: undefined, result: "not-dead" };
    j.status = "QUEUED";
    j.attempts = 0;
    j.nextRunAt = new Date(now).toISOString();
    delete j.completedAt;
    delete j.lastError;
    return { value: doc, result: j };
  });
  if (job === "missing") throw new HttpError(404, `No job ${id}.`);
  if (job === "not-dead") throw new HttpError(409, `Job ${id} is not dead-lettered.`);
  await appendAudit(store, { type: "SYSTEM", subject: id, action: "SYNC_JOB_REQUEUED", actorRole: actor.role, actor: actor.label, detail: `${id} was put back in the queue by a person.` });
  return job;
}
