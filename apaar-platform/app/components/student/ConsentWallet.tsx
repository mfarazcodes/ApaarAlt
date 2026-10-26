"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Download, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ConsentPurposes, NogenReceipt, ShareRequest, ShareScope, StudentConsentLedger, Verifier } from "@/lib/consentEngine";
import { NOTICE_ENGLISH, NOTICE_LANGUAGES } from "@/lib/consentNotices";
import { api, errorText, formatDate } from "../portal/api";
import { useT } from "../portal/I18n";
import { Button, Card, Eyebrow, Field, ICON, Modal, Notice, Pill, SectionTitle, Toggle, inputClass } from "../portal/ui";

interface WalletResponse {
  ledger: StudentConsentLedger;
  verifiers: Verifier[];
  scopeLabels: Record<ShareScope, string>;
  chain: { valid: boolean; checked: number };
  viewer: { role: "STUDENT" | "GUARDIAN"; name: string };
}

// label and hint are dictionary keys, so they follow the chosen language.
const PURPOSES: { key: Exclude<keyof ConsentPurposes, "behavioralTracking">; label: string; hint: string }[] = [
  { key: "abcCreditSync", label: "wallet.p.abc", hint: "wallet.p.abc.hint" },
  { key: "aicteEnrolmentCount", label: "wallet.p.count", hint: "wallet.p.count.hint" },
  { key: "employerVerification", label: "wallet.p.emp", hint: "wallet.p.emp.hint" },
];

const DISPUTE_FIELDS = ["Name", "Date of birth", "Guardian name", "Marks or grade", "Credits", "Other"];
const DURATIONS = [7, 30, 90];

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export default function ConsentWallet() {
  const [data, setData] = useState<WalletResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState("en");
  const [optOutOpen, setOptOutOpen] = useState(false);
  const [optOutError, setOptOutError] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [dispute, setDispute] = useState({ field: DISPUTE_FIELDS[0], claimedValue: "", reason: "" });
  // What the next share will contain. The student chooses scopes and duration before switching a verifier on.
  const [scopes, setScopes] = useState<ShareScope[]>(["DEGREE_STATUS", "INTERNSHIP_STATUS", "CGPA_BAND", "EOA_STATUS"]);
  const [days, setDays] = useState(30);
  const { t } = useT();

  const load = useCallback(async () => {
    try {
      setData(await api<WalletResponse>("/api/consent"));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  // Requests arrive from another tab, so refresh on a timer and when the tab regains focus.
  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 5000);
    window.addEventListener("focus", load);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  /** Returns true when the server accepted the change. */
  async function act(body: Record<string, unknown>, onError: (m: string) => void = setError): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await api("/api/consent", body);
      await load();
      return true;
    } catch (e) {
      onError(errorText(e));
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <Card>
        <SectionTitle eyebrow={t("wallet.eyebrow")} title={t("wallet.title")} />
        {error ? <Notice tone="red">{error}</Notice> : <p className="text-sm text-white/60">{t("wallet.loading")}</p>}
      </Card>
    );
  }

  const { ledger, verifiers, scopeLabels, viewer } = data;
  const isGuardian = viewer.role === "GUARDIAN";
  const optedOut = ledger.apaarStatus === "NOGEN_OPTED_OUT";
  const language = NOTICE_LANGUAGES.find((l) => l.code === lang) ?? NOTICE_LANGUAGES[0];
  const pending = ledger.requests.filter((r) => r.status === "PENDING");
  const needsGuardian = ledger.isMinor && ledger.guardian.coSign !== "SIGNED";
  const locked = busy || optedOut || isGuardian;

  function toggleScope(s: ShareScope) {
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  function downloadReceipt(r: NogenReceipt) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${r.receiptId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submitDispute() {
    if (await act({ action: "RAISE_DISPUTE", ...dispute })) {
      setDisputeOpen(false);
      setDispute({ field: DISPUTE_FIELDS[0], claimedValue: "", reason: "" });
    }
  }

  async function optOut() {
    setOptOutError("");
    // The dialog stays open if the server refuses, so the student is never told it worked when it did not.
    if (await act({ action: "TOGGLE_OPT_OUT", optOut: true }, setOptOutError)) setOptOutOpen(false);
  }

  return (
    <Card>
      <SectionTitle
        eyebrow={t("wallet.eyebrow")}
        title={isGuardian ? t("wallet.guardianTitle", { name: ledger.studentName }) : t("wallet.title")}
        hint={t("wallet.hint")}
      />

      {error && (
        <div className="mb-4">
          <Notice tone="red">{error}</Notice>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {optedOut ? (
          <Pill tone="red"><ShieldAlert width={16} height={16} className="h-3.5 w-3.5 shrink-0" />{t("wallet.nogen")}</Pill>
        ) : (
          <Pill tone="accent"><ShieldCheck width={16} height={16} className="h-3.5 w-3.5 shrink-0" />{t("wallet.apaarActive")}</Pill>
        )}
        <Pill tone={data.chain.valid ? "accent" : "red"}>
          <BadgeCheck width={16} height={16} className="h-3.5 w-3.5 shrink-0" />
          {data.chain.valid ? t("wallet.auditVerified", { n: data.chain.checked }) : t("wallet.auditBroken", { n: data.chain.checked })}
        </Pill>
        <Pill>{t("wallet.identity", { value: ledger.identityDisplay })}</Pill>
        {ledger.isMinor && <Pill tone="amber">{t("wallet.under18")}</Pill>}
      </div>

      {needsGuardian && (
        <div className="mb-5">
          <Notice tone="amber">
            {isGuardian ? t("wallet.minorGuardian", { name: ledger.studentName }) : t("wallet.minorSelf")}
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* guardian */}
          {ledger.isMinor && (
            <div>
              <Eyebrow>{t("wallet.guardianCosign")}</Eyebrow>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3.5 py-3">
                <div>
                  <p className="text-sm font-medium">{ledger.guardian.guardianName}</p>
                  <p className="text-xs text-white/60">
                    {ledger.guardian.coSign === "SIGNED" ? t("wallet.signed", { date: formatDate(ledger.guardian.signedAt ?? ledger.lastUpdated) }) : t("wallet.notSigned")}
                    {!isGuardian && t("wallet.onlyGuardian")}
                  </p>
                </div>
                <Toggle
                  checked={ledger.guardian.coSign === "SIGNED"}
                  disabled={busy || !isGuardian}
                  label={t("wallet.guardianToggle")}
                  onChange={(on) => act({ action: "GUARDIAN_COSIGN", sign: on })}
                />
              </div>
            </div>
          )}

          {/* time-bound sharing */}
          <div>
            <Eyebrow>{t("wallet.sharing")}</Eyebrow>
            {!isGuardian && (
              <fieldset className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                <legend className="px-1 text-xs text-white/60">{t("wallet.nextShare")}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {(Object.keys(scopeLabels) as ShareScope[]).map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm text-white/80">
                      <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} className="h-4 w-4 accent-[var(--accent)]" />
                      {t(`scope.${s}`)}
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm text-white/80">
                  <label htmlFor="share-days">{t("wallet.for")}</label>
                  <select id="share-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputClass} !w-auto !py-1.5`}>
                    {DURATIONS.map((d) => <option key={d} value={d} className="text-black">{t("wallet.days", { n: d })}</option>)}
                  </select>
                </div>
              </fieldset>
            )}

            {!isGuardian && pending.length > 0 && (
              <ul className="mt-3 space-y-2" aria-label="Pending requests">
                {pending.map((r: ShareRequest) => (
                  <li key={r.requestId} className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-3.5">
                    <p className="text-sm font-semibold text-amber-200">{t("wallet.requestAsking", { name: r.verifierName })}</p>
                    <p className="mt-1 text-xs text-white/70">{r.scopes.map((s) => scopeLabels[s]).join(", ")} · {t("wallet.days", { n: r.days })} · {r.purpose}</p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="primary" disabled={busy} onClick={() => act({ action: "RESPOND_REQUEST", requestId: r.requestId, approve: true, via: "APP" })}>{t("wallet.allow", { n: r.days })}</Button>
                      <Button size="sm" disabled={busy} onClick={() => act({ action: "RESPOND_REQUEST", requestId: r.requestId, approve: false, via: "APP" })}>{t("wallet.refuse")}</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <ul className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10">
              {verifiers.map((v) => {
                const share = ledger.shares.find((s) => s.verifierId === v.id && s.status === "ACTIVE");
                return (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{v.name}</p>
                      <p className="text-xs text-white/60">
                        {share ? (
                          <>
                            {share.effective ? t("wallet.sharingNow") : <span className="font-semibold text-amber-300">{t("wallet.paused")}</span>} {share.scopes.map((s) => t(`scope.${s}`)).join(", ")} · {t("wallet.ends", { date: formatDate(share.expiresAt), n: daysLeft(share.expiresAt) })}
                          </>
                        ) : (
                          t("wallet.notSharing")
                        )}
                      </p>
                    </div>
                    <Toggle
                      checked={Boolean(share)}
                      disabled={locked || (!share && scopes.length === 0)}
                      label={t("wallet.shareWith", { name: v.name })}
                      onChange={(on) => act(on ? { action: "GRANT_SHARE", verifierId: v.id, scopes, days } : { action: "REVOKE_SHARE", shareId: share?.shareId })}
                    />
                  </li>
                );
              })}
            </ul>
            {!isGuardian && scopes.length === 0 && <p className="mt-2 text-xs text-amber-300">{t("wallet.pickOne")}</p>}
          </div>

          {/* purposes */}
          <div>
            <Eyebrow>{t("wallet.purposes")}</Eyebrow>
            <ul className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10">
              {PURPOSES.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t(p.label)}</p>
                    <p className="text-xs text-white/60">{t(p.hint)}</p>
                  </div>
                  <Toggle checked={ledger.purposes[p.key]} disabled={locked} label={t(p.label)} onChange={(on) => act({ action: "UPDATE_PURPOSE", purpose: p.key, allow: on })} />
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Lock width={16} height={16} className={`${ICON} text-white/60`} />
                    {t("wallet.p.track")}
                    <Pill tone="red">{t("wallet.p.track.off")}</Pill>
                  </p>
                  <p className="text-xs text-white/60">{t("wallet.p.track.hint")}</p>
                </div>
                <Toggle checked={false} disabled label="Behavioural tracking (locked off)" onChange={() => {}} />
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          {/* notice */}
          <div>
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>{t("wallet.notice")}</Eyebrow>
              <label className="sr-only" htmlFor="notice-lang">{t("wallet.noticeLanguage")}</label>
              <select id="notice-lang" value={lang} onChange={(e) => setLang(e.target.value)} className={`${inputClass} !w-auto !py-1.5`}>
                {NOTICE_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} className="text-black">
                    {l.name} · {l.native}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p lang={language.text ? language.code : "en"} dir={language.rtl && language.text ? "rtl" : "ltr"} className="text-sm leading-relaxed text-white/85">
                {language.text ?? NOTICE_ENGLISH}
              </p>
              {!language.text && <p className="mt-2 text-xs text-amber-300">{t("wallet.noticePending", { name: language.name })}</p>}
              {language.text && language.code !== "en" && <p className="mt-2 text-xs text-white/50">{t("wallet.noticeDraft")}</p>}
            </div>
            <p className="mt-2 text-xs text-white/50">{t("wallet.noticeLangs")}</p>
          </div>

          {/* NOGEN + dispute (the student's own choices) */}
          {!isGuardian && (
            <div className="grid gap-3 sm:grid-cols-2">
              {optedOut ? (
                <Button disabled={busy} variant="primary" onClick={() => act({ action: "TOGGLE_OPT_OUT", optOut: false })}>{t("wallet.reenrol")}</Button>
              ) : (
                <Button disabled={busy} variant="danger" onClick={() => { setOptOutError(""); setOptOutOpen(true); }}>{t("wallet.optOut")}</Button>
              )}
              <Button onClick={() => setDisputeOpen(true)}>{t("wallet.dispute")}</Button>
            </div>
          )}

          {ledger.nogenReceipt && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4">
              <p className="text-sm font-semibold text-red-200">{t("wallet.receipt", { id: ledger.nogenReceipt.receiptId })}</p>
              <p className="mt-1 text-xs text-white/70">{ledger.nogenReceipt.statement}</p>
              <div className="mt-3"><Button size="sm" onClick={() => downloadReceipt(ledger.nogenReceipt as NogenReceipt)}><Download width={16} height={16} className={ICON} />{t("wallet.downloadReceipt")}</Button></div>
            </div>
          )}

          {ledger.disputes.length > 0 && (
            <div>
              <Eyebrow>{t("wallet.disputes")}</Eyebrow>
              <ul className="mt-3 space-y-2" aria-label="Disputes">
                {ledger.disputes.map((d) => (
                  <li key={d.ticketId} className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm">
                    <span className="font-mono text-xs text-white/60">{d.ticketId}</span> · {d.field}{" "}
                    <Pill tone={d.status === "OPEN" ? "amber" : d.status === "RESOLVED" ? "accent" : "red"} className="ml-1">{d.status === "OPEN" ? t("wallet.d.open") : d.status === "RESOLVED" ? t("wallet.d.resolved") : t("wallet.d.rejected")}</Pill>
                    <p className="mt-1 text-xs text-white/60">{d.status === "OPEN" ? t("wallet.d.ack", { date: formatDate(d.acknowledgeBy) }) : (d.resolution ?? "")}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Modal open={optOutOpen} onClose={() => setOptOutOpen(false)} title={t("wallet.optOutModal.title")}>
        <p className="text-sm text-white/75">
          {t("wallet.optOutModal.body")}
        </p>
        {optOutError && <div className="mt-4"><Notice tone="red">{optOutError}</Notice></div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setOptOutOpen(false)}>{t("wallet.keep")}</Button>
          <Button variant="danger" disabled={busy} onClick={optOut}>{t("wallet.optOutConfirm")}</Button>
        </div>
      </Modal>

      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title={t("wallet.disputeModal.title")}>
        <p className="mb-4 text-sm text-white/70">{t("wallet.disputeModal.intro")}</p>
        {error && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}
        <div className="space-y-4">
          <Field label={t("wallet.disputeField")}>
            <select value={dispute.field} onChange={(e) => setDispute({ ...dispute, field: e.target.value })} className={inputClass}>
              {DISPUTE_FIELDS.map((f) => <option key={f} value={f} className="text-black">{t(`wallet.field.${f}`)}</option>)}
            </select>
          </Field>
          <Field label={t("wallet.disputeCorrect")}>
            <input value={dispute.claimedValue} onChange={(e) => setDispute({ ...dispute, claimedValue: e.target.value })} className={inputClass} placeholder="Correct value" />
          </Field>
          <Field label={t("wallet.disputeWhy")}>
            <textarea value={dispute.reason} onChange={(e) => setDispute({ ...dispute, reason: e.target.value })} rows={3} className={inputClass} placeholder="Briefly explain" />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setDisputeOpen(false)}>{t("wallet.cancel")}</Button>
          <Button variant="primary" disabled={busy || !dispute.reason.trim()} onClick={submitDispute}>{t("wallet.submit")}</Button>
        </div>
      </Modal>
    </Card>
  );
}
