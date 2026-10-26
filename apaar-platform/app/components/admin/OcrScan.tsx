"use client";

import { useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { LOW_CONFIDENCE, parseOcrLines, type OcrLine, type OcrParseResult } from "@/lib/ocrParse";
import { useT } from "../portal/I18n";
import { Button, ICON, Notice, Pill, ProgressBar } from "../portal/ui";

type Status = "idle" | "loading" | "reading" | "done" | "error";

interface RecognizedLike {
  text?: string;
  confidence?: number;
  lines?: { text: string; confidence: number }[];
  blocks?: { paragraphs?: { lines?: { text: string; confidence: number }[] }[] }[] | null;
}

/** tesseract.js reports lines directly or nested in blocks, depending on version and output settings. */
function linesOf(data: RecognizedLike): OcrLine[] {
  const direct = data.lines ?? data.blocks?.flatMap((b) => b.paragraphs?.flatMap((p) => p.lines ?? []) ?? []) ?? [];
  if (direct.length > 0) return direct.map((l) => ({ text: l.text.replace(/\s+/g, " ").trim(), confidence: Math.round(l.confidence) }));
  return (data.text ?? "").split("\n").map((text) => ({ text, confidence: Math.round(data.confidence ?? 0) }));
}

/**
 * Reads a marksheet photo on this device with Tesseract (WebAssembly, served from this site). The image is
 * never uploaded. What it read is shown row by row, and the registrar must confirm they checked it against
 * the sheet before anything can be synced.
 */
export default function OcrScan({ onRead, onConfirmedChange }: { onRead: (csv: string) => void; onConfirmedChange: (confirmed: boolean) => void }) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [result, setResult] = useState<OcrParseResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  async function scan(file?: File) {
    if (!file) return;
    setStatus("loading");
    setError("");
    setResult(null);
    setConfirmed(false);
    onConfirmedChange(false);
    setProgress(0);
    setPhase(t("con.ocr.loading"));

    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        // Everything comes from this site, so nothing is fetched from a CDN and nothing leaves the device.
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr",
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => {
          setPhase(m.status.charAt(0).toUpperCase() + m.status.slice(1));
          if (m.status === "recognizing text") {
            setStatus("reading");
            setProgress(Math.round(m.progress * 100));
          }
        },
      });
      try {
        const { data } = await worker.recognize(file, {}, { text: true, blocks: true });
        const parsed = parseOcrLines(linesOf(data as unknown as RecognizedLike));
        setResult(parsed);
        setStatus("done");
        if (parsed.csv) onRead(parsed.csv);
      } finally {
        await worker.terminate();
      }
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : t("con.ocr.fail"));
    }
  }

  function confirm(next: boolean) {
    setConfirmed(next);
    onConfirmedChange(next);
  }

  const busy = status === "loading" || status === "reading";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept="image/*" className="sr-only" aria-label={t("con.ocr.aria")} onChange={(e) => scan(e.target.files?.[0])} />
        <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <ScanLine width={16} height={16} className={ICON} />
          {t("con.ocr.button")}
        </Button>
        <span className="text-xs text-white/65">{t("con.ocr.note")}</span>
      </div>

      {busy && (
        <div aria-live="polite">
          <p className="mb-1.5 text-xs text-white/65">{phase}{status === "reading" ? `… ${progress}%` : "…"}</p>
          <ProgressBar value={status === "reading" ? progress : 5} max={100} label={t("con.ocr.progress")} />
        </div>
      )}
      {error && <Notice tone="red">{error}</Notice>}

      {result && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4" aria-live="polite">
          <p className="text-sm font-semibold">
            {t(result.courses.length === 1 ? "con.ocr.read1" : "con.ocr.read", { n: result.courses.length })}
            {result.roll ? t("con.ocr.for", { roll: result.roll }) : ""}
          </p>

          {result.courses.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-xs">
                <caption className="sr-only">{t("con.ocr.caption")}</caption>
                <thead className="uppercase tracking-wider text-white/50">
                  <tr>
                    <th scope="col" className="pb-1.5 pr-2 font-semibold">{t("con.ocr.col.code")}</th>
                    <th scope="col" className="pb-1.5 pr-2 font-semibold">{t("con.ocr.col.subject")}</th>
                    <th scope="col" className="pb-1.5 pr-2 text-right font-semibold">{t("con.ocr.col.credits")}</th>
                    <th scope="col" className="pb-1.5 pr-2 text-right font-semibold">{t("con.ocr.col.marks")}</th>
                    <th scope="col" className="pb-1.5 text-right font-semibold">{t("con.ocr.col.quality")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.07]">
                  {result.courses.map((c) => (
                    <tr key={c.lineIndex}>
                      <td className="py-1.5 pr-2 font-mono">{c.code}</td>
                      <td className="py-1.5 pr-2">{c.title}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{c.credits}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{c.marks}</td>
                      <td className="py-1.5 text-right">
                        <Pill tone={c.confidence < LOW_CONFIDENCE ? "amber" : "accent"}>{c.confidence < LOW_CONFIDENCE ? t("con.ocr.check") : t("con.ocr.good")} · {c.confidence}%</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.unread.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/65">{t("con.ocr.unread")}</p>
              <ul className="mt-1.5 space-y-1 text-xs text-white/65">
                {result.unread.map((u) => <li key={u.lineIndex} className="font-mono">{u.text}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-3 space-y-2">
            {result.warnings.map((w) => <Notice key={w} tone="amber">{w}</Notice>)}
          </div>

          {result.courses.length > 0 && (
            <label className="mt-4 flex items-start gap-2 text-sm text-white/85">
              <input type="checkbox" checked={confirmed} onChange={(e) => confirm(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
              {t("con.ocr.confirm")}
            </label>
          )}
        </div>
      )}
    </div>
  );
}
