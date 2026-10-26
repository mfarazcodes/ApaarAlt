import { afterEach, describe, expect, it } from "vitest";
import { GET as auditGet, POST as auditPost } from "@/app/api/audit/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as consentGet, POST as consentPost } from "@/app/api/consent/route";
import { GET as healthGet } from "@/app/api/health/route";
import { POST as certIn } from "@/app/api/security/cert-in/route";
import { POST as syncPost, GET as syncGet } from "@/app/api/sync/aicte-nad/route";
import { GET as credGet, POST as credPost } from "@/app/api/verify/credential/route";
import { GET as fuzzyGet, POST as fuzzyPost } from "@/app/api/verify/fuzzy-match/route";
import { appendAudit, readChain } from "@/lib/audit";
import { getStore, NS } from "@/lib/store";
import { SESSION_COOKIE } from "@/lib/session";
import { call, freshStoreEachTest } from "./helpers";

freshStoreEachTest();

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("S1: every route needs a session, and the right role", () => {
  it("answers 401 with no cookie", async () => {
    expect((await call(consentGet)).status).toBe(401);
    expect((await call(consentPost, { body: { action: "TOGGLE_OPT_OUT", optOut: true } })).status).toBe(401);
    expect((await call(syncGet)).status).toBe(401);
    expect((await call(syncPost, { body: { action: "SYNC", csvText: "a,b\n1,2" } })).status).toBe(401);
    expect((await call(fuzzyGet)).status).toBe(401);
    expect((await call(auditGet)).status).toBe(401);
    expect((await call(credGet)).status).toBe(401);
    expect((await call(certIn, { body: { action: "TOKENIZE", rawId: "x" } })).status).toBe(401);
  });

  it("answers 401 for a forged or tampered cookie", async () => {
    expect((await call(consentGet, { cookie: `${SESSION_COOKIE}=not.a.jwt` })).status).toBe(401);
    const real = (await import("./helpers")).cookieFor;
    const good = await real("student-rahul");
    const tampered = good.slice(0, -4) + "AAAA";
    expect((await call(consentGet, { cookie: tampered })).status).toBe(401);
  });

  it("does not let a token name a persona that does not exist", async () => {
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ personaId: "root", role: "AICTE" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("dev-only-session-secret-not-for-production-use"));
    expect((await call(syncGet, { cookie: `${SESSION_COOKIE}=${token}` })).status).toBe(401);
  });

  it("keeps each role to its own surface", async () => {
    expect((await call(consentGet, { as: "registrar" })).status).toBe(403);
    expect((await call(consentGet, { as: "verifier-acme" })).status).toBe(403);
    expect((await call(syncGet, { as: "student-rahul" })).status).toBe(403);
    expect((await call(syncGet, { as: "verifier-acme" })).status).toBe(403);
    expect((await call(credGet, { as: "registrar" })).status).toBe(403);
    expect((await call(auditGet, { as: "student-rahul" })).status).toBe(403);
    expect((await call(fuzzyGet, { as: "verifier-acme" })).status).toBe(403);
  });

  it("lets a verifier ask for consent but never answer it", async () => {
    const open = await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", apaarId: "948120416672" } });
    const holderToken = open.json.result.holderToken as string;
    const req = await call(consentPost, { as: "verifier-acme", body: { action: "REQUEST_ACCESS", holderToken } });
    expect(req.status).toBe(200);
    const self = await call(consentPost, { as: "verifier-acme", body: { action: "RESPOND_REQUEST", requestId: req.json.request.requestId, approve: true } });
    expect(self.status).toBe(403);
    const grant = await call(consentPost, { as: "verifier-acme", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME" } });
    expect(grant.status).toBe(403);
  });

  it("stops a student from asking for access on a verifier's behalf", async () => {
    const r = await call(consentPost, { as: "student-rahul", body: { action: "REQUEST_ACCESS", holderToken: "x" } });
    expect(r.status).toBe(403);
  });
});

describe("S2: the audit actor comes from the session, never the body", () => {
  it("ignores an actor and role the caller tries to supply", async () => {
    const r = await call(consentPost, {
      as: "student-rahul",
      body: { action: "GRANT_SHARE", verifierId: "VRF-ACME", actor: "GUARDIAN (Sunita S.)", actorRole: "GUARDIAN" },
    });
    expect(r.status).toBe(200);
    const { entries } = await readChain(getStore());
    const granted = entries.find((e) => e.action === "SHARE_GRANTED")!;
    expect(granted.actorRole).toBe("STUDENT");
    expect(granted.actor).toBe("Rahul K.V.");
    expect(JSON.stringify(entries)).not.toContain("Sunita");
  });

  it("records the phone simulator as the simulator, not as the student", async () => {
    const open = await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", apaarId: "948120416672" } });
    const holderToken = open.json.result.holderToken;
    const req = await call(consentPost, { as: "verifier-acme", body: { action: "REQUEST_ACCESS", holderToken } });
    const { POST: phone } = await import("@/app/api/demo/phone/route");
    const ok = await call(phone, { as: "verifier-acme", body: { action: "REPLY", holderToken, requestId: req.json.request.requestId, approve: true, via: "SMS" } });
    expect(ok.status).toBe(200);
    const granted = (await readChain(getStore())).entries.find((e) => e.action === "SHARE_GRANTED")!;
    expect(granted.actorRole).toBe("DEMO_SIMULATOR");
  });

  it("switches the phone simulator off outside demo mode", async () => {
    process.env.DEMO_MODE = "false";
    const { POST: phone } = await import("@/app/api/demo/phone/route");
    const r = await call(phone, { as: "verifier-acme", body: { action: "REPLY", holderToken: "x", requestId: "REQ-001", approve: true } });
    expect(r.status).toBe(404);
  });
});

describe("S3 / S14: input is validated, and bad input is a 400", () => {
  it("rejects an unknown purpose instead of inventing one", async () => {
    const r = await call(consentPost, { as: "student-rahul", body: { action: "UPDATE_PURPOSE", purpose: "sellMyData", allow: true } });
    expect(r.status).toBe(400);
    const ledger = (await call(consentGet, { as: "student-rahul" })).json.ledger;
    expect(Object.keys(ledger.purposes)).toEqual(["abcCreditSync", "aicteEnrolmentCount", "employerVerification", "behavioralTracking"]);
  });

  it("refuses behavioural tracking and logs the attempt (Section 9(3))", async () => {
    const r = await call(consentPost, { as: "student-rahul", body: { action: "UPDATE_PURPOSE", purpose: "behavioralTracking", allow: true } });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/9\(3\)/);
    const { entries } = await readChain(getStore());
    expect(entries.some((e) => e.action === "BEHAVIORAL_TRACKING_BLOCKED")).toBe(true);
    expect((await call(consentGet, { as: "student-rahul" })).json.ledger.purposes.behavioralTracking).toBe(false);
  });

  it("answers 400, not 500, for a missing field", async () => {
    const r = await call(fuzzyPost, { as: "registrar", body: { action: "MATCH", erp: { dob: "2004-01-01", source: "ERP" }, digilocker: {} } });
    expect(r.status).toBe(400);
    expect(r.json.error).toBeTruthy();
  });

  it("answers 400 for invalid JSON and 413 for an oversized body", async () => {
    expect((await call(consentPost, { as: "student-rahul", rawBody: "{not json" })).status).toBe(400);
    const big = JSON.stringify({ action: "RAISE_DISPUTE", field: "x", reason: "y".repeat(100_000) });
    expect((await call(consentPost, { as: "student-rahul", rawBody: big })).status).toBe(413);
  });

  it("rejects out-of-range numbers", async () => {
    const r = await call(consentPost, { as: "student-rahul", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME", days: 99999 } });
    expect(r.status).toBe(400);
  });

  it("refuses a cross-site write even with a valid cookie", async () => {
    const r = await call(consentPost, {
      as: "student-rahul",
      body: { action: "TOGGLE_OPT_OUT", optOut: true },
      headers: { origin: "https://evil.example", host: "localhost" },
    });
    expect(r.status).toBe(403);
    expect((await call(consentGet, { as: "student-rahul" })).json.ledger.apaarStatus).toBe("ACTIVE");
  });
});

describe("S8: rate limiting is real", () => {
  it("answers 429 with Retry-After once a session passes its write limit", async () => {
    let last = { status: 0, headers: new Headers() };
    for (let i = 0; i < 70; i++) last = await call(consentPost, { as: "student-rahul", body: { action: "UPDATE_PURPOSE", purpose: "abcCreditSync", allow: true } });
    expect(last.status).toBe(429);
    expect(Number(last.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("limits sign-in attempts per IP", async () => {
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await call(login, { body: { personaId: "nobody" }, headers: { "x-forwarded-for": "9.9.9.9" } })).status;
    expect(last).toBe(429);
  });
});

describe("S5 / S9: government IDs", () => {
  it("never returns a raw ID, and returns no HMAC, when tokenizing", async () => {
    const r = await call(certIn, { as: "registrar", body: { action: "TOKENIZE", rawId: "2345 6789 0123", idType: "AADHAAR" } });
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.json);
    expect(text).not.toMatch(/2345|6789|0123/);
    expect(r.json.tokenized.maskedDisplay).toBe("[Aadhaar Redacted]");
    expect(r.json.tokenized.hmacSignature).toBeUndefined();
  });

  it("is registrar-only, and a client-chosen salt changes nothing", async () => {
    expect((await call(certIn, { as: "aicte", body: { action: "TOKENIZE", rawId: "x" } })).status).toBe(403);
    const a = await call(certIn, { as: "registrar", body: { action: "TOKENIZE", rawId: "234567890123", salt: "A" } });
    const b = await call(certIn, { as: "registrar", body: { action: "TOKENIZE", rawId: "234567890123", salt: "B" } });
    expect(a.json.tokenized.vaultToken).toBe(b.json.tokenized.vaultToken);
  });

  it("drops an apaar_id column on upload and never echoes it back", async () => {
    const csv = "roll_no,student_name,apaar_id,sub_cd,subj_desc,cr_reg,marks_obt\n2023-CS-777,Test,948120416672,CS1,Prog,4,88";
    const preview = await call(syncPost, { as: "registrar", body: { action: "PREVIEW", csvText: csv } });
    expect(preview.status).toBe(200);
    const sync = await call(syncPost, { as: "registrar", body: { action: "SYNC", csvText: csv } });
    expect(sync.status).toBe(200);
    expect(JSON.stringify(preview.json) + JSON.stringify(sync.json)).not.toContain("948120416672");
    expect(JSON.stringify((await call(syncGet, { as: "registrar" })).json)).not.toContain("948120416672");
    expect(preview.json.mapping.mappings.find((m: { source: string }) => m.source === "apaar_id").method).toBe("government-id");
  });

  it("does not embed an APAAR number in any sample ABC id", async () => {
    const r = await call(syncGet, { as: "registrar" });
    expect(r.json.sampleMessyCsv).not.toMatch(/9481|7318/);
  });
});

describe("S6: configuration problems are a clear 503, not a crash", () => {
  it("names the missing settings in production", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    delete process.env.VAULT_PEPPER;
    delete process.env.SESSION_SECRET;
    delete process.env.ISSUER_PRIVATE_KEY_PEM;
    const r = await call(healthGet);
    expect(r.status).toBe(503);
    expect(r.json.missing).toEqual(["VAULT_PEPPER", "SESSION_SECRET", "ISSUER_PRIVATE_KEY_PEM"]);
    expect(JSON.stringify(r.json)).not.toMatch(/dev-only/);
  });

  it("refuses to sign in or tokenize without the secrets, with a 503", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    delete process.env.SESSION_SECRET;
    const r = await call(login, { body: { personaId: "registrar" } });
    expect(r.status).toBe(503);
    expect(r.json.code).toBe("CONFIG_MISSING");
    expect(r.json.missing).toContain("SESSION_SECRET");
  });

  it("reports health as ok in development without secrets", async () => {
    const r = await call(healthGet);
    expect(r.status).toBe(200);
    expect(r.json.store).toBe("memory");
  });
});

describe("S11: reading never writes", () => {
  it("adds no audit entries when the ledger is read, even with a lapsed share, and logs the expiry on the next write", async () => {
    await call(consentPost, { as: "student-rahul", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME", days: 1 } });
    const store = getStore();
    // Age the share so it has lapsed.
    await store.update<{ shares: { expiresAt: string }[] }, void>(NS.consent, "STU-RKV", (cur) => {
      cur!.shares[0].expiresAt = new Date(Date.now() - 1000).toISOString();
      return { value: cur, result: undefined };
    });
    const before = (await readChain(store)).entries.length;
    const view = await call(consentGet, { as: "student-rahul" });
    await call(consentGet, { as: "student-rahul" });
    expect(view.json.ledger.shares[0].status).toBe("EXPIRED");
    expect((await readChain(store)).entries.length).toBe(before);

    await call(consentPost, { as: "student-rahul", body: { action: "UPDATE_PURPOSE", purpose: "abcCreditSync", allow: true } });
    const entries = (await readChain(store)).entries;
    expect(entries.filter((e) => e.action === "SHARE_EXPIRED")).toHaveLength(1);
    await call(consentPost, { as: "student-rahul", body: { action: "UPDATE_PURPOSE", purpose: "abcCreditSync", allow: true } });
    expect((await readChain(store)).entries.filter((e) => e.action === "SHARE_EXPIRED")).toHaveLength(1);
  });
});

describe("S10: minor status comes from the date of birth", () => {
  it("blocks a minor's grants until the guardian co-signs, and the student cannot switch it off", async () => {
    const blocked = await call(consentPost, { as: "student-meera", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME" } });
    expect(blocked.status).toBe(403);
    expect(blocked.json.error).toMatch(/9\(1\)/);

    // There is no SET_MINOR action to call.
    expect((await call(consentPost, { as: "student-meera", body: { action: "SET_MINOR", isMinor: false } })).status).toBe(400);
    // A student cannot co-sign for themselves.
    expect((await call(consentPost, { as: "student-meera", body: { action: "GUARDIAN_COSIGN", sign: true } })).status).toBe(403);

    expect((await call(consentPost, { as: "guardian-meera", body: { action: "GUARDIAN_COSIGN", sign: true } })).status).toBe(200);
    expect((await call(consentPost, { as: "student-meera", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME" } })).status).toBe(200);

    // Withdrawing the guardian's consent ends the share.
    await call(consentPost, { as: "guardian-meera", body: { action: "GUARDIAN_COSIGN", sign: false } });
    const ledger = (await call(consentGet, { as: "student-meera" })).json.ledger;
    expect(ledger.shares[0].status).toBe("REVOKED");
    expect(ledger.guardian.coSign).toBe("PENDING");
  });

  it("does not require a co-sign for an adult, and a guardian cannot act for one", async () => {
    expect((await call(consentPost, { as: "student-rahul", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME" } })).status).toBe(200);
    expect((await call(consentPost, { as: "student-rahul", body: { action: "GUARDIAN_COSIGN", sign: true } })).status).toBe(403);
  });
});

describe("credential verification keeps consent per student and per verifier", () => {
  async function holder() {
    return (await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", apaarId: "948120416672" } })).json.result.holderToken as string;
  }

  it("withholds claims until the student allows it, shows only boolean claims, and withholds again after revocation", async () => {
    const samples = (await call(credGet, { as: "verifier-acme" })).json.samples;
    const qr = samples[0].qr as string;
    const first = await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", qr } });
    expect(first.json.result.status).toBe("AUTHENTIC");
    expect(first.json.result.claims).toBeNull();

    await call(consentPost, { as: "student-rahul", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME", scopes: ["DEGREE_STATUS"], days: 7 } });
    const allowed = await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", qr } });
    expect(allowed.json.result.claims).toHaveLength(1); // only the scope the student chose
    expect(allowed.json.result.claims[0].value).toBe(true);
    expect(allowed.json.result.identity).toBe("[Aadhaar Redacted]");

    // A different verifier does not inherit the first one's consent.
    const other = await call(credPost, { as: "verifier-finserve", body: { mode: "ONLINE", qr } });
    expect(other.json.result.claims).toBeNull();

    const shareId = allowed.json.result.consent.shareId;
    await call(consentPost, { as: "student-rahul", body: { action: "REVOKE_SHARE", shareId } });
    expect((await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", qr } })).json.result.claims).toBeNull();
  });

  it("pauses an active share when the employer-verification switch is off", async () => {
    const qr = (await call(credGet, { as: "verifier-acme" })).json.samples[0].qr as string;
    await call(consentPost, { as: "student-rahul", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME" } });
    await call(consentPost, { as: "student-rahul", body: { action: "UPDATE_PURPOSE", purpose: "employerVerification", allow: false } });
    expect((await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", qr } })).json.result.claims).toBeNull();
    const ledger = (await call(consentGet, { as: "student-rahul" })).json.ledger;
    expect(ledger.shares[0].status).toBe("ACTIVE");
    expect(ledger.shares[0].effective).toBe(false); // shown as paused in the wallet
  });

  it("uses the verifier from the session, so a body cannot pose as another verifier", async () => {
    await call(consentPost, { as: "student-rahul", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME" } });
    const qr = (await call(credGet, { as: "verifier-finserve" })).json.samples[0].qr as string;
    const r = await call(credPost, { as: "verifier-finserve", body: { mode: "ONLINE", qr, verifierId: "VRF-ACME" } });
    expect(r.json.result.claims).toBeNull();
  });

  it("reports each status, an unknown key, and never echoes an APAAR ID", async () => {
    const samples = (await call(credGet, { as: "verifier-acme" })).json.samples as { qr: string; expected: string }[];
    for (const s of samples) {
      const r = await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", qr: s.qr } });
      expect(r.json.result.status).toBe(s.expected);
    }
    const body = Buffer.from(samples[0].qr.split(".")[1], "base64url").toString();
    const forged = samples[0].qr.split(".");
    forged[1] = Buffer.from(body.replace(/"kid":"[^"]+"/, '"kid":"deadbeef0000"')).toString("base64url");
    const unknown = await call(credPost, { as: "verifier-acme", body: { mode: "OFFLINE", qr: forged.join(".") } });
    expect(unknown.json.result.status).toBe("INVALID_SIGNATURE");
    expect(unknown.json.result.detail).toMatch(/Unknown signing key/);

    const byId = await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", apaarId: "9481-2041-6672" } });
    expect(JSON.stringify(byId.json)).not.toMatch(/9481|948120416672/);
  });

  it("answers NOT_FOUND for an APAAR ID with no credential", async () => {
    const r = await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", apaarId: "111122223333" } });
    expect(r.json.result.status).toBe("NOT_FOUND");
    await holder();
  });
});

describe("NOGEN", () => {
  it("revokes every share, blocks new ones, and issues a receipt tied to an audit entry", async () => {
    await call(consentPost, { as: "student-rahul", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME" } });
    const r = await call(consentPost, { as: "student-rahul", body: { action: "TOGGLE_OPT_OUT", optOut: true } });
    expect(r.json.receipt.sharesRevoked).toBe(1);
    const { entries } = await readChain(getStore());
    const optOut = entries.find((e) => e.action === "OPT_OUT_NOGEN")!;
    expect(r.json.receipt.auditHash).toBe(optOut.sha256Hash);
    expect((await call(consentPost, { as: "student-rahul", body: { action: "GRANT_SHARE", verifierId: "VRF-ACME" } })).status).toBe(409);
  });
});

describe("S12: the audit chain head is signed", () => {
  async function seed() {
    const store = getStore();
    for (let i = 0; i < 4; i++) {
      await appendAudit(store, { type: "SYSTEM", subject: "SYSTEM", action: `EVENT_${i}`, actorRole: "SYSTEM", actor: "test", detail: `entry ${i}` });
    }
    return store;
  }

  it("verifies an intact log and shows the head's key id", async () => {
    await seed();
    const r = await call(auditGet, { as: "aicte" });
    expect(r.json.chain.valid).toBe(true);
    expect(r.json.chain.head).toBe("valid");
    expect(r.json.chain.headKid).toBeTruthy();
  });

  it("catches an altered entry, an altered actor, and a log cut short", async () => {
    await seed();
    const { entries } = (await call(auditGet, { as: "aicte" })).json;

    const edited = structuredClone(entries);
    edited[1].detail = "never happened";
    expect((await call(auditPost, { as: "aicte", body: { action: "VERIFY", entries: edited } })).json.chain.valid).toBe(false);

    const actor = structuredClone(entries);
    actor[2].actor = "someone else";
    expect((await call(auditPost, { as: "aicte", body: { action: "VERIFY", entries: actor } })).json.chain.valid).toBe(false);

    // The hashes are still consistent after cutting the tail, so only the signed head can catch this.
    const cut = entries.slice(0, 2);
    const hashesOnly = await call(auditPost, { as: "aicte", body: { action: "VERIFY", entries: cut, checkHead: false } });
    expect(hashesOnly.json.chain.valid).toBe(true);
    const withHead = await call(auditPost, { as: "aicte", body: { action: "VERIFY", entries: cut, checkHead: true } });
    expect(withHead.json.chain.valid).toBe(false);
    expect(withHead.json.chain.head).toBe("mismatch");
  });

  it("catches a log whose every hash was recomputed, because the head cannot be re-signed", async () => {
    const store = await seed();
    const { computeEntryHash, GENESIS_HASH } = await import("@/lib/audit");
    await store.update<{ entries: any[]; head: any }, void>(NS.audit, "main", (doc) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      doc!.entries[1].detail = "rewritten";
      let prev = GENESIS_HASH;
      for (const e of doc!.entries) {
        e.previousHash = prev;
        e.sha256Hash = computeEntryHash(prev, e);
        prev = e.sha256Hash;
      }
      doc!.head.hash = prev; // an attacker can set the hash, but not a matching signature
      return { value: doc, result: undefined };
    });
    const r = await call(auditGet, { as: "aicte" });
    expect(r.json.chain.valid).toBe(false);
    expect(r.json.chain.head).toBe("invalid");
  });
});

describe("M7: registrar decisions are saved and audited", () => {
  it("persists a decision, records who made it, and refuses decisions that make no sense", async () => {
    const ok = await call(fuzzyPost, { as: "registrar", body: { action: "RESOLVE", caseId: "CASE-02", decision: "FIXED", reason: "Checked the Aadhaar copy" } });
    expect(ok.status).toBe(200);
    expect(ok.json.decision.suggestedFix).toContain("Mohammad Faraz");
    expect((await call(fuzzyGet, { as: "registrar" })).json.decisions["CASE-02"].decision).toBe("FIXED");

    const entry = (await readChain(getStore())).entries.find((e) => e.action === "FUZZY_FIXED")!;
    expect(entry.actorRole).toBe("REGISTRAR");
    expect(entry.detail).toContain("Checked the Aadhaar copy");

    expect((await call(fuzzyPost, { as: "registrar", body: { action: "RESOLVE", caseId: "CASE-06", decision: "ACCEPTED" } })).status).toBe(400); // already exact
    expect((await call(fuzzyPost, { as: "registrar", body: { action: "RESOLVE", caseId: "CASE-07", decision: "ACCEPTED" } })).status).toBe(400); // hard reject
    expect((await call(fuzzyPost, { as: "registrar", body: { action: "RESOLVE", caseId: "CASE-01", decision: "FIXED" } })).status).toBe(400); // not auto-fixable
    expect((await call(fuzzyPost, { as: "aicte", body: { action: "RESOLVE", caseId: "CASE-02", decision: "FIXED" } })).status).toBe(403);
  });

  it("gives the AICTE officer the summary but not the college's name queue", async () => {
    const r = await call(fuzzyGet, { as: "aicte" });
    expect(r.json.records).toEqual([]);
    expect(r.json.summary.totalRecords).toBeGreaterThan(0);
  });
});

describe("sync rules (B1, B5): the route enforces them", () => {
  const problem = "roll_no,student_name,sub_cd,subj_desc,cr_reg,marks_obt,max_marks\n2023-EC-062,Test,EC1,Signals,4,AB,100\n2023-EC-062,Test,EC2,Control,4,74,100";

  it("refuses a sync with unreadable rows until the registrar confirms, and writes nothing meanwhile", async () => {
    const refused = await call(syncPost, { as: "registrar", body: { action: "SYNC", csvText: problem } });
    expect(refused.status).toBe(400);
    expect(refused.json.blockingIssues).toHaveLength(1);
    const students = (await call(syncGet, { as: "registrar" })).json.syncedStudents as { studentRoll: string }[];
    expect(students.some((s) => s.studentRoll === "2023-EC-062")).toBe(false);

    const ok = await call(syncPost, { as: "registrar", body: { action: "SYNC", csvText: problem, acknowledgeIssues: true } });
    expect(ok.status).toBe(200);
    expect(ok.json.results[0].student.syncStatus).toBe("HELD_FOR_REVIEW");
    expect(ok.json.results[0].student.hasPriorRecord).toBe(false);
  });

  it("lets only a registrar sync, but lets a student use the calculators", async () => {
    expect((await call(syncPost, { as: "aicte", body: { action: "SYNC", csvText: problem } })).status).toBe(403);
    expect((await call(syncPost, { as: "student-rahul", body: { action: "PREVIEW", csvText: problem } })).status).toBe(403);
    expect((await call(syncPost, { as: "student-rahul", body: { action: "NEP_EXIT", earnedCredits: 128, vocationalCredits: 4 } })).status).toBe(200);
  });

  it("gives the AICTE officer compliance but no student records", async () => {
    const r = await call(syncGet, { as: "aicte" });
    expect(r.json.compliance.programmes.length).toBeGreaterThan(0);
    expect(r.json.syncedStudents).toBeUndefined();
  });

  it("records the sync and any grade change in the audit chain", async () => {
    const first = "roll_no,student_name,sub_cd,subj_desc,cr_reg,marks_obt\nR-9,Test,X1,Prog,4,70";
    const reval = "roll_no,student_name,sub_cd,subj_desc,cr_reg,marks_obt\nR-9,Test,X1,Prog,4,92";
    await call(syncPost, { as: "registrar", body: { action: "SYNC", csvText: first } });
    await call(syncPost, { as: "registrar", body: { action: "SYNC", csvText: reval } });
    const { entries } = await readChain(getStore());
    expect(entries.filter((e) => e.type === "NAD_SYNC")).toHaveLength(2);
    const change = entries.find((e) => e.type === "GRADE_CHANGE")!;
    expect(change.detail).toContain("X1: A to O");
    expect(change.actorRole).toBe("REGISTRAR");
  });

  it("returns 400 for an oversized sheet and a missing body", async () => {
    expect((await call(syncPost, { as: "registrar", body: { action: "SYNC" } })).status).toBe(400);
    const huge = "a,b\n" + "x,y\n".repeat(600_000);
    expect((await call(syncPost, { as: "registrar", rawBody: JSON.stringify({ action: "SYNC", csvText: huge }) })).status).toBe(413);
  });
});
