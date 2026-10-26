import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DICTIONARIES, EN, HI, LANGS, isLang, translate } from "@/lib/i18n";

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("language dictionaries", () => {
  it("offers English and Hindi", () => {
    expect(LANGS.map((l) => l.code)).toEqual(["en", "hi"]);
    expect(isLang("hi")).toBe(true);
    expect(isLang("fr")).toBe(false);
  });

  it("has the same keys in both languages", () => {
    expect(Object.keys(HI).sort()).toEqual(Object.keys(EN).sort());
  });

  it("has no empty strings", () => {
    for (const lang of ["en", "hi"] as const) {
      for (const [key, value] of Object.entries(DICTIONARIES[lang])) {
        expect(value.trim().length, `${lang}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every {placeholder} in the Hindi text", () => {
    for (const key of Object.keys(EN) as (keyof typeof EN)[]) {
      expect(placeholders(HI[key]), key).toEqual(placeholders(EN[key]));
    }
  });

  it("actually translates: Hindi differs from English for nearly every key", () => {
    // Proper nouns and codes (APAAR, NAD, NOGEN, "OTP") may legitimately match; allow a small share.
    const same = (Object.keys(EN) as (keyof typeof EN)[]).filter((k) => HI[k] === EN[k]);
    expect(same.length / Object.keys(EN).length).toBeLessThan(0.12);
  });

  it("fills placeholders and falls back to English, then to the key", () => {
    expect(translate("en", "wallet.days", { n: 30 })).toContain("30");
    expect(translate("hi", "wallet.days", { n: 30 })).toContain("30");
    expect(translate("hi", "wallet.days", { n: 30 })).not.toBe(translate("en", "wallet.days", { n: 30 }));
    expect(translate("hi", "no.such.key")).toBe("no.such.key");
    expect(translate("en", "wallet.days")).toContain("{n}");
  });
});

describe("keys used in the UI exist in the dictionary", () => {
  const files = sourceFiles(join(ROOT, "app"));
  const used = new Map<string, string>();
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    // t("key"), t("key", {...}), translate(lang, "key"), and key strings stored in tables (label: "wallet.x").
    for (const m of text.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) used.set(m[1], f);
    for (const m of text.matchAll(/translate\(\s*lang\s*,\s*"([a-zA-Z0-9_.]+)"/g)) used.set(m[1], f);
    for (const m of text.matchAll(/(?:label|hint):\s*"((?:wallet|qr|ver)\.[a-zA-Z0-9_.]+)"/g)) used.set(m[1], f);
  }

  it("finds the literal keys at all", () => {
    expect(used.size).toBeGreaterThan(100);
  });

  it("has every literal key in English and Hindi", () => {
    const missing = [...used.keys()].filter((k) => !(k in EN) || !(k in HI));
    expect(missing).toEqual([]);
  });

  it("covers every key built from a template (scope, status, field, role, persona)", () => {
    const scopes = ["DEGREE_STATUS", "INTERNSHIP_STATUS", "CGPA_BAND", "EOA_STATUS"];
    const statuses = ["AUTHENTIC", "REVOKED", "SUPERSEDED", "EXPIRED", "INVALID_SIGNATURE", "NOT_FOUND"];
    const roles = ["STUDENT", "GUARDIAN", "REGISTRAR", "AICTE", "VERIFIER"];
    const wanted = [
      ...scopes.map((s) => `scope.${s}`),
      ...statuses.map((s) => `status.${s}`),
      ...roles.map((r) => `role.${r}`),
    ];
    for (const k of wanted) expect(k in EN && k in HI, k).toBe(true);
    // Dispute-field option labels are keyed by the English field name, so check the real list.
    const src = readFileSync(join(ROOT, "app/components/student/ConsentWallet.tsx"), "utf8");
    const declared = src.match(/DISPUTE_FIELDS[^=]*=\s*\[([^\]]+)\]/)?.[1] ?? "";
    for (const f of [...declared.matchAll(/"([^"]+)"/g)].map((m) => m[1])) {
      expect(`wallet.field.${f}` in EN, `wallet.field.${f}`).toBe(true);
    }
  });

  it("has a persona name for every login persona", async () => {
    const { PERSONAS } = await import("@/lib/personas");
    for (const p of PERSONAS) {
      expect(`persona.${p.id}` in EN && `persona.${p.id}` in HI, `persona.${p.id}`).toBe(true);
    }
  });
});
