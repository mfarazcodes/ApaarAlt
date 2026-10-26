"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LANGS, LANG_COOKIE, translate, type Key, type Lang } from "@/lib/i18n";

const Ctx = createContext<Lang>("en");

/** Carries the server's language choice to every client component below it. */
export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useT() {
  const lang = useContext(Ctx);
  return { lang, t: (key: Key | string, vars?: Record<string, string | number>) => translate(lang, key, vars) };
}

function saveLang(code: Lang) {
  document.cookie = `${LANG_COOKIE}=${code}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/** English / Hindi. Saves the choice in a cookie so server components render in it too, then refreshes. */
export function LanguageSwitcher() {
  const router = useRouter();
  const { lang, t } = useT();

  function pick(code: Lang) {
    saveLang(code);
    router.refresh();
  }

  return (
    <div role="group" aria-label={t("lang.label")} className="flex items-center gap-1 rounded-xl bg-white/[0.07] p-1">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          aria-pressed={lang === l.code}
          onClick={() => pick(l.code)}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${lang === l.code ? "bg-paper text-deep" : "text-white/70 hover:text-white"}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
