import AdminTabs from "../components/admin/AdminTabs";
import PortalShell from "../components/portal/PortalShell";
import { currentSession } from "@/lib/session-server";

export default async function AdminPage() {
  const session = await currentSession();
  const isRegistrar = session?.role === "REGISTRAR";

  return (
    <PortalShell
      active="/admin"
      title={isRegistrar ? "College and AICTE console" : "AICTE national command center"}
      subtitle={
        isRegistrar
          ? "Turn messy ERP exports into clean NAD records, resolve identity mismatches, and give AICTE a national view with the reasons behind every flag."
          : "A national view of compliance, flagged cases and the audit trail, with the reasons behind every flag."
      }
    >
      <AdminTabs canUseCollegeConsole={isRegistrar} />
    </PortalShell>
  );
}
