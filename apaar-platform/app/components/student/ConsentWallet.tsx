"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Download, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ConsentPurposes, NogenReceipt, ShareRequest, ShareScope, StudentConsentLedger, Verifier } from "@/lib/consentEngine";
import { NOTICE_ENGLISH, NOTICE_LANGUAGES } from "@/lib/consentNotices";
import { api, errorText, formatDate } from "../portal/api";
import { Button, Card, Eyebrow, Field, ICON, Modal, Notice, Pill, SectionTitle, Toggle, inputClass } from "../portal/ui";

interface WalletResponse {
  ledger: StudentConsentLedger;
  verifiers: Verifier[];
  scopeLabels: Record<ShareScope, string>;
  chain: { valid: boolean; checked: number };
  viewer: { role: "STUDENT" | "GUARDIAN"; name: string };
}

const PURPOSES: { key: Exclude<keyof ConsentPurposes, "behavioralTracking">; label: string; hint: string }[] = [
  { key: "abcCreditSync", label: "Sync credits to the Academic Bank of Credits", hint: "Lets your college push grades and credits to NAD." },
  { key: "aicteEnrolmentCount", label: "Count me in AICTE enrolment figures", hint: "Counted as a headcount only." },
  { key: "employerVerification", label: "Allow employer verification", hint: "Master switch. Turning it off pauses every share below." },
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
        <SectionTitle eyebrow="DPDP Consent Wallet" title="Consent wallet and dispute portal" />
        {error ? <Notice tone="red">{error}</Notice> : <p className="text-sm text-white/60">Loading the consent ledger…</p>}
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
        eyebrow="DPDP Consent Wallet"
        title={isGuardian ? `Guardian view for ${ledger.studentName}` : "Who can see what, and for how long"}
        hint="Every change is sealed into the hash-chained audit log."
      />

      {error && (
        <div className="mb-4">
          <Notice tone="red">{error}</Notice>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {optedOut ? (
          <Pill tone="red"><ShieldAlert width={16} height={16} className="h-3.5 w-3.5 shrink-0" />NOGEN: opted out of APAAR</Pill>
        ) : (
          <Pill tone="accent"><ShieldCheck width={16} height={16} className="h-3.5 w-3.5 shrink-0" />APAAR active</Pill>
        )}
        <Pill tone={data.chain.valid ? "accent" : "red"}>
          <BadgeCheck width={16} height={16} className="h-3.5 w-3.5 shrink-0" />
          Audit log {data.chain.valid ? "verified" : "BROKEN"} · {data.chain.checked} entries
        </Pill>
        <Pill>Identity: {ledger.identityDisplay}</Pill>
        {ledger.isMinor && <Pill tone="amber">Under 18</Pill>}
      </div>

      {needsGuardian && (
        <div className="mb-5">
          <Notice tone="amber">
            {isGuardian
              ? `${ledger.studentName} is under 18. Nothing can be shared until you co-sign below.`
              : "You are under 18, so sharing is paused until your guardian co-signs (DPDP Act, Section 9(1))."}
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* guardian */}
          {ledger.isMinor && (
            <div>
              <Eyebrow>Guardian co-sign</Eyebrow>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3.5 py-3">
                <div>
                  <p className="text-sm font-medium">{ledger.guardian.guardianName}</p>
                  <p className="text-xs text-white/60">
                    {ledger.guardian.coSign === "SIGNED" ? `Signed ${formatDate(ledger.guardian.signedAt ?? ledger.lastUpdated)}` : "Not signed yet."}
                    {!isGuardian && " Only your guardian can change this."}
                  </p>
                </div>
                <Toggle
                  checked={ledger.guardian.coSign === "SIGNED"}
                  disabled={busy || !isGuardian}
                  label="Guardian has co-signed"
                  onChange={(on) => act({ action: "GUARDIAN_COSIGN", sign: on })}
                />
              </div>
            </div>
          )}

          {/* time-bound sharing */}
          <div>
            <Eyebrow>Time-bound sharing</Eyebrow>
            {!isGuardian && (
              <fieldset className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                <legend className="px-1 text-xs text-white/60">What the next share will include</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {(Object.keys(scopeLabels) as ShareScope[]).map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm text-white/80">
                      <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} className="h-4 w-4 accent-[var(--accent)]" />
                      {scopeLabels[s]}
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm text-white/80">
                  <label htmlFor="share-days">For</label>
                  <select id="share-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputClass} !w-auto !py-1.5`}>
                    {DURATIONS.map((d) => <option key={d} value={d} className="text-black">{d} days</option>)}
                  </select>
                </div>
              </fieldset>
            )}

            {!isGuardian && pending.length > 0 && (
              <ul className="mt-3 space-y-2" aria-label="Pending requests">
                {pending.map((r: ShareRequest) => (
                  <li key={r.requestId} className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-3.5">
                    <p className="text-sm font-semibold text-amber-200">{r.verifierName} is asking for access</p>
                    <p className="mt-1 text-xs text-white/70">{r.scopes.map((s) => scopeLabels[s]).join(", ")} · {r.days} days · {r.purpose}</p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="primary" disabled={busy} onClick={() => act({ action: "RESPOND_REQUEST", requestId: r.requestId, approve: true, via: "APP" })}>Allow {r.days} days</Button>
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
                        {share ? (
                          <>
                            {share.effective ? "Sharing" : <span className="font-semibold text-amber-300">Paused</span>} {share.scopes.map((s) => scopeLabels[s]).join(", ")} · ends {formatDate(share.expiresAt)} ({daysLeft(share.expiresAt)} days)
                          </>
                        ) : (
                          "Not sharing"
                        )}
                      </p>
                    </div>
                    <Toggle
                      checked={Boolean(share)}
                      disabled={locked || (!share && scopes.length === 0)}
                      label={`Share with ${v.name}`}
                      onChange={(on) => act(on ? { action: "GRANT_SHARE", verifierId: v.id, scopes, days } : { action: "REVOKE_SHARE", shareId: share?.shareId })}
                    />
                  </li>
                );
              })}
            </ul>
            {!isGuardian && scopes.length === 0 && <p className="mt-2 text-xs text-amber-300">Pick at least one thing to share.</p>}
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
                  <Toggle checked={ledger.purposes[p.key]} disabled={locked} label={p.label} onChange={(on) => act({ action: "UPDATE_PURPOSE", purpose: p.key, allow: on })} />
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

          {/* NOGEN + dispute (the student's own choices) */}
          {!isGuardian && (
            <div className="grid gap-3 sm:grid-cols-2">
              {optedOut ? (
                <Button disabled={busy} variant="primary" onClick={() => act({ action: "TOGGLE_OPT_OUT", optOut: false })}>Re-enrol in APAAR</Button>
              ) : (
                <Button disabled={busy} variant="danger" onClick={() => { setOptOutError(""); setOptOutOpen(true); }}>Opt out of APAAR (NOGEN)</Button>
              )}
              <Button onClick={() => setDisputeOpen(true)}>Raise a data dispute</Button>
            </div>
          )}

          {ledger.nogenReceipt && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4">
              <p className="text-sm font-semibold text-red-200">NOGEN receipt {ledger.nogenReceipt.receiptId}</p>
              <p className="mt-1 text-xs text-white/70">{ledger.nogenReceipt.statement}</p>
              <div className="mt-3"><Button size="sm" onClick={() => downloadReceipt(ledger.nogenReceipt as NogenReceipt)}><Download width={16} height={16} className={ICON} />Download receipt</Button></div>
            </div>
          )}

          {ledger.disputes.length > 0 && (
            <div>
              <Eyebrow>Disputes</Eyebrow>
              <ul className="mt-3 space-y-2" aria-label="Disputes">
                {ledger.disputes.map((d) => (
                  <li key={d.ticketId} className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm">
                    <span className="font-mono text-xs text-white/60">{d.ticketId}</span> · {d.field}{" "}
                    <Pill tone={d.status === "OPEN" ? "amber" : d.status === "RESOLVED" ? "accent" : "red"} className="ml-1">{d.status === "OPEN" ? "Open" : d.status === "RESOLVED" ? "Resolved" : "Rejected"}</Pill>
                    <p className="mt-1 text-xs text-white/60">{d.status === "OPEN" ? `Acknowledgement due by ${formatDate(d.acknowledgeBy)}` : (d.resolution ?? "")}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Modal open={optOutOpen} onClose={() => setOptOutOpen(false)} title="Opt out of APAAR?">
        <p className="text-sm text-white/75">
          This sets your status to NOGEN, stops credit sync, and ends every active share. Opting out must not cost you admission, exams or any service. You will get a signed receipt, and you can re-enrol later.
        </p>
        {optOutError && <div className="mt-4"><Notice tone="red">{optOutError}</Notice></div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setOptOutOpen(false)}>Keep APAAR</Button>
          <Button variant="danger" disabled={busy} onClick={optOut}>Opt out</Button>
        </div>
      </Modal>

      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title="Raise a data dispute">
        <p className="mb-4 text-sm text-white/70">Tell us which record is wrong. Your college receives the ticket, and it is written to the audit log.</p>
        {error && <div className="mb-3"><Notice tone="red">{error}</Notice></div>}
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
