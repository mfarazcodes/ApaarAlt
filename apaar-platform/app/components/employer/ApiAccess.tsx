"use client";

import { useEffect, useState } from "react";
import { Code2 } from "lucide-react";
import { api, errorText } from "../portal/api";
import { Card, ICON, Notice, SectionTitle } from "../portal/ui";

interface Access {
  apiKey: string;
  limits: { maxItemsPerCall: number; callsPerMinute: number };
  docs: string;
}

/** For developers: the caller's key, the limits, and a ready-to-run example. */
export default function ApiAccess() {
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("https://your-deployment");

  useEffect(() => {
    const first = setTimeout(() => {
      setOrigin(window.location.origin);
      api<Access>("/api/verify/bulk")
        .then(setAccess)
        .catch((e) => setError(errorText(e)));
    }, 0);
    return () => clearTimeout(first);
  }, []);

  const example = access
    ? `curl -X POST ${origin}/api/verify/bulk \\\n  -H "x-api-key: ${access.apiKey}" \\\n  -H "content-type: application/json" \\\n  -d '{"items":[{"qr":"APAARQR1...."}]}'`
    : "";

  return (
    <Card>
      <SectionTitle
        eyebrow="For developers"
        title="Bulk verification API"
        hint={access ? `Up to ${access.limits.maxItemsPerCall} credentials per call, ${access.limits.callsPerMinute} calls a minute. Consent still applies to every student.` : "Verify many credentials in one call."}
      />
      {error && <Notice tone="red">{error}</Notice>}
      {access && (
        <>
          <p className="flex items-center gap-2 text-xs text-white/60">
            <Code2 width={16} height={16} className={ICON} />
            Your API key (keep it private):
          </p>
          <code className="mt-1 block overflow-x-auto rounded-lg bg-white/[0.06] px-3 py-2 font-mono text-xs text-white/85">{access.apiKey}</code>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-white/[0.06] p-3 text-xs leading-relaxed text-white/80">{example}</pre>
          <p className="mt-3 text-xs text-white/55">
            Full description: <a href={access.docs} className="underline underline-offset-4 hover:text-white">OpenAPI document</a>. This demo key is derived from a server secret and cannot be rotated on its own.
          </p>
        </>
      )}
    </Card>
  );
}
