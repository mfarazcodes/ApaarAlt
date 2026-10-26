import Link from "next/link";
import PortalShell from "../components/portal/PortalShell";
import OfflineSupport from "../components/employer/OfflineSupport";
import { translate } from "@/lib/i18n";
import { currentLang } from "@/lib/lang-server";
import SmartVerifier from "../components/employer/SmartVerifier";

export default async function EmployerPage() {
  const lang = await currentLang();
  return (
    <PortalShell active="/employer" title={translate(lang, "employer.title")} subtitle={translate(lang, "employer.subtitle")}>
      <OfflineSupport />
      <SmartVerifier />
      <p className="mt-8 text-sm text-white/65">
        <Link href="/employer/developers" className="underline underline-offset-4 hover:text-white">
          {translate(lang, "dev.link")}
        </Link>
      </p>
    </PortalShell>
  );
}
