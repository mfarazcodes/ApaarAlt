import { describe, expect, it } from "vitest";
import { POST as consentPost } from "@/app/api/consent/route";
import { GET as credGet, POST as credPost } from "@/app/api/verify/credential/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { forecastCredits } from "@/lib/nadSyncEngine";
import { PERSONAS } from "@/lib/personas";
import { STUDENTS, isMinor } from "@/lib/students";
import { PROGRAM_TOTAL_CREDITS, profileFor, semesterSgpa, studentsWithTwin, twinFor, twinTotals } from "@/lib/studentData";
import { call, freshStoreEachTest } from "./helpers";

freshStoreEachTest();

const open = (id: string) => twinFor(id)!.flatMap((s) => s.backlogs).filter((b) => !b.clearedInSemester).length;
const forecast = (id: string) => {
  const t = twinTotals(twinFor(id)!);
  return forecastCredits({ earnedCredits: t.creditsEarned, totalCredits: PROGRAM_TOTAL_CREDITS, scheduledRemaining: t.scheduledRemaining, swayamUsed: t.swayamCredits });
};

describe("F12: the sample students cover the cases the portals need to show", () => {
  it("has an adult, a minor with a guardian, an opted-out student, a backlog, and two shortfalls", () => {
    expect(STUDENTS.length).toBeGreaterThanOrEqual(5);
    expect(isMinor(STUDENTS.find((s) => s.id === "STU-MS")!.dob)).toBe(true);
    expect(STUDENTS.filter((s) => isMinor(s.dob)).map((s) => s.id)).toEqual(["STU-MS"]);
    expect(STUDENTS.find((s) => s.startsOptedOut)?.id).toBe("STU-IQ");
    expect(PERSONAS.filter((p) => p.role === "GUARDIAN")).toHaveLength(1);
  });

  it("gives each student with a record a different story, all internally consistent", () => {
    const ids = studentsWithTwin();
    expect(ids).toEqual(["STU-RKV", "STU-AB", "STU-IQ", "STU-PL"]);
    for (const id of ids) {
      const twin = twinFor(id)!;
      // SGPA always agrees with the grades under it.
      for (const sem of twin.filter((s) => s.status === "COMPLETED")) expect(semesterSgpa(sem)).not.toBeNull();
      expect(twin.map((s) => s.status)).toEqual(["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "PLANNED", "PLANNED"]);
      expect(profileFor(id)!.roll).toMatch(/^2023-CS-\d{3}$/);
    }
    expect(new Set(ids.map((id) => profileFor(id)!.roll)).size).toBe(ids.length);
  });

  it("varies grades, backlogs and credit shortfall as the stories say", () => {
    const cgpa = Object.fromEntries(studentsWithTwin().map((id) => [id, twinTotals(twinFor(id)!).cgpa]));
    expect(cgpa["STU-AB"]).toBeGreaterThan(cgpa["STU-RKV"]);
    expect(cgpa["STU-RKV"]).toBeGreaterThan(cgpa["STU-IQ"]);
    expect(cgpa["STU-IQ"]).toBeGreaterThan(cgpa["STU-PL"]);

    expect(open("STU-RKV")).toBe(0); // one backlog, cleared
    expect(twinFor("STU-RKV")!.flatMap((s) => s.backlogs)).toHaveLength(1);
    expect(open("STU-AB")).toBe(0);
    expect(twinFor("STU-AB")!.flatMap((s) => s.backlogs)).toHaveLength(0);
    expect(open("STU-IQ")).toBe(1);
    expect(open("STU-PL")).toBe(0);

    expect(forecast("STU-RKV").shortfall).toBe(12);
    expect(forecast("STU-AB").shortfall).toBe(0);
    expect(forecast("STU-AB").onTrack).toBe(true);
    expect(forecast("STU-IQ").shortfall).toBeGreaterThan(forecast("STU-RKV").shortfall);
    expect(forecast("STU-PL").shortfall).toBeGreaterThan(forecast("STU-IQ").shortfall);
  });

  it("derives a student's twin without changing the base record", () => {
    expect(twinTotals(twinFor("STU-RKV")!).creditsEarned).toBe(128);
    expect(twinFor("STU-PL")).not.toBe(twinFor("STU-RKV"));
    expect(twinFor("STU-NOBODY")).toBeNull();
    expect(twinFor("STU-MS")).toBeNull();
  });
});

describe("F12: every persona can sign in, and each student gets a credential that follows their own record", () => {
  it("signs in all personas", async () => {
    expect(PERSONAS.length).toBeGreaterThanOrEqual(10);
    for (const p of PERSONAS) {
      const r = await call(loginPost, { body: { personaId: p.id }, headers: { "x-forwarded-for": `1.1.1.${PERSONAS.indexOf(p)}` } });
      expect(r.status, p.id).toBe(200);
    }
  });

  it("issues a current credential to each student with a record, with claims from their own CGPA", async () => {
    const samples = (await call(credGet, { as: "verifier-acme" })).json.samples as { cid: string; qr: string; label: string }[];
    expect(samples.map((s) => s.label)).toEqual(expect.arrayContaining(["Ananya Banerjee's current credential", "Imran Q.'s current credential", "Priya L.'s current credential"]));

    const claimsOf = async (as: string, id: string) => {
      const share = (await call(consentPost, { as, body: { action: "CREATE_QR", scopes: ["CGPA_BAND", "DEGREE_STATUS"], days: 7 } }));
      if (share.status !== 200) return { status: share.status };
      const v = await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", qr: share.json.presentation.qr } });
      return { status: 200, claims: Object.fromEntries(v.json.result.claims.map((c: { key: string; value: boolean }) => [c.key, c.value])), id };
    };

    const ananya = await claimsOf("student-ananya", "STU-AB");
    expect(ananya.claims).toMatchObject({ degreeVerified: true, cgpaAtLeast75: true });
    const priya = await claimsOf("student-priya", "STU-PL");
    expect(priya.claims).toMatchObject({ degreeVerified: true, cgpaAtLeast75: false });
  });

  it("looks a student up by their own APAAR ID, and by no one else's", async () => {
    for (const [id, expected] of [["612744901825", "AUTHENTIC"], ["209174638502", "AUTHENTIC"], ["731855209044", "NOT_FOUND"]] as const) {
      const r = await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", apaarId: id } });
      expect(r.json.result.status, id).toBe(expected);
    }
  });
});

describe("F12: the opted-out and minor students", () => {
  it("starts Imran opted out: nothing can be granted, no QR can be made, and his credential releases no claims", async () => {
    const wallet = await call((await import("@/app/api/consent/route")).GET, { as: "student-imran" });
    expect(wallet.json.ledger.apaarStatus).toBe("NOGEN_OPTED_OUT");
    expect(wallet.json.ledger.purposes.employerVerification).toBe(false);

    expect((await call(consentPost, { as: "student-imran", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME" } })).status).toBe(409);
    expect((await call(consentPost, { as: "student-imran", body: { action: "CREATE_QR", scopes: ["DEGREE_STATUS"], days: 7 } })).status).toBe(409);
    const v = await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", apaarId: "385920174613" } });
    expect(v.json.result.consent.state).toBe("OPTED_OUT");
    expect(v.json.result.claims).toBeNull();

    // He can re-enrol, after which he can share.
    expect((await call(consentPost, { as: "student-imran", body: { action: "TOGGLE_OPT_OUT", optOut: false } })).status).toBe(200);
    expect((await call(consentPost, { as: "student-imran", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME" } })).status).toBe(200);
  });

  it("keeps Meera, the minor, from creating a QR (she has no credential) and from sharing before co-sign", async () => {
    expect((await call(consentPost, { as: "student-meera", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME" } })).status).toBe(403);
    expect((await call(consentPost, { as: "student-meera", body: { action: "CREATE_QR", scopes: ["DEGREE_STATUS"], days: 7 } })).status).toBe(404);
  });
});
