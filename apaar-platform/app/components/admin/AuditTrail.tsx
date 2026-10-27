"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Download, ShieldAlert } from "lucide-react";
import type { AuditEntry, AuditType, ChainHead, ChainVerification } from "@/lib/audit";
import { auditToCsv } from "@/lib/auditCsv";
import { api, errorText, formatDateTime } from "../portal/api";
import { downloadCsv } from "../portal/csvDownload";
import { useT } from "../portal/I18n";
import { Button, Card, Disclosure, ICON, Notice, Pill, SectionTitle } from "../portal/ui";

interface AuditResponse {
  entries: AuditEntry[];
  chain: ChainVerification;
  head: ChainHead | null;
  types: AuditType[];
}

const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

/** The activity log. Plain by default (when, what, who); hashes and the tamper demo are one click away. */
export default function AuditTrail() {
  const { t } = useT();
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
    setCopy({ entries: edited, label: t("con.au.copyEdited") });
    setChain(null);
  }

  function cutTail() {
    const source = data?.entries ?? [];
    if (source.length < 2) return;
    setCopy({ entries: source.slice(0, -1), label: t("con.au.copyCut") });
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
      <SectionTitle title={t("con.au.title")} hint={t("con.au.hint")} />
      {error && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => verify(copy?.entries, true)}>{t("con.au.verify")}</Button>
        <Button size="sm" disabled={shown.length === 0 || Boolean(copy)} onClick={() => downloadCsv(`audit-log${filter === "ALL" ? "" : `-${filter.toLowerCase()}`}.csv`, auditToCsv(shown))}>
          <Download width={16} height={16} className={ICON} />
          {t("con.export")}
        </Button>
        {chain && (
          <Pill tone={chain.valid ? "accent" : "red"}>
            {chain.valid ? <BadgeCheck width={16} height={16} className="h-3.5 w-3.5 shrink-0" /> : <ShieldAlert width={16} height={16} className="h-3.5 w-3.5 shrink-0" />}
            {chain.valid ? t("con.au.intact", { n: chain.checked }) : t("con.au.broken")}
          </Pill>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={t("con.au.filter")}>
        {(["ALL", ...(data?.types ?? [])] as const).map((ty) => (
          <button
            key={ty}
            type="button"
            aria-pressed={filter === ty}
            onClick={() => setFilter(ty)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filter === ty ? "bg-paper text-deep" : "bg-white/[0.07] text-white/75 hover:bg-white/[0.14]"}`}
          >
            {ty === "ALL" ? t("con.au.all") : t(`con.au.t.${ty}`)}
          </button>
        ))}
      </div>

      {chain && !chain.valid && <div className="mb-3"><Notice tone="red">{chain.reason}</Notice></div>}
      {copy && !chain && <div className="mb-3"><Notice tone="amber">{t("con.au.copyNote", { what: copy.label })}</Notice></div>}
      {copy && chain && chain.valid && chain.head === "not-checked" && <div className="mb-3"><Notice tone="amber">{t("con.au.headNote")}</Notice></div>}

      <div className="max-h-[420px] overflow-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">{t("con.au.caption")}</caption>
          <thead className="sticky top-0 bg-deep-2 text-xs uppercase tracking-wider text-white/65">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">{t("con.au.when")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t("con.au.what")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t("con.au.who")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07]">
            {shown.map((e) => (
              <tr key={e.logId} className={broken !== undefined && shownAll.indexOf(e) >= broken ? "bg-red-500/10" : ""}>
                <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-white/75">{formatDateTime(e.timestamp)}</td>
                <td className="px-3 py-2 align-top">
                  <Pill className="mr-2">{t(`con.au.t.${e.type}`)}</Pill>
                  <span className="text-xs font-semibold">{e.action.replace(/_/g, " ")}</span>
                  <span className="mt-0.5 block text-xs text-white/70">{e.detail}</span>
                  <details className="mt-1 text-xs text-white/65">
                    <summary className="cursor-pointer">{t("con.au.details")}</summary>
                    <span className="mt-1 block font-mono">{e.logId} · {e.subject}</span>
                    <span className="block font-mono" title={e.sha256Hash}>{short(e.sha256Hash)} <span title={e.previousHash}>← {short(e.previousHash)}</span></span>
                  </details>
                </td>
                <td className="px-3 py-2 align-top text-xs text-white/75">
                  {e.actor}
                  <span className="block text-xs text-white/65">{e.actorRole.replace(/_/g, " ")}</span>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-sm text-white/65">{t("con.au.empty")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Disclosure summary={t("con.au.tamper")} className="mt-4">
        <p className="text-sm text-white/75">{t("con.au.tamperIntro")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {copy ? (
            <Button size="sm" onClick={restore}>{t("con.au.restore")}</Button>
          ) : (
            <>
              <Button size="sm" variant="danger" onClick={editEntry}>{t("con.au.tryEdit")}</Button>
              <Button size="sm" variant="danger" onClick={cutTail}>{t("con.au.tryCut")}</Button>
            </>
          )}
          {head && !copy && <Pill>{t("con.au.head", { n: head.seq, kid: head.kid })}</Pill>}
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-white/65">
          <ShieldAlert width={16} height={16} className={`${ICON} mt-0.5`} />
          {t("con.au.tamperNote")}
        </p>
      </Disclosure>
    </Card>
  );
}
