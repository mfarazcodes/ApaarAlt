"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import type { DisputeRow } from "@/lib/consentEngine";
import { api, errorText, formatDate, formatDateTime } from "../portal/api";
import { Button, Card, Field, ICON, Modal, Notice, Pill, SectionTitle, inputClass } from "../portal/ui";

/** The registrar's inbox for disputes students raise from their wallets. Each ticket has an acknowledgement deadline. */
export default function DisputeInbox() {
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [error, setError] = useState("");
  const [active, setActive] = useState<{ row: DisputeRow; decision: "RESOLVED" | "REJECTED" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await api<{ disputes: DisputeRow[] }>("/api/disputes")).disputes);
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
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const open = rows.filter((r) => r.status === "OPEN");

  return (
    <Card>
      <SectionTitle
        eyebrow="Dispute inbox"
        title="Student data disputes"
        hint="A student who spots a wrong record raises a ticket from their wallet. Close each one with a reason the student can read."
      />
      {error && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}

      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone={open.length ? "amber" : "accent"}>{open.length} open</Pill>
        <Pill tone={open.some((r) => r.overdue) ? "red" : "neutral"}>{open.filter((r) => r.overdue).length} past their acknowledgement date</Pill>
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-white/15 px-6 py-10 text-center text-sm text-white/55">
          <Inbox width={16} height={16} className="mb-3 h-6 w-6 shrink-0 text-white/35" />
          No disputes yet. They appear here when a student raises one.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((d) => (
            <li key={`${d.studentId}-${d.ticketId}`} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold">
                  {d.studentName} <span className="font-mono text-xs font-normal text-white/55">{d.studentRoll} · {d.ticketId}</span>
                </p>
                <Pill tone={d.status === "OPEN" ? (d.overdue ? "red" : "amber") : d.status === "RESOLVED" ? "accent" : "neutral"}>
                  {d.status === "OPEN" ? (d.overdue ? "Overdue" : "Open") : d.status === "RESOLVED" ? "Resolved" : "Rejected"}
                </Pill>
              </div>
              <p className="mt-2 text-sm text-white/80">
                <strong>{d.field}</strong>
                {d.claimedValue && <> should say <q>{d.claimedValue}</q></>}
              </p>
              <p className="mt-1 text-sm text-white/65">{d.reason}</p>
              <p className="mt-2 text-xs text-white/50">
                Raised {formatDateTime(d.raisedAt)}
                {d.status === "OPEN" ? ` · acknowledge by ${formatDate(d.acknowledgeBy)}` : ` · closed ${d.resolvedAt ? formatDateTime(d.resolvedAt) : ""} by ${d.resolvedBy ?? "the registrar"}`}
              </p>
              {d.resolution && <p className="mt-2 rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-white/80">{d.resolution}</p>}
              {d.status === "OPEN" && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => { setReason(""); setActive({ row: d, decision: "RESOLVED" }); }}>Resolve</Button>
                  <Button size="sm" onClick={() => { setReason(""); setActive({ row: d, decision: "REJECTED" }); }}>Reject</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-white/50">The acknowledgement date is this platform&apos;s own target, not a legal deadline.</p>

      <Modal open={Boolean(active)} onClose={() => setActive(null)} title={active?.decision === "RESOLVED" ? "Resolve this dispute" : "Reject this dispute"}>
        <p className="mb-4 text-sm text-white/70">The student sees this reason in their wallet, and it is written to the audit log.</p>
        {error && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}
        <Field label="Reason">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className={inputClass} placeholder={active?.decision === "RESOLVED" ? "For example: corrected the date of birth to match the certificate." : "For example: the certificate supplied matches the current record."} />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setActive(null)}>Cancel</Button>
          <Button variant="primary" disabled={busy || reason.trim().length < 3} onClick={submit}>
            <Inbox width={16} height={16} className={ICON} />
            Save decision
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
