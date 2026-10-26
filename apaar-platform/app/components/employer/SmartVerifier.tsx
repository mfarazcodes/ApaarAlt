"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Hourglass,
  KeyRound,
  Lock,
  QrCode,
  RefreshCw,
  Search,
  ShieldX,
  SearchX,
  WifiOff,
  XCircle,
} from "lucide-react";
import type { Verifier } from "@/lib/consentEngine";
import type { CredentialStatus, SampleCredential, VerificationResult } from "@/lib/credentials";
import { api, errorText, formatDate } from "../portal/api";
import { Button, Card, Eyebrow, ICON, Notice, Pill, SectionTitle, Toggle, inputClass } from "../portal/ui";
import ConsentPhone from "./ConsentPhone";

interface Catalog {
  verifiers: Verifier[];
  samples: SampleCredential[];
  issuerPublicKeyPem: string;
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

export default function SmartVerifier() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [verifierId, setVerifierId] = useState("VRF-ACME");
  const [offline, setOffline] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [lastQr, setLastQr] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Catalog>("/api/verify/credential")
      .then(setCatalog)
      .catch((e) => setError(errorText(e)));
  }, []);

  const verify = useCallback(
    async (args: { qr?: string; apaarId?: string; mode?: "ONLINE" | "OFFLINE" }) => {
      setBusy(true);
      setError("");
      try {
        const res = await api<{ result: VerificationResult }>("/api/verify/credential", {
          mode: args.mode ?? (offline ? "OFFLINE" : "ONLINE"),
          qr: args.qr,
          apaarId: args.apaarId,
          verifierId,
        });
        setResult(res.result);
        setLastQr(args.qr);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [offline, verifierId]
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
  const verifier = catalog?.verifiers.find((v) => v.id === verifierId);
  const keyPreview = catalog?.issuerPublicKeyPem.replace(/-----[A-Z ]+-----|\s/g, "").slice(0, 28);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="space-y-6">
        <Card>
          <SectionTitle eyebrow="Smart credential verifier" title="Check a credential" hint="Enter an APAAR ID or scan a Smart QR. Only what the student agreed to share comes back." />

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <WifiOff width={16} height={16} className={ICON} />
                  Offline verification mode
                </p>
                <p className="text-xs text-white/60">Checks the Ed25519 signature on this device. No network, no registry.</p>
              </div>
              <Toggle checked={offline} onChange={setOffline} label="Offline verification mode" />
            </div>

            {!offline && (
              <label className="block text-sm">
                <span className="mb-1.5 block text-white/70">Verifying as</span>
                <select value={verifierId} onChange={(e) => setVerifierId(e.target.value)} className={inputClass}>
                  {catalog?.verifiers.map((v) => (
                    <option key={v.id} value={v.id} className="text-black">{v.name}</option>
                  ))}
                </select>
              </label>
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

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={busy || !input.trim()} onClick={submit}>
                <Search width={16} height={16} className={ICON} />
                Verify
              </Button>
              <Button disabled={busy || !(lastQr || input.startsWith("APAARQR1."))} onClick={tamper} title="Alter the QR to see signature checking catch it">
                Simulate tampered QR
              </Button>
            </div>

            {!offline && <p className="text-xs text-white/55">Demo APAAR ID: 9481-2041-6672. It is tokenized on arrival and never shown back.</p>}
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <Eyebrow>Scan a sample QR</Eyebrow>
            <ul className="mt-3 space-y-2">
              {catalog?.samples.map((s) => (
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
          </div>

          {keyPreview && (
            <p className="mt-5 flex items-center gap-2 text-xs text-white/50">
              <KeyRound width={16} height={16} className={ICON} />
              Issuer public key cached: <span className="font-mono">{keyPreview}…</span>
            </p>
          )}
        </Card>

        <ConsentPhone
          verifier={verifier}
          result={result}
          disabled={offline}
          onChanged={() => verify({ qr: lastQr, apaarId: lastQr ? undefined : input.trim() })}
        />
      </div>

      <Card>
        <SectionTitle eyebrow="Result" title="Live credential status" />
        {error && (
          <div className="mb-4">
            <Notice tone="red">{error}</Notice>
          </div>
        )}

        {!result && !error && (
          <div className="grid place-items-center rounded-xl border border-dashed border-white/15 px-6 py-16 text-center">
            <QrCode width={16} height={16} className="mb-4 h-10 w-10 shrink-0 text-white/35" />
            <p className="text-sm text-white/65">Nothing verified yet. Scan a sample QR to see each status.</p>
          </div>
        )}

        {result && view && (
          <div aria-live="polite">
            <div className={`flex items-center gap-4 rounded-2xl border p-5 ${BANNER_BG[view.tone]}`}>
              <view.Icon width={40} height={40} className={`h-10 w-10 shrink-0 ${view.text}`} strokeWidth={2} />
              <div className="min-w-0">
                <p className={`text-2xl font-semibold tracking-tight ${view.text}`}>{result.headline}</p>
                <p className="mt-0.5 text-sm text-white/75">{result.detail}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>{result.mode === "OFFLINE" ? "Offline check" : "Online check"}</Pill>
              {result.credentialId && <Pill>{result.credentialId} · v{result.version}</Pill>}
              {result.expiresAt && <Pill>Valid until {formatDate(result.expiresAt)}</Pill>}
            </div>

            {/* minimal-disclosure claims */}
            <div className="mt-6">
              <Eyebrow>Consented claims</Eyebrow>
              {result.claims ? (
                <ul className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10">
                  {result.claims.map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span>{c.label}</span>
                      {c.value ? (
                        <Pill tone="accent"><CheckCircle2 width={16} height={16} className="h-3.5 w-3.5 shrink-0" />Yes</Pill>
                      ) : (
                        <Pill tone="neutral">Not met</Pill>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/70">
                  <Lock width={16} height={16} className={`${ICON} mt-0.5`} />
                  <span>
                    {result.consent.state === "OPTED_OUT"
                      ? "The student opted out of APAAR. No claims are released."
                      : result.consent.state === "NOT_GRANTED" && result.status === "AUTHENTIC"
                        ? "Withheld. The student has not allowed this verifier to see any claims."
                        : "Claims are only released for an authentic credential."}
                  </span>
                </div>
              )}
              <dl className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3 text-sm">
                <dt className="text-white/65">Identity number</dt>
                <dd className="font-mono text-xs">{result.identity}</dd>
              </dl>
              {result.consent.state === "GRANTED" && result.consent.expiresAt && (
                <p className="mt-2 text-xs text-white/55">Student consent active until {formatDate(result.consent.expiresAt)}. The student can withdraw it at any time.</p>
              )}
            </div>

            {/* checks */}
            <div className="mt-6">
              <Eyebrow>What was checked</Eyebrow>
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
