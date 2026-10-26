/* Offline support for the verifier page.
 *
 * - /_next/static/* files are cache-first: they are content-hashed, so a cached copy is always right.
 * - /employer is network-first, with the saved copy as the fallback when there is no network.
 * - /api/* is never touched, so no student data is ever stored by this worker.
 *
 * The cache name matches app/components/portal/offlineCache.ts. */
const CACHE = "apaar-offline-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  if (req.mode === "navigate" && url.pathname === "/employer") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/employer", copy));
          }
          return res;
        })
        .catch(() => caches.match("/employer").then((hit) => hit || Response.error()))
    );
  }
});
