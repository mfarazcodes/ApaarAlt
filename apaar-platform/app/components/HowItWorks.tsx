"use client";

import Link from "next/link";
import { ArrowRight, Check, GraduationCap, QrCode, School, ShieldAlert } from "lucide-react";
import { portalKey } from "@/lib/i18n";
import { useT } from "./portal/I18n";

const GROUPS = [
  { id: "colleges", href: "/admin", Icon: School },
  { id: "aicte", href: "/admin", Icon: ShieldAlert },
  { id: "students", href: "/student", Icon: GraduationCap },
  { id: "employers", href: "/employer", Icon: QrCode },
] as const;

export default function HowItWorks() {
  const { t } = useT();
  return (
    <section id="how-it-works" className="scroll-mt-24 px-4 pb-20 sm:px-6">
      <div className="mx-auto max-w-6xl text-center">
        <h2 className="mx-auto max-w-3xl text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.04] tracking-[-0.04em] text-white">{t("land.how.title")}</h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-white/65">{t("land.how.sub")}</p>
      </div>

      <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GROUPS.map(({ id, href, Icon }) => (
          <article key={id} className="flex flex-col rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5 text-left text-white">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-ink text-white">
              <Icon width={16} height={16} className="h-5 w-5 shrink-0" />
            </span>
            <h3 className="mt-4 text-xl font-semibold tracking-tight">{t(id === "aicte" ? "portal.aicte" : portalKey(href))}</h3>
            <ul className="mt-3 flex-1 space-y-2.5 text-sm text-white/75">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex items-start gap-2">
                  <Check width={16} height={16} className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" />
                  {t(`land.how.${id}.${n}`)}
                </li>
              ))}
            </ul>
            <Link href={`/login?next=${href}`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent-soft hover:underline">
              {t(`land.how.${id}.open`)}
              <ArrowRight width={16} height={16} className="h-4 w-4 shrink-0" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
