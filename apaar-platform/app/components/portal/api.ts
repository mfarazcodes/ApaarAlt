/** Thin fetch wrapper for the /api routes. Throws an Error carrying the server's message. */
export async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  let data: { success?: boolean; error?: string } & Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server returned an unreadable response (${res.status}).`);
  }
  if (!res.ok || data.success === false) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data as T;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
