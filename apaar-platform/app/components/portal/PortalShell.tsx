import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { demoMode } from "@/lib/config";
import { translate } from "@/lib/i18n";
import { currentLang } from "@/lib/lang-server";
import { PAGE_ACCESS } from "@/lib/personas";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { I18nProvider, LanguageSwitcher } from "./I18n";
import { ConfigBanner, SessionBar } from "./SessionBar";
import ThemeSwitcher from "./ThemeSwitcher";

const PORTALS = [
  { href: "/admin", key: "nav.admin" },
  { href: "/student", key: "nav.student" },
  { href: "/employer", key: "nav.employer" },
] as const;

/* A calmer cousin of the hero circuit: a few traces and one pulse, behind everything. */
const TRACES = [
  "M0 120 H180 Q210 120 210 150 V260 Q210 290 240 290 H420",
  "M1440 90 H1240 Q1210 90 1210 120 V240 Q1210 270 1180 270 H980",
  "M0 360 H90",
  "M1440 330 H1350",
];

function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 60% 70% at 92% 0%, color-mix(in oklab, var(--accent) 30%, transparent), transparent 70%)",
            "linear-gradient(118deg, transparent 40%, rgba(255,255,255,0.10) 49%, rgba(255,255,255,0.02) 53%, transparent 62%)",
          ].join(","),
        }}
      />
      <svg width={1440} height={560} viewBox="0 0 1440 560" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full text-white">
        <g fill="none" strokeWidth={1.5} strokeLinecap="round">
          {TRACES.map((d) => (
            <path key={d} d={d} stroke="currentColor" strokeOpacity={0.08} />
          ))}
          {TRACES.map((d, i) => (
            <path
              key={`p-${d}`}
              d={d}
              pathLength={100}
              stroke="var(--accent)"
              strokeWidth={2.5}
              className="circuit-pulse"
              style={{ animationDelay: `${i * 1.2}s` }}
            />
          ))}
        </g>
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-deep to-transparent" />
    </div>
  );
}

export default async function PortalShell({
  active,
  title,
  subtitle,
  children,
}: {
  active: (typeof PORTALS)[number]["href"];
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const lang = await currentLang();
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  // A person only sees the portals their role can open.
  const portals = session ? PORTALS.filter((p) => PAGE_ACCESS[p.href].includes(session.role)) : PORTALS;
  return (
    <I18nProvider lang={lang}>
    <div className="min-h-screen p-3 sm:p-5">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[28px] bg-deep text-white">
        <Backdrop />

        <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] py-1.5 pl-1.5 pr-4 backdrop-blur-xl">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-ink text-white">
              <ShieldCheck width={16} height={16} className="h-4 w-4 shrink-0" />
            </span>
            <span className="text-[17px] font-semibold tracking-tight">APAAR Bridge</span>
          </Link>

          <nav aria-label={translate(lang, "nav.portals")} className="order-3 flex w-full gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.06] p-1.5 backdrop-blur-xl sm:order-none sm:w-auto">
            {portals.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                aria-current={p.href === active ? "page" : undefined}
                className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition ${
                  p.href === active ? "bg-paper text-deep" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {translate(lang, p.key)}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-1.5 backdrop-blur-xl">
            <LanguageSwitcher />
            <ThemeSwitcher variant="dark" />
          </div>
        </header>

        {session && (
          <div className="relative z-10 px-4 pt-4 sm:px-8">
            <SessionBar name={session.name} roleLabel={translate(lang, `role.${session.role}`)} canReset={demoMode() && (session.role === "REGISTRAR" || session.role === "AICTE")} />
          </div>
        )}
        <ConfigBanner />

        <div className="relative z-10 px-4 pb-16 pt-12 sm:px-8">
          <div className="mb-10 max-w-3xl">
            <h1 className="text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.02] tracking-[-0.04em]">{title}</h1>
            <p className="mt-4 text-base text-white/65 sm:text-lg">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
    </I18nProvider>
  );
}
