"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import type { AICTEIntakeCompliance, CourseDiff, NADStudentRecord, SchemaMappingResult } from "@/lib/nadSyncEngine";
import { api, errorText } from "../portal/api";
import { useT } from "../portal/I18n";
import { useToast } from "../portal/Toast";
import { Button, Card, Disclosure, Notice, Pill, SectionTitle, inputClass } from "../portal/ui";
import { useReportStat } from "./ConsoleStats";
import OcrScan from "./OcrScan";

interface PreviewResponse {
  message: string;
  mapping: SchemaMappingResult;
  results: { student: NADStudentRecord; diff: CourseDiff[]; isNew: boolean }[];
  blockingIssues: { studentRoll: string }[];
  updatedCompliance: AICTEIntakeCompliance;
}

const CHANGE_TONE = { ADDED: "accent", CHANGED: "amber", REMOVED: "red", UNCHANGED: "neutral" } as const;

type SampleKey = "original" | "revaluation" | "problem";
const SAMPLE_LABEL: Record<SampleKey, string> = { original: "con.up.sample.original", revaluation: "con.up.sample.reval", problem: "con.up.sample.problem" };

/** Three steps: add a marksheet, check what we found, send it to NAD. */
export default function MarksheetUploader({ onSynced }: { onSynced: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [csv, setCsv] = useState("");
  const [source, setSource] = useState("");
  const [mapping, setMapping] = useState<SchemaMappingResult | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<Record<SampleKey, string> | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  // A sheet read by OCR cannot be previewed or synced until the registrar confirms they checked it.
  const [ocrChecked, setOcrChecked] = useState(false);
  const ocrBlocked = source === "ocr" && !ocrChecked;
  const fileRef = useRef<HTMLInputElement>(null);
  const shownMapping = csv.trim() ? mapping : null;
  const hasBlocking = (preview?.blockingIssues.length ?? 0) > 0;

  // Rows that carry a problem (left out or warned about) in the latest check.
  const problemRows = preview ? preview.results.reduce((n, r) => n + r.student.rowIssues.length, 0) : null;
  useReportStat("rows", problemRows);

  useEffect(() => {
    api<{ sampleMessyCsv: string; sampleRevaluationCsv: string; sampleProblemCsv: string }>("/api/sync/aicte-nad")
      .then((r) => setSamples({ original: r.sampleMessyCsv, revaluation: r.sampleRevaluationCsv, problem: r.sampleProblemCsv }))
      .catch((e) => setError(errorText(e)));
  }, []);

  // The column finder runs as you type, so mistakes in the headers show before anything is sent.
  useEffect(() => {
    if (!csv.trim()) return;
    const timer = setTimeout(() => {
      api<{ mapping: SchemaMappingResult }>("/api/sync/aicte-nad", { action: "MAP_SCHEMA", csvText: csv })
        .then((r) => (setMapping(r.mapping), setError("")))
        .catch((e) => setError(errorText(e)));
    }, 350);
    return () => clearTimeout(timer);
  }, [csv]);

  function load(text: string, label: string) {
    setCsv(text);
    setSource(label);
    setPreview(null);
    setAcknowledged(false);
    setMessage("");
  }

  function onFile(file?: File) {
    if (!file) return;
    file.text().then((text) => load(text, file.name)).catch(() => setError(t("con.up.readFail")));
  }

  async function run(action: "PREVIEW" | "SYNC") {
    setBusy(true);
    setError("");
    try {
      const res = await api<PreviewResponse>("/api/sync/aicte-nad", { action, csvText: csv, acknowledgeIssues: action === "SYNC" ? acknowledged : undefined });
      setPreview(res);
      setMessage(res.message);
      if (action === "SYNC") {
        onSynced();
        toast(t("con.up.sent"));
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const blocked = busy || !csv.trim() || ocrBlocked || Boolean(shownMapping?.missingRequired.length);
  const sourceLabel = source === "ocr" ? t("con.up.ocrSource") : source === "pasted" ? t("con.up.pasted") : source in SAMPLE_LABEL ? t(SAMPLE_LABEL[source as SampleKey]) : source;

  return (
    <Card>
      <SectionTitle title={t("con.up.title")} hint={t("con.up.hint")} />

      {/* Step 1 */}
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-ink text-xs text-white">1</span>
        {t("con.up.step1")}
      </h3>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files[0]);
            }}
            className="rounded-xl border border-dashed border-white/25 bg-white/[0.03] p-5 text-center"
          >
            <UploadCloud width={16} height={16} className="mx-auto h-7 w-7 shrink-0 text-accent-soft" />
            <p className="mt-2 text-sm text-white/75">{t("con.up.drop")}</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label={t("con.up.chooseAria")} />
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={() => fileRef.current?.click()}>{t("con.up.choose")}</Button>
              <label className="sr-only" htmlFor="sample-pick">{t("con.up.sample")}</label>
              <select
                id="sample-pick"
                disabled={!samples}
                value=""
                onChange={(e) => {
                  const k = e.target.value as SampleKey;
                  if (samples && k) load(samples[k], k);
                }}
                className={`${inputClass} !w-auto !py-1.5 text-xs`}
              >
                <option value="" className="text-black">{t("con.up.sample")}…</option>
                {(Object.keys(SAMPLE_LABEL) as SampleKey[]).map((k) => (
                  <option key={k} value={k} className="text-black">{t(SAMPLE_LABEL[k])}</option>
                ))}
              </select>
            </div>
          </div>
          <OcrScan onRead={(text) => load(text, "ocr")} onConfirmedChange={setOcrChecked} />
        </div>

        {/* Step 2: columns */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-ink text-xs text-white">2</span>
            {t("con.up.step2")} · {t("con.up.columns")}
            {source && <Pill>{sourceLabel}</Pill>}
          </h3>
          {!shownMapping ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/65">{t("con.up.columns.empty")}</p>
          ) : (
            <>
              <ul className="divide-y divide-white/[0.08] rounded-xl border border-white/10">
                {shownMapping.mappings.map((m) => (
                  <li key={m.source} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                    <span className="font-mono text-xs text-white/75">{m.source}</span>
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-white/55">→</span>
                      <span className="font-medium">{m.target ? t(`con.field.${m.target}`) : "–"}</span>
                      <Pill tone={m.method === "alias" ? "accent" : m.method === "fuzzy" ? "amber" : "neutral"}>
                        {m.method === "alias" ? t("con.up.col.found") : m.method === "fuzzy" ? t("con.up.col.check") : m.method === "government-id" ? t("con.up.col.idUnused") : t("con.up.col.unused")}
                      </Pill>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-2">
                {shownMapping.missingRequired.length > 0 && <Notice tone="red">{t("con.up.missing", { list: shownMapping.missingRequired.map((f) => t(`con.field.${f}`)).join(", ") })}</Notice>}
                {shownMapping.warnings.map((w) => (
                  <Notice key={w} tone="amber">{w}</Notice>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4">
        <Disclosure summary={t("con.up.showText")}>
          <label className="block text-sm">
            <span className="sr-only">{t("con.up.csvContents")}</span>
            <textarea
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setSource("pasted");
                setPreview(null);
                setAcknowledged(false);
              }}
              rows={8}
              spellCheck={false}
              placeholder="roll_no,student_name,sub_cd,subj_desc,cr_reg,marks_obt,max_marks…"
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
        </Disclosure>
      </div>

      {/* Step 2 button and Step 3 */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-5">
        <Button disabled={blocked} title={ocrBlocked ? t("con.up.previewTitle") : undefined} onClick={() => run("PREVIEW")}>{t("con.up.preview")}</Button>
        <Button
          variant="primary"
          disabled={busy || !preview || ocrBlocked || Boolean(shownMapping?.missingRequired.length) || (hasBlocking && !acknowledged)}
          title={!preview ? t("con.up.sendFirst") : undefined}
          onClick={() => run("SYNC")}
        >
          <span className="mr-0.5 grid h-5 w-5 place-items-center rounded-full bg-white/20 text-xs">3</span>
          {t("con.up.send")}
        </Button>
        {hasBlocking && (
          <label className="flex items-center gap-2 text-sm text-amber-200">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            {t("con.up.leaveOut")}
          </label>
        )}
      </div>

      {error && <div className="mt-4"><Notice tone="red">{error}</Notice></div>}
      {message && <div className="mt-4"><Notice tone="accent">{message}</Notice></div>}

      {preview?.results.map(({ student, diff, isNew }) => (
        <div key={student.studentRoll} className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {student.studentName} <span className="font-mono text-xs font-normal text-white/65">{student.studentRoll}</span>
              {isNew && <Pill tone="blue" className="ml-2">{t("con.up.new")}</Pill>}
            </p>
            <div className="flex flex-wrap gap-2">
              <Pill tone="accent">SGPA {student.sgpa === null ? t("con.up.na") : student.sgpa.toFixed(2)}</Pill>
              <Pill>CGPA {student.cgpa === null ? t("con.up.na") : student.cgpa.toFixed(2)}</Pill>
              <Pill>{t("con.up.credits", { n: student.updatedCumulativeCredits })}</Pill>
              {!student.hasPriorRecord && <Pill tone="amber">{t("con.up.noPrior")}</Pill>}
            </div>
          </div>
          {student.rowIssues.length > 0 && (
            <ul className="mt-3 space-y-2" aria-label={t("con.up.rowIssues", { name: student.studentName })}>
              {student.rowIssues.map((r) => (
                <li key={r.rowNumber} className={`rounded-lg px-3 py-2 text-sm ${r.excluded ? "bg-red-500/10 text-red-200" : "bg-amber-400/10 text-amber-200"}`}>
                  <span className="font-mono text-xs">{t("con.up.row", { n: r.rowNumber })}{r.courseCode ? ` · ${r.courseCode}` : ""}</span>{" "}
                  <Pill tone={r.excluded ? "red" : "amber"}>{r.excluded ? t("con.up.excluded") : t("con.up.warning")}</Pill>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {r.issues.map((i) => <li key={i.code + i.message}>{i.message}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[460px] text-left text-sm">
              <caption className="sr-only">{t("con.up.changes", { name: student.studentName })}</caption>
              <thead className="text-xs uppercase tracking-wider text-white/65">
                <tr>
                  <th scope="col" className="pb-2 pr-3 font-semibold">{t("con.up.col.course")}</th>
                  <th scope="col" className="pb-2 pr-3 font-semibold">{t("con.up.col.change")}</th>
                  <th scope="col" className="pb-2 font-semibold">{t("con.up.col.detail")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {diff.map((d) => (
                  <tr key={d.courseCode}>
                    <td className="py-2 pr-3"><span className="font-mono text-xs text-white/65">{d.courseCode}</span> {d.courseTitle}</td>
                    <td className="py-2 pr-3"><Pill tone={CHANGE_TONE[d.change]}>{t(`con.change.${d.change}`)}</Pill></td>
                    <td className="py-2 text-xs text-white/75">
                      {d.change === "CHANGED" && d.before && d.after && `${d.before.letterGrade} (${d.before.gradePoints}) → ${d.after.letterGrade} (${d.after.gradePoints})`}
                      {d.change === "ADDED" && d.after && `${d.after.letterGrade}, ${t("con.up.credits", { n: d.after.creditsRegistered })}`}
                      {d.change === "REMOVED" && t("con.up.removedNote")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Card>
  );
}
