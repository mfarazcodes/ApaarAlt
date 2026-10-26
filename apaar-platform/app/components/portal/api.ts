/** Thin fetch wrapper for the /api routes. Throws an Error carrying the server's message. */
export async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  // A lapsed or missing session sends the user back to sign in, then back to where they were.
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth")) {
    // A full page load on purpose: it drops any stale client state along with the dead session.
    // This module is not a React component, so the router hook is not available here.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Please sign in again.");
  }

  let data: { success?: boolean; error?: string; code?: string } & Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server returned an unreadable response (${res.status}).`);
  }
  if (!res.ok || data.success === false) {
    const err = new Error(data.error ?? `Request failed (${res.status}).`) as Error & { data?: typeof data; status?: number };
    err.data = data; // lets a caller read details such as blockingIssues
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export function errorData<T = Record<string, unknown>>(e: unknown): T | undefined {
  return (e as { data?: T } | undefined)?.data;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
