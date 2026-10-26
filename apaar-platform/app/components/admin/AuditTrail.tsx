"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import type { ChainVerification, ConsentAuditEntry } from "@/lib/consentEngine";
import { api, errorText, formatDateTime } from "../portal/api";
import { Button, Card, ICON, Notice, Pill, SectionTitle } from "../portal/ui";

const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

export default function AuditTrail() {
  const [entries, setEntries] = useState<ConsentAuditEntry[]>([]);
  const [tampered, setTampered] = useState<ConsentAuditEntry[] | null>(null);
  const [chain, setChain] = useState<ChainVerification | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ ledger: { auditTrail: ConsentAuditEntry[] }; chain: ChainVerification }>("/api/consent");
      setEntries(r.ledger.auditTrail);
      setChain(r.chain);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const shown = tampered ?? entries;

  async function verify() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ chain: ChainVerification }>("/api/consent", { action: "VERIFY_CHAIN", entries: shown });
      setChain(r.chain);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // Rewrites the notice on one entry in a local copy, the way an insider with database access might.
  function simulateTamper() {
    if (entries.length === 0) return;
    const target = Math.min(1, entries.length - 1); // the second entry, or the only one on a fresh ledger
    const copy = entries.map((e) => ({ ...e }));
    copy[target] = { ...copy[target], legalNotice: "Consent was never given.", actor: "SOMEONE_ELSE" };
    setTampered(copy);
    setChain(null);
  }

  function restore() {
    setTampered(null);
    load();
  }

  const broken = chain && !chain.valid ? chain.brokenAtIndex : undefined;

  return (
    <Card>
      <SectionTitle
        eyebrow="Immutable audit trail"
        title="Consent ledger viewer"
        hint="Each entry holds a SHA-256 hash of its own contents and the entry before it. Change anything and every later link breaks."
      />
      {error && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={verify}>Verify chain</Button>
        {tampered ? <Button size="sm" onClick={restore}>Restore the real ledger</Button> : <Button size="sm" variant="danger" onClick={simulateTamper}>Simulate tampering</Button>}
        {chain && (
          <Pill tone={chain.valid ? "accent" : "red"}>
            {chain.valid ? <BadgeCheck width={16} height={16} className="h-3.5 w-3.5 shrink-0" /> : <ShieldAlert width={16} height={16} className="h-3.5 w-3.5 shrink-0" />}
            {chain.valid ? `Chain intact · ${chain.checked} entries` : "Chain broken"}
          </Pill>
        )}
      </div>
      {chain && !chain.valid && <div className="mb-3"><Notice tone="red">{chain.reason}</Notice></div>}
      {tampered && !chain && <div className="mb-3"><Notice tone="amber">This is a tampered local copy. Press Verify chain to see it caught.</Notice></div>}

      <div className="max-h-[420px] overflow-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Consent audit entries</caption>
          <thead className="sticky top-0 bg-deep-2 text-xs uppercase tracking-wider text-white/55">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Entry</th>
              <th scope="col" className="px-3 py-2 font-semibold">When</th>
              <th scope="col" className="px-3 py-2 font-semibold">Action</th>
              <th scope="col" className="px-3 py-2 font-semibold">Actor</th>
              <th scope="col" className="px-3 py-2 font-semibold">Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07]">
            {shown.map((e, i) => (
              <tr key={e.logId} className={broken !== undefined && i >= broken ? "bg-red-500/10" : ""}>
                <td className="px-3 py-2 font-mono text-xs text-white/65">{e.logId}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-white/70">{formatDateTime(e.timestamp)}</td>
                <td className="px-3 py-2">
                  <span className="text-xs font-semibold">{e.action.replace(/_/g, " ")}</span>
                  <span className="mt-0.5 block text-xs text-white/60">{e.legalNotice}</span>
                </td>
                <td className="px-3 py-2 text-xs text-white/70">{e.actor}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-white/55" title={e.sha256Hash}>
                  {short(e.sha256Hash)}
                  <span className="block text-white/35" title={e.previousHash}>← {short(e.previousHash)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-white/50">
        <ShieldAlert width={16} height={16} className={ICON} />
        No API edits or deletes entries. This view is read-only.
      </p>
    </Card>
  );
}
