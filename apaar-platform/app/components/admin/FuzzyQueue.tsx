"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Copy, FileText, X } from "lucide-react";
import type { MatchClassification, MatchScoreBreakdown, StudentDemographicRecord } from "@/lib/fuzzyMatcher";
import { api, errorText } from "../portal/api";
import { useT } from "../portal/I18n";
import { Button, Card, Disclosure, ICON, Modal, Notice, Pill, ProgressBar, SectionTitle } from "../portal/ui";
import { useReportStat } from "./ConsoleStats";

interface CaseRow {
  id: string;
  studentRoll: string;
  institution: string;
  erp: StudentDemographicRecord;
  digilocker: StudentDemographicRecord;
  notes: string;
  analysis: MatchScoreBreakdown;
}

type Resolution = "ACCEPTED" | "REJECTED" | "FIXED";

// One colour per status: blue = can be fixed in one click, amber = a person decides, red = will be rejected, green = done.
const CLASS_VIEW: Record<MatchClassification, { tone: "accent" | "amber" | "red" | "blue" | "neutral"; label: string }> = {
  EXACT_MATCH: { tone: "neutral", label: "con.fz.exact" },
  AUTO_FIXABLE: { tone: "blue", label: "con.fz.fixable" },
  SOFT_MISMATCH_REVIEW: { tone: "amber", label: "con.fz.review" },
  HARD_REJECT: { tone: "red", label: "con.fz.reject" },
};

const RESOLUTION_LABEL: Record<Resolution, string> = { ACCEPTED: "con.fz.accepted", FIXED: "con.fz.fixed", REJECTED: "con.fz.rejected" };

export default function FuzzyQueue() {
  const { t } = useT();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [resolved, setResolved] = useState<Record<string, Resolution>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [affidavit, setAffidavit] = useState<{ id: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmFix, setConfirmFix] = useState<CaseRow | null>(null);
  const [fixReason, setFixReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ records: CaseRow[]; decisions: Record<string, { decision: Resolution }> }>("/api/verify/fuzzy-match")
      .then((r) => {
        setRows(r.records);
        setResolved(Object.fromEntries(Object.entries(r.decisions).map(([id, d]) => [id, d.decision])));
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  /** Saves the decision on the server, which also writes it to the audit log. The screen follows the server. */
  async function decide(id: string, decision: Resolution, reason?: string): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await api("/api/verify/fuzzy-match", { action: "RESOLVE", caseId: id, decision, reason: reason?.trim() || undefined });
      setResolved((cur) => ({ ...cur, [id]: decision }));
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openAffidavit(id: string) {
    try {
      const res = await api<{ affidavit: string }>("/api/verify/fuzzy-match", { action: "AFFIDAVIT", caseId: id });
      setCopied(false);
      setAffidavit({ id, text: res.affidavit });
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError(t("con.fz.copyFailed"));
    }
  }

  const review = rows.filter((r) => r.analysis.classification !== "EXACT_MATCH");
  const exactCount = rows.length - review.length;
  const done = review.filter((r) => resolved[r.id]).length;
  useReportStat("names", rows.length ? review.length - done : null);

  return (
    <Card>
      <SectionTitle title={t("con.fz.title")} hint={t("con.fz.hint")} />
      {error && <div className="mb-4"><Notice tone="red">{error}</Notice></div>}

      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone="blue">{t("con.fz.nFixable", { n: rows.filter((r) => r.analysis.classification === "AUTO_FIXABLE").length })}</Pill>
        <Pill tone="amber">{t("con.fz.nReview", { n: rows.filter((r) => r.analysis.classification === "SOFT_MISMATCH_REVIEW").length })}</Pill>
        <Pill tone="accent">{t("con.fz.nDone", { done, total: review.length })}</Pill>
        <Pill>{t("con.fz.nExact", { n: exactCount })}</Pill>
      </div>

      <ul className="space-y-3">
        {review.map((r) => {
          const view = CLASS_VIEW[r.analysis.classification];
          const res = resolved[r.id];
          const expanded = open === r.id;
          return (
            <li key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03]">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={t("con.fz.detailsFor", { name: r.erp.name })}
                  onClick={() => setOpen(expanded ? null : r.id)}
                  className="rounded-lg p-1 text-white/65 hover:bg-white/10"
                >
                  <ChevronDown width={16} height={16} className={`${ICON} transition ${expanded ? "rotate-180" : ""}`} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                    <span>&ldquo;{r.erp.name}&rdquo;</span>
                    <ArrowRight width={16} height={16} className={`${ICON} text-accent-soft`} />
                    <span className="text-white/80">&ldquo;{r.digilocker.name}&rdquo;</span>
                  </p>
                  <p className="mt-0.5 text-xs text-white/65">{r.studentRoll} · {r.institution}</p>
                </div>
                <Pill tone={view.tone}>{t(view.label)}</Pill>
                {res && <Pill tone={res === "REJECTED" ? "red" : "accent"}>{t(RESOLUTION_LABEL[res])}</Pill>}
              </div>

              {expanded && (
                <div className="border-t border-white/10 px-4 pb-4 pt-3">
                  {/* What is different and what to do about it come first. The scores are under Details. */}
                  <p className="text-sm text-white/80">{r.notes}</p>
                  {r.analysis.suggestedFixes.map((f) => (
                    <p key={f.text} className="mt-3 text-sm text-sky-300">{f.text}</p>
                  ))}
                  {r.analysis.discrepancies.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-200/90">
                      {r.analysis.discrepancies.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                  )}
                  <Disclosure summary={t("con.fz.details")} className="mt-4">
                    <p className="text-sm text-white/80">{t("con.fz.sameConfidence", { n: r.analysis.sameIdentityConfidence })}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-white/65">{t("con.fz.accepts")}</span>
                      {([["con.fz.f.name", r.analysis.apiWillAccept.name], ["con.fz.f.dob", r.analysis.apiWillAccept.dob], ["con.fz.f.gender", r.analysis.apiWillAccept.gender]] as const).map(([label, ok]) => (
                        <Pill key={label} tone={ok === null ? "neutral" : ok ? "accent" : "red"}>{t(label)}: {ok === null ? t("con.fz.notCompared") : ok ? t("con.fz.yes") : t("con.fz.no")}</Pill>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {([
                        ["con.fz.f.name", r.analysis.nameFinalScore],
                        ["con.fz.f.dob", r.analysis.dobScore],
                        ["con.fz.f.gender", r.analysis.genderScore],
                      ] as [string, number | null][]).map(([label, value]) =>
                        value === null ? (
                          <div key={label} className="text-xs text-white/65">{t(label)}: {t("con.fz.missing")}</div>
                        ) : (
                          <div key={label}>
                            <div className="flex justify-between text-xs text-white/70"><span>{t(label)}</span><span className="tabular-nums">{value}%</span></div>
                            <div className="mt-1.5"><ProgressBar value={value} max={100} tone={value < 65 ? "red" : value < 100 ? "amber" : "accent"} label={t(label)} /></div>
                          </div>
                        )
                      )}
                    </div>
                    {r.analysis.reconciliationNotes.length > 0 && (
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-white/70">
                        {r.analysis.reconciliationNotes.map((n) => <li key={n}>{n}</li>)}
                      </ul>
                    )}
                  </Disclosure>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
                {r.analysis.classification === "AUTO_FIXABLE" ? (
                  <Button size="sm" variant="primary" disabled={busy || res === "FIXED"} onClick={() => { setFixReason(""); setConfirmFix(r); }}>
                    <Check width={16} height={16} className={ICON} />{t("con.fz.applyFix")}
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" disabled={busy || r.analysis.classification === "HARD_REJECT"} title={r.analysis.classification === "HARD_REJECT" ? t("con.fz.hardRejectTitle") : undefined} onClick={() => decide(r.id, "ACCEPTED")}>
                    <Check width={16} height={16} className={ICON} />{t("con.fz.accept")}
                  </Button>
                )}
                <Button size="sm" disabled={busy} onClick={() => decide(r.id, "REJECTED")}>
                  <X width={16} height={16} className={ICON} />{t("con.fz.reject")}
                </Button>
                {r.analysis.classification === "SOFT_MISMATCH_REVIEW" && (
                  <Button size="sm" onClick={() => openAffidavit(r.id)}>
                    <FileText width={16} height={16} className={ICON} />{t("con.fz.affidavit")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {review.length === 0 && rows.length > 0 && <p className="text-sm text-white/70">{t("con.fz.none")}</p>}

      {exactCount > 0 && (
        <Disclosure summary={t("con.fz.showExact", { n: exactCount })} className="mt-4">
          <ul className="space-y-1.5 text-sm text-white/75">
            {rows.filter((r) => r.analysis.classification === "EXACT_MATCH").map((r) => (
              <li key={r.id}>&ldquo;{r.erp.name}&rdquo; · <span className="text-xs text-white/65">{r.studentRoll}</span></li>
            ))}
          </ul>
        </Disclosure>
      )}

      <Modal open={Boolean(confirmFix)} onClose={() => setConfirmFix(null)} title={t("con.fz.modalTitle")}>
        {confirmFix && (
          <>
            <p className="text-sm text-white/80">
              {t("con.fz.modalBody", { from: confirmFix.erp.name, to: confirmFix.digilocker.name })}
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1.5 block text-white/75">{t("con.fz.reason")}</span>
              <input value={fixReason} onChange={(e) => setFixReason(e.target.value)} maxLength={300} className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/55 focus:border-accent focus:outline-none" placeholder={t("con.fz.reasonEx")} />
            </label>
            {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setConfirmFix(null)}>{t("session.cancel")}</Button>
              <Button variant="primary" disabled={busy} onClick={async () => { if (await decide(confirmFix.id, "FIXED", fixReason)) setConfirmFix(null); }}>{t("con.fz.confirm")}</Button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={Boolean(affidavit)} onClose={() => setAffidavit(null)} title={t("con.fz.affTitle")}>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-white/[0.06] p-4 text-xs leading-relaxed text-white/85">{affidavit?.text}</pre>
        <p className="mt-3 text-xs text-amber-200/90">{t("con.fz.affNote")}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => affidavit && copy(affidavit.text)}>
            <Copy width={16} height={16} className={ICON} />{copied ? t("qr.copied") : t("con.fz.copyText")}
          </Button>
          <Button variant="primary" onClick={() => setAffidavit(null)}>{t("con.fz.done")}</Button>
        </div>
      </Modal>
    </Card>
  );
}
