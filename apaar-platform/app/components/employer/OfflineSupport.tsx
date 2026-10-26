"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { OFFLINE_CACHE } from "../portal/offlineCache";
import { ICON, Pill } from "../portal/ui";

/**
 * Registers the service worker and saves this page and its scripts on the device, so the verifier
 * opens with no network. API calls are never cached, so no student data is stored here.
 */
export default function OfflineSupport() {
  const [ready, setReady] = useState<"checking" | "ready" | "unsupported">("checking");

  useEffect(() => {
    let live = true;
    (async () => {
      if (!("serviceWorker" in navigator) || typeof caches === "undefined") {
        if (live) setReady("unsupported");
        return;
      }
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        // The scripts this page already loaded are saved by hand, so the very next offline visit works.
        const cache = await caches.open(OFFLINE_CACHE);
        const assets = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => new URL(u).origin === location.origin && new URL(u).pathname.startsWith("/_next/static/"));
        await cache.addAll([location.pathname, ...new Set(assets)]);
        if (live) setReady("ready");
      } catch {
        if (live) setReady("unsupported");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (ready === "checking") return null;
  return (
    <p className="mb-4 flex items-center gap-2 text-sm text-white/65">
      <CloudOff width={16} height={16} className={ICON} />
      {ready === "ready" ? <Pill tone="accent">Works offline</Pill> : <Pill tone="amber">Offline page saving is not available in this browser</Pill>}
      <span className="text-xs text-white/50">{ready === "ready" ? "This page and the issuer keys are saved on this device." : "Offline checks still work if the page is already open."}</span>
    </p>
  );
}
