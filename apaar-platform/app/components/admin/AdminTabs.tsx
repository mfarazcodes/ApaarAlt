"use client";

import { useState } from "react";
import { useT } from "../portal/I18n";
import { Disclosure, Tabs } from "../portal/ui";
import AuditTrail from "./AuditTrail";
import CollisionDetector from "./CollisionDetector";
import { ConsoleStatsProvider } from "./ConsoleStats";
import DisputeInbox from "./DisputeInbox";
import EarlyWarning from "./EarlyWarning";
import FuzzyQueue from "./FuzzyQueue";
import IncidentClock from "./IncidentClock";
import IntakeTracker from "./IntakeTracker";
import Leaderboard from "./Leaderboard";
import MarksheetUploader from "./MarksheetUploader";
import RetryQueue from "./RetryQueue";
import SpikeDetector from "./SpikeDetector";
import TodayStrip from "./TodayStrip";
import GlanceStrip from "./GlanceStrip";

type Mode = "erp" | "aicte";

export default function AdminTabs({ canUseCollegeConsole }: { canUseCollegeConsole: boolean }) {
  const { t } = useT();
  // An AICTE officer has no college console, so they start on (and only see) the national view.
  const [mode, setMode] = useState<Mode>(canUseCollegeConsole ? "erp" : "aicte");
  // Bumped after a sync so the intake tracker refetches its totals.
  const [syncVersion, setSyncVersion] = useState(0);
  const tabs = [
    { id: "erp" as const, label: t("con.tab.college") },
    { id: "aicte" as const, label: t("con.tab.aicte") },
  ];

  return (
    <ConsoleStatsProvider>
      <div className="mb-6">{canUseCollegeConsole ? <Tabs tabs={tabs} value={mode} onChange={setMode} label={t("con.tabs.label")} /> : null}</div>

      {mode === "erp" && canUseCollegeConsole ? (
        <div id="panel-erp" role="tabpanel" aria-labelledby="tab-erp" className="space-y-6">
          <TodayStrip />
          {/* In the order a registrar works: upload, names, disputes, then the queue, intake and mentor alerts. */}
          <MarksheetUploader onSynced={() => setSyncVersion((v) => v + 1)} />
          <FuzzyQueue />
          <DisputeInbox />
          <div className="grid gap-6 xl:grid-cols-2">
            <RetryQueue />
            <IntakeTracker refreshKey={syncVersion} />
          </div>
          <EarlyWarning />
        </div>
      ) : (
        <div id="panel-aicte" role="tabpanel" aria-labelledby="tab-aicte" className="space-y-6">
          <GlanceStrip />
          <div className="grid gap-6 xl:grid-cols-2">
            <Leaderboard />
            <CollisionDetector />
          </div>
          <SpikeDetector />
          <AuditTrail />
          <Disclosure summary={t("con.compliance")}>
            <IncidentClock />
          </Disclosure>
        </div>
      )}
    </ConsoleStatsProvider>
  );
}
