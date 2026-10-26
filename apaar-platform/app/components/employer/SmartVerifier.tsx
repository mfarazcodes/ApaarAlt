"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Hourglass, KeyRound, Lock, QrCode, RefreshCw, Search, ShieldX, SearchX, WifiOff, XCircle } from "lucide-react";
import type { Verifier } from "@/lib/consentEngine";
import { baseResult, type CredentialStatus, type VerificationResult } from "@/lib/credentialModel";
import type { SampleCredential } from "@/lib/credentials";
import { verifyOffline } from "@/lib/qrVerify";
import { api, errorText, formatDate } from "../portal/api";
import { useT } from "../portal/I18n";
import { Button, Card, Eyebrow, ICON, Notice, Pill, SectionTitle, Toggle, inputClass } from "../portal/ui";
import CameraScanner from "./CameraScanner";
import ConsentPhone from "./ConsentPhone";
import { loadKeys, newEventId, pendingEvents, queueEvent, removeEvents, saveKeys, type CachedKeys, type OfflineEvent } from "./deviceStore";

interface Catalog {
  you: Verifier | null;
  samples: SampleCredential[];
  keys: { kid: string; publicKeyPem: string; status: "current" | "retired" }[];
}

const STATUS_VIEW: Record<CredentialStatus, { tone: "accent" | "red" | "amber" | "neutral"; Icon: typeof CheckCircle2; text: string }> = {
  AUTHENTIC: { tone: "accent", Icon: CheckCircle2, text: "text-accent" },
  REVOKED: { tone: "red", Icon: XCircle, text: "text-red-300" },
  SUPERSEDED: { tone: "amber", Icon: RefreshCw, text: "text-amber-300" },
  EXPIRED: { tone: "amber", Icon: Hourglass, text: "text-amber-300" },
  INVALID_SIGNATURE: { tone: "red", Icon: ShieldX, text: "text-red-300" },
  NOT_FOUND: { tone: "neutral", Icon: SearchX, text: "text-white/70" },
};

const BANNER_BG = { accent: "border-accent/40 bg-accent/10", red: "border-red-400/40 bg-red-500/10", amber: "border-amber-300/40 bg-amber-400/10", neutral: "border-white/15 bg-white/[0.05]" };

const ENGINE_LABEL = { server: "Checked by the server", webcrypto: "Checked on this device (WebCrypto)", noble: "Checked on this device (JavaScript fallback)" } as const;

const eventStatus = (s: CredentialStatus): OfflineEvent["status"] => (s === "AUTHENTIC" || s === "EXPIRED" || s === "NOT_FOUND" ? s : "INVALID_SIGNATURE");

export default function SmartVerifier() {
  const { t } = useT();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [cached, setCached] = useState<CachedKeys | null>(null);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [offline, setOffline] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [lastQr, setLastQr] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const verifierId = useRef<string | null>(null);

  /** Reports queued offline checks, once the network is back and only under the verifier that made them. */
  const flush = useCallback(async () => {
    try {
      const id = verifierId.current ?? loadKeys()?.verifierId ?? undefined;
      if (!id || !navigator.onLine) return;
      const batch = (await pendingEvents(id)).slice(0, 50);
      if (batch.length > 0) {
        await api("/api/verify/offline-events", {
          events: batch.map((e) => ({ id: e.id, cid: e.cid, status: e.status, checkedAt: e.checkedAt, kid: e.kid, engine: e.engine })),
        });
        await removeEvents(batch.map((e) => e.id));
      }
      setQueued((await pendingEvents(id)).length);
    } catch {
      /* the events stay queued and are retried the next time the device is online */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(async () => {
      setOnline(navigator.onLine);
      setCached(loadKeys());
      try {
        const c = await api<Catalog>("/api/verify/credential");
        setCatalog(c);
        verifierId.current = c.you?.id ?? null;
        // Cache the issuer keys while there is a network, so offline checks have something to check against.
        setCached(saveKeys(c.keys.map((k) => ({ kid: k.kid, publicKeyPem: k.publicKeyPem })), c.you?.id ?? null));
        await flush();
      } catch (e) {
        if (navigator.onLine) setError(errorText(e));
      }
    }, 0);
    const goOnline = () => {
      setOnline(true);
      flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      clearTimeout(first);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flush]);

  const verify = useCallback(
    async (args: { qr?: string; apaarId?: string }) => {
      setBusy(true);
      setError("");
      try {
        if (offline) {
          // Runs on this device against the cached keys. Nothing is sent anywhere.
          const r = args.qr
            ? await verifyOffline(args.qr, cached?.keys ?? [])
            : { ...baseResult("OFFLINE", "NOT_FOUND", "Offline mode can only read a scanned QR. An APAAR ID lookup needs the network."), limitations: ["Switch to online mode to look up by APAAR ID."] };
          setResult(r);
          setLastQr(args.qr);
          if (args.qr) {
            const id = verifierId.current ?? cached?.verifierId;
            if (id) {
              await queueEvent({ id: newEventId(), verifierId: id, cid: r.credentialId ?? "UNKNOWN", status: eventStatus(r.status), checkedAt: new Date().toISOString(), kid: r.checks[0]?.note.match(/key (\w+)/)?.[1], engine: r.signatureEngine === "server" ? undefined : r.signatureEngine });
              setQueued((await pendingEvents(id)).length);
              flush();
            }
          }
          return;
        }
        const res = await api<{ result: VerificationResult }>("/api/verify/credential", { mode: "ONLINE", qr: args.qr, apaarId: args.apaarId });
        setResult(res.result);
        setLastQr(args.qr);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [offline, cached, flush]
  );

  function submit() {
    const text = input.trim();
    if (!text) return;
    if (text.startsWith("APAARQR1.")) verify({ qr: text });
    else verify({ apaarId: text });
  }

  function scan(sample: SampleCredential) {
    setInput(sample.qr);
    verify({ qr: sample.qr });
  }

  function scanned(text: string) {
    setInput(text);
    verify({ qr: text });
  }

  // Flip a few characters in the signed body, as a forger editing the QR would.
  function tamper() {
    const source = lastQr ?? (input.startsWith("APAARQR1.") ? input : "");
    if (!source) return;
    const [prefix, body, sig] = source.split(".");
    const flipped = `${prefix}.${body.slice(0, 10)}${body[10] === "A" ? "B" : "A"}${body.slice(11)}.${sig}`;
    setInput(flipped);
    verify({ qr: flipped });
  }

  const view = result ? STATUS_VIEW[result.status] : null;
  const verifier = catalog?.you ?? undefined;
  const noKeys = offline && (cached?.keys.length ?? 0) === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="space-y-6">
        <Card>
          <SectionTitle eyebrow={t("ver.eyebrow")} title={t("ver.title")} hint={t("ver.hint")} />

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <WifiOff width={16} height={16} className={ICON} />
                  {t("ver.offlineMode")}
                </p>
                <p className="text-xs text-white/60">{t("ver.offlineHint")}</p>
              </div>
              <Toggle checked={offline} onChange={setOffline} label={t("ver.offlineMode")} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Pill tone={online ? "accent" : "amber"}>{online ? t("ver.network") : t("ver.noNetwork")}</Pill>
              {cached && cached.keys.length > 0 ? (
                <Pill>
                  <KeyRound width={16} height={16} className="h-3.5 w-3.5 shrink-0" />
                  Keys on this device: {cached.keys.map((k) => k.kid).join(", ")}
                </Pill>
              ) : (
                <Pill tone="amber">No issuer keys saved yet</Pill>
              )}
              {queued > 0 && <Pill tone="blue">{queued} offline check{queued === 1 ? "" : "s"} waiting to be reported</Pill>}
            </div>
            {noKeys && <Notice tone="amber">No issuer keys are saved on this device. Open this page once while online, and they are saved automatically.</Notice>}

            {!offline && verifier && (
              <p className="rounded-xl bg-white/[0.04] px-4 py-3 text-sm text-white/75">
                Verifying as <strong className="text-white">{verifier.name}</strong>. Consent is checked for this organisation only.
              </p>
            )}

            <label className="block text-sm">
              <span className="mb-1.5 block text-white/70">{offline ? "Smart QR payload" : "APAAR ID or Smart QR payload"}</span>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={3}
                spellCheck={false}
                placeholder={offline ? "APAARQR1.…" : "Type an APAAR ID, or paste APAARQR1.…"}
                className={`${inputClass} font-mono text-xs`}
              />
            </label>

            <CameraScanner onDecode={scanned} />

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={busy || !input.trim()} onClick={submit}>
                <Search width={16} height={16} className={ICON} />
                {t("ver.verify")}
              </Button>
              <Button disabled={busy || !(lastQr || input.startsWith("APAARQR1."))} onClick={tamper} title="Alter the QR to see signature checking catch it">
                {t("ver.tamper")}
              </Button>
            </div>

            {!offline && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-white/55">
                <Button size="sm" onClick={() => setInput("9481-2041-6672")}>Try the demo APAAR ID</Button>
                An APAAR ID is tokenized on arrival and never shown back.
              </p>
            )}
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <Eyebrow>{t("ver.sample")}</Eyebrow>
            {catalog ? (
              <ul className="mt-3 space-y-2">
                {catalog.samples.map((s) => (
                  <li key={s.cid}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => scan(s)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left text-sm transition hover:bg-white/[0.08] disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2.5">
                        <QrCode width={16} height={16} className={`${ICON} text-accent`} />
                        {s.label}
                      </span>
                      <span className="font-mono text-[11px] text-white/45">{s.cid}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-white/55">{online ? "Loading the sample QRs…" : "The sample QRs need the network. Paste or scan a QR instead."}</p>
            )}
          </div>
        </Card>

        <ConsentPhone verifier={verifier} result={result} disabled={offline} onChanged={() => verify({ qr: lastQr, apaarId: lastQr ? undefined : input.trim() })} />
      </div>

      <Card>
        <SectionTitle eyebrow={t("ver.result")} title={t("ver.live")} />
        {error && (
          <div className="mb-4">
            <Notice tone="red">{error}</Notice>
          </div>
        )}

        {!result && !error && (
          <div className="grid place-items-center rounded-xl border border-dashed border-white/15 px-6 py-16 text-center">
            <QrCode width={16} height={16} className="mb-4 h-10 w-10 shrink-0 text-white/35" />
            <p className="text-sm text-white/65">{t("ver.nothing")}</p>
          </div>
        )}

        {result && view && (
          <div aria-live="polite">
            <div className={`flex items-center gap-4 rounded-2xl border p-5 ${BANNER_BG[view.tone]}`}>
              <view.Icon width={40} height={40} className={`h-10 w-10 shrink-0 ${view.text}`} strokeWidth={2} />
              <div className="min-w-0">
                <p className={`text-2xl font-semibold tracking-tight ${view.text}`}>{result.status === "SUPERSEDED" ? result.headline.replace("SUPERSEDED", t("status.SUPERSEDED")) : t(`status.${result.status}`)}</p>
                <p className="mt-0.5 text-sm text-white/75">{result.detail}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>{result.mode === "OFFLINE" ? "Offline check" : "Online check"}</Pill>
              {result.signatureEngine && <Pill>{ENGINE_LABEL[result.signatureEngine]}</Pill>}
              {result.credentialId && <Pill>{result.credentialId} · v{result.version}</Pill>}
              {result.expiresAt && <Pill>Valid until {formatDate(result.expiresAt)}</Pill>}
            </div>

            {/* minimal-disclosure claims */}
            <div className="mt-6">
              <Eyebrow>{t("ver.claims")}</Eyebrow>
              {result.claims ? (
                <ul className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10">
                  {result.claims.map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span>{c.label}</span>
                      {c.value ? (
                        <Pill tone="accent"><CheckCircle2 width={16} height={16} className="h-3.5 w-3.5 shrink-0" />{t("ver.yes")}</Pill>
                      ) : (
                        <Pill tone="neutral">{t("ver.notMet")}</Pill>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/70">
                  <Lock width={16} height={16} className={`${ICON} mt-0.5`} />
                  <span>
                    {result.consent.state === "OPTED_OUT"
                      ? t("ver.optedOut")
                      : result.consent.state === "NOT_GRANTED" && result.status === "AUTHENTIC"
                        ? t("ver.withheld")
                        : t("ver.onlyAuthentic")}
                  </span>
                </div>
              )}
              <dl className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3 text-sm">
                <dt className="text-white/65">{t("ver.identity")}</dt>
                <dd className="font-mono text-xs">{result.identity}</dd>
              </dl>
              {result.consent.state === "GRANTED" && result.consent.expiresAt && (
                <p className="mt-2 text-xs text-white/55">Student consent active until {formatDate(result.consent.expiresAt)}. The student can withdraw it at any time.</p>
              )}
              {result.consent.state === "PRESENTED" && (
                <p className="mt-2 text-xs text-white/55">The student created this QR for exactly these claims. It ends on {result.consent.expiresAt ? formatDate(result.consent.expiresAt) : "its expiry date"} or sooner if the credential it came from is revoked.</p>
              )}
            </div>

            {/* checks */}
            <div className="mt-6">
              <Eyebrow>{t("ver.checked")}</Eyebrow>
              <ul className="mt-3 space-y-2">
                {result.checks.map((c) => (
                  <li key={c.name} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5">
                      {c.passed === null ? (
                        <span className="grid h-4 w-4 place-items-center rounded-full border border-dashed border-white/40 text-[9px] text-white/50">–</span>
                      ) : c.passed ? (
                        <CheckCircle2 width={16} height={16} className={`${ICON} text-accent`} />
                      ) : (
                        <XCircle width={16} height={16} className={`${ICON} text-red-300`} />
                      )}
                    </span>
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-xs text-white/60">{c.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {result.limitations.map((l) => (
              <div key={l} className="mt-4">
                <Notice tone="amber">{l}</Notice>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
