"use client";

import { useEffect, useState } from "react";
import type { AICTEIntakeCompliance } from "@/lib/nadSyncEngine";
import { api, errorText } from "../portal/api";
import { Card, Notice, Pill, ProgressBar, SectionTitle } from "../portal/ui";

// Programme split at the start of the year. It adds up to the institution totals below.
const PROGRAMMES = [
  { name: "Computer Science", approved: 360, enrolled: 362, verified: 354 },
  { name: "Electronics & Comm.", approved: 240, enrolled: 236, verified: 228 },
  { name: "Mechanical", approved: 240, enrolled: 231, verified: 221 },
  { name: "Civil", approved: 180, enrolled: 176, verified: 173 },
  { name: "Electrical", approved: 180, enrolled: 175, verified: 172 },
];

export default function IntakeTracker({ refreshKey }: { refreshKey: number }) {
  const [c, setC] = useState<AICTEIntakeCompliance | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ compliance: AICTEIntakeCompliance }>("/api/sync/aicte-nad")
      .then((r) => setC(r.compliance))
      .catch((e) => setError(errorText(e)));
  }, [refreshKey]);

  const bars = c
    ? [
        { label: "AICTE approved intake (EoA)", value: c.approvedIntake, tone: "accent" as const },
        { label: "ERP enrolled", value: c.totalErpEnrolled, tone: "accent" as const },
        { label: "Verified with APAAR / ABC", value: c.verifiedEnrolment, tone: "accent" as const },
        { label: "ABC credits seeded", value: c.abcSeededCount, tone: "accent" as const },
      ]
    : [];

  return (
    <Card>
      <SectionTitle eyebrow="EoA tracker" title="Approved intake vs actual admission" hint={c ? `${c.institutionName} · ${c.academicYear}` : undefined} />
      {error && <Notice tone="red">{error}</Notice>}

      {c && (
        <>
          <ul className="space-y-4">
            {bars.map((b) => (
              <li key={b.label}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-white/75">{b.label}</span>
                  <span className="font-semibold tabular-nums">{b.value.toLocaleString("en-IN")}</span>
                </div>
                <ProgressBar value={b.value} max={Math.max(c.approvedIntake, b.value)} tone={b.tone} label={b.label} />
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone={c.complianceStatus === "HEALTHY_OPTIMAL" ? "accent" : "red"}>{c.enrolmentPercentage}% of intake verified</Pill>
            <Pill tone="blue">{c.abcSeedingPercentage}% ABC seeded</Pill>
            <Pill tone={c.unverifiedGhostCount ? "amber" : "accent"}>{c.unverifiedGhostCount} unverified in ERP</Pill>
          </div>
          <div className="mt-4">
            <Notice tone={c.complianceStatus === "HEALTHY_OPTIMAL" ? "accent" : "amber"}>{c.aicteNotice}</Notice>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[440px] text-left text-sm">
              <caption className="mb-2 text-left text-xs uppercase tracking-wider text-white/55">By programme (start of year, sample)</caption>
              <thead className="text-xs uppercase tracking-wider text-white/55">
                <tr>
                  <th scope="col" className="pb-2 pr-3 font-semibold">Programme</th>
                  <th scope="col" className="pb-2 pr-3 text-right font-semibold">Approved</th>
                  <th scope="col" className="pb-2 pr-3 text-right font-semibold">Enrolled</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {PROGRAMMES.map((p) => (
                  <tr key={p.name}>
                    <td className="py-2 pr-3">{p.name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.approved}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {p.enrolled}
                      {p.enrolled > p.approved && <Pill tone="red" className="ml-2">Over intake</Pill>}
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
