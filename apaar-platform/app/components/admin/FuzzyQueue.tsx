"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Check, ChevronDown, Copy, FileText, X } from "lucide-react";
import type { MatchClassification, MatchScoreBreakdown, StudentDemographicRecord } from "@/lib/fuzzyMatcher";
import { api, errorText } from "../portal/api";
import { Button, Card, ICON, Modal, Notice, Pill, ProgressBar, SectionTitle } from "../portal/ui";

interface CaseRow {
  id: string;
  studentRoll: string;
  institution: string;
  erp: StudentDemographicRecord;
  digilocker: StudentDemographicRecord;
  notes: string;
  analysis: MatchScoreBreakdown;
}

type Resolution = "ACCEPTED" | "REJECTED";

const CLASS_VIEW: Record<MatchClassification, { tone: "accent" | "amber" | "red"; label: string }> = {
  EXACT_MATCH: { tone: "accent", label: "Exact" },
  SOFT_MISMATCH_REVIEW: { tone: "amber", label: "Needs review" },
  HARD_REJECT: { tone: "red", label: "Hard reject" },
};

export default function FuzzyQueue() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [resolved, setResolved] = useState<Record<string, Resolution>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [affidavit, setAffidavit] = useState<{ id: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ records: CaseRow[] }>("/api/verify/fuzzy-match")
      .then((r) => setRows(r.records))
      .catch((e) => setError(errorText(e)));
  }, []);

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
      setError("Copy failed. Select the text and copy it manually.");
    }
  }

  const review = rows.filter((r) => r.analysis.classification !== "EXACT_MATCH");
  const done = review.filter((r) => resolved[r.id]).length;

  return (
    <Card>
      <SectionTitle
        eyebrow="Fuzzy match resolution queue"
        title="Resolve ERP and DigiLocker mismatches"
        hint="Exact matches pass through on their own. Everything else waits here for a registrar."
      />
      {error && <div className="mb-4"><Notice tone="red">{error}</Notice></div>}

      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone="accent">{rows.length - review.length} exact</Pill>
        <Pill tone="amber">{review.length} for review</Pill>
        <Pill tone="blue">{done} of {review.length} resolved</Pill>
      </div>

      <ul className="space-y-3">
        {rows.map((r) => {
          const view = CLASS_VIEW[r.analysis.classification];
          const res = resolved[r.id];
          const expanded = open === r.id;
          const exact = r.analysis.classification === "EXACT_MATCH";
          return (
            <li key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03]">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={`Details for ${r.erp.name}`}
                  onClick={() => setOpen(expanded ? null : r.id)}
                  className="rounded-lg p-1 text-white/60 hover:bg-white/10"
                >
                  <ChevronDown width={16} height={16} className={`${ICON} transition ${expanded ? "rotate-180" : ""}`} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                    <span>&ldquo;{r.erp.name}&rdquo;</span>
                    <ArrowLeftRight width={16} height={16} className={`${ICON} text-accent`} />
                    <span className="text-white/75">&ldquo;{r.digilocker.name}&rdquo;</span>
                  </p>
                  <p className="mt-0.5 text-xs text-white/55">{r.studentRoll} · {r.institution}</p>
                </div>
                <Pill tone={view.tone}>{view.label} · {r.analysis.overallConfidence}%</Pill>
                {res && <Pill tone={res === "ACCEPTED" ? "accent" : "red"}>{res === "ACCEPTED" ? "Accepted" : "Rejected"}</Pill>}
              </div>

              {expanded && (
                <div className="border-t border-white/10 px-4 pb-4 pt-3">
                  <p className="text-sm text-white/70">{r.notes}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {[
                      ["Name", r.analysis.nameFinalScore],
                      ["Date of birth", r.analysis.dobScore],
                      ["Gender", r.analysis.genderScore],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <div className="flex justify-between text-xs text-white/65"><span>{label}</span><span className="tabular-nums">{value}%</span></div>
                        <div className="mt-1.5"><ProgressBar value={value as number} max={100} tone={(value as number) < 65 ? "red" : (value as number) < 100 ? "amber" : "accent"} label={label as string} /></div>
                      </div>
                    ))}
                  </div>
                  {[...r.analysis.discrepancies, ...r.analysis.reconciliationNotes].length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-white/65">
                      {r.analysis.discrepancies.map((d) => <li key={d} className="text-amber-200/90">{d}</li>)}
                      {r.analysis.reconciliationNotes.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {!exact && (
                <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
                  <Button size="sm" variant="primary" disabled={r.analysis.classification === "HARD_REJECT"} title={r.analysis.classification === "HARD_REJECT" ? "A hard reject cannot be accepted" : undefined} onClick={() => setResolved({ ...resolved, [r.id]: "ACCEPTED" })}>
                    <Check width={16} height={16} className={ICON} />Accept match
                  </Button>
                  <Button size="sm" onClick={() => setResolved({ ...resolved, [r.id]: "REJECTED" })}>
                    <X width={16} height={16} className={ICON} />Reject
                  </Button>
                  {r.analysis.classification === "SOFT_MISMATCH_REVIEW" && (
                    <Button size="sm" onClick={() => openAffidavit(r.id)}>
                      <FileText width={16} height={16} className={ICON} />Provisional affidavit
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Modal open={Boolean(affidavit)} onClose={() => setAffidavit(null)} title="Provisional affidavit">
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-white/[0.06] p-4 text-xs leading-relaxed text-white/85">{affidavit?.text}</pre>
        <p className="mt-3 text-xs text-amber-200/90">A draft for the registrar to review. It only has legal effect once executed before a notary or oath commissioner.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => affidavit && copy(affidavit.text)}>
            <Copy width={16} height={16} className={ICON} />{copied ? "Copied" : "Copy text"}
          </Button>
          <Button variant="primary" onClick={() => setAffidavit(null)}>Done</Button>
        </div>
      </Modal>
    </Card>
  );
}
