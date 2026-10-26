"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, ShieldCheck, X } from "lucide-react";

const THEMES = [
  { id: "emerald", label: "Emerald Fintech", color: "#10B981" },
  { id: "cobalt", label: "Cobalt AICTE", color: "#3B82F6" },
  { id: "amber", label: "Amber Gold", color: "#F59E0B" },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];

const LINKS = [
  { href: "/admin", label: "College ERP" },
  { href: "/student", label: "Digital Twin" },
  { href: "/employer", label: "Smart QR Verify" },
  { href: "#features", label: "Architecture" },
];

export default function Navbar() {
  const [theme, setTheme] = useState<ThemeId>("emerald");
  const [open, setOpen] = useState(false);

  // The inline script in layout.tsx has already applied the saved theme; mirror it into state.
  useEffect(() => {
    const current = document.documentElement.dataset.theme as ThemeId | undefined;
    if (current && THEMES.some((t) => t.id === current)) setTheme(current);
  }, []);

  function pickTheme(id: ThemeId) {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    try {
      localStorage.setItem("apaar-theme", id);
    } catch {
      /* storage can be blocked; the theme still applies for this visit */
    }
  }

  const pill =
    "pointer-events-auto rounded-2xl border border-black/5 bg-white/75 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl";

  return (
    <header className="pointer-events-none fixed inset-x-4 top-4 z-50 sm:inset-x-6 sm:top-6">
      <div className="flex items-start justify-between gap-3">
        {/* Brand mark */}
        <div className="relative">
          <div className={`${pill} flex items-center gap-2.5 p-1.5 pr-1.5`}>
            <Link href="/" className="flex items-center gap-2.5 pl-1.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-deep text-accent">
                <ShieldCheck width={16} height={16} className="h-4 w-4 shrink-0" />
              </span>
              <span className="text-[17px] font-semibold tracking-tight text-deep">
                APAAR Bridge
              </span>
              <span className="hidden rounded-md bg-deep/[0.06] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-deep/60 xl:inline">
                AICTE • NAD • DPDP
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              className="grid h-9 w-9 place-items-center rounded-lg bg-accent-ink text-white lg:hidden"
            >
              {open ? (
                <X width={16} height={16} className="h-4 w-4 shrink-0" />
              ) : (
                <Menu width={16} height={16} className="h-4 w-4 shrink-0" />
              )}
            </button>
          </div>

          {open && (
            <nav
              className={`${pill} absolute left-0 top-full mt-2 flex w-56 flex-col p-2 lg:hidden`}
            >
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-deep hover:bg-deep/[0.06]"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {/* Centre links */}
        <nav className={`${pill} hidden items-center gap-1 p-1.5 lg:flex`}>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-xl px-4 py-2 text-sm font-medium text-deep/70 transition hover:bg-deep/[0.06] hover:text-deep"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Theme dots + CTA */}
        <div className={`${pill} flex items-center gap-2 p-1.5`}>
          <div
            role="radiogroup"
            aria-label="Brand accent theme"
            className="flex items-center gap-1.5 rounded-xl bg-deep/[0.05] px-2.5 py-2.5"
          >
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={theme === t.id}
                aria-label={t.label}
                title={t.label}
                onClick={() => pickTheme(t.id)}
                style={{ backgroundColor: t.color }}
                className={`h-4 w-4 rounded-full transition ${
                  theme === t.id
                    ? "ring-2 ring-deep ring-offset-2 ring-offset-white"
                    : "opacity-70 hover:opacity-100"
                }`}
              />
            ))}
          </div>
          <Link
            href="/student"
            className="flex items-center gap-1.5 rounded-xl bg-accent-ink px-3.5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 sm:px-4"
          >
            <span className="hidden sm:inline">Launch Portal</span>
            <span className="sm:hidden">Launch</span>
            <ArrowRight width={16} height={16} className="h-4 w-4 shrink-0" />
          </Link>
        </div>
      </div>
    </header>
  );
}
