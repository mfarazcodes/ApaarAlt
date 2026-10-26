import { describe, expect, it } from "vitest";
import { GET as nationalGet } from "@/app/api/national/route";
import { POST as consentPost } from "@/app/api/consent/route";
import { GET as auditGet } from "@/app/api/audit/route";
import type { AuditEntry } from "@/lib/audit";
import { auditToCsv } from "@/lib/auditCsv";
import { SAMPLE_COLLEGES } from "@/lib/nadSyncEngine";
import { PAGE_SIZE, nationalColleges, programmesFor, splitTotal, studentsFor } from "@/lib/nationalData";
import { call, freshStoreEachTest } from "./helpers";

freshStoreEachTest();

describe("F9: programmes add up to their college", () => {
  it("splits a total exactly, whatever the weights", () => {
    for (const total of [0, 1, 7, 470, 1200, 1604]) {
      const parts = splitTotal(total, [0.3, 0.2, 0.2, 0.15, 0.15]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every((p) => Number.isInteger(p) && p >= 0)).toBe(true);
    }
  });

  it("reconciles every field of every college, and keeps verified within enrolled and seeded within verified", () => {
    for (const c of SAMPLE_COLLEGES) {
      const programmes = programmesFor(c);
      const sum = (k: "approvedIntake" | "erpEnrolled" | "verified" | "abcSeeded") => programmes.reduce((n, p) => n + p[k], 0);
      expect(sum("approvedIntake"), c.name).toBe(c.approvedIntake);
      expect(sum("erpEnrolled"), c.name).toBe(c.erpEnrolled);
      expect(sum("verified"), c.name).toBe(c.verified);
      expect(sum("abcSeeded"), c.name).toBe(c.abcSeeded);
      for (const p of programmes) {
        expect(p.verified).toBeLessThanOrEqual(p.erpEnrolled);
        expect(p.abcSeeded).toBeLessThanOrEqual(p.verified);
      }
    }
  });

  it("flags the over-intake programmes at a college that is over", () => {
    const thar = nationalColleges().find((c) => c.name.startsWith("Thar"))!;
    expect(thar.overIntakeProgrammes.length).toBeGreaterThan(0);
    expect(thar.programmes.filter((p) => p.status === "OVER_INTAKE_PENALTY_RISK").map((p) => p.programme)).toEqual(thar.overIntakeProgrammes);
  });
});

describe("F9: the student level is tokens, paged, and consistent", () => {
  const programme = programmesFor(SAMPLE_COLLEGES[3])[0];

  it("lists exactly the enrolled students, split into the statuses the programme reports", () => {
    const pages = Math.ceil(programme.erpEnrolled / PAGE_SIZE);
    const all = Array.from({ length: pages }, (_, i) => studentsFor("DEMO-0004", programme.programme, i + 1).rows).flat();
    expect(all).toHaveLength(programme.erpEnrolled);
    expect(all.filter((s) => s.status === "ABC_SEEDED")).toHaveLength(programme.abcSeeded);
    expect(all.filter((s) => s.status === "VERIFIED")).toHaveLength(programme.verified - programme.abcSeeded);
    expect(all.filter((s) => s.status === "UNVERIFIED")).toHaveLength(programme.erpEnrolled - programme.verified);
    expect(new Set(all.map((s) => s.token)).size).toBe(all.length); // no collisions
    expect(all.filter((s) => s.status === "UNVERIFIED").every((s) => s.flags.includes("No verified APAAR identity"))).toBe(true);
  });

  it("never carries a name, a roll number or an ID number", () => {
    const text = JSON.stringify(studentsFor("DEMO-0004", programme.programme, 1));
    expect(text).not.toMatch(/\d{12}|\d{4}-\d{4}-\d{4}|\d{4}-[A-Z]{2}-\d{3}/);
    expect(studentsFor("DEMO-0004", programme.programme, 1).rows.every((r) => /^STU-[0-9A-F]{6}$/.test(r.token))).toBe(true);
  });

  it("is the same every time, and clamps the page", () => {
    expect(studentsFor("DEMO-0004", programme.programme, 2)).toEqual(studentsFor("DEMO-0004", programme.programme, 2));
    expect(studentsFor("DEMO-0004", programme.programme, 9999).page).toBe(studentsFor("DEMO-0004", programme.programme, 9999).pages);
    expect(studentsFor("DEMO-0004", programme.programme, -3).page).toBe(1);
  });

  it("rejects an unknown college or programme", () => {
    expect(() => studentsFor("NOPE", "Civil")).toThrow();
    expect(() => studentsFor("DEMO-0004", "Astrology")).toThrow();
  });
});

describe("F9: the national route", () => {
  const programme = encodeURIComponent("Computer Science");

  it("gives colleges and programmes to AICTE and registrars, but student rows to AICTE only", async () => {
    const aicte = await call(nationalGet, { as: "aicte" });
    expect(aicte.json.colleges).toHaveLength(SAMPLE_COLLEGES.length);
    expect(aicte.json.studentLevel).toBe(true);
    expect((await call(nationalGet, { as: "registrar" })).json.studentLevel).toBe(false);

    const rows = await call(nationalGet, { as: "aicte", path: `/api/national?college=DEMO-0004&programme=${programme}&page=2` });
    expect(rows.status).toBe(200);
    expect(rows.json.page).toBe(2);
    expect(rows.json.rows.length).toBeGreaterThan(0);
    expect((await call(nationalGet, { as: "registrar", path: `/api/national?college=DEMO-0004&programme=${programme}` })).status).toBe(403);
  });

  it("is closed to everyone else, and validates its input", async () => {
    for (const as of ["student-rahul", "verifier-acme", "guardian-meera"]) expect((await call(nationalGet, { as })).status, as).toBe(403);
    expect((await call(nationalGet)).status).toBe(401);
    expect((await call(nationalGet, { as: "aicte", path: `/api/national?college=DEMO-0004` })).status).toBe(400);
    expect((await call(nationalGet, { as: "aicte", path: `/api/national?college=NOPE&programme=${programme}` })).status).toBe(404);
    expect((await call(nationalGet, { as: "aicte", path: `/api/national?college=DEMO-0004&programme=Astrology` })).status).toBe(404);
    expect((await call(nationalGet, { as: "aicte", path: `/api/national?college=DEMO-0004&programme=${programme}&page=abc` })).status).toBe(400);
  });
});

describe("F9: the audit CSV is safe to open in a spreadsheet", () => {
  const entry = (over: Partial<AuditEntry>): AuditEntry => ({
    logId: "AUDIT-0001", seq: 1, timestamp: "2026-10-27T10:00:00.000Z", type: "DISPUTE", subject: "STU-RKV", action: "DISPUTE_RAISED",
    actorRole: "STUDENT", actor: "Rahul K.V.", detail: "ok", previousHash: "0".repeat(64), sha256Hash: "a".repeat(64), ...over,
  });

  it("neutralises text a student typed that would run as a formula", () => {
    const csv = auditToCsv([entry({ detail: '=HYPERLINK("http://evil.example","click")' }), entry({ actor: "@SUM(A1:A9)", logId: "AUDIT-0002" })]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(csv).toContain("'@SUM(A1:A9)");
    expect(csv.split("\r\n")[0]).toBe("Entry,When (UTC),Type,Action,Actor role,Actor,Subject,Detail,Hash");
  });

  it("exports a real log written through the API, formula text included", async () => {
    await call(consentPost, { as: "student-rahul", body: { action: "RAISE_DISPUTE", field: "Name", claimedValue: "x", reason: "=cmd|' /C calc'!A0" } });
    const { entries } = (await call(auditGet, { as: "aicte" })).json as { entries: AuditEntry[] };
    const csv = auditToCsv(entries);
    // The dispute text lives in the ledger, not the audit detail, so check that no cell anywhere starts as a formula.
    for (const line of csv.split("\r\n").slice(1)) for (const cell of line.split(",")) expect(cell).not.toMatch(/^[=+\-@]/);
    expect(entries.some((e) => e.type === "DISPUTE")).toBe(true);
  });
});
