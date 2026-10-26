"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Lock, Plus } from "lucide-react";
import { forecastCredits, simulateNepExit, validateSwayamCap } from "@/lib/nadSyncEngine";
import { PROGRAM_TOTAL_CREDITS, creditsThroughSemester, projectedCreditsThrough, twinFor, twinTotals } from "@/lib/studentData";
import { useT } from "../portal/I18n";
import { Button, Card, ICON, Notice, Pill, ProgressBar, SectionTitle, Toggle } from "../portal/ui";

// Both calculators are pure functions, so they run here in the browser: dragging a slider never calls the server.

/** "If I leave after semester N": which certificate, diploma or degree the credits would qualify for. */
export function ExitSimulator({ studentId }: { studentId: string }) {
  const { t } = useT();
  const twin = useMemo(() => twinFor(studentId) ?? [], [studentId]);
  const totals = useMemo(() => twinTotals(twin), [twin]);
  const [exitAfter, setExitAfter] = useState(totals.completedThrough);
  // The 4 skill credits are not on the record, so they start off and the student tells us.
  const [vocational, setVocational] = useState(false);

  const earnedAtExit = creditsThroughSemester(exitAfter, twin);
  const projectedAtExit = projectedCreditsThrough(exitAfter, twin);
  const isProjection = projectedAtExit > earnedAtExit;
  const vocationalCredits = vocational ? 4 : 0;
  const nep = useMemo(() => simulateNepExit(earnedAtExit, vocationalCredits), [earnedAtExit, vocationalCredits]);
  const projection = useMemo(() => (isProjection ? simulateNepExit(projectedAtExit, vocationalCredits) : null), [isProjection, projectedAtExit, vocationalCredits]);

  return (
    <Card>
      <SectionTitle title={t("nep.exit.title")} hint={t("nep.exit.hint")} />
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <label htmlFor="exit-sem" className="flex items-baseline justify-between text-sm">
          <span className="text-white/80">{t("nep.ifExit")}</span>
          <span className="text-xl font-semibold tabular-nums">{exitAfter}</span>
        </label>
        <input id="exit-sem" type="range" min={1} max={8} value={exitAfter} onChange={(e) => setExitAfter(Number(e.target.value))} className="mt-3 w-full accent-[var(--accent)]" />
        <p className="mt-2 text-sm text-white/75">
          {exitAfter <= totals.completedThrough
            ? t("nep.earnedBy", { n: earnedAtExit, sem: exitAfter })
            : t("nep.earnedSoFar", { n: earnedAtExit }) + t("nep.completeThrough", { n: totals.completedThrough })}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-sm">
          <div>
            <span className="text-white/80">{t("nep.vocational")}</span>
            <p className="text-xs text-white/65">{t("nep.vocationalHint")}</p>
          </div>
          <Toggle checked={vocational} onChange={setVocational} label={t("nep.vocationalLabel")} />
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {nep.options.map((o) => (
          <li key={o.level} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${o.eligible ? "border-accent/40 bg-accent/10" : "border-white/10 bg-white/[0.03]"}`}>
            <div>
              <p className="font-semibold">{t(`nep.level.${o.level}`)}</p>
              <p className="text-xs text-white/65">
                {t("nep.minCredits", { n: o.minCredits })}
                {o.level !== "DEGREE" && t("nep.plusSkill")} · {t("nep.yearLower", { n: o.afterYear })}
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
          <p className="mt-1 text-white/80">
            {t("nep.projA", { sem: exitAfter, credits: projectedAtExit })}
            {projection.highestEligible ? t("nep.projYes", { label: t(`nep.level.${projection.highestEligible.level}`) }) : t("nep.projNo")}
          </p>
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-white/65">{t("nep.reentry", { years: nep.reEntry.abcValidityYears })}</p>
    </Card>
  );
}

/** Where the student is headed at graduation, and how many online-course (SWAYAM) credits could close a gap. */
export function GraduationForecast({ studentId }: { studentId: string }) {
  const { t } = useT();
  const twin = useMemo(() => twinFor(studentId) ?? [], [studentId]);
  const totals = useMemo(() => twinTotals(twin), [twin]);
  const [planSwayam, setPlanSwayam] = useState(0);

  const forecast = useMemo(
    () =>
      forecastCredits({
        earnedCredits: totals.creditsEarned + planSwayam,
        totalCredits: PROGRAM_TOTAL_CREDITS,
        scheduledRemaining: totals.scheduledRemaining,
        swayamUsed: totals.swayamCredits + planSwayam,
      }),
    [totals, planSwayam]
  );

  // The shortfall before any SWAYAM is added decides how many credits to recommend.
  const baseShortfall = Math.max(0, PROGRAM_TOTAL_CREDITS - (totals.creditsEarned + totals.scheduledRemaining.reduce((a, b) => a + b, 0)));
  const cap = validateSwayamCap(PROGRAM_TOTAL_CREDITS, totals.swayamCredits).capCredits;
  const recommended = Math.min(baseShortfall, Math.max(0, cap - totals.swayamCredits));
  const swayam = forecast.swayam;

  return (
    <Card>
      <SectionTitle title={t("nep.fc.title")} hint={t("nep.fc.hint")} />
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-white/80">{t("nep.projectedAtGrad")}</span>
          <span className="text-xl font-semibold tabular-nums">
            {forecast.projectedAtGraduation}/{forecast.totalCredits}
          </span>
        </div>
        <div className="mt-3">
          <ProgressBar value={forecast.projectedAtGraduation} max={forecast.totalCredits} tone={forecast.onTrack ? "accent" : "amber"} label={t("nep.projectedCredits")} />
        </div>
        <p className="mt-3 text-sm text-white/75">{t("nep.earnedPlusScheduled", { earned: totals.creditsEarned + planSwayam, scheduled: forecast.scheduledCredits })}</p>
        <div className="mt-3">
          {forecast.onTrack ? <Notice tone="accent">{t("nep.onTrack", { total: forecast.totalCredits })}</Notice> : <Notice tone="amber">{t("nep.shortOf", { n: forecast.shortfall, total: forecast.totalCredits })}</Notice>}
        </div>
      </div>

      {/* Only worth showing when there is a gap to close, or the student has already added some. */}
      {(recommended > 0 || planSwayam > 0) && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-accent-soft">{t("nep.swayamRec", { n: planSwayam || recommended })}</p>
              <p className="text-xs text-white/65">{t("nep.swayamHint")}</p>
            </div>
            <Button size="sm" variant={planSwayam ? "ghost" : "primary"} onClick={() => setPlanSwayam(planSwayam ? 0 : recommended)}>
              {planSwayam ? <CheckCircle2 width={16} height={16} className={`${ICON} text-accent-soft`} /> : <Plus width={16} height={16} className={ICON} />}
              {planSwayam ? t("nep.inPlan") : t("nep.addPlan")}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="flex justify-between text-xs text-white/70">
          <span>{t("nep.swayamCap", { pct: swayam.capPercent })}</span>
          <span className="tabular-nums">
            {swayam.usedCredits}/{swayam.capCredits}
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar value={swayam.usedCredits} max={swayam.capCredits} tone={swayam.valid ? "accent" : "red"} label={t("nep.swayamCapUsed")} />
        </div>
        <p className="mt-2 text-xs text-white/65">
          {swayam.valid
            ? t("nep.swayamMsg.ok", { used: swayam.usedCredits, cap: swayam.capCredits, pct: swayam.usedPercent })
            : t("nep.swayamMsg.over", { used: swayam.usedCredits, pct: swayam.usedPercent, capPct: swayam.capPercent, cap: swayam.capCredits, extra: swayam.usedCredits - swayam.capCredits })}
        </p>
      </div>
    </Card>
  );
}
