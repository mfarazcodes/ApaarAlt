"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Download, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ConsentPurposes, NogenReceipt, ShareRequest, StudentConsentLedger, Verifier } from "@/lib/consentEngine";
import { NOTICE_ENGLISH, NOTICE_LANGUAGES } from "@/lib/consentNotices";
import { api, errorText, formatDate } from "../portal/api";
import { Button, Card, Eyebrow, Field, ICON, Modal, Notice, Pill, SectionTitle, Toggle, inputClass } from "../portal/ui";

interface WalletResponse {
  ledger: StudentConsentLedger;
  verifiers: Verifier[];
  scopeLabels: Record<string, string>;
  chain: { valid: boolean; checked: number };
}

const PURPOSES: { key: Exclude<keyof ConsentPurposes, "behavioralTracking">; label: string; hint: string }[] = [
  { key: "abcCreditSync", label: "Sync credits to the Academic Bank of Credits", hint: "Lets your college push grades and credits to NAD." },
  { key: "aicteEnrolmentCount", label: "Count me in AICTE enrolment figures", hint: "Counted as a headcount only." },
  { key: "employerVerification", label: "Allow employer verification", hint: "Master switch for every verifier share below." },
];

const DISPUTE_FIELDS = ["Name", "Date of birth", "Guardian name", "Marks or grade", "Credits", "Other"];

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export default function ConsentWallet() {
  const [data, setData] = useState<WalletResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState("en");
  const [optOutOpen, setOptOutOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [dispute, setDispute] = useState({ field: DISPUTE_FIELDS[0], claimedValue: "", reason: "" });

  const load = useCallback(async () => {
    try {
      setData(await api<WalletResponse>("/api/consent"));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  // Employer requests arrive from another tab, so refresh on a timer and when the tab regains focus.
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

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ ledger: StudentConsentLedger }>("/api/consent", body);
      await load();
      return res;
    } catch (e) {
      setError(errorText(e));
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <Card>
        <SectionTitle eyebrow="DPDP Consent Wallet" title="Consent wallet and dispute portal" />
        {error ? <Notice tone="red">{error}</Notice> : <p className="text-sm text-white/60">Loading your consent ledger…</p>}
      </Card>
    );
  }

  const { ledger, verifiers } = data;
  const optedOut = ledger.apaarStatus === "NOGEN_OPTED_OUT";
  const language = NOTICE_LANGUAGES.find((l) => l.code === lang) ?? NOTICE_LANGUAGES[0];
  const pending = ledger.requests.filter((r) => r.status === "PENDING");
  const needsGuardian = ledger.isMinor && ledger.guardian.coSign !== "SIGNED";

  function downloadReceipt(r: NogenReceipt) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${r.receiptId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submitDispute() {
    const res = await act({ action: "RAISE_DISPUTE", ...dispute });
    if (res) {
      setDisputeOpen(false);
      setDispute({ field: DISPUTE_FIELDS[0], claimedValue: "", reason: "" });
    }
  }

  return (
    <Card>
      <SectionTitle
        eyebrow="DPDP Consent Wallet"
        title="Who can see what, and for how long"
        hint="Every change is sealed into a hash-chained ledger that you can audit."
      />

      {error && (
        <div className="mb-4">
          <Notice tone="red">{error}</Notice>
        </div>
      )}

      {/* status strip */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {optedOut ? (
          <Pill tone="red"><ShieldAlert width={16} height={16} className="h-3.5 w-3.5 shrink-0" />NOGEN: opted out of APAAR</Pill>
        ) : (
          <Pill tone="accent"><ShieldCheck width={16} height={16} className="h-3.5 w-3.5 shrink-0" />APAAR active</Pill>
        )}
        <Pill tone={data.chain.valid ? "accent" : "red"}>
          <BadgeCheck width={16} height={16} className="h-3.5 w-3.5 shrink-0" />
          Ledger {data.chain.valid ? "verified" : "BROKEN"} · {data.chain.checked} entries
        </Pill>
        <Pill>Identity: {ledger.identityDisplay}</Pill>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* time-bound sharing */}
          <div>
            <Eyebrow>Time-bound sharing (30 days)</Eyebrow>
            {pending.length > 0 && (
              <ul className="mt-3 space-y-2" aria-label="Pending requests">
                {pending.map((r: ShareRequest) => (
                  <li key={r.requestId} className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-3.5">
                    <p className="text-sm font-semibold text-amber-200">{r.verifierName} is asking for access</p>
                    <p className="mt-1 text-xs text-white/70">{r.scopes.map((s) => data.scopeLabels[s]).join(", ")} · {r.purpose}</p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="primary" disabled={busy} onClick={() => act({ action: "RESPOND_REQUEST", requestId: r.requestId, approve: true, via: "APP" })}>Allow 30 days</Button>
                      <Button size="sm" disabled={busy} onClick={() => act({ action: "RESPOND_REQUEST", requestId: r.requestId, approve: false, via: "APP" })}>Refuse</Button>
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
                        {share ? `Shares degree & internship status · ends ${formatDate(share.expiresAt)} (${daysLeft(share.expiresAt)} days)` : "Not sharing"}
                      </p>
                    </div>
                    <Toggle
                      checked={Boolean(share)}
                      disabled={busy || optedOut}
                      label={`Share with ${v.name} for 30 days`}
                      onChange={(on) =>
                        act(on ? { action: "GRANT_SHARE", verifierId: v.id, days: 30 } : { action: "REVOKE_SHARE", shareId: share?.shareId })
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </div>

          {/* purposes */}
          <div>
            <Eyebrow>Purposes</Eyebrow>
            <ul className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10">
              {PURPOSES.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-white/60">{p.hint}</p>
                  </div>
                  <Toggle
                    checked={ledger.purposes[p.key]}
                    disabled={busy || optedOut}
                    label={p.label}
                    onChange={(on) => act({ action: "UPDATE_PURPOSE", purpose: p.key, allow: on })}
                  />
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Lock width={16} height={16} className={`${ICON} text-white/60`} />
                    Behavioural tracking
                    <Pill tone="red">DISABLED</Pill>
                  </p>
                  <p className="text-xs text-white/60">Locked by law. Section 9(3) bars tracking and profiling of students.</p>
                </div>
                <Toggle checked={false} disabled label="Behavioural tracking (locked off)" onChange={() => {}} />
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          {/* minor / guardian */}
          <div>
            <Eyebrow>Under 18? Guardian co-sign</Eyebrow>
            <div className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10">
              <div className="flex items-center justify-between gap-3 px-3.5 py-3">
                <div>
                  <p className="text-sm font-medium">I am under 18 (demo switch)</p>
                  <p className="text-xs text-white/60">Section 9(1) needs a parent or guardian to consent first.</p>
                </div>
                <Toggle checked={ledger.isMinor} disabled={busy || optedOut} label="Student is under 18" onChange={(on) => act({ action: "SET_MINOR", isMinor: on })} />
              </div>
              {ledger.isMinor && (
                <div className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <div>
                    <p className="text-sm font-medium">Guardian co-sign: {ledger.guardian.guardianName}</p>
                    <p className="text-xs text-white/60">
                      {ledger.guardian.coSign === "SIGNED" ? `Signed ${formatDate(ledger.guardian.signedAt ?? ledger.lastUpdated)}` : "Pending. New sharing is blocked until signed."}
                    </p>
                  </div>
                  <Toggle checked={ledger.guardian.coSign === "SIGNED"} disabled={busy} label="Guardian has co-signed" onChange={(on) => act({ action: "GUARDIAN_COSIGN", sign: on })} />
                </div>
              )}
            </div>
            {needsGuardian && (
              <div className="mt-3">
                <Notice tone="amber">Sharing is paused until your guardian co-signs.</Notice>
              </div>
            )}
          </div>

          {/* notice */}
          <div>
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>Privacy notice</Eyebrow>
              <label className="sr-only" htmlFor="notice-lang">Notice language</label>
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
              {!language.text && <p className="mt-2 text-xs text-amber-300">The {language.name} translation is pending, so the English notice is shown.</p>}
              {language.text && language.code !== "en" && <p className="mt-2 text-xs text-white/50">Draft translation. Certified legal translation is required before real use.</p>}
            </div>
            <p className="mt-2 text-xs text-white/50">English plus the 22 Eighth Schedule languages.</p>
          </div>

          {/* NOGEN + dispute */}
          <div className="grid gap-3 sm:grid-cols-2">
            {optedOut ? (
              <Button disabled={busy} variant="primary" onClick={() => act({ action: "TOGGLE_OPT_OUT", optOut: false })}>Re-enrol in APAAR</Button>
            ) : (
              <Button disabled={busy} variant="danger" onClick={() => setOptOutOpen(true)}>Opt out of APAAR (NOGEN)</Button>
            )}
            <Button onClick={() => setDisputeOpen(true)}>Raise a data dispute</Button>
          </div>

          {ledger.nogenReceipt && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4">
              <p className="text-sm font-semibold text-red-200">NOGEN receipt {ledger.nogenReceipt.receiptId}</p>
              <p className="mt-1 text-xs text-white/70">{ledger.nogenReceipt.statement}</p>
              <div className="mt-3"><Button size="sm" onClick={() => downloadReceipt(ledger.nogenReceipt as NogenReceipt)}><Download width={16} height={16} className={ICON} />Download receipt</Button></div>
            </div>
          )}

          {ledger.disputes.length > 0 && (
            <ul className="space-y-2" aria-label="Your disputes">
              {ledger.disputes.map((d) => (
                <li key={d.ticketId} className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm">
                  <span className="font-mono text-xs text-white/60">{d.ticketId}</span> · {d.field} <Pill tone="amber" className="ml-1">Open</Pill>
                  <p className="mt-1 text-xs text-white/60">Acknowledgement due by {formatDate(d.acknowledgeBy)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Modal open={optOutOpen} onClose={() => setOptOutOpen(false)} title="Opt out of APAAR?">
        <p className="text-sm text-white/75">
          This sets your status to NOGEN, stops credit sync, and ends every active share. Opting out must not cost you admission, exams or any service. You will get a signed receipt, and you can re-enrol later.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setOptOutOpen(false)}>Keep APAAR</Button>
          <Button variant="danger" disabled={busy} onClick={async () => { await act({ action: "TOGGLE_OPT_OUT", optOut: true }); setOptOutOpen(false); }}>Opt out</Button>
        </div>
      </Modal>

      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title="Raise a data dispute">
        <p className="mb-4 text-sm text-white/70">Tell us which record is wrong. Your college and the platform both get the ticket, and it is written to your ledger.</p>
        <div className="space-y-4">
          <Field label="Which field?">
            <select value={dispute.field} onChange={(e) => setDispute({ ...dispute, field: e.target.value })} className={inputClass}>
              {DISPUTE_FIELDS.map((f) => <option key={f} className="text-black">{f}</option>)}
            </select>
          </Field>
          <Field label="What should it say?">
            <input value={dispute.claimedValue} onChange={(e) => setDispute({ ...dispute, claimedValue: e.target.value })} className={inputClass} placeholder="Correct value" />
          </Field>
          <Field label="Why is the current value wrong?">
            <textarea value={dispute.reason} onChange={(e) => setDispute({ ...dispute, reason: e.target.value })} rows={3} className={inputClass} placeholder="Briefly explain" />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setDisputeOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={busy || !dispute.reason.trim()} onClick={submitDispute}>Submit dispute</Button>
        </div>
      </Modal>
    </Card>
  );
}
