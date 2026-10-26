"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CollegeSnapshot, ComplianceScore } from "@/lib/nadSyncEngine";
import { api, errorText } from "../portal/api";
import { Card, ICON, Notice, Pill, ProgressBar, SectionTitle } from "../portal/ui";

type Row = CollegeSnapshot & ComplianceScore;

const BAND_TONE = { GREEN: "accent", AMBER: "amber", RED: "red", UNRATED: "neutral" } as const;

export default function Leaderboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ leaderboard: Row[] }>("/api/sync/aicte-nad")
      .then((r) => setRows(r.leaderboard))
      .catch((e) => setError(errorText(e)));
  }, []);

  return (
    <Card>
      <SectionTitle
        eyebrow="National compliance"
        title="College compliance leaderboard"
        hint="Score = identity verification 35%, intake fit 25%, ABC seeding 25%, flag resolution 15%. Open a row to see why. Sample institutions."
      />
      {error && <Notice tone="red">{error}</Notice>}

      <ol className="space-y-2">
        {rows.map((r, i) => {
          const expanded = open === r.code;
          return (
            <li key={r.code} className="rounded-xl border border-white/10 bg-white/[0.03]">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : r.code)}
                className="flex w-full items-center gap-3 p-3.5 text-left"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block text-xs text-white/55">{r.state} · intake {r.approvedIntake.toLocaleString("en-IN")} · {r.flagsOpen} open flags</span>
                </span>
                <Pill tone={BAND_TONE[r.band]}>{r.band === "UNRATED" ? "Unrated" : r.score}</Pill>
                <ChevronDown width={16} height={16} className={`${ICON} text-white/55 transition ${expanded ? "rotate-180" : ""}`} />
              </button>
              {expanded && (
                <ul className="grid gap-3 border-t border-white/10 p-4 sm:grid-cols-2">
                  {r.breakdown.map((b) => (
                    <li key={b.label}>
                      <div className="flex justify-between text-xs text-white/65">
                        <span>{b.label} ({b.weight}%)</span>
                        <span className="tabular-nums">{Math.round(b.value)}</span>
                      </div>
                      <div className="mt-1.5">
                        <ProgressBar value={b.value} max={100} tone={b.value < 60 ? "red" : b.value < 85 ? "amber" : "accent"} label={b.label} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
