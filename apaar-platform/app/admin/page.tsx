import AdminTabs from "../components/admin/AdminTabs";
import PortalShell from "../components/portal/PortalShell";
import { translate } from "@/lib/i18n";
import { currentLang } from "@/lib/lang-server";
import { currentSession } from "@/lib/session-server";

export default async function AdminPage() {
  const lang = await currentLang();
  const session = await currentSession();
  const isRegistrar = session?.role === "REGISTRAR";

  return (
    <PortalShell
      active="/admin"
      title={translate(lang, isRegistrar ? "admin.title.registrar" : "admin.title.aicte")}
      subtitle={translate(lang, isRegistrar ? "admin.subtitle.registrar" : "admin.subtitle.aicte")}
    >
      <AdminTabs canUseCollegeConsole={isRegistrar} />
    </PortalShell>
  );
}
