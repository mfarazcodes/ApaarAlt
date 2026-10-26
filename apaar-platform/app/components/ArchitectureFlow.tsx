"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";

const TABS = [
  {
    id: "erp",
    label: "College ERP",
    href: "/admin",
    summary: "Turn messy legacy exports into NAD-ready records without a single timeout.",
    steps: [
      "Upload CSV or OCR a legacy sheet",
      "AI schema mapper converts Legacy → NAD",
      "Fuzzy match assistant resolves name drift",
      "Offline batch sync with automatic retry",
    ],
  },
  {
    id: "aicte",
    label: "AICTE Admin",
    href: "/admin",
    summary: "Watch intake and enrolment in real time and catch anomalies early.",
    steps: [
      "Approved intake feed per institution",
      "Cross-college duplicate detection",
      "Explainable risk flags with cited fields",
      "Privacy-safe mentoring alerts to faculty",
    ],
  },
  {
    id: "twin",
    label: "Student Twin",
    href: "/student",
    summary: "A living academic record that plans ahead and keeps consent in the student's hands.",
    steps: [
      "Live semester timeline",
      "Credit shortfall forecast",
      "Role readiness and skill-gap map",
      "DPDP Consent Wallet in 22 languages",
    ],
  },
  {
    id: "qr",
    label: "QR Verifier",
    href: "/employer",
    summary: "Verify a degree in seconds, on or off the network, without seeing the marksheet.",
    steps: [
      "Scan the Smart Credential QR",
      "Ed25519 signature check, even with no network",
      "Consent-gated minimal disclosure",
      "Authentic, revoked or superseded result",
    ],
  },
] as const;

export default function ArchitectureFlow() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tab = TABS[active];

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (active + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <section id="architecture" className="scroll-mt-24 px-4 pb-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-md bg-paper px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-deep">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />
            Architecture flow
          </span>
          <h2 className="mx-auto mt-6 max-w-2xl text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.04] tracking-[-0.04em] text-white">
            One pipeline, <span className="text-white/45">four doorways</span>
          </h2>
        </div>

        <div
          role="tablist"
          aria-label="Platform surfaces"
          onKeyDown={onKeyDown}
          className="mx-auto mt-10 grid max-w-2xl grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1 sm:grid-cols-4"
        >
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={active === i}
              aria-controls={`panel-${t.id}`}
              tabIndex={active === i ? 0 : -1}
              onClick={() => setActive(i)}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active === i
                  ? "bg-paper text-deep shadow"
                  : "text-white/60 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          className="mt-6 rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-6 shadow-2xl backdrop-blur-xl sm:p-8"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-lg text-white/80">{tab.summary}</p>
            <Link
              href={tab.href}
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-paper px-5 py-3 text-sm font-semibold text-deep transition hover:brightness-95"
            >
              Open {tab.href}
              <ArrowRight
                width={16}
                height={16}
                className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5"
              />
            </Link>
          </div>

          <ol className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-4">
            {tab.steps.map((step, i) => (
              <li key={step} className="relative">
                <div className="h-full rounded-xl border border-white/10 bg-deep/60 p-4">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                    {i + 1}
                  </span>
                  <p className="mt-3 text-sm leading-snug text-white/85">{step}</p>
                </div>
                {i < tab.steps.length - 1 && (
                  <ChevronRight
                    width={16}
                    height={16}
                    aria-hidden="true"
                    className="absolute -right-[14px] top-1/2 z-10 hidden h-4 w-4 shrink-0 -translate-y-1/2 text-accent md:block"
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
