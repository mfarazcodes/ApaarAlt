"use client";

import { useState } from "react";
import { Award, Briefcase, CheckCircle2, CircleDashed, TriangleAlert } from "lucide-react";
import { PROGRAM_TOTAL_CREDITS, profileFor, semesterCreditsEarned, semesterSgpa, twinFor, twinTotals } from "@/lib/studentData";
import { useT } from "../portal/I18n";
import { Card, Eyebrow, ICON, Pill, ProgressBar, SectionTitle } from "../portal/ui";

const GRADE_TONE = (g: string) => (g === "F" ? "red" : g === "O" || g === "A+" ? "accent" : "neutral");

export default function DigitalTwinTimeline({ studentId }: { studentId: string }) {
  const { t } = useT();
  const TWIN = twinFor(studentId) ?? [];
  const profile = profileFor(studentId);
  const totals = twinTotals(TWIN);
  const [selected, setSelected] = useState(totals.completedThrough);
  const sem = TWIN.find((s) => s.semester === selected) ?? TWIN[0];
  const openBacklogs = TWIN.flatMap((s) => s.backlogs).filter((b) => !b.clearedInSemester).length;

  return (
    <Card>
      <SectionTitle
        eyebrow={t("twin.eyebrow")}
        title={t("twin.title")}
        hint={t("twin.hint", { program: profile?.program ?? t("twin.yourProgramme") })}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={t("twin.stat.credits")} value={`${totals.creditsEarned}/${PROGRAM_TOTAL_CREDITS}`}>
          <ProgressBar value={totals.creditsEarned} max={PROGRAM_TOTAL_CREDITS} label={t("twin.creditsEarned")} />
        </Stat>
        <Stat label={t("twin.stat.cgpa")} value={totals.cgpa.toFixed(2)} />
        <Stat label={t("twin.stat.swayam")} value={String(totals.swayamCredits)} />
        <Stat label={t("twin.stat.backlogs")} value={String(openBacklogs)} tone={openBacklogs ? "red" : "accent"} />
      </div>

      <ol className="mt-6 flex items-center overflow-x-auto pb-2" aria-label={t("twin.semesters")}>
        {TWIN.map((s, i) => {
          const planned = s.status === "PLANNED";
          const active = s.semester === selected;
          return (
            <li key={s.semester} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => setSelected(s.semester)}
                aria-current={active ? "step" : undefined}
                aria-label={t("twin.semAria", { n: s.semester, state: t(planned ? "twin.planned" : "twin.completed") })}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold transition ${
                  active
                    ? "bg-white text-deep ring-4 ring-accent/40"
                    : planned
                      ? "border border-dashed border-white/30 text-white/55 hover:text-white"
                      : "bg-accent text-deep hover:brightness-110"
                }`}
              >
                {s.semester}
              </button>
              {i < TWIN.length - 1 && (
                <span className={`mx-1 h-0.5 min-w-4 flex-1 rounded ${planned || TWIN[i + 1].status === "PLANNED" ? "bg-white/10" : "bg-accent"}`} />
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            {sem.status === "COMPLETED" ? (
              <CheckCircle2 width={16} height={16} className={`${ICON} text-accent-soft`} />
            ) : (
              <CircleDashed width={16} height={16} className={`${ICON} text-white/60`} />
            )}
            {t("twin.semester", { n: sem.semester })}
            <span className="text-sm font-normal text-white/60">{t("twin.year", { n: sem.year })}</span>
          </h3>
          <div className="flex items-center gap-2">
            {semesterSgpa(sem) !== null && <Pill tone="accent">{t("twin.sgpa", { value: semesterSgpa(sem)?.toFixed(2) ?? "" })}</Pill>}
            <Pill>{t(sem.status === "PLANNED" ? "twin.creditsPlannedPill" : "twin.creditsEarnedPill", { n: semesterCreditsEarned(sem) })}</Pill>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="sr-only">{t("twin.subjectsCaption", { n: sem.semester })}</caption>
            <thead className="text-xs uppercase tracking-wider text-white/55">
              <tr>
                <th scope="col" className="pb-2 pr-3 font-semibold">{t("twin.col.code")}</th>
                <th scope="col" className="pb-2 pr-3 font-semibold">{t("twin.col.subject")}</th>
                <th scope="col" className="pb-2 pr-3 text-right font-semibold">{t("twin.col.credits")}</th>
                <th scope="col" className="pb-2 text-right font-semibold">{t("twin.col.grade")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {sem.courses.map((c) => (
                <tr key={`${c.code}-${c.title}`}>
                  <td className="py-2.5 pr-3 font-mono text-xs text-white/60">{c.code}</td>
                  <td className="py-2.5 pr-3">
                    {c.title}
                    {c.swayam && <Pill tone="blue" className="ml-2">SWAYAM</Pill>}
                    {c.backlogClearedFrom && <Pill tone="amber" className="ml-2">{t("twin.backlogFrom", { n: c.backlogClearedFrom })}</Pill>}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{c.credits}</td>
                  <td className="py-2.5 text-right">
                    {sem.status === "COMPLETED" ? <Pill tone={GRADE_TONE(c.grade)}>{c.grade}</Pill> : <span className="text-white/55">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Extras
            icon={<Briefcase width={16} height={16} className={ICON} />}
            title={t("twin.internships")}
            empty={t("twin.noneThis")}
            items={sem.internships.map((i) => t("twin.intern.item", { org: i.org, weeks: i.weeks, mode: t(i.mode === "REMOTE" ? "twin.remote" : "twin.onsite") }))}
          />
          <Extras
            icon={<Award width={16} height={16} className={ICON} />}
            title={t("twin.certificates")}
            empty={t("twin.noneThis")}
            items={sem.certificates.map((c) => `${c.title} (${c.issuer})`)}
          />
          <Extras
            icon={<TriangleAlert width={16} height={16} className={ICON} />}
            title={t("twin.backlogs")}
            empty={t("twin.noBacklogs")}
            tone={sem.backlogs.length ? "amber" : undefined}
            items={sem.backlogs.map((b) => `${b.code} ${b.title}: ${b.clearedInSemester ? t("twin.backlog.cleared", { n: b.clearedInSemester }) : t("twin.backlog.open")}`)}
          />
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone, children }: { label: string; value: string; tone?: "red" | "accent"; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <Eyebrow>{label}</Eyebrow>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "red" ? "text-red-300" : ""}`}>{value}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

function Extras({
  icon,
  title,
  items,
  empty,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  empty: string;
  tone?: "amber";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <p className={`flex items-center gap-2 text-sm font-semibold ${tone === "amber" ? "text-amber-300" : "text-white/80"}`}>
        {icon}
        {title}
      </p>
      {items.length ? (
        <ul className="mt-2 space-y-1.5 text-sm text-white/75">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-white/55">{empty}</p>
      )}
    </div>
  );
}
