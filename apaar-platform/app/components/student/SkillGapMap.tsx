"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Circle, CircleDashed, Plus } from "lucide-react";
import { GAP_SUGGESTIONS, ROLES, assessReadiness, type SkillStatus } from "@/lib/skillMap";
import { twinFor, twinTotals, type TwinSemester } from "@/lib/studentData";
import { Button, Card, Eyebrow, ICON, Pill, ProgressBar, SectionTitle, Tabs } from "../portal/ui";

const STATUS_STYLE: Record<SkillStatus, { tone: "accent" | "blue" | "neutral"; label: string }> = {
  COVERED: { tone: "accent", label: "Covered" },
  IN_PLAN: { tone: "blue", label: "In plan" },
  GAP: { tone: "neutral", label: "Gap" },
};

function Ring({ score }: { score: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg width={96} height={96} viewBox="0 0 96 96" role="img" aria-label={`Placement readiness ${score} out of 100`} className="h-24 w-24 -rotate-90">
        <circle cx={48} cy={48} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={8} />
        <circle
          cx={48}
          cy={48}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-2xl font-semibold tabular-nums">{score}</span>
    </div>
  );
}

export default function SkillGapMap({ studentId }: { studentId: string }) {
  const TWIN = useMemo(() => twinFor(studentId) ?? [], [studentId]);
  const [roleId, setRoleId] = useState(ROLES[0].id);
  const [plan, setPlan] = useState<string[]>([]);
  const totals = twinTotals(TWIN);
  const internships = TWIN.flatMap((s) => s.internships).length;

  const role = ROLES.find((r) => r.id === roleId) ?? ROLES[0];

  // Skills the student has added to their plan count as half-covered, like planned coursework.
  const twin = useMemo<TwinSemester[]>(() => {
    if (!plan.length) return TWIN;
    const extra: TwinSemester = {
      semester: 99,
      year: 5,
      status: "PLANNED",
      courses: plan.map((skill) => ({ code: skill, title: `Planned: ${GAP_SUGGESTIONS[skill]?.title ?? skill}`, credits: 3, grade: "A", skills: [skill] })),
      internships: [],
      certificates: [],
      backlogs: [],
    };
    return [...TWIN, extra];
  }, [plan, TWIN]);

  const result = assessReadiness(role, twin, totals.cgpa, internships);

  function togglePlan(skill: string) {
    setPlan((p) => (p.includes(skill) ? p.filter((s) => s !== skill) : [...p, skill]));
  }

  return (
    <Card>
      <SectionTitle
        eyebrow="Placement readiness"
        title="Skill-to-curriculum gap map"
        hint="Pick a target role. Your completed courses, internships and certificates are matched against the skills it needs."
      />

      <Tabs tabs={ROLES.map((r) => ({ id: r.id, label: r.label }))} value={roleId} onChange={setRoleId} label="Target role" size="sm" />

      <div id={`panel-${roleId}`} role="tabpanel" aria-labelledby={`tab-${roleId}`} className="mt-5 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div>
          <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <Ring score={result.score} />
            <div>
              <Eyebrow>Readiness score</Eyebrow>
              <p className="mt-1 text-sm text-white/70">{result.coverage}% of {role.label} skills covered</p>
            </div>
          </div>
          <ul className="mt-3 space-y-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            {result.breakdown.map((b) => (
              <li key={b.label}>
                <div className="flex justify-between text-xs text-white/70">
                  <span>{b.label} ({b.weight}%)</span>
                  <span className="tabular-nums">{b.value}</span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar value={b.value} max={100} label={b.label} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {result.skills.map((s) => {
              const st = STATUS_STYLE[s.status];
              const Icon = s.status === "COVERED" ? CheckCircle2 : s.status === "IN_PLAN" ? CircleDashed : Circle;
              return (
                <li key={s.skill} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Icon width={16} height={16} className={`${ICON} ${s.status === "COVERED" ? "text-accent" : "text-white/45"}`} />
                      {s.label}
                    </p>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </div>
                  <p className="mt-1.5 text-xs text-white/60">
                    {s.evidence.length ? s.evidence.slice(0, 2).join(" · ") : "No coursework or experience yet"}
                  </p>
                </li>
              );
            })}
          </ul>

          {result.gaps.length > 0 && (
            <div className="mt-4">
              <Eyebrow>Close the gaps</Eyebrow>
              <ul className="mt-2 space-y-2">
                {result.gaps.map((g) => {
                  const hint = GAP_SUGGESTIONS[g.skill];
                  return (
                    <li key={g.skill} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm">
                      <span>
                        <span className="font-medium">{hint?.title ?? g.label}</span>
                        <span className="block text-xs text-white/55">{hint ? `${hint.via} · ${hint.credits} credits` : "Look for a related elective"}</span>
                      </span>
                      <Button size="sm" onClick={() => togglePlan(g.skill)}>
                        <Plus width={16} height={16} className={ICON} />
                        Add to plan
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {plan.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/65">
              In plan:
              {plan.map((p) => (
                <button key={p} type="button" onClick={() => togglePlan(p)} className="rounded-md bg-sky-400/15 px-2 py-1 text-sky-300 hover:bg-sky-400/25" aria-label={`Remove ${GAP_SUGGESTIONS[p]?.title ?? p} from plan`}>
                  {GAP_SUGGESTIONS[p]?.title ?? p} ✕
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
