import type { Store } from "./types";

/**
 * In-process store. Documents are kept as JSON strings, so a caller can never mutate stored state by
 * accident. Updates to the same key are queued, which gives the same atomicity a database row lock would.
 */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private docs = new Map<string, string>();
  private queues = new Map<string, Promise<unknown>>();

  private id(ns: string, key: string) {
    return `${ns}\u0000${key}`;
  }

  async get<T>(ns: string, key: string): Promise<T | undefined> {
    const raw = this.docs.get(this.id(ns, key));
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(ns: string, key: string, value: T): Promise<void> {
    await this.update<T, void>(ns, key, () => ({ value, result: undefined }));
  }

  update<T, R>(ns: string, key: string, fn: (current: T | undefined) => { value: T | undefined; result: R }): Promise<R> {
    const id = this.id(ns, key);
    const previous = this.queues.get(id) ?? Promise.resolve();
    const run = previous.then(async () => {
      const raw = this.docs.get(id);
      const { value, result } = fn(raw === undefined ? undefined : (JSON.parse(raw) as T));
      if (value !== undefined) this.docs.set(id, JSON.stringify(value));
      return result;
    });
    // A failed update must not block the queue for the next caller.
    this.queues.set(id, run.catch(() => undefined));
    return run;
  }

  async list<T>(ns: string): Promise<{ key: string; value: T }[]> {
    const prefix = `${ns}\u0000`;
    return [...this.docs.entries()]
      .filter(([id]) => id.startsWith(prefix))
      .map(([id, raw]) => ({ key: id.slice(prefix.length), value: JSON.parse(raw) as T }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async delete(ns: string, key: string): Promise<void> {
    this.docs.delete(this.id(ns, key));
  }

  async clear(namespaces: string[]): Promise<void> {
    const prefixes = namespaces.map((n) => `${n}\u0000`);
    for (const id of [...this.docs.keys()]) {
      if (prefixes.some((p) => id.startsWith(p))) this.docs.delete(id);
    }
  }
}
