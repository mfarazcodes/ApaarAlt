import { beforeEach } from "vitest";
import { MemoryStore, setStore } from "@/lib/store";
import { PERSONAS } from "@/lib/personas";
import { SESSION_COOKIE, createSessionToken } from "@/lib/session";

/** A fresh in-memory store before every test, so tests never see each other's state. */
export function freshStoreEachTest() {
  beforeEach(() => {
    setStore(new MemoryStore());
  });
}

export async function cookieFor(personaId: string): Promise<string> {
  const persona = PERSONAS.find((p) => p.id === personaId);
  if (!persona) throw new Error(`No persona ${personaId}`);
  return `${SESSION_COOKIE}=${await createSessionToken(persona)}`;
}

type Handler = (req: Request) => Promise<Response>;

export interface Call {
  method?: "GET" | "POST";
  path?: string;
  as?: string; // persona id
  cookie?: string; // raw cookie header, to test forged ones
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}

/** Calls a route handler the way the framework would, and returns the status and parsed JSON. */
export async function call(handler: Handler, opts: Call = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  const cookie = opts.cookie ?? (opts.as ? await cookieFor(opts.as) : undefined);
  if (cookie) headers.cookie = cookie;
  const method = opts.method ?? (opts.body !== undefined || opts.rawBody !== undefined ? "POST" : "GET");
  if (method === "POST") headers["content-type"] = "application/json";

  const res = await handler(
    new Request(`http://localhost${opts.path ?? "/api/test"}`, {
      method,
      headers,
      body: method === "POST" ? (opts.rawBody ?? JSON.stringify(opts.body ?? {})) : undefined,
    })
  );
  const json = (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { status: res.status, json, headers: res.headers };
}
