import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

const PORTALS = [
  { href: "/student", label: "Student Digital Twin" },
  { href: "/admin", label: "College & AICTE Console" },
  { href: "/employer", label: "Smart QR Verify" },
];

const PLATFORM = [
  { href: "#features", label: "Modules" },
  { href: "#architecture", label: "Architecture flow" },
];

const STANDARDS = ["AICTE compliance", "NAD / ABC credits", "DPDP Act consent"];

const linkClass = "text-white/80 transition hover:text-accent";

export default function Footer() {
  return (
    <footer className="relative overflow-hidden px-4 pb-10 pt-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-ink text-white shadow-[0_0_40px_-8px_var(--accent)]">
            <ShieldCheck width={16} height={16} className="h-6 w-6 shrink-0" />
          </span>
          <h2 className="mx-auto mt-8 max-w-3xl text-[clamp(2rem,4.8vw,3.8rem)] leading-[1.02] tracking-[-0.04em] text-white">
            Verify once, <span className="text-white/45">trusted everywhere.</span>
          </h2>
          <p className="mt-4 text-base text-white/60">
            Pick a portal and see the bridge working end to end.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
            <Link
              href="/student"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-paper px-6 py-4 text-base font-semibold text-deep transition hover:brightness-95"
            >
              Explore Student Digital Twin
              <ArrowRight width={16} height={16} className="h-4 w-4 shrink-0" />
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center justify-center rounded-xl border border-white/25 px-6 py-4 text-base font-semibold text-white transition hover:bg-white/10"
            >
              College &amp; AICTE Console
            </Link>
          </div>
        </div>

        <div className="mt-20 grid grid-cols-1 gap-10 border-t border-white/10 pt-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5 text-white">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-ink">
                <ShieldCheck width={16} height={16} className="h-4 w-4 shrink-0" />
              </span>
              <span className="text-lg font-semibold tracking-tight">APAAR Bridge</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-white/55">
              Unified student data verification and academic digital twin for AICTE institutions.
            </p>
          </div>

          <nav aria-label="Portals">
            <p className="text-sm text-white/45">Portals</p>
            <ul className="mt-4 space-y-3 text-[15px]">
              {PORTALS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Platform">
            <p className="text-sm text-white/45">Platform</p>
            <ul className="mt-4 space-y-3 text-[15px]">
              {PLATFORM.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className={linkClass}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="text-sm text-white/45">Built around</p>
            <ul className="mt-4 space-y-3 text-[15px] text-white/80">
              {STANDARDS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <p
        aria-hidden="true"
        className="pointer-events-none mt-10 select-none text-center text-[clamp(5rem,22vw,18rem)] font-semibold leading-[0.8] tracking-[-0.06em] text-white/[0.04]"
      >
        apaar
      </p>
    </footer>
  );
}
