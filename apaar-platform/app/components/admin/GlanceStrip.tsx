"use client";

import { useT } from "../portal/I18n";
import { Eyebrow } from "../portal/ui";
import { useConsoleStats } from "./ConsoleStats";

const ITEMS = [
  { key: "colleges", label: "con.glance.colleges" },
  { key: "over", label: "con.glance.over" },
  { key: "flags", label: "con.glance.flags" },
  { key: "spikes", label: "con.glance.spikes" },
] as const;

/** The AICTE view at a glance. Each number is reported by the card that owns it. */
export default function GlanceStrip() {
  const { t } = useT();
  const stats = useConsoleStats();
  return (
    <section aria-label={t("con.glance.title")}>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ITEMS.map(({ key, label }) => {
          const n = stats[key];
          return (
            <div key={key} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <dt>
                <Eyebrow>{t(label)}</Eyebrow>
              </dt>
              <dd className={`mt-1 text-2xl font-semibold tabular-nums ${key !== "colleges" && n ? "text-amber-300" : ""}`}>{n === undefined ? "–" : n}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
