import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTICE_ENGLISH, NOTICE_LANGUAGES } from "@/lib/consentNotices";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules" || name === ".next") return [];
    return statSync(p).isDirectory() ? sources(p) : /\.(tsx?|css)$/.test(name) ? [p] : [];
  });
}

describe("copy must not claim what the code does not do", () => {
  const files = [...sources("app"), ...sources("lib")];
  const text = files.map((f) => ({ f, t: readFileSync(f, "utf8") }));

  it.each([
    ["an absolute claim to eliminate rejections or fraud", /eliminating demographic|eliminating .*fraud/i],
    ["last digits of an ID", /••••\s*••••\s*\d{4}/],
    ["a 'BullMQ ready' badge for a browser simulation", /BullMQ Ready/],
    ["a 12-digit ID-like number shown as page text", />\s*\d{4}-\d{4}-\d{4}\s*</],
  ])("has no %s", (_label, pattern) => {
    const hits = text.filter(({ t }) => pattern.test(t)).map(({ f }) => f);
    expect(hits).toEqual([]);
  });
});

describe("Q6: the translated notices keep both sentences", () => {
  const sentences = (t: string) => (t.match(/[.।۔]/g) ?? []).length;

  it("has two sentences in English", () => {
    expect(sentences(NOTICE_ENGLISH)).toBe(2);
  });

  it("keeps two sentences in every drafted translation", () => {
    const drafted = NOTICE_LANGUAGES.filter((l) => l.code !== "en" && l.text);
    expect(drafted.length).toBeGreaterThanOrEqual(14);
    for (const l of drafted) expect(sentences(l.text!), l.name).toBeGreaterThanOrEqual(2);
  });

  it("covers English plus the 22 Eighth Schedule languages, and flags the undone ones as missing", () => {
    expect(NOTICE_LANGUAGES).toHaveLength(23);
    expect(NOTICE_LANGUAGES.filter((l) => l.text === null).map((l) => l.name).sort()).toEqual(
      ["Bodo", "Dogri", "Kashmiri", "Konkani", "Maithili", "Manipuri", "Santali", "Sindhi"]
    );
  });
});
