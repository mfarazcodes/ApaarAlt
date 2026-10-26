"use client";

import { useEffect, useState } from "react";
import { Download, Ghost, GitCompareArrows } from "lucide-react";
import { toCsv } from "@/lib/csvExport";
import type { DiscrepancyFlag } from "@/lib/fuzzyMatcher";
import type { GhostCandidate } from "@/lib/fuzzySamples";
import { api, errorText } from "../portal/api";
import { downloadCsv } from "../portal/csvDownload";
import { Button, Card, Eyebrow, ICON, Notice, Pill, SectionTitle } from "../portal/ui";

const SEV_TONE = { HIGH: "red", MEDIUM: "amber", LOW: "neutral" } as const;

export default function CollisionDetector() {
  const [flags, setFlags] = useState<DiscrepancyFlag[]>([]);
  const [ghosts, setGhosts] = useState<GhostCandidate[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ collisionFlags: DiscrepancyFlag[]; ghostCandidates: GhostCandidate[] }>("/api/verify/fuzzy-match")
      .then((r) => (setFlags(r.collisionFlags), setGhosts(r.ghostCandidates)))
      .catch((e) => setError(errorText(e)));
  }, []);

  const open = flags.filter((f) => !dismissed.includes(f.id));

  function exportFlags() {
    downloadCsv(
      "dual-enrolment-flags.csv",
      toCsv(
        open.map((f) => ({ ...f, evidence: f.evidence.join(" | ") })),
        [
          { key: "title", header: "Flag" },
          { key: "severity", header: "Severity" },
          { key: "reason", header: "Reason" },
          { key: "evidence", header: "Evidence" },
          { key: "suggestedAction", header: "Suggested action" },
        ]
      )
    );
  }

  return (
    <Card>
      <SectionTitle
        eyebrow="Collision detector"
        title="Dual enrolment and ghost students"
        hint="Every flag lists the exact signals behind it, so a reviewer can accept or dismiss it with context."
      />
      {error && <Notice tone="red">{error}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>Cross-college dual enrolment</Eyebrow>
        <Button size="sm" disabled={open.length === 0} onClick={exportFlags}>
          <Download width={16} height={16} className={ICON} />
          Export as CSV
        </Button>
      </div>
      <ul className="mt-3 space-y-3">
        {open.map((f) => (
          <li key={f.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <GitCompareArrows width={16} height={16} className={`${ICON} text-accent-soft`} />
                {f.title}
              </p>
              <Pill tone={SEV_TONE[f.severity]}>{f.severity}</Pill>
            </div>
            <p className="mt-2 text-sm text-white/75">{f.reason}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-white/55">Why it was flagged</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-white/70">
              {f.evidence.map((e) => <li key={e}>{e}</li>)}
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-accent-soft">{f.suggestedAction}</p>
              <Button size="sm" onClick={() => setDismissed((d) => [...d, f.id])}>Mark as reviewed</Button>
            </div>
          </li>
        ))}
        {open.length === 0 && <li className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/60">No open collisions.</li>}
      </ul>
      <p className="mt-3 text-xs text-white/50">The scan also checked a student who moved from B.Tech to M.Tech. Those dates do not overlap, so it was correctly not flagged.</p>

      <div className="mt-6">
        <Eyebrow>Ghost student candidates</Eyebrow>
        <ul className="mt-3 space-y-3">
          {ghosts.map((g) => (
            <li key={g.token} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Ghost width={16} height={16} className={`${ICON} text-amber-300`} />
                <span className="font-mono">{g.token}</span>
                <span className="text-xs font-normal text-white/55">{g.program} · {g.college}</span>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-white/70">
                {g.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
