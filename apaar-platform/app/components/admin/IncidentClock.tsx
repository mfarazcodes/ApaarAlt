"use client";

import { useState } from "react";
import { Copy, Siren } from "lucide-react";
import type { BreachAlert, BreachType } from "@/lib/tokenization";
import { api, errorText, formatDateTime } from "../portal/api";
import { Button, Card, Field, ICON, Notice, Pill, SectionTitle, inputClass } from "../portal/ui";

const TYPES: { id: BreachType; label: string }[] = [
  { id: "UNAUTHORISED_ACCESS", label: "Unauthorised access" },
  { id: "DATA_EXFILTRATION", label: "Data exfiltration" },
  { id: "RANSOMWARE", label: "Ransomware" },
  { id: "CREDENTIAL_LEAK", label: "Credential leak" },
];

const STATUS_TONE = { ON_TIME: "accent", DUE_SOON: "amber", OVERDUE: "red" } as const;
const STATUS_LABEL = { ON_TIME: "On time", DUE_SOON: "Due soon", OVERDUE: "Overdue" } as const;

export default function IncidentClock() {
  const [type, setType] = useState<BreachType>("UNAUTHORISED_ACCESS");
  const [hoursAgo, setHoursAgo] = useState(2);
  const [affected, setAffected] = useState(120);
  const [alert, setAlert] = useState<BreachAlert | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setError("");
    try {
      const res = await api<{ alert: BreachAlert }>("/api/security/cert-in", {
        action: "BREACH_ALERT",
        incidentType: type,
        detectedAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
        affectedPrincipals: affected,
      });
      setAlert(res.alert);
      setCopied(false);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function copy() {
    if (!alert) return;
    try {
      await navigator.clipboard.writeText(alert.certInDraft);
      setCopied(true);
    } catch {
      setError("Copy failed. Select the text and copy it manually.");
    }
  }

  return (
    <Card>
      <SectionTitle
        title="CERT-In and Data Protection Board clocks"
        hint="Start the statutory timers from the moment an incident is noticed. Drafts are for the incident commander to edit."
      />
      {error && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Incident type">
          <select value={type} onChange={(e) => setType(e.target.value as BreachType)} className={inputClass}>
            {TYPES.map((t) => <option key={t.id} value={t.id} className="text-black">{t.label}</option>)}
          </select>
        </Field>
        <Field label={`Noticed ${hoursAgo} hours ago`}>
          <input type="range" min={0} max={80} value={hoursAgo} onChange={(e) => setHoursAgo(Number(e.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
        </Field>
        <Field label="People affected">
          <input type="number" min={0} value={affected} onChange={(e) => setAffected(Math.max(0, Number(e.target.value)))} className={inputClass} />
        </Field>
      </div>
      <div className="mt-4">
        <Button variant="danger" onClick={generate}>
          <Siren width={16} height={16} className={ICON} />
          Start incident clocks
        </Button>
      </div>

      {alert && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <p className="text-xs text-white/55">Incident <span className="font-mono">{alert.incidentId}</span> · noticed {formatDateTime(alert.detectedAt)}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {alert.deadlines.map((d) => (
              <div key={d.authority} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{d.authority}</p>
                  <Pill tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Pill>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {d.hoursRemaining >= 0 ? `${d.hoursRemaining}h left` : `${Math.abs(d.hoursRemaining)}h overdue`}
                </p>
                <p className="mt-1 text-xs text-white/60">Due {formatDateTime(d.deadline)}</p>
                <p className="mt-2 text-xs text-white/55">{d.rule}</p>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/55">CERT-In report draft</p>
              <Button size="sm" onClick={copy}><Copy width={16} height={16} className={ICON} />{copied ? "Copied" : "Copy"}</Button>
            </div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-white/[0.06] p-4 text-xs leading-relaxed text-white/80">{alert.certInDraft}</pre>
          </div>
          <ul className="list-decimal space-y-1 pl-5 text-sm text-white/75">
            {alert.checklist.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}
    </Card>
  );
}
