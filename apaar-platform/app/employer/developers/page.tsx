import Link from "next/link";
import ApiAccess from "../../components/employer/ApiAccess";
import PortalShell from "../../components/portal/PortalShell";
import { translate } from "@/lib/i18n";
import { currentLang } from "@/lib/lang-server";

// Same role gate as /employer: the proxy matches every path under it.
export default async function DevelopersPage() {
  const lang = await currentLang();
  return (
    <PortalShell active="/employer" title={translate(lang, "dev.title")} subtitle={translate(lang, "dev.subtitle")}>
      <ApiAccess />
      <p className="mt-8 text-sm text-white/65">
        <Link href="/employer" className="underline underline-offset-4 hover:text-white">
          {translate(lang, "dev.back")}
        </Link>
      </p>
    </PortalShell>
  );
}
