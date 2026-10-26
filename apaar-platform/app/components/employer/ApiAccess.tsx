"use client";

import { useEffect, useState } from "react";
import { Code2 } from "lucide-react";
import { api, errorText } from "../portal/api";
import { useT } from "../portal/I18n";
import { Card, ICON, Notice, SectionTitle } from "../portal/ui";

interface Access {
  apiKey: string;
  limits: { maxItemsPerCall: number; callsPerMinute: number };
  docs: string;
}

/** For developers: the caller's key, the limits, and a ready-to-run example. */
export default function ApiAccess() {
  const { t } = useT();
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
      <SectionTitle title={t("api.title")} hint={access ? t("api.limits", { n: access.limits.maxItemsPerCall, c: access.limits.callsPerMinute }) : t("api.hintLoading")} />
      {error && <Notice tone="red">{error}</Notice>}
      {access && (
        <>
          <p className="flex items-center gap-2 text-xs text-white/65">
            <Code2 width={16} height={16} className={ICON} />
            {t("api.key")}
          </p>
          <code className="mt-1 block overflow-x-auto rounded-lg bg-white/[0.06] px-3 py-2 font-mono text-xs text-white/85">{access.apiKey}</code>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-white/[0.06] p-3 text-xs leading-relaxed text-white/80">{example}</pre>
          <p className="mt-3 text-xs text-white/65">
            {t("api.docs")} <a href={access.docs} className="underline underline-offset-4 hover:text-white">{t("api.openapi")}</a>. {t("api.note")}
          </p>
        </>
      )}
    </Card>
  );
}
