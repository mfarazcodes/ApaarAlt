"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { useT } from "./I18n";

/** Every icon in the portals is sized with this so nothing can expand to full width. */
export const ICON = "h-4 w-4 shrink-0";

export const SATIN =
  "rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.02] shadow-2xl backdrop-blur-xl";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`${SATIN} p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">{children}</p>;
}

export function SectionTitle({ eyebrow, title, hint }: { eyebrow?: string; title: string; hint?: ReactNode }) {
  return (
    <div className="mb-4">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">{title}</h2>
      {hint && <p className="mt-1 text-sm text-white/60">{hint}</p>}
    </div>
  );
}

type Tone = "accent" | "red" | "amber" | "neutral" | "blue";

const TONES: Record<Tone, string> = {
  accent: "bg-accent/15 text-accent-soft",
  red: "bg-red-500/15 text-red-300",
  amber: "bg-amber-400/15 text-amber-300",
  blue: "bg-sky-400/15 text-sky-300",
  neutral: "bg-white/10 text-white/70",
};

export function Pill({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** A grey placeholder block shown while data loads, so the layout does not jump. */
export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-white/[0.07] motion-reduce:animate-none ${className}`} />;
}

export function Notice({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === "red" ? "alert" : "status"} className={`rounded-xl px-3.5 py-3 text-sm ${TONES[tone]}`}>
      {children}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // 24px tall to match WCAG 2.2 target size, with an invisible 44px hit area around it.
      className={`relative h-6 w-11 shrink-0 rounded-full transition before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-accent" : "bg-white/25"}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

type ButtonProps = {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
};

export function Button({ variant = "ghost", size = "md", children, className = "", type = "button", ...rest }: ButtonProps) {
  const styles = {
    primary:
      "bg-gradient-to-b from-accent-ink to-[color-mix(in_oklab,var(--accent-ink)_75%,black)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:brightness-110",
    ghost: "border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]",
    danger: "border border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20",
  }[variant];
  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm";
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${pad} ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ProgressBar({ value, max, tone = "accent", label }: { value: number; max: number; tone?: Tone; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill = tone === "red" ? "bg-red-400" : tone === "amber" ? "bg-amber-400" : "bg-gradient-to-r from-accent-strong to-accent";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 overflow-hidden rounded-full bg-white/10"
    >
      <div className={`h-full rounded-full transition-all duration-500 ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  size = "md",
}: {
  tabs: { id: T; label: string; badge?: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === value);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          className={`flex items-center gap-2 rounded-xl font-semibold transition ${size === "sm" ? "px-3 py-2 text-sm" : "px-4 py-2.5 text-sm"} ${
            value === t.id ? "bg-paper text-deep shadow" : "text-white/65 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          {t.label}
          {t.badge && (
            <span className={`rounded-md px-1.5 py-0.5 text-xs ${value === t.id ? "bg-deep/10 text-deep" : "bg-white/10 text-white/70"}`}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const { t } = useT();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel.current) return;
      // Keep Tab inside the dialog: wrap from the last control to the first and back.
      const controls = [...panel.current.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute("disabled"));
      if (controls.length === 0) {
        e.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      const here = document.activeElement;
      if (e.shiftKey && (here === first || here === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && here === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-white/15 bg-deep-2 p-6 text-white shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <button type="button" aria-label={t("a11y.close")} onClick={onClose} className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white">
            <X width={16} height={16} className={ICON} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-white/70">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/55 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
