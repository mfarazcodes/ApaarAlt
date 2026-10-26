import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import LoginPicker from "../components/portal/LoginPicker";
import { demoMode } from "@/lib/config";
import { translate } from "@/lib/i18n";
import { currentLang } from "@/lib/lang-server";
import { I18nProvider, LanguageSwitcher } from "../components/portal/I18n";
import { PAGE_ACCESS, PERSONAS } from "@/lib/personas";

export const metadata = { title: "Sign in — APAAR Bridge" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string }> }) {
  const { next, denied } = await searchParams;
  const lang = await currentLang();
  const safeNext = next && next in PAGE_ACCESS ? next : undefined;
  const deniedPage = denied && denied in PAGE_ACCESS ? denied : undefined;

  return (
    <I18nProvider lang={lang}>
    <div className="min-h-screen p-3 sm:p-5">
      <a href="#main-content" className="sr-only rounded-xl bg-paper px-4 py-2 text-sm font-semibold text-deep focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]">{translate(lang, "a11y.skip")}</a>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-4xl outline-none rounded-[28px] bg-deep px-4 py-10 text-white sm:px-10 sm:py-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] py-1.5 pl-1.5 pr-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-ink text-white">
            <ShieldCheck width={16} height={16} className="h-4 w-4 shrink-0" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">APAAR Bridge</span>
        </Link>
        <LanguageSwitcher />
        </div>

        <h1 className="mt-10 text-[clamp(2rem,4.4vw,3.2rem)] leading-[1.02] tracking-[-0.04em]">{translate(lang, "login.title")}</h1>
        <p className="mt-4 max-w-2xl text-base text-white/65">
          {translate(lang, "login.intro")}
        </p>

        {deniedPage && (
          <p role="alert" className="mt-6 rounded-xl bg-amber-400/15 px-4 py-3 text-sm text-amber-200">
            {translate(lang, "login.denied", { page: deniedPage })}
          </p>
        )}

        {demoMode() ? (
          <LoginPicker personas={PERSONAS} next={safeNext} />
        ) : (
          <p className="mt-8 rounded-xl bg-white/[0.06] px-4 py-4 text-sm text-white/75">{translate(lang, "login.off")}</p>
        )}
      </main>
    </div>
    </I18nProvider>
  );
}
