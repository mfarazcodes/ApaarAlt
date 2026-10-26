"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Wifi, WifiOff } from "lucide-react";
import { Button, Card, ICON, Pill, ProgressBar, SectionTitle, Toggle } from "../portal/ui";

interface Job {
  id: number;
  records: number;
  status: "QUEUED" | "SYNCED";
  attempts: number;
}

const TICK_MS = 700;
const MAX_BACKOFF_S = 32;

/**
 * A browser-side model of a retry queue. It is a simulation, not Redis or BullMQ. Batches added while offline wait with
 * exponential backoff; reconnecting drains them one per tick. Nothing here talks to a real queue.
 */
export default function RetryQueue() {
  const [online, setOnline] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const nextId = useRef(1);
  const ticks = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      ticks.current += 1;
      setJobs((prev) => {
        if (!prev.some((j) => j.status === "QUEUED")) return prev;
        if (online) {
          const idx = prev.findIndex((j) => j.status === "QUEUED");
          return prev.map((j, i) => (i === idx ? { ...j, status: "SYNCED" } : j));
        }
        // Offline: each retry fails, so the attempt count (and the backoff) grows every few ticks.
        if (ticks.current % 4 !== 0) return prev;
        return prev.map((j) => (j.status === "QUEUED" ? { ...j, attempts: j.attempts + 1 } : j));
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [online]);

  function addBatches(n: number) {
    setJobs((prev) => [
      ...prev,
      ...Array.from({ length: n }, () => ({ id: nextId.current++, records: 120, status: "QUEUED" as const, attempts: 0 })),
    ]);
  }

  const queued = jobs.filter((j) => j.status === "QUEUED");
  const synced = jobs.length - queued.length;

  return (
    <Card>
      <SectionTitle
        eyebrow="Offline retry queue"
        title="Batch sync with retry"
        hint="Colleges with patchy connectivity keep working. Batches wait locally and retry with backoff. This is a browser simulation."
      />

      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          {online ? <Wifi width={16} height={16} className={`${ICON} text-accent`} /> : <WifiOff width={16} height={16} className={`${ICON} text-amber-300`} />}
          {online ? "Connected to NAD" : "Offline: batches are queueing"}
        </p>
        <Toggle checked={online} onChange={setOnline} label="Connected to NAD" />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-white/75">Queue depth</span>
          <span className="font-semibold tabular-nums">{queued.length} pending · {synced} synced</span>
        </div>
        <ProgressBar value={synced} max={Math.max(1, jobs.length)} tone={queued.length && !online ? "amber" : "accent"} label="Batches synced" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => addBatches(1)}><Plus width={16} height={16} className={ICON} />Add a batch</Button>
        <Button size="sm" onClick={() => addBatches(3)}>Add 3 batches</Button>
        {jobs.length > 0 && <Button size="sm" onClick={() => setJobs([])}>Clear</Button>}
      </div>

      {jobs.length > 0 && (
        <ul className="mt-4 max-h-48 space-y-1.5 overflow-auto" aria-live="polite">
          {[...jobs].reverse().map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
              <span>Batch {j.id} · {j.records} records</span>
              {j.status === "SYNCED" ? (
                <Pill tone="accent">Synced</Pill>
              ) : j.attempts === 0 ? (
                <Pill tone="neutral">Queued</Pill>
              ) : (
                <Pill tone="amber">Retry {j.attempts} · next in {Math.min(MAX_BACKOFF_S, 2 ** j.attempts)}s</Pill>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
