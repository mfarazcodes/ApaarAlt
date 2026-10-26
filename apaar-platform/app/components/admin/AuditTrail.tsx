"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Download, ShieldAlert } from "lucide-react";
import type { AuditEntry, AuditType, ChainHead, ChainVerification } from "@/lib/audit";
import { auditToCsv } from "@/lib/auditCsv";
import { api, errorText, formatDateTime } from "../portal/api";
import { downloadCsv } from "../portal/csvDownload";
import { Button, Card, ICON, Notice, Pill, SectionTitle } from "../portal/ui";

interface AuditResponse {
  entries: AuditEntry[];
  chain: ChainVerification;
  head: ChainHead | null;
  types: AuditType[];
}

const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;
const TYPE_LABEL: Record<AuditType, string> = {
  CONSENT: "Consent",
  FUZZY_DECISION: "Match decisions",
  NAD_SYNC: "NAD syncs",
  GRADE_CHANGE: "Grade changes",
  DISPUTE: "Disputes",
  VERIFICATION: "Verifications",
  SYSTEM: "System",
};

export default function AuditTrail() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [copy, setCopy] = useState<{ entries: AuditEntry[]; label: string } | null>(null);
  const [chain, setChain] = useState<ChainVerification | null>(null);
  const [filter, setFilter] = useState<AuditType | "ALL">("ALL");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<AuditResponse>("/api/audit");
      setData(r);
      setChain(r.chain);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const shownAll = copy?.entries ?? data?.entries ?? [];
  const shown = filter === "ALL" ? shownAll : shownAll.filter((e) => e.type === filter);

  async function verify(entries: AuditEntry[] | undefined, checkHead = true) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ chain: ChainVerification }>("/api/audit", { action: "VERIFY", entries, checkHead });
      setChain(r.chain);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // The demos work on a local copy: the real log is never touched.
  function editEntry() {
    const source = data?.entries ?? [];
    if (source.length === 0) return;
    const target = Math.min(1, source.length - 1);
    const edited = source.map((e, i) => (i === target ? { ...e, detail: "Consent was never given.", actor: "SOMEONE_ELSE" } : { ...e }));
    setCopy({ entries: edited, label: "a copy with one entry edited" });
    setChain(null);
  }

  function cutTail() {
    const source = data?.entries ?? [];
    if (source.length < 2) return;
    setCopy({ entries: source.slice(0, -1), label: "a copy with the last entry deleted" });
    setChain(null);
  }

  function restore() {
    setCopy(null);
    load();
  }

  const broken = chain && !chain.valid ? chain.brokenAtIndex : undefined;
  const head = data?.head;

  return (
    <Card>
      <SectionTitle
        eyebrow="Immutable audit trail"
        title="Unified audit log"
        hint="Consent, match decisions, NAD syncs, grade changes and disputes share one hash-chained log. Each entry seals the one before it, and the chain head is signed with the issuer key."
      />
      {error && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => verify(copy?.entries, true)}>Verify chain</Button>
        {copy ? (
          <Button size="sm" onClick={restore}>Restore the real log</Button>
        ) : (
          <>
            <Button size="sm" variant="danger" onClick={editEntry}>Try editing an entry</Button>
            <Button size="sm" variant="danger" onClick={cutTail}>Try deleting the last entry</Button>
          </>
        )}
        <Button size="sm" disabled={shown.length === 0 || Boolean(copy)} onClick={() => downloadCsv(`audit-log${filter === "ALL" ? "" : `-${filter.toLowerCase()}`}.csv`, auditToCsv(shown))}>
          <Download width={16} height={16} className={ICON} />
          Export as CSV
        </Button>
        {chain && (
          <Pill tone={chain.valid ? "accent" : "red"}>
            {chain.valid ? <BadgeCheck width={16} height={16} className="h-3.5 w-3.5 shrink-0" /> : <ShieldAlert width={16} height={16} className="h-3.5 w-3.5 shrink-0" />}
            {chain.valid ? `Chain intact · ${chain.checked} entries` : "Chain broken"}
          </Pill>
        )}
        {head && !copy && (
          <Pill>
            Head #{head.seq} signed · key {head.kid}
          </Pill>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by type">
        {(["ALL", ...(data?.types ?? [])] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={filter === t}
            onClick={() => setFilter(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filter === t ? "bg-paper text-deep" : "bg-white/[0.07] text-white/70 hover:bg-white/[0.14]"}`}
          >
            {t === "ALL" ? "All" : TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {chain && !chain.valid && <div className="mb-3"><Notice tone="red">{chain.reason}</Notice></div>}
      {copy && !chain && <div className="mb-3"><Notice tone="amber">This is {copy.label}. Press Verify chain to see it caught.</Notice></div>}
      {copy && chain && chain.valid && chain.head === "not-checked" && <div className="mb-3"><Notice tone="amber">Hashes alone cannot see a deleted last entry. Verify with the signed head to catch it.</Notice></div>}

      <div className="max-h-[420px] overflow-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Audit entries</caption>
          <thead className="sticky top-0 bg-deep-2 text-xs uppercase tracking-wider text-white/55">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Entry</th>
              <th scope="col" className="px-3 py-2 font-semibold">When</th>
              <th scope="col" className="px-3 py-2 font-semibold">What happened</th>
              <th scope="col" className="px-3 py-2 font-semibold">Actor</th>
              <th scope="col" className="px-3 py-2 font-semibold">Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07]">
            {shown.map((e) => (
              <tr key={e.logId} className={broken !== undefined && shownAll.indexOf(e) >= broken ? "bg-red-500/10" : ""}>
                <td className="px-3 py-2 font-mono text-xs text-white/65">{e.logId}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-white/70">{formatDateTime(e.timestamp)}</td>
                <td className="px-3 py-2">
                  <Pill className="mr-2">{TYPE_LABEL[e.type]}</Pill>
                  <span className="text-xs font-semibold">{e.action.replace(/_/g, " ")}</span>
                  <span className="mt-0.5 block text-xs text-white/60">{e.detail}</span>
                  <span className="font-mono text-[10px] text-white/40">{e.subject}</span>
                </td>
                <td className="px-3 py-2 text-xs text-white/70">
                  {e.actor}
                  <span className="block text-[10px] text-white/45">{e.actorRole.replace(/_/g, " ")}</span>
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-white/55" title={e.sha256Hash}>
                  {short(e.sha256Hash)}
                  <span className="block text-white/35" title={e.previousHash}>← {short(e.previousHash)}</span>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-white/55">Nothing logged yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs text-white/50">
        <ShieldAlert width={16} height={16} className={`${ICON} mt-0.5`} />
        No API edits or deletes entries. Someone with database access could rewrite the log, but could not re-sign the head without the issuer key, so the verification above would fail.
      </p>
    </Card>
  );
}
