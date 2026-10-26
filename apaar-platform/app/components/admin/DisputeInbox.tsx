"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import type { DisputeRow } from "@/lib/consentEngine";
import { api, errorText, formatDate, formatDateTime } from "../portal/api";
import { useT } from "../portal/I18n";
import { useToast } from "../portal/Toast";
import { Button, Card, Field, ICON, Modal, Notice, Pill, SectionTitle, inputClass } from "../portal/ui";
import { useReportStat } from "./ConsoleStats";

/** The registrar's inbox for reports students raise about a wrong detail. Each ticket has an acknowledgement date. */
export default function DisputeInbox() {
  const { t } = useT();
  const toast = useToast();
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState<{ row: DisputeRow; decision: "RESOLVED" | "REJECTED" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await api<{ disputes: DisputeRow[] }>("/api/disputes")).disputes);
      setLoaded(true);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  async function submit() {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/disputes", { action: "RESOLVE", studentId: active.row.studentId, ticketId: active.row.ticketId, decision: active.decision, resolution: reason });
      setActive(null);
      setReason("");
      toast(t("con.dp.saved"));
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const open = rows.filter((r) => r.status === "OPEN");
  useReportStat("disputes", loaded ? open.length : null);

  return (
    <Card>
      <SectionTitle title={t("con.dp.title")} hint={t("con.dp.hint")} />
      {error && !active && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}

      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone={open.length ? "amber" : "accent"}>{t("con.dp.nOpen", { n: open.length })}</Pill>
        <Pill tone={open.some((r) => r.overdue) ? "red" : "neutral"}>{t("con.dp.nOverdue", { n: open.filter((r) => r.overdue).length })}</Pill>
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-white/15 px-6 py-10 text-center text-sm text-white/65">
          <Inbox width={16} height={16} className="mb-3 h-6 w-6 shrink-0 text-white/60" />
          {t("con.dp.empty")}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((d) => (
            <li key={`${d.studentId}-${d.ticketId}`} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold">
                  {d.studentName} <span className="font-mono text-xs font-normal text-white/65">{d.studentRoll} · {d.ticketId}</span>
                </p>
                <Pill tone={d.status === "OPEN" ? (d.overdue ? "red" : "amber") : d.status === "RESOLVED" ? "accent" : "neutral"}>
                  {d.status === "OPEN" ? (d.overdue ? t("con.dp.overdue") : t("wallet.d.open")) : d.status === "RESOLVED" ? t("wallet.d.resolved") : t("wallet.d.rejected")}
                </Pill>
              </div>
              <p className="mt-2 text-sm text-white/85">
                <strong>{t(`wallet.field.${d.field}`)}</strong>
                {d.claimedValue && <> {t("con.dp.shouldSay")} <q>{d.claimedValue}</q></>}
              </p>
              <p className="mt-1 text-sm text-white/70">{d.reason}</p>
              <p className="mt-2 text-xs text-white/65">
                {t("con.dp.raised", { when: formatDateTime(d.raisedAt) })}
                {d.status === "OPEN" ? ` · ${t("con.dp.ackBy", { date: formatDate(d.acknowledgeBy) })}` : ` · ${t("con.dp.closed", { when: d.resolvedAt ? formatDateTime(d.resolvedAt) : "", by: d.resolvedBy ?? t("con.dp.theRegistrar") })}`}
              </p>
              {d.resolution && <p className="mt-2 rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-white/85">{d.resolution}</p>}
              {d.status === "OPEN" && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => { setReason(""); setError(""); setActive({ row: d, decision: "RESOLVED" }); }}>{t("con.dp.resolve")}</Button>
                  <Button size="sm" onClick={() => { setReason(""); setError(""); setActive({ row: d, decision: "REJECTED" }); }}>{t("con.fz.reject")}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-white/65">{t("con.dp.note")}</p>

      <Modal open={Boolean(active)} onClose={() => setActive(null)} title={active?.decision === "RESOLVED" ? t("con.dp.resolveTitle") : t("con.dp.rejectTitle")}>
        <p className="mb-4 text-sm text-white/75">{t("con.dp.modalIntro")}</p>
        {error && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}
        <Field label={t("con.dp.reason")}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className={inputClass} placeholder={active?.decision === "RESOLVED" ? t("con.dp.exResolve") : t("con.dp.exReject")} />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setActive(null)}>{t("session.cancel")}</Button>
          <Button variant="primary" disabled={busy || reason.trim().length < 3} onClick={submit}>
            <Inbox width={16} height={16} className={ICON} />
            {t("con.dp.save")}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
