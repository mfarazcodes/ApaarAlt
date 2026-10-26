"use client";

import { useState } from "react";
import { Copy, Download, Printer, QrCode } from "lucide-react";
import type { ShareScope } from "@/lib/consentEngine";
import type { Presentation } from "@/lib/credentials";
import { api, errorText, formatDate } from "../portal/api";
import { useT } from "../portal/I18n";
import { Button, Card, Eyebrow, ICON, Notice, Pill, SectionTitle, inputClass } from "../portal/ui";

const SCOPES: ShareScope[] = ["DEGREE_STATUS", "INTERNSHIP_STATUS", "CGPA_BAND", "EOA_STATUS"];
const DURATIONS = [7, 30, 90];

/**
 * The student picks what a QR will say and how long it lives. The QR carries only those claims, so
 * an employer scanning it, even with no network, learns nothing else.
 */
export default function SmartQrCreator() {
  const { t } = useT();
  const [scopes, setScopes] = useState<ShareScope[]>(["DEGREE_STATUS", "INTERNSHIP_STATUS"]);
  const [days, setDays] = useState(30);
  const [made, setMade] = useState<{ presentation: Presentation; image: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggle = (s: ShareScope) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  async function create() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const res = await api<{ presentation: Presentation }>("/api/consent", { action: "CREATE_QR", scopes, days });
      const QRCode = (await import("qrcode")).default;
      const image = await QRCode.toDataURL(res.presentation.qr, { errorCorrectionLevel: "M", margin: 2, width: 520 });
      setMade({ presentation: res.presentation, image });
    } catch (e) {
      setMade(null);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.presentation.qr);
      setCopied(true);
    } catch {
      setError("Copy failed. Download the image instead.");
    }
  }

  return (
    <Card>
      <SectionTitle
        eyebrow={t("qr.eyebrow")}
        title={t("qr.title")}
        hint={t("qr.hint")}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <fieldset className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <legend className="px-1 text-xs text-white/60">{t("qr.legend")}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2.5">
              {SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm text-white/85">
                  <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} className="h-4 w-4 accent-[var(--accent)]" />
                  {t(`scope.${s}`)}
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-white/85">
              <label htmlFor="qr-days">{t("qr.worksFor")}</label>
              <select id="qr-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputClass} !w-auto !py-1.5`}>
                {DURATIONS.map((d) => <option key={d} value={d} className="text-black">{t("wallet.days", { n: d })}</option>)}
              </select>
            </div>
          </fieldset>
          <div className="mt-4">
            <Button variant="primary" disabled={busy || scopes.length === 0} onClick={create}>
              <QrCode width={16} height={16} className={ICON} />
              {t("qr.create")}
            </Button>
          </div>
          {error && <div className="mt-4"><Notice tone="red">{error}</Notice></div>}
          <p className="mt-4 text-xs leading-relaxed text-white/55">
            {t("qr.note")}
          </p>
        </div>

        <div>
          {made ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mx-auto w-full max-w-[280px] rounded-xl bg-white p-2">
                {/* A data URL made on this device, so next/image has nothing to optimise. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={made.image} alt={`Smart QR for: ${made.presentation.claimLabels.join(", ")}`} width={260} height={260} className="h-auto w-full" />
              </div>
              <Eyebrow>{t("qr.says")}</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-2">
                {made.presentation.claimLabels.map((l) => <Pill key={l} tone="accent">{l}</Pill>)}
              </div>
              <p className="mt-3 text-sm text-white/70">{t("qr.worksUntil", { date: formatDate(made.presentation.expiresAt) })}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={made.image}
                  download={`${made.presentation.cid}.png`}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.12]"
                >
                  <Download width={16} height={16} className={ICON} />
                  {t("qr.download")}
                </a>
                <Button size="sm" onClick={copy}>
                  <Copy width={16} height={16} className={ICON} />
                  {copied ? t("qr.copied") : t("qr.copy")}
                </Button>
                <Button size="sm" onClick={() => window.print()}>
                  <Printer width={16} height={16} className={ICON} />
                  {t("qr.print")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-48 place-items-center rounded-xl border border-dashed border-white/15 px-6 py-10 text-center text-sm text-white/55">
              {t("qr.empty")}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
