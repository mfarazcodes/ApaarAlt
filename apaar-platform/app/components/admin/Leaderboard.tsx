"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { toCsv } from "@/lib/csvExport";
import type { CollegeRow, StudentPage, StudentStatus } from "@/lib/nationalData";
import { api, errorText } from "../portal/api";
import { downloadCsv } from "../portal/csvDownload";
import { useT } from "../portal/I18n";
import { Button, Card, Disclosure, ICON, Notice, Pill, ProgressBar, SectionTitle } from "../portal/ui";
import { useReportStat } from "./ConsoleStats";

const BAND_TONE = { GREEN: "accent", AMBER: "amber", RED: "red", UNRATED: "neutral" } as const;
const STATUS_VIEW: Record<StudentStatus, { tone: "accent" | "blue" | "amber"; label: string }> = {
  ABC_SEEDED: { tone: "accent", label: "con.lb.s.seeded" },
  VERIFIED: { tone: "blue", label: "con.lb.s.verified" },
  UNVERIFIED: { tone: "amber", label: "con.lb.s.unverified" },
};

/**
 * College, then programme, then pseudonymous students. The first two levels show why a score is what it is.
 * The student level (AICTE only) shows tokens, never names.
 */
export default function Leaderboard() {
  const { t } = useT();
  const [colleges, setColleges] = useState<CollegeRow[]>([]);
  const [studentLevel, setStudentLevel] = useState(false);
  const [openCollege, setOpenCollege] = useState<string | null>(null);
  const [programme, setProgramme] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ colleges: CollegeRow[]; studentLevel: boolean }>("/api/national")
      .then((r) => (setColleges(r.colleges), setStudentLevel(r.studentLevel)))
      .catch((e) => setError(errorText(e)));
  }, []);

  const loadStudents = useCallback(async (college: string, prog: string, page: number) => {
    try {
      setStudents(await api<StudentPage>(`/api/national?college=${encodeURIComponent(college)}&programme=${encodeURIComponent(prog)}&page=${page}`));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  function pickProgramme(college: string, prog: string) {
    setProgramme(prog);
    setStudents(null);
    if (studentLevel) loadStudents(college, prog, 1);
  }

  useReportStat("colleges", colleges.length ? colleges.length : null);
  useReportStat("over", colleges.length ? colleges.reduce((n, c) => n + c.overIntakeProgrammes.length, 0) : null);

  function exportColleges() {
    downloadCsv(
      "college-compliance.csv",
      toCsv(
        colleges.map((c) => ({ ...c, over: c.overIntakeProgrammes.join("; ") })),
        [
          { key: "name", header: "College" },
          { key: "state", header: "State" },
          { key: "score", header: "Compliance score" },
          { key: "band", header: "Band" },
          { key: "approvedIntake", header: "Approved intake" },
          { key: "erpEnrolled", header: "ERP enrolled" },
          { key: "verified", header: "Verified" },
          { key: "abcSeeded", header: "ABC seeded" },
          { key: "flagsOpen", header: "Open flags" },
          { key: "over", header: "Programmes over intake" },
        ]
      )
    );
  }

  function exportProgrammes(c: CollegeRow) {
    downloadCsv(
      `${c.code}-programmes.csv`,
      toCsv(c.programmes as unknown as Record<string, unknown>[], [
        { key: "programme", header: "Programme" },
        { key: "approvedIntake", header: "Approved" },
        { key: "erpEnrolled", header: "Enrolled" },
        { key: "verified", header: "Verified" },
        { key: "abcSeeded", header: "ABC seeded" },
        { key: "overBy", header: "Over intake by" },
        { key: "status", header: "Status" },
      ])
    );
  }

  function exportStudents() {
    if (!students) return;
    downloadCsv(
      `${students.college}-${students.programme.replace(/\W+/g, "-")}-page-${students.page}.csv`,
      toCsv(students.rows.map((r) => ({ ...r, flags: r.flags.join("; ") })), [
        { key: "token", header: "Student token" },
        { key: "status", header: "Status" },
        { key: "flags", header: "Flags" },
      ])
    );
  }

  return (
    <Card>
      <SectionTitle title={t("con.lb.title")} hint={t("con.lb.hint")} />
      <div className="mb-3">
        <Disclosure summary={t("con.lb.how")}>
          <p className="text-sm text-white/80">{t("con.lb.formula")}</p>
        </Disclosure>
      </div>
      {error && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}
      <div className="mb-3">
        <Button size="sm" disabled={colleges.length === 0} onClick={exportColleges}>
          <Download width={16} height={16} className={ICON} />
          {t("con.lb.exportColleges")}
        </Button>
      </div>

      <ol className="space-y-2">
        {colleges.map((c, i) => {
          const expanded = openCollege === c.code;
          return (
            <li key={c.code} className="rounded-xl border border-white/10 bg-white/[0.03]">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => {
                  setOpenCollege(expanded ? null : c.code);
                  setProgramme(null);
                  setStudents(null);
                }}
                className="flex w-full items-center gap-3 p-3.5 text-left"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block text-xs text-white/55">
                    {c.state} · {t("con.lb.seats", { n: c.approvedIntake.toLocaleString("en-IN") })} · {t("con.lb.flags", { n: c.flagsOpen })}
                    {c.overIntakeProgrammes.length > 0 && ` · ${t("con.lb.overN", { n: c.overIntakeProgrammes.length })}`}
                  </span>
                </span>
                <Pill tone={BAND_TONE[c.band]}>{c.band === "UNRATED" ? t("con.lb.unrated") : c.score}</Pill>
                <ChevronDown width={16} height={16} className={`${ICON} text-white/55 transition ${expanded ? "rotate-180" : ""}`} />
              </button>

              {expanded && (
                <div className="border-t border-white/10 p-4">
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {c.breakdown.map((b) => (
                      <li key={b.label}>
                        <div className="flex justify-between text-xs text-white/65">
                          <span>{b.label} ({b.weight}%)</span>
                          <span className="tabular-nums">{Math.round(b.value)}</span>
                        </div>
                        <div className="mt-1.5">
                          <ProgressBar value={b.value} max={100} tone={b.value < 60 ? "red" : b.value < 85 ? "amber" : "accent"} label={b.label} />
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/65">{t("con.in.col.programme")}</p>
                    <Button size="sm" onClick={() => exportProgrammes(c)}>
                      <Download width={16} height={16} className={ICON} />
                      {t("con.lb.exportProgrammes")}
                    </Button>
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <caption className="sr-only">{t("con.lb.progAt", { name: c.name })}</caption>
                      <thead className="text-xs uppercase tracking-wider text-white/55">
                        <tr>
                          <th scope="col" className="pb-2 pr-3 font-semibold">{t("con.in.col.programme")}</th>
                          <th scope="col" className="pb-2 pr-3 text-right font-semibold">{t("con.in.col.approved")}</th>
                          <th scope="col" className="pb-2 pr-3 text-right font-semibold">{t("con.in.col.enrolled")}</th>
                          <th scope="col" className="pb-2 pr-3 text-right font-semibold">{t("con.in.col.verified")}</th>
                          <th scope="col" className="pb-2 text-right font-semibold">{t("con.lb.students")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.07]">
                        {c.programmes.map((p) => (
                          <tr key={p.programme} className={programme === p.programme ? "bg-white/[0.05]" : ""}>
                            <td className="py-2 pr-3">{p.programme}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{p.approvedIntake}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {p.erpEnrolled}
                              {p.status === "OVER_INTAKE_PENALTY_RISK" && <Pill tone="red" className="ml-2">+{p.overBy}</Pill>}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">{p.verified}</td>
                            <td className="py-2 text-right">
                              <Button size="sm" disabled={!studentLevel} title={studentLevel ? undefined : t("con.lb.aicteOnly")} onClick={() => pickProgramme(c.code, p.programme)}>
                                {t("con.lb.view")}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!studentLevel && <p className="mt-2 text-xs text-white/65">{t("con.lb.aicteOnly")}</p>}

                  {studentLevel && programme && students && students.college === c.code && (
                    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4" aria-live="polite">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{t("con.lb.studentsIn", { programme: students.programme, n: students.total })}</p>
                        <Button size="sm" onClick={exportStudents}>
                          <Download width={16} height={16} className={ICON} />
                          {t("con.lb.exportPage")}
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-white/65">{t("con.lb.tokens")}</p>
                      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                        {students.rows.map((s) => (
                          <li key={s.token} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs">
                            <span className="font-mono">{s.token}</span>
                            <span className="flex flex-wrap items-center justify-end gap-1.5">
                              {s.flags.map((f) => <span key={f} className="text-amber-200/90">{f}</span>)}
                              <Pill tone={STATUS_VIEW[s.status].tone}>{t(STATUS_VIEW[s.status].label)}</Pill>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex items-center justify-between text-xs text-white/60">
                        <span>{t("con.lb.page", { n: students.page, of: students.pages })}</span>
                        <span className="flex gap-2">
                          <Button size="sm" disabled={students.page <= 1} onClick={() => loadStudents(students.college, students.programme, students.page - 1)}>{t("con.lb.prev")}</Button>
                          <Button size="sm" disabled={students.page >= students.pages} onClick={() => loadStudents(students.college, students.programme, students.page + 1)}>{t("con.lb.next")}</Button>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
