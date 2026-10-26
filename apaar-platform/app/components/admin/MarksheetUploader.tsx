"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import type { AICTEIntakeCompliance, CourseDiff, NADStudentRecord, SchemaMappingResult } from "@/lib/nadSyncEngine";
import { api, errorText } from "../portal/api";
import { Button, Card, Eyebrow, Notice, Pill, SectionTitle, inputClass } from "../portal/ui";
import OcrScan from "./OcrScan";

interface PreviewResponse {
  message: string;
  mapping: SchemaMappingResult;
  results: { student: NADStudentRecord; diff: CourseDiff[]; isNew: boolean }[];
  blockingIssues: { studentRoll: string }[];
  updatedCompliance: AICTEIntakeCompliance;
}

const CHANGE_TONE = { ADDED: "accent", CHANGED: "amber", REMOVED: "red", UNCHANGED: "neutral" } as const;

export default function MarksheetUploader({ onSynced }: { onSynced: () => void }) {
  const [csv, setCsv] = useState("");
  const [source, setSource] = useState("");
  const [mapping, setMapping] = useState<SchemaMappingResult | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<{ original: string; revaluation: string; problem: string } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  // A sheet read by OCR cannot be previewed or synced until the registrar confirms they checked it.
  const [ocrChecked, setOcrChecked] = useState(false);
  const ocrBlocked = source.startsWith("OCR") && !ocrChecked;
  const fileRef = useRef<HTMLInputElement>(null);
  const shownMapping = csv.trim() ? mapping : null;
  const hasBlocking = (preview?.blockingIssues.length ?? 0) > 0;

  useEffect(() => {
    api<{ sampleMessyCsv: string; sampleRevaluationCsv: string; sampleProblemCsv: string }>("/api/sync/aicte-nad")
      .then((r) => setSamples({ original: r.sampleMessyCsv, revaluation: r.sampleRevaluationCsv, problem: r.sampleProblemCsv }))
      .catch((e) => setError(errorText(e)));
  }, []);

  // The schema mapper runs as you type, so mistakes in the headers show before anything is synced.
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
    file.text().then((t) => load(t, file.name)).catch(() => setError("Could not read that file."));
  }

  async function run(action: "PREVIEW" | "SYNC") {
    setBusy(true);
    setError("");
    try {
      const res = await api<PreviewResponse>("/api/sync/aicte-nad", { action, csvText: csv, acknowledgeIssues: action === "SYNC" ? acknowledged : undefined });
      setPreview(res);
      setMessage(res.message);
      if (action === "SYNC") onSynced();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle
        eyebrow="Marksheet uploader"
        title="Smart CSV / OCR marksheet diff"
        hint="Drop in any ERP export. The mapper reads the headers, and the diff shows exactly what will change in NAD."
      />

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
            <p className="mt-2 text-sm text-white/75">Drop a CSV here, or</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Choose a CSV file" />
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => fileRef.current?.click()}>Choose file</Button>
              <Button size="sm" disabled={!samples} onClick={() => samples && load(samples.original, "Sample ERP export")}>Load sample export</Button>
              <Button size="sm" disabled={!samples} onClick={() => samples && load(samples.revaluation, "Revaluation re-upload")}>Load revaluation re-upload</Button>
              <Button size="sm" disabled={!samples} onClick={() => samples && load(samples.problem, "Sheet with problems")}>Load sheet with problems</Button>
            </div>
          </div>
          <OcrScan
            onRead={(csv) => load(csv, "OCR scan (check every value)")}
            onConfirmedChange={setOcrChecked}
          />

          <label className="block text-sm">
            <span className="mb-1.5 flex items-center justify-between text-white/70">
              CSV contents {source && <Pill>{source}</Pill>}
            </span>
            <textarea
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setSource("Pasted");
                setPreview(null);
                setAcknowledged(false);
              }}
              rows={8}
              spellCheck={false}
              placeholder="roll_no,student_name,sub_cd,subj_desc,cr_reg,marks_obt,max_marks…"
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
        </div>

        {/* AI schema mapper */}
        <div>
          <Eyebrow>AI schema mapper</Eyebrow>
          {!shownMapping ? (
            <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/55">Load a CSV to see how its columns map to NAD fields.</p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-white/[0.08] rounded-xl border border-white/10">
                {shownMapping.mappings.map((m) => (
                  <li key={m.source} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                    <span className="font-mono text-xs text-white/75">{m.source}</span>
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-white/55">→</span>
                      <span className="font-medium">{m.target ?? "unmapped"}</span>
                      <Pill tone={m.method === "alias" ? "accent" : m.method === "fuzzy" ? "amber" : "neutral"}>
                        {m.method === "unmapped" ? "ignored" : `${Math.round(m.confidence * 100)}%`}
                      </Pill>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-2">
                {shownMapping.missingRequired.length > 0 && <Notice tone="red">Missing required columns: {shownMapping.missingRequired.join(", ")}. This sheet cannot be synced.</Notice>}
                {shownMapping.warnings.map((w) => (
                  <Notice key={w} tone="amber">{w}</Notice>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-5">
        <Button disabled={busy || !csv.trim() || ocrBlocked || Boolean(shownMapping?.missingRequired.length)} title={ocrBlocked ? "Confirm you checked the values read from the image" : undefined} onClick={() => run("PREVIEW")}>Preview diff</Button>
        <Button
          variant="primary"
          disabled={busy || !preview || ocrBlocked || Boolean(shownMapping?.missingRequired.length) || (hasBlocking && !acknowledged)}
          title={!preview ? "Preview the diff first" : undefined}
          onClick={() => run("SYNC")}
        >
          Sync to NAD
        </Button>
        {hasBlocking && (
          <label className="flex items-center gap-2 text-sm text-amber-200">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Sync the rest and leave the excluded rows out
          </label>
        )}
      </div>

      {error && <div className="mt-4"><Notice tone="red">{error}</Notice></div>}
      {message && <div className="mt-4"><Notice tone="accent">{message}</Notice></div>}

      {preview?.results.map(({ student, diff, isNew }) => (
        <div key={student.studentRoll} className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {student.studentName} <span className="font-mono text-xs font-normal text-white/55">{student.studentRoll}</span>
              {isNew && <Pill tone="blue" className="ml-2">New to NAD</Pill>}
            </p>
            <div className="flex gap-2">
              <Pill tone="accent">SGPA {student.sgpa === null ? "n/a" : student.sgpa.toFixed(2)}</Pill>
              <Pill>CGPA {student.cgpa === null ? "n/a" : student.cgpa.toFixed(2)}</Pill>
              <Pill>{student.updatedCumulativeCredits} credits</Pill>
              {!student.hasPriorRecord && <Pill tone="amber">No prior NAD record</Pill>}
            </div>
          </div>
          {student.rowIssues.length > 0 && (
            <ul className="mt-3 space-y-2" aria-label={`Row issues for ${student.studentName}`}>
              {student.rowIssues.map((r) => (
                <li key={r.rowNumber} className={`rounded-lg px-3 py-2 text-sm ${r.excluded ? "bg-red-500/10 text-red-200" : "bg-amber-400/10 text-amber-200"}`}>
                  <span className="font-mono text-xs">Row {r.rowNumber}{r.courseCode ? ` · ${r.courseCode}` : ""}</span>{" "}
                  <Pill tone={r.excluded ? "red" : "amber"}>{r.excluded ? "Excluded" : "Warning"}</Pill>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {r.issues.map((i) => <li key={i.code + i.message}>{i.message}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[460px] text-left text-sm">
              <caption className="sr-only">Changes for {student.studentName}</caption>
              <thead className="text-xs uppercase tracking-wider text-white/55">
                <tr>
                  <th scope="col" className="pb-2 pr-3 font-semibold">Course</th>
                  <th scope="col" className="pb-2 pr-3 font-semibold">Change</th>
                  <th scope="col" className="pb-2 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {diff.map((d) => (
                  <tr key={d.courseCode}>
                    <td className="py-2 pr-3"><span className="font-mono text-xs text-white/60">{d.courseCode}</span> {d.courseTitle}</td>
                    <td className="py-2 pr-3"><Pill tone={CHANGE_TONE[d.change]}>{d.change}</Pill></td>
                    <td className="py-2 text-xs text-white/70">
                      {d.change === "CHANGED" && d.before && d.after && `${d.before.letterGrade} (${d.before.gradePoints}) → ${d.after.letterGrade} (${d.after.gradePoints})`}
                      {d.change === "ADDED" && d.after && `${d.after.letterGrade}, ${d.after.creditsRegistered} credits`}
                      {d.change === "REMOVED" && "Not in the new upload"}
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
