"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Lock, Plus } from "lucide-react";
import type { CreditForecast, NepExitResult } from "@/lib/nadSyncEngine";
import { PROGRAM_TOTAL_CREDITS, creditsThroughSemester, projectedCreditsThrough, twinFor, twinTotals } from "@/lib/studentData";
import { api, errorText } from "../portal/api";
import { useT } from "../portal/I18n";
import { Button, Card, Eyebrow, ICON, Notice, Pill, ProgressBar, SectionTitle, Toggle } from "../portal/ui";

export default function NepForecaster({ studentId }: { studentId: string }) {
  const { t } = useT();
  const twin = twinFor(studentId) ?? [];
  const totals = twinTotals(twin);
  const [exitAfter, setExitAfter] = useState(totals.completedThrough);
  const [vocational, setVocational] = useState(true);
  const [planSwayam, setPlanSwayam] = useState(0);
  const [nep, setNep] = useState<NepExitResult | null>(null);
  const [forecast, setForecast] = useState<CreditForecast | null>(null);
  const [error, setError] = useState("");

  const earnedAtExit = creditsThroughSemester(exitAfter, twin);
  const projectedAtExit = projectedCreditsThrough(exitAfter, twin);
  const isProjection = projectedAtExit > earnedAtExit;
  const [projection, setProjection] = useState<NepExitResult | null>(null);

  useEffect(() => {
    let live = true;
    api<{ result: NepExitResult }>("/api/sync/aicte-nad", {
      action: "NEP_EXIT",
      earnedCredits: earnedAtExit,
      vocationalCredits: vocational ? 4 : 0,
    })
      .then((r) => live && (setNep(r.result), setError("")))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [earnedAtExit, vocational]);

  useEffect(() => {
    if (!isProjection) return;
    let live = true;
    api<{ result: NepExitResult }>("/api/sync/aicte-nad", { action: "NEP_EXIT", earnedCredits: projectedAtExit, vocationalCredits: vocational ? 4 : 0 })
      .then((r) => live && setProjection(r.result))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [isProjection, projectedAtExit, vocational]);

  useEffect(() => {
    let live = true;
    api<{ result: CreditForecast }>("/api/sync/aicte-nad", {
      action: "FORECAST",
      earnedCredits: totals.creditsEarned + planSwayam,
      totalCredits: PROGRAM_TOTAL_CREDITS,
      scheduledRemaining: totals.scheduledRemaining,
      swayamUsed: totals.swayamCredits + planSwayam,
    })
      .then((r) => live && (setForecast(r.result), setError("")))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
    // totals is derived from static sample data, so it never changes between renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSwayam]);

  // The shortfall before any SWAYAM is added decides how many credits to recommend.
  const baseShortfall = Math.max(0, PROGRAM_TOTAL_CREDITS - (totals.creditsEarned + totals.scheduledRemaining.reduce((a, b) => a + b, 0)));
  const recommended = forecast ? Math.min(baseShortfall, Math.max(0, forecast.swayam.capCredits - totals.swayamCredits)) : 0;

  return (
    <Card>
      <SectionTitle
        eyebrow={t("nep.eyebrow")}
        title={t("nep.title")}
        hint={t("nep.hint", { total: PROGRAM_TOTAL_CREDITS })}
      />
      {error && <Notice tone="red">{error}</Notice>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Exit simulator */}
        <div>
          <Eyebrow>{t("nep.simulator")}</Eyebrow>
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <label htmlFor="exit-sem" className="flex items-baseline justify-between text-sm">
              <span className="text-white/75">{t("nep.ifExit")}</span>
              <span className="text-xl font-semibold tabular-nums">{exitAfter}</span>
            </label>
            <input
              id="exit-sem"
              type="range"
              min={1}
              max={8}
              value={exitAfter}
              onChange={(e) => setExitAfter(Number(e.target.value))}
              className="mt-3 w-full accent-[var(--accent)]"
            />
            <p className="mt-2 text-sm text-white/70">
              {t("nep.earnedSoFar", { n: earnedAtExit })}
              {isProjection && t("nep.completeThrough", { n: totals.completedThrough })}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-sm">
              <span className="text-white/75">{t("nep.vocational")}</span>
              <Toggle checked={vocational} onChange={setVocational} label={t("nep.vocationalLabel")} />
            </div>
          </div>

          <ul className="mt-3 space-y-2">
            {nep?.options.map((o) => (
              <li key={o.level} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${o.eligible ? "border-accent/40 bg-accent/10" : "border-white/10 bg-white/[0.03]"}`}>
                <div>
                  <p className="font-semibold">{o.label}</p>
                  <p className="text-xs text-white/60">
                    {t("nep.minCredits", { n: o.minCredits })}{o.level !== "DEGREE" && t("nep.plusSkill")} · {t("nep.yearLower", { n: o.afterYear })}
                  </p>
                </div>
                {o.eligible ? (
                  <Pill tone="accent">
                    <CheckCircle2 width={16} height={16} className="h-3.5 w-3.5 shrink-0" />
                    {t("nep.eligible")}
                  </Pill>
                ) : (
                  <Pill tone="amber">
                    <Lock width={16} height={16} className="h-3.5 w-3.5 shrink-0" />
                    {o.creditShortfall > 0 ? t("nep.creditsShort", { n: o.creditShortfall }) : t("nep.skillShort", { n: o.vocationalShortfall })}
                  </Pill>
                )}
              </li>
            ))}
          </ul>
          {isProjection && projection && (
            <div className="mt-3 rounded-xl border border-dashed border-sky-300/40 bg-sky-400/5 px-4 py-3 text-sm">
              <p className="font-semibold text-sky-300">{t("nep.projection")}</p>
              <p className="mt-1 text-white/75">
                {t("nep.projA", { sem: exitAfter, credits: projectedAtExit })}
                {projection.highestEligible ? t("nep.projYes", { label: projection.highestEligible.label }) : t("nep.projNo")}
              </p>
            </div>
          )}
          {nep && <p className="mt-3 text-xs leading-relaxed text-white/55">{nep.reEntry.note}</p>}
        </div>

        {/* Credit forecaster */}
        <div>
          <Eyebrow>{t("nep.forecast")}</Eyebrow>
          {forecast && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-white/75">{t("nep.projectedAtGrad")}</span>
                <span className="text-xl font-semibold tabular-nums">
                  {forecast.projectedAtGraduation}/{forecast.totalCredits}
                </span>
              </div>
              <div className="mt-3">
                <ProgressBar value={forecast.projectedAtGraduation} max={forecast.totalCredits} tone={forecast.onTrack ? "accent" : "amber"} label={t("nep.projectedCredits")} />
              </div>
              <p className="mt-3 text-sm text-white/70">
                {t("nep.earnedPlusScheduled", { earned: totals.creditsEarned + planSwayam, scheduled: forecast.scheduledCredits })}
              </p>
              {forecast.onTrack ? (
                <div className="mt-3">
                  <Notice tone="accent">{t("nep.onTrack", { total: forecast.totalCredits })}</Notice>
                </div>
              ) : (
                <div className="mt-3">
                  <Notice tone="amber">
                    {t("nep.shortOf", { n: forecast.shortfall, total: forecast.totalCredits })}
                  </Notice>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-accent-soft">{t("nep.swayamRec", { n: recommended })}</p>
                <p className="text-xs text-white/60">{t("nep.swayamHint")}</p>
              </div>
              <Button
                size="sm"
                variant={planSwayam ? "ghost" : "primary"}
                disabled={recommended === 0 && planSwayam === 0}
                onClick={() => setPlanSwayam(planSwayam ? 0 : recommended)}
              >
                {planSwayam ? (
                  <CheckCircle2 width={16} height={16} className={`${ICON} text-accent-soft`} />
                ) : (
                  <Plus width={16} height={16} className={ICON} />
                )}
                {planSwayam ? t("nep.inPlan") : t("nep.addPlan")}
              </Button>
            </div>
            {forecast && (
              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="flex justify-between text-xs text-white/65">
                  <span>{t("nep.swayamCap", { pct: forecast.swayam.capPercent })}</span>
                  <span className="tabular-nums">
                    {forecast.swayam.usedCredits}/{forecast.swayam.capCredits}
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar value={forecast.swayam.usedCredits} max={forecast.swayam.capCredits} tone={forecast.swayam.valid ? "accent" : "red"} label={t("nep.swayamCapUsed")} />
                </div>
                <p className="mt-2 text-xs text-white/60">{forecast.swayam.message}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
