"use client";

import { useState } from "react";
import type { ShareScope } from "@/lib/consentEngine";
import { useT } from "../portal/I18n";
import { Button, Modal, Notice, inputClass } from "../portal/ui";

const SCOPES: ShareScope[] = ["DEGREE_STATUS", "INTERNSHIP_STATUS", "CGPA_BAND", "EOA_STATUS"];
const DURATIONS = [7, 30, 90];

/** The same defaults everywhere a student starts a share: degree and internship, for 30 days. */
export const DEFAULT_SCOPES: ShareScope[] = ["DEGREE_STATUS", "INTERNSHIP_STATUS"];
export const DEFAULT_DAYS = 30;

/** What to share and for how long. Used both for sharing with an employer and for making a QR. */
export default function ShareDialog({
  open,
  onClose,
  title,
  confirmLabel,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  confirmLabel: string;
  busy: boolean;
  error: string;
  onConfirm: (scopes: ShareScope[], days: number) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <ShareForm onClose={onClose} confirmLabel={confirmLabel} busy={busy} error={error} onConfirm={onConfirm} />
    </Modal>
  );
}

// Lives inside the Modal, so it is created fresh each time the dialog opens and the choices start from the defaults.
function ShareForm({ onClose, confirmLabel, busy, error, onConfirm }: Pick<Parameters<typeof ShareDialog>[0], "onClose" | "confirmLabel" | "busy" | "error" | "onConfirm">) {
  const { t } = useT();
  const [scopes, setScopes] = useState<ShareScope[]>(DEFAULT_SCOPES);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const toggle = (s: ShareScope) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div>
      <fieldset className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <legend className="px-1 text-xs text-white/65">{t("share.legend")}</legend>
        <div className="flex flex-col gap-3">
          {SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-3 text-sm text-white/85">
              <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} className="h-5 w-5 accent-[var(--accent)]" />
              {t(`scope.${s}`)}
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-white/85">
          <label htmlFor="share-days">{t("wallet.for")}</label>
          <select id="share-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputClass} !w-auto !py-1.5`}>
            {DURATIONS.map((d) => (
              <option key={d} value={d} className="text-black">
                {t("wallet.days", { n: d })}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      {scopes.length === 0 && <p className="mt-2 text-sm text-amber-300">{t("wallet.pickOne")}</p>}
      {error && (
        <div className="mt-4">
          <Notice tone="red">{error}</Notice>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>{t("wallet.cancel")}</Button>
        <Button variant="primary" disabled={busy || scopes.length === 0} onClick={() => onConfirm(scopes, days)}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
