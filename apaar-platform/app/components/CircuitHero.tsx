"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import AudienceCards from "./AudienceCards";
import { useT } from "./portal/I18n";

/* Orthogonal PCB traces, drawn edge → centre so the pulses flow inward
   toward the hero badge and down to the dashboard cards. */
const TRACES = [
  "M0 300 H210 Q240 300 240 330 V430 Q240 460 270 460 H560 Q590 460 590 490 V700",
  "M0 640 H300 Q330 640 330 670 V780 Q330 810 360 810 H520",
  "M0 470 H120",
  "M1440 300 H1230 Q1200 300 1200 330 V430 Q1200 460 1170 460 H880 Q850 460 850 490 V700",
  "M1440 640 H1140 Q1110 640 1110 670 V780 Q1110 810 1080 810 H920",
  "M1440 470 H1320",
  "M300 0 V120 Q300 150 330 150 H600 Q630 150 630 180",
  "M1140 0 V120 Q1140 150 1110 150 H840 Q810 150 810 180",
  "M60 0 V160 Q60 190 90 190 H150",
  "M1380 0 V160 Q1380 190 1350 190 H1290",
];

const NODES = [
  { x: 232, y: 214, g: "ID" },
  { x: 1208, y: 214, g: "ID" },
  { x: 120, y: 300, g: "NAD" },
  { x: 1320, y: 300, g: "ABC" },
  { x: 160, y: 830, g: "QR" },
  { x: 1280, y: 830, g: "✓" },
];

function CircuitBackground() {
  return (
    <svg
      aria-hidden="true"
      width={1440}
      height={1000}
      viewBox="0 0 1440 1000"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full text-deep"
    >
      <g fill="none" strokeWidth={1.5} strokeLinecap="round">
        {TRACES.map((d) => (
          <path key={`t-${d}`} d={d} stroke="currentColor" strokeOpacity={0.12} />
        ))}
        {TRACES.map((d, i) => (
          <path
            key={`p-${d}`}
            d={d}
            pathLength={100}
            stroke="var(--accent)"
            strokeWidth={2.5}
            className="circuit-pulse"
            style={{ animationDelay: `${(i * 0.9) % 5}s` }}
          />
        ))}
      </g>
      {NODES.map((n) => (
        <g key={`${n.x}-${n.y}`} transform={`translate(${n.x} ${n.y})`}>
          <rect
            x={-36}
            y={-20}
            width={72}
            height={40}
            rx={10}
            fill="var(--paper)"
            stroke="currentColor"
            strokeOpacity={0.14}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={13}
            fill="currentColor"
            fillOpacity={0.4}
            fontFamily="inherit"
          >
            {n.g}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function CircuitHero() {
  const { t } = useT();
  return (
    <section className="relative">
      {/* Background clips to the rounded frame; the cards below intentionally overflow it. */}
      <div className="absolute inset-0 overflow-hidden rounded-t-[28px] bg-paper">
        <CircuitBackground />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-paper to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-0 pt-32 text-center sm:px-6 sm:pt-36">
        <div className="mx-auto inline-flex max-w-full items-center gap-2.5 rounded-full border border-deep/10 bg-white/70 px-4 py-2 text-[13px] font-medium text-deep/80 shadow-sm backdrop-blur">
          <span className="relative grid h-3 w-3 shrink-0 place-items-center">
            <span className="node-ping absolute inset-0 rounded-full bg-accent" />
            <span className="relative h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
          </span>
          <span className="truncate">{t("land.badge")}</span>
        </div>

        <h1 className="mx-auto mt-8 max-w-[1100px] text-[clamp(2.2rem,5.6vw,4.2rem)] font-normal leading-[1.02] tracking-[-0.04em] text-deep">
          {t("land.h1.a")} <span className="text-deep/55">{t("land.h1.b")}</span>
        </h1>

        <p className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-relaxed text-deep/65 sm:text-lg">{t("land.sub")}</p>

        <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link
            href="/login"
            className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-accent-ink to-[color-mix(in_oklab,var(--accent-ink)_75%,black)] px-6 py-4 text-base font-semibold text-white shadow-[0_10px_30px_-10px_var(--accent-ink),inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:brightness-110"
          >
            {t("land.cta")}
            <ArrowRight width={16} height={16} className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center rounded-xl border border-deep/20 bg-white/70 px-6 py-4 text-base font-semibold text-deep backdrop-blur transition hover:border-deep/40 hover:bg-white"
          >
            {t("land.cta2")}
          </a>
        </div>
        <p className="mt-4 text-sm text-deep/60">{t("land.cta.hint")}</p>
      </div>

      {/* Cards straddle the hero's bottom edge, as in the template. */}
      <div className="relative z-20 mx-auto mt-14 max-w-6xl px-4 pb-10 sm:px-6 lg:-mb-28 lg:pb-0">
        <AudienceCards />
      </div>
    </section>
  );
}
