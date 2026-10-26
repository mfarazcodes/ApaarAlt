"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, RotateCcw, TriangleAlert, UserRound } from "lucide-react";
import { api, errorText } from "./api";
import { useT } from "./I18n";
import { clearOfflineCache } from "./offlineCache";
import { Button, ICON } from "./ui";

interface Health {
  ok: boolean;
  missing: string[];
  warnings: string[];
  demoMode: boolean;
  store: string;
}

/** Who is signed in, how to switch, and (for admin roles in demo mode) a way to reset the demo data. */
export function SessionBar({ name, roleLabel, canReset }: { name: string; roleLabel: string; canReset: boolean }) {
  const router = useRouter();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function signOut() {
    setBusy(true);
    try {
      await api("/api/auth/logout", {});
      // The saved verifier page was loaded under this session, so it does not stay on the device.
      await clearOfflineCache();
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  async function reset() {
    if (!window.confirm("Reset all demo data (consent, credentials, sync state and the audit trail)?")) return;
    setBusy(true);
    try {
      await api("/api/admin/reset", {});
      window.location.reload();
    } catch (e) {
      setNote(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/70">
      <span className="flex items-center gap-2">
        <UserRound width={16} height={16} className={ICON} />
        {t("session.signedInAs")} <strong className="font-semibold text-white">{name}</strong>
        <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs">{roleLabel}</span>
      </span>
      <Link href="/login" className="underline decoration-white/30 underline-offset-4 hover:text-white">
        {t("session.switchRole")}
      </Link>
      <Button size="sm" disabled={busy} onClick={signOut}>
        <LogOut width={16} height={16} className={ICON} />
        {t("session.signOut")}
      </Button>
      {canReset && (
        <Button size="sm" variant="danger" disabled={busy} onClick={reset}>
          <RotateCcw width={16} height={16} className={ICON} />
          {t("session.reset")}
        </Button>
      )}
      {note && <span role="alert" className="text-red-300">{note}</span>}
    </div>
  );
}

/** Shows a clear banner when the server is missing required settings, instead of a wall of 500s. */
export function ConfigBanner() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    // /api/health answers 503 when config is missing, and still carries the report, so read it directly.
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((h) => setHealth(h as Health))
      .catch(() => undefined);
  }, []);

  if (!health || (health.ok && health.warnings.length === 0)) return null;
  return (
    <div role="status" className="relative z-10 mx-4 mt-4 rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 sm:mx-8">
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert width={16} height={16} className={ICON} />
        {health.ok ? "Deployment notice" : "This server is not fully configured"}
      </p>
      {health.missing.length > 0 && (
        <p className="mt-1">
          Missing: <code className="rounded bg-black/30 px-1.5 py-0.5">{health.missing.join(", ")}</code>. Sign-in, tokenization and credential signing are unavailable until these are set.
        </p>
      )}
      {health.warnings.map((w) => (
        <p key={w} className="mt-1">{w}</p>
      ))}
    </div>
  );
}
