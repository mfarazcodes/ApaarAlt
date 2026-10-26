import { Check, FileSpreadsheet, GraduationCap, QrCode, ShieldAlert } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type Feature = {
  n: string;
  title: string;
  blurb: string;
  points: string[];
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  span: string;
};

const FEATURES: Feature[] = [
  {
    n: "01",
    title: "College Dashboard & AI Discrepancy Detector",
    blurb:
      "Drop in whatever your ERP exports. The bridge maps it to NAD before the API ever sees a bad row.",
    points: [
      "Smart CSV / OCR upload",
      "Legacy-to-NAD AI schema mapper",
      "Fuzzy match assistant for name drift",
      "Offline batch sync",
    ],
    Icon: FileSpreadsheet,
    span: "lg:col-span-4",
  },
  {
    n: "02",
    title: "AICTE National Compliance & Early-Warning Sandbox",
    blurb: "Regulators see the whole picture; individual students stay private.",
    points: [
      "Real-time intake vs. enrolment tracker",
      "Cross-college duplicate detection",
      "Explainable AI risk flags",
      "Privacy-safe faculty mentoring alerts",
    ],
    Icon: ShieldAlert,
    span: "lg:col-span-2",
  },
  {
    n: "03",
    title: "Student Academic Digital Twin & Skill-to-Curriculum Gap Map",
    blurb: "A living record that tells each student what to take next, and who may see it.",
    points: [
      "Live semester timeline",
      "Credit shortfall forecaster",
      "roadmap.sh-style role readiness mapper",
      "22-language DPDP Consent Wallet with NOGEN opt-out protection",
    ],
    Icon: GraduationCap,
    span: "lg:col-span-2",
  },
  {
    n: "04",
    title: "Verifier API & Offline Smart QR Gateway",
    blurb:
      "Employers get a yes or no, not a marksheet. Checks keep working when the network doesn't.",
    points: [
      "Consent-gated minimal disclosure — Verified without exposing full marksheets",
      "Offline cryptographic signature verification",
    ],
    Icon: QrCode,
    span: "lg:col-span-4",
  },
];

export default function SatinFeaturePanel() {
  return (
    <section id="features" className="scroll-mt-24 px-4 pb-24 sm:px-6">
      <div
        className="relative mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-white/10 px-4 py-16 sm:px-10 sm:py-20"
        style={{
          background: [
            "radial-gradient(ellipse 70% 60% at 90% 0%, color-mix(in oklab, var(--accent) 38%, transparent), transparent 70%)",
            "linear-gradient(118deg, transparent 38%, rgba(255,255,255,0.16) 48%, rgba(255,255,255,0.03) 52%, transparent 62%)",
            "linear-gradient(165deg, var(--deep) 0%, color-mix(in oklab, var(--accent) 16%, var(--deep)) 100%)",
          ].join(","),
        }}
      >
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-md bg-paper px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-deep">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />
            Inside the platform
          </span>
          <h2 className="mx-auto mt-6 max-w-3xl text-[clamp(2rem,4.6vw,3.6rem)] leading-[1.02] tracking-[-0.04em] text-white">
            Four modules, <span className="text-white/55">one verified</span> bridge
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/60">
            Colleges, regulators, students and employers each get a surface built for their job,
            all reading from the same record.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-6">
          {FEATURES.map(({ n, title, blurb, points, Icon, span }) => (
            <article
              key={n}
              className={`group rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-6 shadow-2xl backdrop-blur-xl transition hover:border-accent/40 sm:p-7 ${span}`}
            >
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent-soft">
                  <Icon width={16} height={16} className="h-4 w-4 shrink-0" />
                </span>
                <span className="font-mono text-xs text-white/50">{n}</span>
              </div>
              <h3 className="mt-6 text-xl font-semibold leading-snug tracking-tight text-white">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{blurb}</p>
              <ul className="mt-5 space-y-2.5">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm text-white/80">
                    <Check
                      width={16}
                      height={16}
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft"
                    />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
