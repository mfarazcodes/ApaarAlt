import PortalShell from "../components/portal/PortalShell";
import OfflineSupport from "../components/employer/OfflineSupport";
import { translate } from "@/lib/i18n";
import { currentLang } from "@/lib/lang-server";
import ApiAccess from "../components/employer/ApiAccess";
import SmartVerifier from "../components/employer/SmartVerifier";

export default async function EmployerPage() {
  const lang = await currentLang();
  return (
    <PortalShell
      active="/employer"
      title={translate(lang, "employer.title")}
      subtitle={translate(lang, "employer.subtitle")}
    >
      <OfflineSupport />
      <SmartVerifier />
      <div className="mt-6">
        <ApiAccess />
      </div>
    </PortalShell>
  );
}
