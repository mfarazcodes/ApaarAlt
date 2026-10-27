"use client";

import { useT } from "../portal/I18n";
import { Eyebrow } from "../portal/ui";
import { useConsoleStats } from "./ConsoleStats";

const ITEMS = [
  { key: "rows", label: "con.today.rows" },
  { key: "names", label: "con.today.names" },
  { key: "disputes", label: "con.today.disputes" },
  { key: "batches", label: "con.today.batches" },
] as const;

/** What needs the registrar's attention right now. A dash means that card has not loaded yet, or has nothing to report. */
export default function TodayStrip() {
  const { t } = useT();
  const stats = useConsoleStats();
  return (
    <section aria-label={t("con.today.title")}>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ITEMS.map(({ key, label }) => {
          const n = stats[key];
          return (
            <div key={key} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <dt>
                <Eyebrow>{t(label)}</Eyebrow>
              </dt>
              <dd className={`mt-1 text-2xl font-semibold tabular-nums ${n ? "text-amber-300" : ""}`}>{n === undefined ? "–" : n}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
