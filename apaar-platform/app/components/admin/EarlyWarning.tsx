"use client";

import { EyeOff, HeartHandshake } from "lucide-react";
import { SAMPLE_COHORT, assessSupportNeed, type SupportBand } from "@/lib/earlyWarning";
import { Card, ICON, Notice, Pill, SectionTitle } from "../portal/ui";

const BAND_TONE: Record<SupportBand, "red" | "amber" | "accent"> = { HIGH: "red", MODERATE: "amber", LOW: "accent" };

export default function EarlyWarning() {
  const assessed = SAMPLE_COHORT.map((s) => ({ ...s, result: assessSupportNeed(s.signals) }));
  const visible = assessed.filter((s) => s.mentoringOptIn && s.result.band !== "LOW");
  const hidden = assessed.filter((s) => !s.mentoringOptIn);
  const hiddenNeedSupport = hidden.filter((s) => s.result.band !== "LOW").length;

  return (
    <Card>
      <SectionTitle
        eyebrow="Faculty early warning"
        title="Student support, privacy first"
        hint="Mentors see a pseudonym, a support band and plain-language reasons. Never marks, names or ID numbers."
      />

      <ul className="space-y-3" aria-label="Students who opted in to mentor alerts">
        {visible.map((s) => (
          <li key={s.token} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-sm">{s.token} <span className="font-sans text-xs text-white/55">· {s.program}</span></p>
              <Pill tone={BAND_TONE[s.result.band]}>{s.result.band === "HIGH" ? "High support need" : "Moderate support need"}</Pill>
            </div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-white/75">
              {s.result.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <p className="mt-3 flex items-start gap-2 text-sm text-accent">
              <HeartHandshake width={16} height={16} className={`${ICON} mt-0.5`} />
              {s.result.suggestion}
            </p>
          </li>
        ))}
        {visible.length === 0 && <li className="text-sm text-white/60">No opted-in students currently need support.</li>}
      </ul>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
        <EyeOff width={16} height={16} className={`${ICON} mt-0.5`} />
        <span>
          {hidden.length} other students have not opted in to mentor alerts, so individual rows stay hidden. {hiddenNeedSupport > 0 ? `About ${hiddenNeedSupport} of them may benefit from a general outreach to the whole cohort.` : "None of them show signs of needing support."}
        </span>
      </div>
      <div className="mt-3">
        <Notice tone="blue">Bands are rules, not predictions: attendance, change in results, credit pace and missed assessments. A person decides what happens next.</Notice>
      </div>
    </Card>
  );
}
