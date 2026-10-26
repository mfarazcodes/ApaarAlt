"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Plus, RotateCw, Wifi, WifiOff } from "lucide-react";
import type { JobStatus, SyncJob } from "@/lib/jobs";
import { api, errorText } from "../portal/api";
import { useT } from "../portal/I18n";
import { Button, Card, Disclosure, ICON, Notice, Pill, ProgressBar, SectionTitle, Toggle } from "../portal/ui";
import { useReportStat } from "./ConsoleStats";

interface QueueState {
  jobs: SyncJob[];
  nadOnline: boolean;
  counts: Record<JobStatus, number>;
  due: number;
  config: { maxAttempts: number; backoffBaseMs: number; backoffCapMs: number };
  serverTime: string;
}

const secondsUntil = (iso: string, skewMs: number) => Math.max(0, Math.ceil((new Date(iso).getTime() - (Date.now() + skewMs)) / 1000));

/**
 * The sync retry queue. The jobs live on the server, so they survive a refresh and are shared. They are
 * drained by a scheduler calling /api/queue/drain (see the README), and, while this page is open, by this tab.
 */
export default function RetryQueue() {
  const { t } = useT();
  const [state, setState] = useState<QueueState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const [, tick] = useState(0);
  // How far the server's clock is from this one, so countdowns agree with when the server will retry.
  const [skew, setSkew] = useState(0);

  const apply = useCallback((s: QueueState) => {
    setSkew(new Date(s.serverTime).getTime() - Date.now());
    setState(s);
  }, []);

  const call = useCallback(
    async (body?: Record<string, unknown>) => {
      try {
        apply(await api<QueueState>("/api/queue", body));
        setError("");
      } catch (e) {
        setError(errorText(e));
      }
    },
    [apply]
  );

  useEffect(() => {
    const first = setTimeout(() => call(), 0);
    const poll = setInterval(() => call(), 3000);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [call]);

  // While this page is open it acts as a worker, so a demo does not need a scheduler. A real deployment calls /api/queue/drain.
  useEffect(() => {
    if (!auto || !state || state.due === 0) return;
    const timer = setTimeout(() => call({ action: "DRAIN" }), 500);
    return () => clearTimeout(timer);
  }, [auto, state, call]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    await call(body);
    setBusy(false);
  }

  const jobs = state?.jobs ?? [];
  const live = jobs.filter((j) => j.status === "QUEUED" || j.status === "RETRYING");
  const done = state?.counts.DONE ?? 0;
  const total = jobs.length;
  const nadOnline = state?.nadOnline !== false;
  useReportStat("batches", state ? live.length : null);

  return (
    <Card>
      <SectionTitle title={t("con.rq.title")} hint={t("con.rq.hint")} />
      {error && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}
      {!nadOnline && <div className="mb-3"><Notice tone="amber">{t("con.rq.offline")}</Notice></div>}

      <div>
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-white/80">{t("con.rq.depth")}</span>
          <span className="font-semibold tabular-nums">
            {t("con.rq.counts", { waiting: live.length, sent: done })}
            {state && state.counts.DEAD > 0 ? ` · ${t("con.rq.failedCount", { n: state.counts.DEAD })}` : ""}
          </span>
        </div>
        <ProgressBar value={done} max={Math.max(1, total)} tone={live.length && !nadOnline ? "amber" : "accent"} label={t("con.rq.sentBar")} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy || !state} onClick={() => act({ action: "ENQUEUE", records: 120 })}>
          <Plus width={16} height={16} className={ICON} />
          {t("con.rq.add")}
        </Button>
        <Button size="sm" disabled={busy || !state} onClick={() => act({ action: "DRAIN" })}>
          <Play width={16} height={16} className={ICON} />
          {t("con.rq.runNow")}
        </Button>
      </div>

      {jobs.length > 0 && (
        <ul className="mt-4 max-h-56 space-y-1.5 overflow-auto" aria-live="polite" aria-label={t("con.rq.batches")}>
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
              <span>{t("con.rq.job", { label: j.label, n: j.records })}</span>
              {j.status === "DONE" && <Pill tone="accent">{t("con.rq.sent")}</Pill>}
              {j.status === "QUEUED" && <Pill tone="neutral">{t("con.rq.queued")}</Pill>}
              {j.status === "RETRYING" && <Pill tone="amber">{t("con.rq.retry", { a: j.attempts, m: j.maxAttempts, s: secondsUntil(j.nextRunAt, skew) })}</Pill>}
              {j.status === "DEAD" && (
                <span className="flex items-center gap-2">
                  <Pill tone="red">{t("con.rq.failedAfter", { n: j.attempts })}</Pill>
                  <Button size="sm" disabled={busy} onClick={() => act({ action: "REQUEUE", id: j.id })}>
                    <RotateCw width={16} height={16} className={ICON} />
                    {t("con.rq.retryBtn")}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Controls for showing the queue in a demo. They are not part of a registrar's day. */}
      <Disclosure summary={t("con.demoTools")} className="mt-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            {nadOnline ? <Wifi width={16} height={16} className={`${ICON} text-accent-soft`} /> : <WifiOff width={16} height={16} className={`${ICON} text-amber-300`} />}
            {nadOnline ? t("con.rq.nadUp") : t("con.rq.nadDown")}
          </p>
          <Toggle checked={nadOnline} disabled={!state || busy} onChange={(on) => act({ action: "SET_NAD", online: on })} label={t("con.rq.nadUp")} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={busy || !state} onClick={async () => { setBusy(true); for (let i = 0; i < 3; i++) await call({ action: "ENQUEUE", records: 120 }); setBusy(false); }}>
            {t("con.rq.add3")}
          </Button>
          <label className="flex items-center gap-2 text-sm text-white/75">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            {t("con.rq.auto")}
          </label>
        </div>
        <p className="mt-3 text-xs text-white/65">{t("con.rq.simNote")}</p>
      </Disclosure>
    </Card>
  );
}
