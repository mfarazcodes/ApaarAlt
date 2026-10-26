import ConsentWallet from "../components/student/ConsentWallet";
import DigitalTwinTimeline from "../components/student/DigitalTwinTimeline";
import NepForecaster from "../components/student/NepForecaster";
import SkillGapMap from "../components/student/SkillGapMap";
import PortalShell from "../components/portal/PortalShell";
import { Notice } from "../components/portal/ui";
import { currentSession } from "@/lib/session-server";

export default async function StudentPage() {
  const session = await currentSession();
  const isGuardian = session?.role === "GUARDIAN";
  // Only the main demo student has twin sample data. The guardian sees the consent side only.
  const hasTwin = !isGuardian && session?.studentId === "STU-RKV";

  return (
    <PortalShell
      active="/student"
      title={isGuardian ? "Guardian consent" : "Your academic digital twin"}
      subtitle={
        isGuardian
          ? "Under the DPDP Act, a child's data can only be shared once a parent or guardian agrees. You can give or withdraw that agreement here."
          : "One living record of subjects, credits, internships and certificates, with a forecast for what to take next and a wallet that keeps you in control of who sees it."
      }
    >
      <div className="space-y-6">
        {hasTwin ? (
          <>
            <DigitalTwinTimeline />
            <NepForecaster />
            <SkillGapMap />
          </>
        ) : (
          !isGuardian && <Notice tone="blue">The academic twin sample data belongs to the main demo student (Rahul). This student has the consent wallet only.</Notice>
        )}
        <ConsentWallet />
      </div>
    </PortalShell>
  );
}
