import ConsentWallet from "../components/student/ConsentWallet";
import DigitalTwinTimeline from "../components/student/DigitalTwinTimeline";
import NepForecaster from "../components/student/NepForecaster";
import SkillGapMap from "../components/student/SkillGapMap";
import SmartQrCreator from "../components/student/SmartQrCreator";
import PortalShell from "../components/portal/PortalShell";
import { Notice } from "../components/portal/ui";
import { translate } from "@/lib/i18n";
import { currentLang } from "@/lib/lang-server";
import { currentSession } from "@/lib/session-server";
import { profileFor, twinFor } from "@/lib/studentData";

export default async function StudentPage() {
  const lang = await currentLang();
  const session = await currentSession();
  const isGuardian = session?.role === "GUARDIAN";
  // Students with an academic record get the twin. The guardian sees the consent side only.
  const studentId = session?.studentId ?? "";
  const hasTwin = !isGuardian && twinFor(studentId) !== null;
  const profile = profileFor(studentId);

  return (
    <PortalShell
      active="/student"
      title={translate(lang, isGuardian ? "student.guardianTitle" : "student.title")}
      subtitle={translate(lang, isGuardian ? "student.guardianSubtitle" : "student.subtitle")}
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
          !isGuardian && <Notice tone="blue">{translate(lang, "student.noRecord")}</Notice>
        )}
        {hasTwin && <SmartQrCreator />}
        <ConsentWallet />
      </div>
    </PortalShell>
  );
}
