import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GET as disputesGet, POST as disputesPost } from "@/app/api/disputes/route";
import { GET as consentGet, POST as consentPost } from "@/app/api/consent/route";
import { GET as docsGet } from "@/app/api/docs/route";
import { GET as credGet } from "@/app/api/verify/credential/route";
import { GET as bulkGet, POST as bulkPost } from "@/app/api/verify/bulk/route";
import { readChain } from "@/lib/audit";
import { apiKeyFor, verifierFromApiKey } from "@/lib/apiKeys";
import { SAMPLE_ADMISSION_SERIES, detectAdmissionSpikes, type AdmissionDay } from "@/lib/admissionSpike";
import { csvCell, toCsv } from "@/lib/csvExport";
import { getStore, NS } from "@/lib/store";
import { openApiDocument } from "@/lib/openapi";
import { call, freshStoreEachTest } from "./helpers";

freshStoreEachTest();

describe("F5: the dispute inbox", () => {
  const raise = (reason = "ERP shows the wrong date") =>
    call(consentPost, { as: "student-rahul", body: { action: "RAISE_DISPUTE", field: "Date of birth", claimedValue: "2004-05-14", reason } });

  it("shows the registrar every student's tickets, with who raised them", async () => {
    await raise();
    const r = await call(disputesGet, { as: "registrar" });
    expect(r.status).toBe(200);
    expect(r.json.open).toBe(1);
    expect(r.json.disputes[0]).toMatchObject({ studentName: "Rahul K.V.", studentRoll: "2023-CS-041", field: "Date of birth", status: "OPEN", overdue: false });
  });

  it("is the registrar's alone", async () => {
    await raise();
    for (const as of ["student-rahul", "aicte", "verifier-acme", "guardian-meera"]) expect((await call(disputesGet, { as })).status).toBe(403);
    expect((await call(disputesGet)).status).toBe(401);
    const close = { action: "RESOLVE", studentId: "STU-RKV", ticketId: "DSP-0001", decision: "RESOLVED", resolution: "Fixed" };
    expect((await call(disputesPost, { as: "student-rahul", body: close })).status).toBe(403);
    expect((await call(disputesPost, { as: "aicte", body: close })).status).toBe(403);
  });

  it("closes a ticket with a reason the student then sees, and audits both steps", async () => {
    await raise();
    const done = await call(disputesPost, { as: "registrar", body: { action: "RESOLVE", studentId: "STU-RKV", ticketId: "DSP-0001", decision: "RESOLVED", resolution: "Corrected to match the birth certificate." } });
    expect(done.status).toBe(200);
    expect(done.json.dispute).toMatchObject({ status: "RESOLVED", resolvedBy: "Registrar, Vindhya Institute" });

    const wallet = (await call(consentGet, { as: "student-rahul" })).json.ledger;
    expect(wallet.disputes[0]).toMatchObject({ status: "RESOLVED", resolution: "Corrected to match the birth certificate." });

    const entries = (await readChain(getStore())).entries.filter((e) => e.type === "DISPUTE");
    expect(entries.map((e) => e.action)).toEqual(["DISPUTE_RAISED", "DISPUTE_RESOLVED"]);
    expect(entries[0].actorRole).toBe("STUDENT");
    expect(entries[1].actorRole).toBe("REGISTRAR");
    expect(entries[1].detail).toContain("Corrected to match the birth certificate.");
  });

  it("needs a reason, and will not close a ticket twice or one that does not exist", async () => {
    await raise();
    const body = { action: "RESOLVE", studentId: "STU-RKV", ticketId: "DSP-0001", decision: "REJECTED" };
    expect((await call(disputesPost, { as: "registrar", body: { ...body, resolution: "" } })).status).toBe(400);
    expect((await call(disputesPost, { as: "registrar", body: { ...body, resolution: "No" } })).status).toBe(400);
    expect((await call(disputesPost, { as: "registrar", body: { ...body, resolution: "The certificate matches the record." } })).status).toBe(200);
    expect((await call(disputesPost, { as: "registrar", body: { ...body, resolution: "Again" } })).status).toBe(409);
    expect((await call(disputesPost, { as: "registrar", body: { ...body, ticketId: "DSP-0099", resolution: "Nope" } })).status).toBe(404);
    expect((await call(disputesPost, { as: "registrar", body: { ...body, studentId: "STU-NOBODY", resolution: "Nope" } })).status).toBe(404);
  });

  it("flags a ticket as overdue once its acknowledgement date has passed", async () => {
    await raise();
    await getStore().update<{ disputes: { acknowledgeBy: string }[] }, void>(NS.consent, "STU-RKV", (l) => {
      l!.disputes[0].acknowledgeBy = new Date(Date.now() - 86_400_000).toISOString();
      return { value: l, result: undefined };
    });
    expect((await call(disputesGet, { as: "registrar" })).json.disputes[0].overdue).toBe(true);
  });
});

describe("F10: bulk verification", () => {
  const keyFor = async (as: string) => (await call(bulkGet, { as })).json.apiKey as string;
  const qrs = async () => (await call(credGet, { as: "verifier-acme" })).json.samples as { cid: string; qr: string }[];
  const bulk = (items: unknown[], headers: Record<string, string> = {}, as?: string) => call(bulkPost, { as, body: { items }, headers });

  it("authenticates by API key with no cookie, and returns one result per item in order", async () => {
    const [current, superseded] = await qrs();
    const key = await keyFor("verifier-acme");
    const r = await bulk([{ qr: current.qr }, { qr: superseded.qr }, { qr: "APAARQR1.garbage.garbage" }, { apaarId: "111122223333" }], { "x-api-key": key });
    expect(r.status).toBe(200);
    expect(r.json.count).toBe(4);
    expect(r.json.results.map((x: { status: string }) => x.status)).toEqual(["AUTHENTIC", "SUPERSEDED", "INVALID_SIGNATURE", "NOT_FOUND"]);
    expect(r.json.results.map((x: { index: number }) => x.index)).toEqual([0, 1, 2, 3]);
  });

  it("still enforces consent per student and per caller", async () => {
    const [current] = await qrs();
    const acme = await keyFor("verifier-acme");
    const finserve = await keyFor("verifier-finserve");

    expect((await bulk([{ qr: current.qr }], { "x-api-key": acme })).json.results[0].claims).toBeNull();

    await call(consentPost, { as: "student-rahul", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME", scopes: ["DEGREE_STATUS"] } });
    const allowed = (await bulk([{ qr: current.qr }], { "x-api-key": acme })).json.results[0];
    expect(allowed.consent).toBe("GRANTED");
    expect(allowed.claims).toHaveLength(1);
    expect((await bulk([{ qr: current.qr }], { "x-api-key": finserve })).json.results[0].claims).toBeNull();
  });

  it("never echoes an APAAR ID or an identity number", async () => {
    const key = await keyFor("verifier-acme");
    const r = await bulk([{ apaarId: "948120416672" }, { apaarId: "9481-2041-6672" }], { "x-api-key": key });
    expect(JSON.stringify(r.json)).not.toMatch(/9481|948120416672/);
    expect(r.json.results[0].identity).toBe("[Aadhaar Redacted]");
  });

  it("refuses a bad key, a key with another verifier's name on it, and callers who are not verifiers", async () => {
    const acme = await keyFor("verifier-acme");
    const forged = acme.replace("VRF-ACME", "VRF-FINSERVE");
    const item = [{ apaarId: "948120416672" }];
    expect((await bulk(item, { "x-api-key": "nonsense" })).status).toBe(401);
    expect((await bulk(item, { "x-api-key": forged })).status).toBe(401);
    expect((await bulk(item)).status).toBe(401);
    expect((await bulk(item, {}, "registrar")).status).toBe(403);
    expect((await bulk(item, {}, "student-rahul")).status).toBe(403);
    expect((await bulk(item, {}, "verifier-acme")).status).toBe(200); // a signed-in verifier needs no key
    expect(verifierFromApiKey(acme)).toBe("VRF-ACME");
    expect(verifierFromApiKey(`${acme}x`)).toBeNull();
    expect(apiKeyFor("VRF-ACME")).toBe(acme);
  });

  it("allows 100 items and rejects 101, an empty list, and items with nothing to check", async () => {
    const key = await keyFor("verifier-acme");
    const many = (n: number) => Array.from({ length: n }, () => ({ apaarId: "111122223333" }));
    expect((await bulk(many(100), { "x-api-key": key })).status).toBe(200);
    expect((await bulk(many(101), { "x-api-key": key })).status).toBe(400);
    expect((await bulk([], { "x-api-key": key })).status).toBe(400);
    expect((await bulk([{}], { "x-api-key": key })).status).toBe(400);
  });

  it("rate-limits each verifier, and one verifier's use does not use up another's allowance", async () => {
    const acme = await keyFor("verifier-acme");
    const finserve = await keyFor("verifier-finserve");
    const item = [{ apaarId: "111122223333" }];
    let status = 0;
    for (let i = 0; i < 31; i++) status = (await bulk(item, { "x-api-key": acme, "x-forwarded-for": `10.0.0.${i}` })).status;
    expect(status).toBe(429);
    expect((await bulk(item, { "x-api-key": finserve, "x-forwarded-for": "10.9.9.9" })).status).toBe(200);
  });
});

describe("F10: the OpenAPI document", () => {
  it("is served without signing in and describes the bulk endpoint", async () => {
    const r = await call(docsGet);
    expect(r.status).toBe(200);
    expect(r.json.openapi).toBe("3.1.0");
    expect(r.json.paths["/api/verify/bulk"].post.requestBody.content["application/json"].schema.properties.items.maxItems).toBe(100);
    expect(r.json.components.securitySchemes.apiKey.name).toBe("x-api-key");
  });

  it("only documents routes that exist, and promises nothing it does not do", () => {
    const doc = openApiDocument();
    for (const path of Object.keys(doc.paths)) expect(existsSync(`app${path}/route.ts`), path).toBe(true);
    expect(JSON.stringify(doc)).toMatch(/never returned/);
  });
});

describe("F9: the admission-spike detector", () => {
  it("flags the one programme that jumps, with its reasons, and leaves the others alone", () => {
    const flags = detectAdmissionSpikes(SAMPLE_ADMISSION_SERIES);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ college: "Brahmaputra Institute of Technology", programme: "B.Tech Civil", admitted: 31, severity: "HIGH" });
    expect(flags[0].unverifiedShare).toBeGreaterThan(0.7);
    expect(flags[0].reasons.join(" ")).toMatch(/31 admissions on 2024-09-15/);
    expect(flags[0].reasons.join(" ")).toMatch(/no verified APAAR identity/);
  });

  const series = (counts: number[]): AdmissionDay[] => counts.map((admitted, i) => ({ college: "C", programme: "P", date: `2024-09-${String(i + 1).padStart(2, "0")}`, admitted, withoutVerifiedId: 0 }));

  it("does not flag a big ratio from a tiny number, or a large number that is normal for the programme", () => {
    expect(detectAdmissionSpikes(series([0, 0, 1, 0, 0, 1, 0, 0, 12]))).toEqual([]); // 12 is under the floor of 15
    expect(detectAdmissionSpikes(series([40, 42, 38, 41, 39, 43, 40, 44]))).toEqual([]); // steady
  });

  it("copes with a zero baseline without dividing by zero, and skips programmes with too little history", () => {
    const flags = detectAdmissionSpikes(series([0, 0, 0, 0, 0, 0, 0, 0, 20]));
    expect(flags).toHaveLength(1);
    expect(Number.isFinite(flags[0].liftPercent)).toBe(true);
    expect(detectAdmissionSpikes(series([1, 1, 30]))).toEqual([]);
  });

  it("uses the programme's own history, so busy programmes are not compared with quiet ones", () => {
    const mixed = [...series([2, 2, 2, 2, 2, 2, 2, 2, 20]), ...series([30, 30, 30, 30, 30, 30, 30, 30, 36]).map((d) => ({ ...d, programme: "Q" }))];
    const flags = detectAdmissionSpikes(mixed);
    expect(flags.map((f) => f.programme)).toEqual(["P"]);
  });
});

describe("F9: CSV export is safe to open in a spreadsheet", () => {
  it("neutralises cells that could run as formulas", () => {
    for (const bad of ["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1"]) {
      expect(csvCell(bad).replace(/^"/, "")).toMatch(/^'/);
    }
    expect(csvCell("Computer Science")).toBe("Computer Science");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(-5)).toBe("'-5"); // a leading minus is still a formula risk, so it is escaped
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('say "hi", twice')).toBe('"say ""hi"", twice"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
  });

  it("builds a table with a header row and CRLF line endings", () => {
    const csv = toCsv([{ a: "x", b: "=boom" }], [{ key: "a", header: "A" }, { key: "b", header: "B" }]);
    expect(csv).toBe("A,B\r\nx,'=boom\r\n");
  });
});
