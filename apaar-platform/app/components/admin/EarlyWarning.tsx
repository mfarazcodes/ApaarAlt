"use client";

import { EyeOff, HeartHandshake } from "lucide-react";
import { SAMPLE_COHORT, assessSupportNeed, type SupportBand } from "@/lib/earlyWarning";
import { useT } from "../portal/I18n";
import { Card, ICON, Notice, Pill, SectionTitle } from "../portal/ui";

const BAND_TONE: Record<SupportBand, "red" | "amber" | "accent"> = { HIGH: "red", MODERATE: "amber", LOW: "accent" };

export default function EarlyWarning() {
  const { t } = useT();
  const assessed = SAMPLE_COHORT.map((s) => ({ ...s, result: assessSupportNeed(s.signals) }));
  const visible = assessed.filter((s) => s.mentoringOptIn && s.result.band !== "LOW");
  const hidden = assessed.filter((s) => !s.mentoringOptIn);
  const hiddenNeedSupport = hidden.filter((s) => s.result.band !== "LOW").length;

  return (
    <Card>
      <SectionTitle title={t("con.ew.title")} hint={t("con.ew.hint")} />

      <ul className="space-y-3" aria-label={t("con.ew.listLabel")}>
        {visible.map((s) => (
          <li key={s.token} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-sm">{s.token} <span className="font-sans text-xs text-white/65">· {s.program}</span></p>
              <Pill tone={BAND_TONE[s.result.band]}>{s.result.band === "HIGH" ? t("con.ew.high") : t("con.ew.moderate")}</Pill>
            </div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-white/80">
              {s.result.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <p className="mt-3 flex items-start gap-2 text-sm text-accent-soft">
              <HeartHandshake width={16} height={16} className={`${ICON} mt-0.5`} />
              {s.result.suggestion}
            </p>
          </li>
        ))}
        {visible.length === 0 && <li className="text-sm text-white/70">{t("con.ew.none")}</li>}
      </ul>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
        <EyeOff width={16} height={16} className={`${ICON} mt-0.5`} />
        <span>
          {t("con.ew.hidden", { n: hidden.length })} {hiddenNeedSupport > 0 ? t("con.ew.hiddenSome", { n: hiddenNeedSupport }) : t("con.ew.hiddenNone")}
        </span>
      </div>
      <div className="mt-3">
        <Notice tone="blue">{t("con.ew.note")}</Notice>
      </div>
    </Card>
  );
}
