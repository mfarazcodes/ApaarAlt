import ConsentWallet from "../components/student/ConsentWallet";
import DigitalTwinTimeline from "../components/student/DigitalTwinTimeline";
import NepForecaster from "../components/student/NepForecaster";
import SkillGapMap from "../components/student/SkillGapMap";
import SmartQrCreator from "../components/student/SmartQrCreator";
import PortalShell from "../components/portal/PortalShell";
import { Notice } from "../components/portal/ui";
import { currentSession } from "@/lib/session-server";
import { profileFor, twinFor } from "@/lib/studentData";

export default async function StudentPage() {
  const session = await currentSession();
  const isGuardian = session?.role === "GUARDIAN";
  // Students with an academic record get the twin. The guardian sees the consent side only.
  const studentId = session?.studentId ?? "";
  const hasTwin = !isGuardian && twinFor(studentId) !== null;
  const profile = profileFor(studentId);

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
            {profile && <p className="text-sm text-white/65">{profile.label} · {profile.roll} · {profile.story}</p>}
            <DigitalTwinTimeline studentId={studentId} />
            <NepForecaster studentId={studentId} />
            <SkillGapMap studentId={studentId} />
          </>
        ) : (
          !isGuardian && <Notice tone="blue">This sample student has no academic record yet, so only the consent wallet is shown.</Notice>
        )}
        {hasTwin && <SmartQrCreator />}
        <ConsentWallet />
      </div>
    </PortalShell>
  );
}
