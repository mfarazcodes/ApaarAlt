"use client";

import { useState } from "react";
import { Download, Printer, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ConsentPurposes, NogenReceipt, ShareRequest, Verifier } from "@/lib/consentEngine";
import { NOTICE_ENGLISH, NOTICE_LANGUAGES } from "@/lib/consentNotices";
import { formatDate } from "../portal/api";
import { useT } from "../portal/I18n";
import { useToast } from "../portal/Toast";
import { Button, Card, Eyebrow, Field, ICON, Modal, Notice, Pill, SectionTitle, Skeleton, Toggle, inputClass } from "../portal/ui";
import ShareDialog from "./ShareDialog";
import { useWallet } from "./WalletContext";

// label and hint are dictionary keys, so they follow the chosen language.
const PURPOSES: { key: Exclude<keyof ConsentPurposes, "behavioralTracking">; label: string; hint: string }[] = [
  { key: "abcCreditSync", label: "wallet.p.abc", hint: "wallet.p.abc.hint" },
  { key: "aicteEnrolmentCount", label: "wallet.p.count", hint: "wallet.p.count.hint" },
  { key: "employerVerification", label: "wallet.p.emp", hint: "wallet.p.emp.hint" },
];

const DISPUTE_FIELDS = ["Name", "Date of birth", "Guardian name", "Marks or grade", "Credits", "Other"];

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export default function ConsentWallet() {
  const { data, error, busy, act } = useWallet();
  const { t, lang: pageLang } = useT();
  const toast = useToast();
  // The privacy notice starts in the language of the page.
  const [noticeLang, setNoticeLang] = useState<string>(pageLang);
  const [optOutOpen, setOptOutOpen] = useState(false);
  const [optOutError, setOptOutError] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeError, setDisputeError] = useState("");
  const [dispute, setDispute] = useState({ field: DISPUTE_FIELDS[0], claimedValue: "", reason: "" });
  const [shareFor, setShareFor] = useState<Verifier | null>(null);
  const [shareError, setShareError] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);

  if (!data) {
    return (
      <Card>
        <SectionTitle title={t("wallet.title")} />
        {error ? (
          <Notice tone="red">{error}</Notice>
        ) : (
          <div role="status" aria-label={t("wallet.loading")} className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        )}
      </Card>
    );
  }

  const { ledger, verifiers, viewer } = data;
  const isGuardian = viewer.role === "GUARDIAN";
  const optedOut = ledger.apaarStatus === "NOGEN_OPTED_OUT";
  const language = NOTICE_LANGUAGES.find((l) => l.code === noticeLang) ?? NOTICE_LANGUAGES[0];
  const pending = ledger.requests.filter((r) => r.status === "PENDING");
  const needsGuardian = ledger.isMinor && ledger.guardian.coSign !== "SIGNED";
  const locked = busy || optedOut || isGuardian;

  function downloadReceiptJson(r: NogenReceipt) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${r.receiptId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submitDispute() {
    setDisputeError("");
    if (await act({ action: "RAISE_DISPUTE", ...dispute }, setDisputeError)) {
      setDisputeOpen(false);
      setDispute({ field: DISPUTE_FIELDS[0], claimedValue: "", reason: "" });
      toast(t("wallet.toast.reported"));
    }
  }

  async function optOut() {
    setOptOutError("");
    // The dialog stays open if the server refuses, so the student is never told it worked when it did not.
    if (await act({ action: "TOGGLE_OPT_OUT", optOut: true }, setOptOutError)) setOptOutOpen(false);
  }

  async function confirmShare(scopes: string[], days: number) {
    if (!shareFor) return;
    setShareError("");
    if (await act({ action: "GRANT_SHARE", verifierId: shareFor.id, scopes, days }, setShareError)) {
      toast(t("share.toast", { name: shareFor.name, date: formatDate(new Date(Date.now() + days * 86_400_000).toISOString()) }));
      setShareFor(null);
    }
  }

  async function stopShare(shareId: string, name: string) {
    if (await act({ action: "REVOKE_SHARE", shareId })) toast(t("share.stopToast", { name }));
  }

  return (
    <Card>
      <SectionTitle title={isGuardian ? t("wallet.guardianTitle", { name: ledger.studentName }) : t("wallet.title")} hint={t("wallet.hint")} />

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
        {ledger.isMinor && <Pill tone="amber">{t("wallet.under18")}</Pill>}
        <span className="text-sm text-white/65">{t("wallet.never")}</span>
      </div>

      {needsGuardian && (
        <div className="mb-5">
          <Notice tone="amber">{isGuardian ? t("wallet.minorGuardian", { name: ledger.studentName }) : t("wallet.minorSelf")}</Notice>
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
                  <p className="text-xs text-white/65">
                    {ledger.guardian.coSign === "SIGNED" ? t("wallet.signed", { date: formatDate(ledger.guardian.signedAt ?? ledger.lastUpdated) }) : t("wallet.notSigned")}
                    {!isGuardian && t("wallet.onlyGuardian")}
                  </p>
                </div>
                <Toggle checked={ledger.guardian.coSign === "SIGNED"} disabled={busy || !isGuardian} label={t("wallet.guardianToggle")} onChange={(on) => act({ action: "GUARDIAN_COSIGN", sign: on })} />
              </div>
            </div>
          )}

          {/* requests waiting for an answer */}
          {!isGuardian && pending.length > 0 && (
            <div>
              <Eyebrow>{t("wallet.requests")}</Eyebrow>
              <ul className="mt-3 space-y-2" aria-label={t("wallet.requests")}>
                {pending.map((r: ShareRequest) => (
                  <li key={r.requestId} className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-3.5">
                    <p className="text-sm font-semibold text-amber-200">{t("wallet.requestAsking", { name: r.verifierName })}</p>
                    <p className="mt-1 text-xs text-white/75">{r.scopes.map((s) => t(`scope.${s}`)).join(", ")} · {t("wallet.days", { n: r.days })} · {r.purpose}</p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="primary" disabled={busy} onClick={() => act({ action: "RESPOND_REQUEST", requestId: r.requestId, approve: true, via: "APP" })}>{t("wallet.allow", { n: r.days })}</Button>
                      <Button size="sm" disabled={busy} onClick={() => act({ action: "RESPOND_REQUEST", requestId: r.requestId, approve: false, via: "APP" })}>{t("wallet.refuse")}</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* who can see the record */}
          <div>
            <Eyebrow>{t("wallet.sharing")}</Eyebrow>
            <ul className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10">
              {verifiers.map((v) => {
                const share = ledger.shares.find((s) => s.verifierId === v.id && s.status === "ACTIVE");
                return (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{v.name}</p>
                      <p className="text-xs text-white/65">
                        {share ? (
                          <>
                            {share.effective ? t("wallet.sharingNow") : <span className="font-semibold text-amber-300">{t("wallet.paused")}</span>} {share.scopes.map((s) => t(`scope.${s}`)).join(", ")} · {t("wallet.ends", { date: formatDate(share.expiresAt), n: daysLeft(share.expiresAt) })}
                          </>
                        ) : (
                          t("wallet.notSharing")
                        )}
                      </p>
                    </div>
                    {share ? (
                      <Button size="sm" disabled={locked} onClick={() => stopShare(share.shareId, v.name)}>
                        <span aria-hidden="true">{t("share.stop")}</span>
                        <span className="sr-only">{t("share.stopWith", { name: v.name })}</span>
                      </Button>
                    ) : (
                      <Button size="sm" variant="primary" disabled={locked} onClick={() => { setShareError(""); setShareFor(v); }}>
                        <span aria-hidden="true">{t("share.button")}</span>
                        <span className="sr-only">{t("wallet.shareWith", { name: v.name })}</span>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* what the college may do */}
          <div>
            <Eyebrow>{t("wallet.purposes")}</Eyebrow>
            <ul className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10">
              {PURPOSES.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t(p.label)}</p>
                    <p className="text-xs text-white/65">{t(p.hint)}</p>
                  </div>
                  <Toggle checked={ledger.purposes[p.key]} disabled={locked} label={t(p.label)} onChange={(on) => act({ action: "UPDATE_PURPOSE", purpose: p.key, allow: on })} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          {/* notice */}
          <div>
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>{t("wallet.notice")}</Eyebrow>
              <label className="sr-only" htmlFor="notice-lang">{t("wallet.noticeLanguage")}</label>
              <select id="notice-lang" value={noticeLang} onChange={(e) => setNoticeLang(e.target.value)} className={`${inputClass} !w-auto !py-1.5`}>
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
              {language.text && language.code !== "en" && <p className="mt-2 text-xs text-white/60">{t("wallet.noticeDraft")}</p>}
            </div>
          </div>

          {/* the student's own choices */}
          {!isGuardian && (
            <div className="grid gap-3 sm:grid-cols-2">
              {optedOut ? (
                <Button disabled={busy} variant="primary" onClick={() => act({ action: "TOGGLE_OPT_OUT", optOut: false })}>{t("wallet.reenrol")}</Button>
              ) : (
                <Button disabled={busy} variant="danger" onClick={() => { setOptOutError(""); setOptOutOpen(true); }}>{t("wallet.optOut")}</Button>
              )}
              <Button onClick={() => { setDisputeError(""); setDisputeOpen(true); }}>{t("wallet.dispute")}</Button>
            </div>
          )}

          {ledger.nogenReceipt && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4">
              <p className="text-sm font-semibold text-red-200">{t("wallet.receipt", { id: ledger.nogenReceipt.receiptId })}</p>
              <p className="mt-1 text-xs text-white/75">{ledger.nogenReceipt.statement}</p>
              <div className="mt-3">
                <Button size="sm" onClick={() => setReceiptOpen(true)}>{t("wallet.viewReceipt")}</Button>
              </div>
            </div>
          )}

          {ledger.disputes.length > 0 && (
            <div>
              <Eyebrow>{t("wallet.disputes")}</Eyebrow>
              <ul className="mt-3 space-y-2" aria-label={t("wallet.disputes")}>
                {ledger.disputes.map((d) => (
                  <li key={d.ticketId} className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm">
                    <span className="font-mono text-xs text-white/65">{d.ticketId}</span> · {t(`wallet.field.${d.field}`)}{" "}
                    <Pill tone={d.status === "OPEN" ? "amber" : d.status === "RESOLVED" ? "accent" : "red"} className="ml-1">{d.status === "OPEN" ? t("wallet.d.open") : d.status === "RESOLVED" ? t("wallet.d.resolved") : t("wallet.d.rejected")}</Pill>
                    <p className="mt-1 text-xs text-white/65">{d.status === "OPEN" ? t("wallet.d.ack", { date: formatDate(d.acknowledgeBy) }) : (d.resolution ?? "")}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <ShareDialog
        open={shareFor !== null}
        onClose={() => setShareFor(null)}
        title={t("share.titleFor", { name: shareFor?.name ?? "" })}
        confirmLabel={t("share.confirm")}
        busy={busy}
        error={shareError}
        onConfirm={confirmShare}
      />

      <Modal open={optOutOpen} onClose={() => setOptOutOpen(false)} title={t("wallet.optOutModal.title")}>
        <p className="text-sm text-white/75">{t("wallet.optOutModal.body")}</p>
        {optOutError && <div className="mt-4"><Notice tone="red">{optOutError}</Notice></div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setOptOutOpen(false)}>{t("wallet.keep")}</Button>
          <Button variant="danger" disabled={busy} onClick={optOut}>{t("wallet.optOutConfirm")}</Button>
        </div>
      </Modal>

      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title={t("wallet.disputeModal.title")}>
        <p className="mb-4 text-sm text-white/75">{t("wallet.disputeModal.intro")}</p>
        {disputeError && <div className="mb-3"><Notice tone="red">{disputeError}</Notice></div>}
        <div className="space-y-4">
          <Field label={t("wallet.disputeField")}>
            <select value={dispute.field} onChange={(e) => setDispute({ ...dispute, field: e.target.value })} className={inputClass}>
              {DISPUTE_FIELDS.map((f) => <option key={f} value={f} className="text-black">{t(`wallet.field.${f}`)}</option>)}
            </select>
          </Field>
          <Field label={t("wallet.disputeCorrect")}>
            <input value={dispute.claimedValue} onChange={(e) => setDispute({ ...dispute, claimedValue: e.target.value })} className={inputClass} placeholder={t("wallet.placeholder.correct")} />
          </Field>
          <Field label={t("wallet.disputeWhy")}>
            <textarea value={dispute.reason} onChange={(e) => setDispute({ ...dispute, reason: e.target.value })} rows={3} className={inputClass} placeholder={t("wallet.placeholder.why")} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setDisputeOpen(false)}>{t("wallet.cancel")}</Button>
          <Button variant="primary" disabled={busy || !dispute.reason.trim()} onClick={submitDispute}>{t("wallet.submit")}</Button>
        </div>
      </Modal>

      {ledger.nogenReceipt && (
        <Modal open={receiptOpen} onClose={() => setReceiptOpen(false)} title={t("wallet.receiptTitle")}>
          {/* A paper-style receipt. The print stylesheet prints only this block. */}
          <div className="print-area rounded-xl bg-white p-5 text-black">
            <h3 className="text-lg font-semibold">{t("wallet.receiptTitle")}</h3>
            <p className="mt-2 text-sm">{t("wallet.receipt", { id: ledger.nogenReceipt.receiptId })}</p>
            <p className="text-sm">{t("wallet.receiptIssued", { date: formatDate(ledger.nogenReceipt.issuedAt) })}</p>
            <p className="mt-3 text-sm">{ledger.nogenReceipt.statement}</p>
            <p className="mt-3 text-sm">{t("wallet.receiptShares", { n: ledger.nogenReceipt.sharesRevoked })}</p>
            <ul className="mt-3 list-disc pl-5 text-sm">
              {ledger.nogenReceipt.legalBasis.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button variant="primary" onClick={() => window.print()}>
              <Printer width={16} height={16} className={ICON} />
              {t("wallet.print")}
            </Button>
            <details className="text-sm text-white/75">
              <summary className="cursor-pointer rounded-lg px-2 py-1.5 hover:bg-white/10">{t("wallet.more")}</summary>
              <div className="mt-2">
                <Button size="sm" onClick={() => downloadReceiptJson(ledger.nogenReceipt as NogenReceipt)}>
                  <Download width={16} height={16} className={ICON} />
                  {t("wallet.receiptJson")}
                </Button>
              </div>
            </details>
          </div>
        </Modal>
      )}
    </Card>
  );
}
