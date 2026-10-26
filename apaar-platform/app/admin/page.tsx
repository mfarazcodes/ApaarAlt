import AdminTabs from "../components/admin/AdminTabs";
import PortalShell from "../components/portal/PortalShell";

export default function AdminPage() {
  return (
    <PortalShell
      active="/admin"
      title="College and AICTE console"
      subtitle="Turn messy ERP exports into clean NAD records, resolve identity mismatches, and give AICTE a national view with the reasons behind every flag."
    >
      <AdminTabs />
    </PortalShell>
  );
}
