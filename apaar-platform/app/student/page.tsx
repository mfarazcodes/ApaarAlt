import PortalShell from "../components/portal/PortalShell";
import { Notice } from "../components/portal/ui";
import StudentHub from "../components/student/StudentHub";
import { demoMode } from "@/lib/config";
import { translate } from "@/lib/i18n";
import { currentLang } from "@/lib/lang-server";
import { currentSession } from "@/lib/session-server";
import { profileFor, twinFor } from "@/lib/studentData";

export default async function StudentPage() {
  const lang = await currentLang();
  const session = await currentSession();
  const isGuardian = session?.role === "GUARDIAN";
  // Students with an academic record get the record and plan tabs. The guardian sees the sharing side only.
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
        {!hasTwin && !isGuardian && <Notice tone="blue">{translate(lang, "student.noRecord")}</Notice>}
        {/* The story line is demo narration, so only a demo deployment shows it. */}
        <StudentHub studentId={studentId} hasTwin={hasTwin} demoNote={demoMode() && profile ? `${profile.label} · ${profile.roll} · ${profile.story}` : undefined} />
      </div>
    </PortalShell>
  );
}
