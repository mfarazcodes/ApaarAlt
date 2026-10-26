"use client";

import { useSyncExternalStore } from "react";

export const THEMES = [
  { id: "emerald", label: "Emerald Fintech", color: "#10B981" },
  { id: "cobalt", label: "Cobalt AICTE", color: "#3B82F6" },
  { id: "amber", label: "Amber Gold", color: "#F59E0B" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function snapshot(): ThemeId {
  const current = document.documentElement.dataset.theme as ThemeId | undefined;
  return current && THEMES.some((t) => t.id === current) ? current : "emerald";
}

/** The accent theme lives on <html data-theme>. layout.tsx applies the saved choice before first paint. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "emerald" as ThemeId);

  function pick(id: ThemeId) {
    document.documentElement.dataset.theme = id;
    try {
      localStorage.setItem("apaar-theme", id);
    } catch {
      /* storage can be blocked; the theme still applies for this visit */
    }
  }

  return { theme, pick };
}

export default function ThemeSwitcher({ variant = "dark" }: { variant?: "light" | "dark" }) {
  const { theme, pick } = useTheme();
  const ring = variant === "light" ? "ring-deep ring-offset-white" : "ring-white ring-offset-deep";

  return (
    <div
      role="radiogroup"
      aria-label="Brand accent theme"
      className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2.5 ${variant === "light" ? "bg-deep/[0.05]" : "bg-white/[0.07]"}`}
    >
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => pick(t.id)}
          style={{ backgroundColor: t.color }}
          className={`h-4 w-4 rounded-full transition ${
            theme === t.id ? `ring-2 ring-offset-2 ${ring}` : "opacity-70 hover:opacity-100"
          }`}
        />
      ))}
    </div>
  );
}
