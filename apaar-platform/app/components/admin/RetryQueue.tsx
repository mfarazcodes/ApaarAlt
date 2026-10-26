"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Plus, RotateCw, Wifi, WifiOff } from "lucide-react";
import type { JobStatus, SyncJob } from "@/lib/jobs";
import { api, errorText } from "../portal/api";
import { Button, Card, ICON, Notice, Pill, ProgressBar, SectionTitle, Toggle } from "../portal/ui";

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
    const t = setTimeout(() => call({ action: "DRAIN" }), 500);
    return () => clearTimeout(t);
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

  return (
    <Card>
      <SectionTitle
        eyebrow="Retry queue"
        title="Batch sync with retry"
        hint="Batches wait on the server and retry with exponential backoff when NAD is unreachable. After repeated failures a batch is dead-lettered for a person. NAD itself is simulated by the switch below."
      />
      {error && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          {state?.nadOnline !== false ? <Wifi width={16} height={16} className={`${ICON} text-accent`} /> : <WifiOff width={16} height={16} className={`${ICON} text-amber-300`} />}
          {state?.nadOnline !== false ? "NAD reachable" : "NAD unreachable (simulated outage)"}
        </p>
        <Toggle checked={state?.nadOnline !== false} disabled={!state || busy} onChange={(on) => act({ action: "SET_NAD", online: on })} label="NAD reachable" />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-white/75">Queue depth</span>
          <span className="font-semibold tabular-nums">
            {live.length} pending · {done} synced{state && state.counts.DEAD > 0 ? ` · ${state.counts.DEAD} failed` : ""}
          </span>
        </div>
        <ProgressBar value={done} max={Math.max(1, total)} tone={live.length && state?.nadOnline === false ? "amber" : "accent"} label="Batches synced" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy || !state} onClick={() => act({ action: "ENQUEUE", records: 120 })}>
          <Plus width={16} height={16} className={ICON} />
          Add a batch
        </Button>
        <Button size="sm" disabled={busy || !state} onClick={async () => { setBusy(true); for (let i = 0; i < 3; i++) await call({ action: "ENQUEUE", records: 120 }); setBusy(false); }}>
          Add 3 batches
        </Button>
        <Button size="sm" disabled={busy || !state} onClick={() => act({ action: "DRAIN" })}>
          <Play width={16} height={16} className={ICON} />
          Run due batches now
        </Button>
        <label className="ml-auto flex items-center gap-2 text-xs text-white/65">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Run automatically while this page is open
        </label>
      </div>

      {jobs.length > 0 && (
        <ul className="mt-4 max-h-56 space-y-1.5 overflow-auto" aria-live="polite" aria-label="Batches">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
              <span>{j.label} · {j.records} records</span>
              {j.status === "DONE" && <Pill tone="accent">Synced</Pill>}
              {j.status === "QUEUED" && <Pill tone="neutral">Queued</Pill>}
              {j.status === "RETRYING" && (
                <Pill tone="amber">
                  Retry {j.attempts} of {j.maxAttempts} · next in {secondsUntil(j.nextRunAt, skew)}s
                </Pill>
              )}
              {j.status === "DEAD" && (
                <span className="flex items-center gap-2">
                  <Pill tone="red">Failed after {j.attempts} tries</Pill>
                  <Button size="sm" disabled={busy} onClick={() => act({ action: "REQUEUE", id: j.id })}>
                    <RotateCw width={16} height={16} className={ICON} />
                    Retry
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
