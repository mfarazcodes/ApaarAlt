import ConsentWallet from "../components/student/ConsentWallet";
import DigitalTwinTimeline from "../components/student/DigitalTwinTimeline";
import NepForecaster from "../components/student/NepForecaster";
import SkillGapMap from "../components/student/SkillGapMap";
import PortalShell from "../components/portal/PortalShell";

export default function StudentPage() {
  return (
    <PortalShell
      active="/student"
      title="Your academic digital twin"
      subtitle="One living record of subjects, credits, internships and certificates, with a forecast for what to take next and a wallet that keeps you in control of who sees it."
    >
      <div className="space-y-6">
        <DigitalTwinTimeline />
        <NepForecaster />
        <SkillGapMap />
        <ConsentWallet />
      </div>
    </PortalShell>
  );
}
