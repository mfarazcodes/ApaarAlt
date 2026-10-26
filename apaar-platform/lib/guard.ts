import { HttpError } from "./errors";
import type { Role } from "./personas";
import { rateLimit, type RateLimit } from "./ratelimit";
import { sessionFromRequest, type Session } from "./session";
import { getStore, type Store } from "./store";

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "local";
}

/** A browser sends Origin (and Sec-Fetch-Site) on cross-site requests. A mismatch is refused. */
function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      /* falls through to the refusal below */
    }
    if (originHost !== host) throw new HttpError(403, "Cross-site request refused.");
  }
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Cross-site request refused.");
}

export interface GuardOptions {
  /** Roles allowed in. "PUBLIC" skips the session check (for login and health). */
  roles: Role[] | "PUBLIC";
  /** Per-IP and per-session limits. Defaults: 120 reads and 60 writes a minute. */
  rate?: RateLimit;
  /** A label so different routes keep separate counters. */
  scope: string;
}

export interface Guarded {
  session: Session | null;
  store: Store;
}

const READ_LIMIT: RateLimit = { limit: 120, windowMs: 60_000 };
const WRITE_LIMIT: RateLimit = { limit: 60, windowMs: 60_000 };

/**
 * Every route handler calls this first: it refuses cross-site writes, rate-limits by IP and by session,
 * checks the session and the role, and hands back the store. The identity comes from the signed
 * cookie only. Nothing in the request body can claim a role or an actor.
 */
export async function guard(req: Request, opts: GuardOptions): Promise<Guarded> {
  const store = getStore();
  const isWrite = req.method !== "GET" && req.method !== "HEAD";
  if (isWrite) assertSameOrigin(req);

  const limit = opts.rate ?? (isWrite ? WRITE_LIMIT : READ_LIMIT);
  const session = await sessionFromRequest(req);

  const ipHit = await rateLimit(store, `${opts.scope}:ip:${clientIp(req)}`, limit);
  const subjectHit = session ? await rateLimit(store, `${opts.scope}:session:${session.personaId}`, limit) : ipHit;
  const blocked = [ipHit, subjectHit].find((r) => !r.allowed);
  if (blocked) throw new HttpError(429, "Too many requests. Please slow down.", { retryAfterSec: blocked.retryAfterSec });

  if (opts.roles !== "PUBLIC") {
    if (!session) throw new HttpError(401, "Sign in to continue.");
    if (!opts.roles.includes(session.role)) throw new HttpError(403, `This action is not available to the ${session.role.toLowerCase()} role.`);
  }
  return { session, store };
}

/** The audit actor for a session. Built on the server from the signed cookie, never from the request. */
export function actorOf(session: Session): { role: Role; label: string } {
  return { role: session.role, label: session.name };
}
