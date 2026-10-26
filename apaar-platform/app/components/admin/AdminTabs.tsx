"use client";

import { useState } from "react";
import { Tabs } from "../portal/ui";
import AuditTrail from "./AuditTrail";
import CollisionDetector from "./CollisionDetector";
import EarlyWarning from "./EarlyWarning";
import FuzzyQueue from "./FuzzyQueue";
import IncidentClock from "./IncidentClock";
import IntakeTracker from "./IntakeTracker";
import Leaderboard from "./Leaderboard";
import MarksheetUploader from "./MarksheetUploader";
import RetryQueue from "./RetryQueue";

type Mode = "erp" | "aicte";

const TABS: { id: Mode; label: string; badge?: string }[] = [
  { id: "erp", label: "College ERP Console" },
  { id: "aicte", label: "AICTE National Command Center" },
];

export default function AdminTabs({ canUseCollegeConsole }: { canUseCollegeConsole: boolean }) {
  // An AICTE officer has no college console, so they start on (and only see) the national view.
  const [mode, setMode] = useState<Mode>(canUseCollegeConsole ? "erp" : "aicte");
  // Bumped after a sync so the intake tracker refetches its totals.
  const [syncVersion, setSyncVersion] = useState(0);

  return (
    <div>
      <div className="mb-6">
        {canUseCollegeConsole ? (
          <Tabs tabs={TABS} value={mode} onChange={setMode} label="Console mode" />
        ) : null}
      </div>

      {mode === "erp" && canUseCollegeConsole ? (
        <div id="panel-erp" role="tabpanel" aria-labelledby="tab-erp" className="space-y-6">
          <MarksheetUploader onSynced={() => setSyncVersion((v) => v + 1)} />
          <div className="grid gap-6 xl:grid-cols-2">
            <FuzzyQueue />
            <div className="space-y-6">
              <RetryQueue />
              <IntakeTracker refreshKey={syncVersion} />
            </div>
          </div>
          <EarlyWarning />
        </div>
      ) : (
        <div id="panel-aicte" role="tabpanel" aria-labelledby="tab-aicte" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Leaderboard />
            <CollisionDetector />
          </div>
          <AuditTrail />
          <IncidentClock />
        </div>
      )}
    </div>
  );
}
