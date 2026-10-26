import { NS, type Store } from "./store/types";

export interface RateLimit {
  limit: number;
  windowMs: number;
}

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * A sliding window kept in the store, so the count is shared by every server instance that
 * shares the store. Each call to an allowed key records one hit.
 */
export async function rateLimit(store: Store, key: string, { limit, windowMs }: RateLimit, now = Date.now()): Promise<RateResult> {
  return store.update<{ hits: number[] }, RateResult>(NS.rate, key, (cur) => {
    const hits = (cur?.hits ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
      return { value: { hits }, result: { allowed: false, remaining: 0, retryAfterSec } };
    }
    hits.push(now);
    return { value: { hits }, result: { allowed: true, remaining: limit - hits.length, retryAfterSec: 0 } };
  });
}

/** Rate-limit windows are small but never expire on their own. Run this from the cron route. */
export async function pruneRateLimits(store: Store, olderThanMs = 60 * 60 * 1000, now = Date.now()): Promise<number> {
  const rows = await store.list<{ hits: number[] }>(NS.rate);
  let removed = 0;
  for (const row of rows) {
    const newest = Math.max(0, ...row.value.hits);
    if (now - newest > olderThanMs) {
      await store.delete(NS.rate, row.key);
      removed++;
    }
  }
  return removed;
}
