import PortalShell from "../components/portal/PortalShell";
import OfflineSupport from "../components/employer/OfflineSupport";
import ApiAccess from "../components/employer/ApiAccess";
import SmartVerifier from "../components/employer/SmartVerifier";

export default function EmployerPage() {
  return (
    <PortalShell
      active="/employer"
      title="Verify a degree without seeing a marksheet"
      subtitle="Scan a Smart QR or look up an APAAR ID. You get live status and the yes-or-no claims the student allowed, with every ID number redacted."
    >
      <OfflineSupport />
      <SmartVerifier />
      <div className="mt-6">
        <ApiAccess />
      </div>
    </PortalShell>
  );
}
