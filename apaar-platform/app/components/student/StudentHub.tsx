"use client";

import { useSyncExternalStore } from "react";
import { PROGRAM_TOTAL_CREDITS, twinFor, twinTotals } from "@/lib/studentData";
import { useT } from "../portal/I18n";
import { Eyebrow, Tabs } from "../portal/ui";
import ConsentWallet from "./ConsentWallet";
import DigitalTwinTimeline from "./DigitalTwinTimeline";
import { ExitSimulator, GraduationForecast } from "./NepForecaster";
import SkillGapMap from "./SkillGapMap";
import SmartQrCreator from "./SmartQrCreator";
import { WalletProvider, useWallet } from "./WalletContext";

type TabId = "record" | "plan" | "sharing";
const TAB_IDS: TabId[] = ["record", "plan", "sharing"];

// The chosen tab lives in the URL hash, so a refresh or a shared link lands on the same tab.
function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
const readTab = (): TabId => {
  const h = window.location.hash.replace("#", "") as TabId;
  return TAB_IDS.includes(h) ? h : "record";
};

export default function StudentHub({ studentId, hasTwin, demoNote }: { studentId: string; hasTwin: boolean; demoNote?: string }) {
  return (
    <WalletProvider>
      <HubInner studentId={studentId} hasTwin={hasTwin} demoNote={demoNote} />
    </WalletProvider>
  );
}

function HubInner({ studentId, hasTwin, demoNote }: { studentId: string; hasTwin: boolean; demoNote?: string }) {
  const { t } = useT();
  const { data } = useWallet();
  const tab = useSyncExternalStore(subscribe, readTab, () => "record" as TabId);
  const openRequests = data ? data.ledger.requests.filter((r) => r.status === "PENDING").length : 0;

  // Someone with no academic record (or a guardian) only has the sharing and privacy side.
  if (!hasTwin) {
    return (
      <div className="space-y-6">
        <ConsentWallet />
      </div>
    );
  }

  const totals = twinTotals(twinFor(studentId) ?? []);
  const tabs = [
    { id: "record" as const, label: t("student.tab.record") },
    { id: "plan" as const, label: t("student.tab.plan") },
    { id: "sharing" as const, label: t("student.tab.sharing"), badge: openRequests > 0 ? String(openRequests) : undefined },
  ];

  return (
    <div className="space-y-6">
      {demoNote && <p className="text-sm text-white/65">{t("student.demoNote", { story: demoNote })}</p>}

      <dl className="grid grid-cols-3 gap-3">
        <Summary label={t("student.sum.credits")} value={`${totals.creditsEarned}/${PROGRAM_TOTAL_CREDITS}`} />
        <Summary label={t("student.sum.cgpa")} value={totals.cgpa.toFixed(2)} />
        <Summary label={t("student.sum.requests")} value={String(openRequests)} highlight={openRequests > 0} />
      </dl>

      <Tabs
        tabs={tabs}
        value={tab}
        label={t("student.tabs.label")}
        onChange={(id) => {
          window.location.hash = id;
        }}
      />

      {/* Every panel stays mounted (hidden when not chosen), so a slider or a draft is not lost when switching tabs. */}
      <div id="panel-record" role="tabpanel" aria-labelledby="tab-record" hidden={tab !== "record"} className="space-y-6">
        <DigitalTwinTimeline studentId={studentId} />
        <GraduationForecast studentId={studentId} />
      </div>
      <div id="panel-plan" role="tabpanel" aria-labelledby="tab-plan" hidden={tab !== "plan"} className="space-y-6">
        <ExitSimulator studentId={studentId} />
        <SkillGapMap studentId={studentId} />
      </div>
      <div id="panel-sharing" role="tabpanel" aria-labelledby="tab-sharing" hidden={tab !== "sharing"} className="space-y-6">
        <SmartQrCreator />
        <ConsentWallet />
      </div>
    </div>
  );
}

function Summary({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <dt>
        <Eyebrow>{label}</Eyebrow>
      </dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${highlight ? "text-amber-300" : ""}`}>{value}</dd>
    </div>
  );
}
