"use client";

import { useState } from "react";
import { Copy, Download, Printer, QrCode } from "lucide-react";
import type { ShareScope } from "@/lib/consentEngine";
import type { Presentation } from "@/lib/credentials";
import { api, errorText, formatDate } from "../portal/api";
import { useT } from "../portal/I18n";
import { useToast } from "../portal/Toast";
import { Button, Card, Eyebrow, ICON, Notice, Pill, SectionTitle } from "../portal/ui";
import ShareDialog from "./ShareDialog";

/**
 * The student picks what a QR will say and how long it lives (in the same dialog used for sharing with an
 * employer). The QR carries only those claims, so an employer scanning it, even with no network, learns nothing else.
 */
export default function SmartQrCreator() {
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<{ presentation: Presentation; image: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create(scopes: ShareScope[], days: number) {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const res = await api<{ presentation: Presentation }>("/api/consent", { action: "CREATE_QR", scopes, days });
      const QRCode = (await import("qrcode")).default;
      const image = await QRCode.toDataURL(res.presentation.qr, { errorCorrectionLevel: "M", margin: 2, width: 520 });
      setMade({ presentation: res.presentation, image });
      setOpen(false);
      toast(t("qr.toast"));
    } catch (e) {
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
      setError(t("qr.copyFailed"));
    }
  }

  return (
    <Card>
      <SectionTitle title={t("qr.title")} hint={t("qr.hint")} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Button variant="primary" disabled={busy} onClick={() => { setError(""); setOpen(true); }}>
            <QrCode width={16} height={16} className={ICON} />
            {t("qr.create")}
          </Button>
          {!open && error && <div className="mt-4"><Notice tone="red">{error}</Notice></div>}
          <p className="mt-4 text-sm leading-relaxed text-white/65">{t("qr.note")}</p>
        </div>

        <div>
          {made ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="print-area mx-auto w-full max-w-[280px] rounded-xl bg-white p-2">
                {/* A data URL made on this device, so next/image has nothing to optimise. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={made.image} alt={`Smart QR for: ${made.presentation.claimLabels.join(", ")}`} width={260} height={260} className="h-auto w-full" />
              </div>
              <Eyebrow>{t("qr.says")}</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-2">
                {made.presentation.claimLabels.map((l) => <Pill key={l} tone="accent">{l}</Pill>)}
              </div>
              <p className="mt-3 text-sm text-white/75">{t("qr.worksUntil", { date: formatDate(made.presentation.expiresAt) })}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={made.image}
                  download={`${made.presentation.cid}.png`}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.12]"
                >
                  <Download width={16} height={16} className={ICON} />
                  {t("qr.download")}
                </a>
                <Button size="sm" onClick={() => window.print()}>
                  <Printer width={16} height={16} className={ICON} />
                  {t("qr.print")}
                </Button>
              </div>
              <details className="mt-3 text-sm text-white/75">
                <summary className="cursor-pointer rounded-lg px-2 py-1.5 hover:bg-white/10">{t("wallet.more")}</summary>
                <div className="mt-2">
                  <Button size="sm" onClick={copy}>
                    <Copy width={16} height={16} className={ICON} />
                    {copied ? t("qr.copied") : t("qr.copy")}
                  </Button>
                </div>
              </details>
            </div>
          ) : (
            <div className="grid h-full min-h-48 place-items-center rounded-xl border border-dashed border-white/15 px-6 py-10 text-center text-sm text-white/65">
              {t("qr.empty")}
            </div>
          )}
        </div>
      </div>

      <ShareDialog open={open} onClose={() => setOpen(false)} title={t("qr.dialogTitle")} confirmLabel={t("qr.confirm")} busy={busy} error={error} onConfirm={create} />
    </Card>
  );
}
