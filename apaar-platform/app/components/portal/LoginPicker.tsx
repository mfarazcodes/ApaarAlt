"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { ROLE_LABEL, type Persona } from "@/lib/personas";
import { api, errorText } from "./api";
import { ICON, Notice, Pill } from "./ui";

export default function LoginPicker({ personas, next }: { personas: Persona[]; next?: string }) {
  const router = useRouter();
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
      {error && (
        <div className="mb-4">
          <Notice tone="red">{error}</Notice>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {personas.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => signIn(p)}
              className="group flex h-full w-full flex-col rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5 text-left transition hover:border-accent/50 disabled:opacity-60"
            >
              <span className="flex items-center justify-between gap-3">
                <Pill tone="accent">{ROLE_LABEL[p.role]}</Pill>
                <ArrowRight width={16} height={16} className={`${ICON} text-white/45 transition group-hover:translate-x-0.5 group-hover:text-accent`} />
              </span>
              <span className="mt-3 text-lg font-semibold tracking-tight">{p.name}</span>
              <span className="mt-1 text-sm text-white/60">{busy === p.id ? "Signing in…" : p.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function personaCanOpen(p: Persona, path: string): boolean {
  const roles: Record<string, string[]> = { "/student": ["STUDENT", "GUARDIAN"], "/admin": ["REGISTRAR", "AICTE"], "/employer": ["VERIFIER"] };
  return (roles[path] ?? []).includes(p.role);
}
