"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Lock, Plus } from "lucide-react";
import type { CreditForecast, NepExitResult } from "@/lib/nadSyncEngine";
import { PROGRAM_TOTAL_CREDITS, creditsThroughSemester, twinTotals } from "@/lib/studentData";
import { api, errorText } from "../portal/api";
import { Button, Card, Eyebrow, ICON, Notice, Pill, ProgressBar, SectionTitle, Toggle } from "../portal/ui";

export default function NepForecaster() {
  const totals = twinTotals();
  const [exitAfter, setExitAfter] = useState(totals.completedThrough);
  const [vocational, setVocational] = useState(true);
  const [planSwayam, setPlanSwayam] = useState(0);
  const [nep, setNep] = useState<NepExitResult | null>(null);
  const [forecast, setForecast] = useState<CreditForecast | null>(null);
  const [error, setError] = useState("");

  const earnedAtExit = creditsThroughSemester(exitAfter);

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
        eyebrow="NEP 2020"
        title="Exit / re-entry and credit forecaster"
        hint="See where you stand if you leave after a given semester, and whether you reach 160 credits on schedule."
      />
      {error && <Notice tone="red">{error}</Notice>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Exit simulator */}
        <div>
          <Eyebrow>Multiple entry / exit simulator</Eyebrow>
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <label htmlFor="exit-sem" className="flex items-baseline justify-between text-sm">
              <span className="text-white/75">If I exit after semester</span>
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
              {earnedAtExit} credits earned{exitAfter > totals.completedThrough && " (assuming planned semesters are cleared)"}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-sm">
              <span className="text-white/75">4 skill / vocational credits done</span>
              <Toggle checked={vocational} onChange={setVocational} label="Skill or vocational credits completed" />
            </div>
          </div>

          <ul className="mt-3 space-y-2">
            {nep?.options.map((o) => (
              <li key={o.level} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${o.eligible ? "border-accent/40 bg-accent/10" : "border-white/10 bg-white/[0.03]"}`}>
                <div>
                  <p className="font-semibold">{o.label}</p>
                  <p className="text-xs text-white/60">
                    {o.minCredits} credits{o.level !== "DEGREE" && " + 4 skill credits"} · year {o.afterYear}
                  </p>
                </div>
                {o.eligible ? (
                  <Pill tone="accent">
                    <CheckCircle2 width={16} height={16} className="h-3.5 w-3.5 shrink-0" />
                    Eligible
                  </Pill>
                ) : (
                  <Pill tone="amber">
                    <Lock width={16} height={16} className="h-3.5 w-3.5 shrink-0" />
                    {o.creditShortfall > 0 ? `${o.creditShortfall} credits short` : `${o.vocationalShortfall} skill credits short`}
                  </Pill>
                )}
              </li>
            ))}
          </ul>
          {nep && <p className="mt-3 text-xs leading-relaxed text-white/55">{nep.reEntry.note}</p>}
        </div>

        {/* Credit forecaster */}
        <div>
          <Eyebrow>Graduation credit forecast</Eyebrow>
          {forecast && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-white/75">Projected at graduation</span>
                <span className="text-xl font-semibold tabular-nums">
                  {forecast.projectedAtGraduation}/{forecast.totalCredits}
                </span>
              </div>
              <div className="mt-3">
                <ProgressBar value={forecast.projectedAtGraduation} max={forecast.totalCredits} tone={forecast.onTrack ? "accent" : "amber"} label="Projected credits" />
              </div>
              <p className="mt-3 text-sm text-white/70">
                {totals.creditsEarned + planSwayam} earned + {forecast.scheduledCredits} scheduled in the final semesters.
              </p>
              {forecast.onTrack ? (
                <div className="mt-3">
                  <Notice tone="accent">On track to reach {forecast.totalCredits} credits.</Notice>
                </div>
              ) : (
                <div className="mt-3">
                  <Notice tone="amber">
                    {forecast.shortfall} credits short of {forecast.totalCredits}.
                  </Notice>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-accent">+{recommended} SWAYAM credits recommended</p>
                <p className="text-xs text-white/60">Closes the gap through approved MOOCs</p>
              </div>
              <Button
                size="sm"
                variant={planSwayam ? "ghost" : "primary"}
                disabled={recommended === 0 && planSwayam === 0}
                onClick={() => setPlanSwayam(planSwayam ? 0 : recommended)}
              >
                {planSwayam ? (
                  <CheckCircle2 width={16} height={16} className={`${ICON} text-accent`} />
                ) : (
                  <Plus width={16} height={16} className={ICON} />
                )}
                {planSwayam ? "In plan" : "Add to plan"}
              </Button>
            </div>
            {forecast && (
              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="flex justify-between text-xs text-white/65">
                  <span>SWAYAM cap ({forecast.swayam.capPercent}% of the programme)</span>
                  <span className="tabular-nums">
                    {forecast.swayam.usedCredits}/{forecast.swayam.capCredits}
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar value={forecast.swayam.usedCredits} max={forecast.swayam.capCredits} tone={forecast.swayam.valid ? "accent" : "red"} label="SWAYAM cap used" />
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
