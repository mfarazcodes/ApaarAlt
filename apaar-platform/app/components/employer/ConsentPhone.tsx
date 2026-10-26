"use client";

import { useState } from "react";
import { MessageCircle, Send, Smartphone } from "lucide-react";
import type { Verifier } from "@/lib/consentEngine";
import type { VerificationResult } from "@/lib/credentials";
import { api, errorText } from "../portal/api";
import { Button, Card, ICON, SectionTitle } from "../portal/ui";

type Channel = "SMS" | "WHATSAPP";
interface Bubble {
  from: "system" | "student" | "error";
  text: string;
}

/**
 * A simulated student phone. Every button here calls the same consent API the student wallet uses,
 * so approving or revoking on this phone really changes what the verifier can see.
 */
export default function ConsentPhone({
  verifier,
  result,
  disabled,
  onChanged,
}: {
  verifier?: Verifier;
  result: VerificationResult | null;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [channel, setChannel] = useState<Channel>("SMS");
  const [thread, setThread] = useState<Bubble[]>([]);
  const [requestId, setRequestId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const push = (b: Bubble) => setThread((t) => [...t, b]);
  const pendingId = requestId ?? result?.consent.pendingRequestId;
  const granted = result?.consent.state === "GRANTED";

  async function run(body: Record<string, unknown>, onOk: () => void) {
    setBusy(true);
    try {
      await api("/api/consent", body);
      onOk();
      onChanged();
    } catch (e) {
      push({ from: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function requestConsent() {
    if (!verifier) return;
    setBusy(true);
    try {
      const res = await api<{ request: { requestId: string; messageText: string } }>("/api/consent", { action: "REQUEST_ACCESS", verifierId: verifier.id });
      setRequestId(res.request.requestId);
      push({ from: "system", text: res.request.messageText });
      onChanged();
    } catch (e) {
      push({ from: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  const reply = (approve: boolean) =>
    run({ action: "RESPOND_REQUEST", requestId: pendingId, approve, via: channel }, () => {
      push({ from: "student", text: approve ? "YES" : "NO" });
      push({ from: "system", text: approve ? "Done. Sharing is on for 30 days. Reply STOP any time to end it." : "Okay, nothing was shared." });
      setRequestId(undefined);
    });

  const revoke = () =>
    run({ action: "REVOKE_SHARE", shareId: result?.consent.shareId }, () => {
      push({ from: "student", text: "STOP" });
      push({ from: "system", text: "Sharing ended. The verifier can no longer see your claims." });
    });

  const ready = Boolean(result) && !disabled;
  const canRequest = ready && result?.status === "AUTHENTIC" && result.consent.state === "NOT_GRANTED" && !pendingId;

  return (
    <Card>
      <SectionTitle
        eyebrow="Consent simulator"
        title="Student phone: approve or revoke"
        hint={disabled ? "Offline mode never contacts the student. The QR itself is the consent." : "Ask the student for access, then answer as them."}
      />

      <div className="mx-auto w-full max-w-[300px] rounded-[2rem] border-4 border-white/20 bg-black/35 p-3">
        <div className="flex items-center justify-between px-2 pb-2 text-xs text-white/60">
          <span className="flex items-center gap-1.5"><Smartphone width={16} height={16} className="h-3.5 w-3.5 shrink-0" />Rahul&apos;s phone</span>
          <div role="radiogroup" aria-label="Message channel" className="flex gap-1">
            {(["SMS", "WHATSAPP"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={channel === c}
                onClick={() => setChannel(c)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${channel === c ? "bg-accent text-deep" : "bg-white/10 text-white/70"}`}
              >
                {c === "SMS" ? "SMS" : "WhatsApp"}
              </button>
            ))}
          </div>
        </div>

        <div className="h-56 space-y-2 overflow-y-auto rounded-2xl bg-white/[0.05] p-3" aria-live="polite">
          {thread.length === 0 && (
            <p className="grid h-full place-items-center text-center text-xs text-white/45">
              <span><MessageCircle width={16} height={16} className="mx-auto mb-2 h-5 w-5 shrink-0" />No messages yet</span>
            </p>
          )}
          {thread.map((b, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-snug ${
                b.from === "student"
                  ? "ml-auto bg-accent-ink text-white"
                  : b.from === "error"
                    ? "bg-red-500/20 text-red-200"
                    : "bg-white/10 text-white/85"
              }`}
            >
              {b.text}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {canRequest && (
            <Button size="sm" variant="primary" disabled={busy} onClick={requestConsent}>
              <Send width={16} height={16} className={ICON} />
              Request consent
            </Button>
          )}
          {pendingId && !disabled && (
            <>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => reply(true)}>Reply YES</Button>
              <Button size="sm" disabled={busy} onClick={() => reply(false)}>Reply NO</Button>
            </>
          )}
          {granted && !disabled && (
            <Button size="sm" variant="danger" disabled={busy} onClick={revoke}>Reply STOP (revoke)</Button>
          )}
          {!ready && <p className="px-1 text-xs text-white/50">Verify a credential online first.</p>}
        </div>
      </div>
    </Card>
  );
}
