"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Hourglass, Lock, QrCode, RefreshCw, Search, ShieldX, SearchX, XCircle } from "lucide-react";
import type { Verifier } from "@/lib/consentEngine";
import { baseResult, type CredentialStatus, type VerificationResult } from "@/lib/credentialModel";
import type { SampleCredential } from "@/lib/credentials";
import { verifyOffline } from "@/lib/qrVerify";
import { api, errorText, formatDate } from "../portal/api";
import { useT } from "../portal/I18n";
import { Button, Card, Disclosure, Eyebrow, ICON, Notice, Pill, SectionTitle, Toggle, inputClass } from "../portal/ui";
import CameraScanner from "./CameraScanner";
import ConsentPhone from "./ConsentPhone";
import { loadKeys, newEventId, pendingEvents, queueEvent, removeEvents, saveKeys, type CachedKeys, type OfflineEvent } from "./deviceStore";

interface Catalog {
  you: Verifier | null;
  samples: SampleCredential[];
  keys: { kid: string; publicKeyPem: string; status: "current" | "retired" }[];
}

const STATUS_VIEW: Record<CredentialStatus, { tone: "accent" | "red" | "amber" | "neutral"; Icon: typeof CheckCircle2; text: string }> = {
  AUTHENTIC: { tone: "accent", Icon: CheckCircle2, text: "text-accent-soft" },
  REVOKED: { tone: "red", Icon: XCircle, text: "text-red-300" },
  SUPERSEDED: { tone: "amber", Icon: RefreshCw, text: "text-amber-300" },
  EXPIRED: { tone: "amber", Icon: Hourglass, text: "text-amber-300" },
  INVALID_SIGNATURE: { tone: "red", Icon: ShieldX, text: "text-red-300" },
  NOT_FOUND: { tone: "neutral", Icon: SearchX, text: "text-white/70" },
};

const BANNER_BG = { accent: "border-accent/40 bg-accent/10", red: "border-red-400/40 bg-red-500/10", amber: "border-amber-300/40 bg-amber-400/10", neutral: "border-white/15 bg-white/[0.05]" };

const ENGINE_LABEL = { server: "ver.engine.server", webcrypto: "ver.engine.webcrypto", noble: "ver.engine.noble" } as const;

const eventStatus = (s: CredentialStatus): OfflineEvent["status"] => (s === "AUTHENTIC" || s === "EXPIRED" || s === "NOT_FOUND" ? s : "INVALID_SIGNATURE");

/** The answer in four plain checks, worked out from the result. null means "cannot be known here". */
function plainChecks(r: VerificationResult): { id: string; ok: boolean | null; note?: string }[] {
  const s = r.status;
  const unknown = s === "INVALID_SIGNATURE" || s === "NOT_FOUND";
  return [
    { id: "genuine", ok: s === "INVALID_SIGNATURE" ? false : s === "NOT_FOUND" ? null : true },
    { id: "notExpired", ok: s === "EXPIRED" ? false : unknown ? null : true },
    {
      id: "notCancelled",
      ok: s === "REVOKED" || s === "SUPERSEDED" ? false : unknown || s === "EXPIRED" || r.mode === "OFFLINE" ? null : true,
      note: r.mode === "OFFLINE" && s === "AUTHENTIC" ? "ver.c.needsInternet" : undefined,
    },
    { id: "allowed", ok: s !== "AUTHENTIC" ? null : r.consent.state === "GRANTED" || r.consent.state === "PRESENTED" ? true : r.consent.state === "NOT_GRANTED" || r.consent.state === "OPTED_OUT" ? false : null },
  ];
}

export default function SmartVerifier() {
  const { t } = useT();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [cached, setCached] = useState<CachedKeys | null>(null);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  // Offline is detected from the network. The switch under Demo tools forces it, for showing the offline check with Wi-Fi on.
  const [forceOffline, setForceOffline] = useState(false);
  const offline = forceOffline || !online;
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
            : { ...baseResult("OFFLINE", "NOT_FOUND", t("ver.offlineNeedsQr")), limitations: [t("ver.switchOnline")] };
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
    [offline, cached, flush, t]
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
    <div className="space-y-6">
      {/* Input and result sit side by side on a wide screen, and one after the other (input, then result) on a phone. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title={t("ver.title")} hint={t("ver.hint")} />

          <div className="space-y-4">
            {offline && <Notice tone="amber">{online ? t("ver.forced") : t("ver.autoOffline")}</Notice>}
            {queued > 0 && <Pill tone="blue">{t(queued === 1 ? "ver.queued1" : "ver.queued", { n: queued })}</Pill>}
            {noKeys && <Notice tone="amber">{t("ver.noKeys")}</Notice>}

            <CameraScanner onDecode={scanned} />

            <Disclosure summary={t("ver.paste")}>
              <label className="block text-sm">
                <span className="mb-1.5 block text-white/75">{t("ver.pasteLabel")}</span>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder={offline ? t("ver.placeholderOffline") : t("ver.placeholder")}
                  className={`${inputClass} font-mono text-xs`}
                />
              </label>
              <div className="mt-3">
                <Button variant="primary" disabled={busy || !input.trim()} onClick={submit}>
                  <Search width={16} height={16} className={ICON} />
                  {t("ver.verify")}
                </Button>
              </div>
            </Disclosure>

            {!offline && verifier && <p className="text-sm text-white/75">{t("ver.as", { name: verifier.name })}</p>}
          </div>
        </Card>

        <Card>
          <SectionTitle title={t("ver.live")} />
          {error && (
            <div className="mb-4">
              <Notice tone="red">{error}</Notice>
            </div>
          )}

          {!result && !error && (
            <div className="grid place-items-center rounded-xl border border-dashed border-white/15 px-6 py-16 text-center">
              <QrCode width={16} height={16} className="mb-4 h-10 w-10 shrink-0 text-white/55" />
              <p className="text-sm text-white/70">{t("ver.nothing")}</p>
            </div>
          )}

          {result && view && (
            <div aria-live="polite">
              <div className={`flex items-center gap-4 rounded-2xl border p-5 ${BANNER_BG[view.tone]}`}>
                <view.Icon width={40} height={40} className={`h-10 w-10 shrink-0 ${view.text}`} strokeWidth={2} />
                <div className="min-w-0">
                  <p className={`text-2xl font-semibold tracking-tight ${view.text}`}>{t(`status.${result.status}`)}</p>
                  <p className="mt-0.5 text-sm text-white/80">{result.detail}</p>
                </div>
              </div>

              {/* four plain checks */}
              <ul className="mt-5 space-y-2">
                {plainChecks(result).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 text-sm">
                    {c.ok === null ? (
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-dashed border-white/40 text-xs text-white/65">–</span>
                    ) : c.ok ? (
                      <CheckCircle2 width={16} height={16} className={`${ICON} h-5 w-5 text-accent-soft`} />
                    ) : (
                      <XCircle width={16} height={16} className={`${ICON} h-5 w-5 text-red-300`} />
                    )}
                    <span className="font-medium">{t(`ver.c.${c.id}`)}</span>
                    {(c.ok === null || c.note) && <span className="text-xs text-white/65">{t(c.note ?? "ver.c.unknown")}</span>}
                  </li>
                ))}
              </ul>

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
                  <div className="mt-3 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/75">
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
                <p className="mt-3 text-sm text-white/75">{t("ver.noIds")}</p>
                {result.consent.state === "GRANTED" && result.consent.expiresAt && (
                  <p className="mt-2 text-xs text-white/65">{t("ver.consentUntil", { date: formatDate(result.consent.expiresAt) })}</p>
                )}
                {result.consent.state === "PRESENTED" && (
                  <p className="mt-2 text-xs text-white/65">{t("ver.presented", { date: result.consent.expiresAt ? formatDate(result.consent.expiresAt) : t("ver.itsExpiry") })}</p>
                )}
              </div>

              {result.limitations.map((l) => (
                <div key={l} className="mt-4">
                  <Notice tone="amber">{l}</Notice>
                </div>
              ))}

              {/* what the engine checked, for anyone who wants to see */}
              <Disclosure summary={t("ver.details")} className="mt-5">
                <div className="flex flex-wrap gap-2">
                  <Pill>{result.mode === "OFFLINE" ? t("ver.mode.offline") : t("ver.mode.online")}</Pill>
                  {result.signatureEngine && <Pill>{t(ENGINE_LABEL[result.signatureEngine])}</Pill>}
                  {result.credentialId && <Pill>{result.credentialId} · v{result.version}</Pill>}
                  {result.expiresAt && <Pill>{t("ver.validUntil", { date: formatDate(result.expiresAt) })}</Pill>}
                  {cached && cached.keys.length > 0 && <Pill>{t("ver.keysOnDevice", { list: cached.keys.map((k) => k.kid).join(", ") })}</Pill>}
                </div>
                <ul className="mt-3 space-y-2">
                  {result.checks.map((c) => (
                    <li key={c.name} className="flex items-start gap-3 text-sm">
                      <span className="mt-0.5">
                        {c.passed === null ? (
                          <span className="grid h-4 w-4 place-items-center rounded-full border border-dashed border-white/40 text-xs text-white/65">–</span>
                        ) : c.passed ? (
                          <CheckCircle2 width={16} height={16} className={`${ICON} text-accent-soft`} />
                        ) : (
                          <XCircle width={16} height={16} className={`${ICON} text-red-300`} />
                        )}
                      </span>
                      <span>
                        <span className="font-medium">{c.name}</span>
                        <span className="block text-xs text-white/65">{c.note}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            </div>
          )}
        </Card>
      </div>

      <ConsentPhone verifier={verifier} result={result} disabled={offline} onChanged={() => verify({ qr: lastQr, apaarId: lastQr ? undefined : input.trim() })} />

      {/* Controls for showing the product in a demo. A real employer never needs them. */}
      <Disclosure summary={t("con.demoTools")}>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div>
            <p className="text-sm font-medium">{t("ver.forceOffline")}</p>
            <p className="text-xs text-white/65">{t("ver.forceOfflineHint")}</p>
          </div>
          <Toggle checked={forceOffline} onChange={setForceOffline} label={t("ver.forceOffline")} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy || !(lastQr || input.startsWith("APAARQR1."))} onClick={tamper} title={t("ver.tamperTitle")}>
            {t("ver.tamper")}
          </Button>
          {!offline && <Button size="sm" onClick={() => setInput("9481-2041-6672")}>{t("ver.demoId")}</Button>}
        </div>
        {!offline && <p className="mt-2 text-xs text-white/65">{t("ver.idNote")}</p>}

        <div className="mt-5 border-t border-white/10 pt-4">
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
                      <QrCode width={16} height={16} className={`${ICON} text-accent-soft`} />
                      {s.label}
                    </span>
                    <span className="font-mono text-xs text-white/65">{s.cid}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-white/65">{online ? t("ver.samplesLoading") : t("ver.samplesOffline")}</p>
          )}
        </div>
      </Disclosure>
    </div>
  );
}
