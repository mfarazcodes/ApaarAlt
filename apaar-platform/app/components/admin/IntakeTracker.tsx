"use client";

import { useEffect, useState } from "react";
import type { AICTEIntakeCompliance } from "@/lib/nadSyncEngine";
import { api, errorText } from "../portal/api";
import { useT } from "../portal/I18n";
import { Card, Notice, Pill, ProgressBar, SectionTitle } from "../portal/ui";

export default function IntakeTracker({ refreshKey }: { refreshKey: number }) {
  const { t } = useT();
  const [c, setC] = useState<AICTEIntakeCompliance | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ compliance: AICTEIntakeCompliance }>("/api/sync/aicte-nad")
      .then((r) => setC(r.compliance))
      .catch((e) => setError(errorText(e)));
  }, [refreshKey]);

  const bars = c
    ? [
        { label: t("con.in.approved"), value: c.approvedIntake },
        { label: t("con.in.enrolled"), value: c.totalErpEnrolled },
        { label: t("con.in.verified"), value: c.verifiedEnrolment },
        { label: t("con.in.seeded"), value: c.abcSeededCount },
      ]
    : [];

  return (
    <Card>
      <SectionTitle title={t("con.in.title")} hint={c ? `${c.institutionName} · ${c.academicYear}` : undefined} />
      {error && <Notice tone="red">{error}</Notice>}

      {c && (
        <>
          <ul className="space-y-4">
            {bars.map((b) => (
              <li key={b.label}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-white/80">{b.label}</span>
                  <span className="font-semibold tabular-nums">{b.value.toLocaleString("en-IN")}</span>
                </div>
                <ProgressBar value={b.value} max={Math.max(c.approvedIntake, b.value)} label={b.label} />
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone={c.complianceStatus === "HEALTHY_OPTIMAL" ? "accent" : "red"}>{c.enrolmentPercentage === null ? t("con.in.noIntake") : t("con.in.pctVerified", { n: c.enrolmentPercentage })}</Pill>
            <Pill tone="blue">{c.abcSeedingPercentage === null ? "-" : t("con.in.pctSeeded", { n: c.abcSeedingPercentage })}</Pill>
            <Pill tone={c.unverifiedGhostCount ? "amber" : "accent"}>{t("con.in.unverified", { n: c.unverifiedGhostCount })}</Pill>
          </div>
          <div className="mt-4">
            <Notice tone={c.complianceStatus === "HEALTHY_OPTIMAL" ? "accent" : c.complianceStatus === "OVER_INTAKE_PENALTY_RISK" ? "red" : "amber"}>{c.aicteNotice}</Notice>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[440px] text-left text-sm">
              <caption className="mb-2 text-left text-xs uppercase tracking-wider text-white/65">{t("con.in.byProgramme")}</caption>
              <thead className="text-xs uppercase tracking-wider text-white/65">
                <tr>
                  <th scope="col" className="pb-2 pr-3 font-semibold">{t("con.in.col.programme")}</th>
                  <th scope="col" className="pb-2 pr-3 text-right font-semibold">{t("con.in.col.approved")}</th>
                  <th scope="col" className="pb-2 pr-3 text-right font-semibold">{t("con.in.col.enrolled")}</th>
                  <th scope="col" className="pb-2 text-right font-semibold">{t("con.in.col.verified")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {c.programmes.map((p) => (
                  <tr key={p.programme}>
                    <td className="py-2 pr-3">{p.programme}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.approvedIntake}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {p.erpEnrolled}
                      {p.status === "OVER_INTAKE_PENALTY_RISK" && <Pill tone="red" className="ml-2">{t("con.in.over", { n: p.overBy })}</Pill>}
                      {p.status === "NO_APPROVED_INTAKE" && <Pill tone="amber" className="ml-2">{t("con.in.noIntake")}</Pill>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{p.verified}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
