"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { portalKey } from "@/lib/i18n";
import { useT } from "./portal/I18n";

const PORTALS = [
  { href: "/admin", key: portalKey("/admin") },
  { href: "/student", key: portalKey("/student") },
  { href: "/employer", key: portalKey("/employer") },
] as const;

const linkClass = "text-white/80 transition hover:text-accent-soft";

export default function Footer() {
  const { t } = useT();
  return (
    <footer className="relative overflow-hidden px-4 pb-10 pt-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-ink text-white shadow-[0_0_40px_-8px_var(--accent)]">
            <ShieldCheck width={16} height={16} className="h-6 w-6 shrink-0" />
          </span>
          <h2 className="mx-auto mt-8 max-w-3xl text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.04] tracking-[-0.04em] text-white">{t("land.footer.title")}</h2>
          <p className="mt-4 text-base text-white/65">{t("land.footer.sub")}</p>
          <div className="mt-8 flex justify-center">
            <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-xl bg-paper px-6 py-4 text-base font-semibold text-deep transition hover:brightness-95">
              {t("land.cta")}
              <ArrowRight width={16} height={16} className="h-4 w-4 shrink-0" />
            </Link>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-10 border-t border-white/10 pt-12 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5 text-white">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-ink">
                <ShieldCheck width={16} height={16} className="h-4 w-4 shrink-0" />
              </span>
              <span className="text-lg font-semibold tracking-tight">APAAR Bridge</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-white/65">{t("land.footer.tag")}</p>
          </div>

          <nav aria-label={t("land.footer.portals")}>
            <p className="text-sm text-white/65">{t("land.footer.portals")}</p>
            <ul className="mt-4 space-y-3 text-[15px]">
              {PORTALS.map((l) => (
                <li key={l.href}>
                  <Link href={`/login?next=${l.href}`} className={linkClass}>
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="text-sm text-white/65">{t("land.footer.built")}</p>
            <ul className="mt-4 space-y-3 text-[15px] text-white/80">
              {["b1", "b2", "b3"].map((k) => (
                <li key={k}>{t(`land.footer.${k}`)}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-10 text-center text-sm text-white/55">{t("land.footer.sample")}</p>
      </div>

      {/* Pure decoration, so it is generated content: not text for assistive tech or contrast checks. */}
      <p
        aria-hidden="true"
        className="pointer-events-none mt-6 select-none text-center text-[clamp(5rem,22vw,18rem)] font-semibold leading-[0.8] tracking-[-0.06em] text-white/[0.04] before:content-['apaar']" />
    </footer>
  );
}
