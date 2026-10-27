"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, GraduationCap, QrCode, School, ShieldAlert, Users } from "lucide-react";
import type { Persona } from "@/lib/personas";
import { useT } from "./I18n";
import { api, errorText } from "./api";
import { ICON, Notice, Pill } from "./ui";

/** Personas grouped by what they do, in the order the demo is best shown. */
const GROUPS = [
  { id: "college", roles: ["REGISTRAR"], Icon: School },
  { id: "students", roles: ["STUDENT"], Icon: GraduationCap },
  { id: "guardian", roles: ["GUARDIAN"], Icon: Users },
  { id: "aicte", roles: ["AICTE"], Icon: ShieldAlert },
  { id: "employers", roles: ["VERIFIER"], Icon: QrCode },
] as const;

/** The three-step path from the README demo script. */
const STEP: Record<string, number> = { registrar: 1, "student-rahul": 2, "verifier-acme": 3 };

export default function LoginPicker({ personas, next }: { personas: Persona[]; next?: string }) {
  const router = useRouter();
  const { t } = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function signIn(p: Persona) {
    setBusy(p.id);
    setError("");
    try {
      await api("/api/auth/login", { personaId: p.id });
      // Land on the page they asked for if this role may open it, otherwise on the role's own home.
      router.push(next && personaCanOpen(p, next) ? next : p.home);
      router.refresh();
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  }

  return (
    <div className="mt-8">
      <p className="mb-6 text-sm text-white/65">{t("login.order")}</p>
      {error && (
        <div className="mb-4">
          <Notice tone="red">{error}</Notice>
        </div>
      )}
      <div className="space-y-8">
        {GROUPS.map(({ id, roles, Icon }) => {
          const list = personas.filter((p) => (roles as readonly string[]).includes(p.role));
          if (list.length === 0) return null;
          return (
            <section key={id} aria-labelledby={`grp-${id}`}>
              <h2 id={`grp-${id}`} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/70">
                <Icon width={16} height={16} className={ICON} />
                {t(`login.group.${id}`)}
              </h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {list.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => signIn(p)}
                      className="group flex h-full w-full flex-col rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5 text-left transition hover:border-accent/50 disabled:opacity-60"
                    >
                      <span className="flex min-h-6 items-center justify-between gap-3">
                        {STEP[p.id] ? (
                          <Pill tone="accent">
                            {t("login.step", { n: STEP[p.id] })}
                            {STEP[p.id] === 1 && ` · ${t("login.startHere")}`}
                          </Pill>
                        ) : (
                          <span />
                        )}
                        <ArrowRight width={16} height={16} className={`${ICON} text-white/55 transition group-hover:translate-x-0.5 group-hover:text-accent-soft`} />
                      </span>
                      <span className="mt-3 text-lg font-semibold tracking-tight">{p.name}</span>
                      <span className="mt-1 text-sm text-white/65">{busy === p.id ? t("login.signingIn") : t(`persona.${p.id}`)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function personaCanOpen(p: Persona, path: string): boolean {
  const roles: Record<string, string[]> = { "/student": ["STUDENT", "GUARDIAN"], "/admin": ["REGISTRAR", "AICTE"], "/employer": ["VERIFIER"] };
  return (roles[path] ?? []).includes(p.role);
}
