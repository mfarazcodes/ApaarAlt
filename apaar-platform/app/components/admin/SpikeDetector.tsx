"use client";

import { Download, TrendingUp } from "lucide-react";
import { SAMPLE_ADMISSION_SERIES, SPIKE_DEFAULTS, detectAdmissionSpikes } from "@/lib/admissionSpike";
import { toCsv } from "@/lib/csvExport";
import { downloadCsv } from "../portal/csvDownload";
import { Button, Card, ICON, Pill, SectionTitle } from "../portal/ui";

const flags = detectAdmissionSpikes(SAMPLE_ADMISSION_SERIES);

/** Flags a programme whose latest day of admissions is far above its own recent average. */
export default function SpikeDetector() {
  function exportFlags() {
    downloadCsv(
      "admission-spikes.csv",
      toCsv(
        flags.map((f) => ({ ...f, reasons: f.reasons.join(" | ") })),
        [
          { key: "college", header: "College" },
          { key: "programme", header: "Programme" },
          { key: "date", header: "Date" },
          { key: "admitted", header: "Admitted" },
          { key: "baselineMean", header: "Recent daily average" },
          { key: "liftPercent", header: "Percent above average" },
          { key: "unverifiedShare", header: "Share without verified ID" },
          { key: "severity", header: "Severity" },
          { key: "reasons", header: "Why" },
        ]
      )
    );
  }

  return (
    <Card>
      <SectionTitle
        eyebrow="Admission spike detector"
        title="Unusual jumps in admissions"
        hint={`A programme is flagged when one day has at least ${SPIKE_DEFAULTS.minAdmitted} admissions and ${SPIKE_DEFAULTS.minRatio}x its recent average. Sample data.`}
      />

      <ul className="space-y-3">
        {flags.map((f) => (
          <li key={f.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp width={16} height={16} className={`${ICON} text-red-300`} />
                {f.programme}, {f.college}
              </p>
              <Pill tone={f.severity === "HIGH" ? "red" : "amber"}>{f.severity}</Pill>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-white/70">
              {f.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </li>
        ))}
        {flags.length === 0 && <li className="text-sm text-white/60">No unusual jumps.</li>}
      </ul>
      <p className="mt-3 text-xs text-white/50">
        {SAMPLE_ADMISSION_SERIES.length > 0 && "Programmes with under a week of history are not judged."} A flag is a prompt to ask the college, not a finding.
      </p>
      <div className="mt-4">
        <Button size="sm" onClick={exportFlags}>
          <Download width={16} height={16} className={ICON} />
          Export flags as CSV
        </Button>
      </div>
    </Card>
  );
}
