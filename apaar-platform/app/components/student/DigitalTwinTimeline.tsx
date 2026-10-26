"use client";

import { useState } from "react";
import { Award, Briefcase, CheckCircle2, CircleDashed, TriangleAlert } from "lucide-react";
import { PROGRAM_TOTAL_CREDITS, STUDENT_PROFILE, TWIN, semesterCreditsEarned, semesterSgpa, twinTotals } from "@/lib/studentData";
import { Card, Eyebrow, ICON, Pill, ProgressBar, SectionTitle } from "../portal/ui";

const GRADE_TONE = (g: string) => (g === "F" ? "red" : g === "O" || g === "A+" ? "accent" : "neutral");

export default function DigitalTwinTimeline() {
  const totals = twinTotals();
  const [selected, setSelected] = useState(totals.completedThrough);
  const sem = TWIN.find((s) => s.semester === selected) ?? TWIN[0];
  const openBacklogs = TWIN.flatMap((s) => s.backlogs).filter((b) => !b.clearedInSemester).length;

  return (
    <Card>
      <SectionTitle
        eyebrow="Academic Digital Twin"
        title="Semester-by-semester timeline"
        hint={`${STUDENT_PROFILE.program}. Pick a semester to see subjects, credits, internships, certificates and backlogs.`}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="ABC credits" value={`${totals.creditsEarned}/${PROGRAM_TOTAL_CREDITS}`}>
          <ProgressBar value={totals.creditsEarned} max={PROGRAM_TOTAL_CREDITS} label="Credits earned" />
        </Stat>
        <Stat label="CGPA" value={totals.cgpa.toFixed(2)} />
        <Stat label="SWAYAM credits" value={String(totals.swayamCredits)} />
        <Stat label="Open backlogs" value={String(openBacklogs)} tone={openBacklogs ? "red" : "accent"} />
      </div>

      <ol className="mt-6 flex items-center overflow-x-auto pb-2" aria-label="Semesters">
        {TWIN.map((s, i) => {
          const planned = s.status === "PLANNED";
          const active = s.semester === selected;
          return (
            <li key={s.semester} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => setSelected(s.semester)}
                aria-current={active ? "step" : undefined}
                aria-label={`Semester ${s.semester}, ${planned ? "planned" : "completed"}`}
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
              <CheckCircle2 width={16} height={16} className={`${ICON} text-accent`} />
            ) : (
              <CircleDashed width={16} height={16} className={`${ICON} text-white/60`} />
            )}
            Semester {sem.semester}
            <span className="text-sm font-normal text-white/60">Year {sem.year}</span>
          </h3>
          <div className="flex items-center gap-2">
            {semesterSgpa(sem) !== null && <Pill tone="accent">SGPA {semesterSgpa(sem)?.toFixed(2)}</Pill>}
            <Pill>{semesterCreditsEarned(sem)} credits {sem.status === "PLANNED" ? "planned" : "earned"}</Pill>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="sr-only">Subjects in semester {sem.semester}</caption>
            <thead className="text-xs uppercase tracking-wider text-white/55">
              <tr>
                <th scope="col" className="pb-2 pr-3 font-semibold">Code</th>
                <th scope="col" className="pb-2 pr-3 font-semibold">Subject</th>
                <th scope="col" className="pb-2 pr-3 text-right font-semibold">Credits</th>
                <th scope="col" className="pb-2 text-right font-semibold">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {sem.courses.map((c) => (
                <tr key={`${c.code}-${c.title}`}>
                  <td className="py-2.5 pr-3 font-mono text-xs text-white/60">{c.code}</td>
                  <td className="py-2.5 pr-3">
                    {c.title}
                    {c.swayam && <Pill tone="blue" className="ml-2">SWAYAM</Pill>}
                    {c.backlogClearedFrom && <Pill tone="amber" className="ml-2">Backlog from Sem {c.backlogClearedFrom}</Pill>}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{c.credits}</td>
                  <td className="py-2.5 text-right">
                    {sem.status === "COMPLETED" ? <Pill tone={GRADE_TONE(c.grade)}>{c.grade}</Pill> : <span className="text-white/45">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Extras
            icon={<Briefcase width={16} height={16} className={ICON} />}
            title="Internships"
            empty="None this semester"
            items={sem.internships.map((i) => `${i.org} · ${i.weeks} weeks · ${i.mode === "REMOTE" ? "Remote" : "On-site"}`)}
          />
          <Extras
            icon={<Award width={16} height={16} className={ICON} />}
            title="Certificates"
            empty="None this semester"
            items={sem.certificates.map((c) => `${c.title} (${c.issuer})`)}
          />
          <Extras
            icon={<TriangleAlert width={16} height={16} className={ICON} />}
            title="Backlogs"
            empty="No backlogs"
            tone={sem.backlogs.length ? "amber" : undefined}
            items={sem.backlogs.map((b) => `${b.code} ${b.title}: ${b.clearedInSemester ? `cleared in Sem ${b.clearedInSemester}` : "open"}`)}
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
        <p className="mt-2 text-sm text-white/45">{empty}</p>
      )}
    </div>
  );
}
