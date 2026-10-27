"use client";

import { ArrowRight, CheckCircle2, GraduationCap, QrCode, School, ShieldCheck } from "lucide-react";
import { portalKey } from "@/lib/i18n";
import { useT } from "./portal/I18n";

const CARD = "flex flex-col rounded-2xl border border-white/[0.09] bg-deep p-5 text-white shadow-2xl";

function Head({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-ink text-white">{icon}</span>
        {title}
      </h2>
    </div>
  );
}

/** Three still examples, one per audience. Nothing here pretends to be live. */
export default function AudienceCards() {
  const { t } = useT();
  const example = <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70">{t("land.example")}</span>;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <article className={CARD}>
        <Head icon={<School width={16} height={16} className="h-4 w-4 shrink-0" />} title={t(portalKey("/admin"))} />
        <p className="mt-3 text-sm text-white/70">{t("land.card.colleges")}</p>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
          <div className="flex items-center justify-between">{example}</div>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm font-medium">
            <span>Mohd Faraz</span>
            <ArrowRight width={16} height={16} className="h-4 w-4 shrink-0 text-accent-soft" />
            <span>Mohammad Faraz</span>
          </p>
          <p className="mt-2 text-sm text-white/65">{t("land.card.colleges.fix")}</p>
        </div>
      </article>

      <article className={CARD}>
        <Head icon={<GraduationCap width={16} height={16} className="h-4 w-4 shrink-0" />} title={t(portalKey("/student"))} />
        <p className="mt-3 text-sm text-white/70">{t("land.card.students")}</p>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
          <div className="flex items-center justify-between">{example}</div>
          <p className="mt-3 text-sm font-medium">Acme Cloud HR</p>
          <p className="mt-1 text-sm text-white/65">{t("land.card.students.row")}</p>
          <p className="mt-3 inline-block rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80">{t("land.card.students.stop")}</p>
        </div>
      </article>

      <article className={CARD}>
        <Head icon={<QrCode width={16} height={16} className="h-4 w-4 shrink-0" />} title={t(portalKey("/employer"))} />
        <p className="mt-3 text-sm text-white/70">{t("land.card.employers")}</p>
        <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 p-3.5">
          <div className="flex items-center justify-between">{example}</div>
          <p className="mt-3 flex items-center gap-2 text-lg font-semibold text-accent-soft">
            <CheckCircle2 width={16} height={16} className="h-5 w-5 shrink-0" />
            {t("land.card.employers.result")}
          </p>
          <p className="mt-1 flex items-start gap-2 text-sm text-white/70">
            <ShieldCheck width={16} height={16} className="mt-0.5 h-4 w-4 shrink-0" />
            {t("land.card.employers.line")}
          </p>
        </div>
      </article>
    </div>
  );
}
