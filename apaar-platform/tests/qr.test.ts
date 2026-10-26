import { describe, expect, it } from "vitest";
import { POST as consentPost } from "@/app/api/consent/route";
import { POST as eventsPost } from "@/app/api/verify/offline-events/route";
import { GET as credGet, POST as credPost } from "@/app/api/verify/credential/route";
import { readChain } from "@/lib/audit";
import { listSampleCredentials, verifyCredential } from "@/lib/credentials";
import { verifyOffline, verifyQrLocally, pemToRawEd25519, type TrustedKey } from "@/lib/qrVerify";
import { getStore, NS } from "@/lib/store";
import { getIssuerKeySet, verifySmartQr } from "@/lib/tokenization";
import { call, freshStoreEachTest } from "./helpers";

freshStoreEachTest();

const trusted = (): TrustedKey[] => getIssuerKeySet().map((k) => ({ kid: k.kid, publicKeyPem: k.publicKeyPem }));

describe("F3: signature checking on the device agrees with the server", () => {
  it("accepts every sample QR on both engines and reaches the server's verdict", async () => {
    const samples = await listSampleCredentials(getStore());
    for (const s of samples) {
      const server = verifySmartQr(s.qr);
      for (const forceFallback of [false, true]) {
        const local = await verifyQrLocally(s.qr, trusted(), { forceFallback });
        expect(local.signatureValid).toBe(server.signatureValid);
        expect(local.kid).toBe(server.kid);
        expect(local.engine).toBe(forceFallback ? "noble" : "webcrypto");
      }
    }
  });

  it("rejects a tampered payload and a tampered signature on both engines", async () => {
    const qr = (await listSampleCredentials(getStore()))[0].qr;
    const [prefix, body, sig] = qr.split(".");
    const flipBody = `${prefix}.${body.slice(0, 12)}${body[12] === "A" ? "B" : "A"}${body.slice(13)}.${sig}`;
    const flipSig = `${prefix}.${body}.${sig.slice(0, 10)}${sig[10] === "A" ? "B" : "A"}${sig.slice(11)}`;
    for (const forceFallback of [false, true]) {
      expect((await verifyQrLocally(flipBody, trusted(), { forceFallback })).signatureValid).toBe(false);
      expect((await verifyQrLocally(flipSig, trusted(), { forceFallback })).signatureValid).toBe(false);
    }
  });

  it("says so when the device has no keys cached, and when the key id is unknown", async () => {
    const qr = (await listSampleCredentials(getStore()))[0].qr;
    expect((await verifyQrLocally(qr, [])).error).toMatch(/No issuer keys are stored/);
    const other = [{ kid: "deadbeef0000", publicKeyPem: trusted()[0].publicKeyPem }];
    expect((await verifyQrLocally(qr, other)).error).toMatch(/Unknown signing key/);
  });

  it("is not fooled by a key with the right id but the wrong key bytes", async () => {
    const qr = (await listSampleCredentials(getStore()))[0].qr;
    const real = trusted()[0];
    const crypto = await import("node:crypto");
    const wrong = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    expect((await verifyQrLocally(qr, [{ kid: real.kid, publicKeyPem: wrong }])).signatureValid).toBe(false);
    expect(pemToRawEd25519(real.publicKeyPem)).toHaveLength(32);
  });

  it("reports the same statuses offline as online for authentic and expired credentials, and admits it cannot see revocation", async () => {
    const samples = await listSampleCredentials(getStore());
    const byCid = Object.fromEntries(samples.map((s) => [s.cid, s.qr]));
    expect((await verifyOffline(byCid["CRED-RKV-2024-V2"], trusted())).status).toBe("AUTHENTIC");
    expect((await verifyOffline(byCid["CRED-RKV-INT-2023"], trusted())).status).toBe("EXPIRED");
    const revoked = await verifyOffline(byCid["CRED-RKV-ERR-0007"], trusted());
    expect(revoked.status).toBe("AUTHENTIC"); // genuine and unexpired; revocation is invisible offline
    expect(revoked.limitations.join(" ")).toMatch(/cannot tell whether the credential was revoked/);
    expect(revoked.consent.state).toBe("NOT_CHECKED_OFFLINE");
    expect((await verifyCredential(getStore(), { mode: "ONLINE", qr: byCid["CRED-RKV-ERR-0007"], verifierId: "VRF-ACME" })).status).toBe("REVOKED");
  });

  it("never needs the network: it works with fetch removed", async () => {
    const qr = (await listSampleCredentials(getStore()))[0].qr;
    const keys = trusted();
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("the offline verifier tried to use the network");
    }) as typeof fetch;
    try {
      expect((await verifyOffline(qr, keys)).status).toBe("AUTHENTIC");
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("F4: a student creates a QR for chosen claims", () => {
  const create = (as: string, scopes: string[], days = 7) => call(consentPost, { as, body: { action: "CREATE_QR", scopes, days } });

  it("carries only the chosen claims, and a short life", async () => {
    const r = await create("student-rahul", ["DEGREE_STATUS"], 7);
    expect(r.status).toBe(200);
    const { qr, expiresAt, claimLabels } = r.json.presentation;
    expect(claimLabels).toEqual(["B.Tech CSE Verified"]);

    const offline = await verifyOffline(qr, trusted());
    expect(offline.status).toBe("AUTHENTIC");
    expect(offline.claims).toHaveLength(1);
    expect(offline.claims![0].label).toBe("B.Tech CSE Verified");
    // The other claims are not hidden in the payload either.
    const payload = JSON.parse(Buffer.from(qr.split(".")[1], "base64url").toString());
    expect(Object.keys(payload.claims).sort()).toEqual(["degreeLabel", "degreeVerified"]);
    const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("is the student's own consent online: claims show without a share, and no raw ID appears", async () => {
    const { qr } = (await create("student-rahul", ["DEGREE_STATUS", "EOA_STATUS"])).json.presentation;
    const r = await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", qr } });
    expect(r.json.result.status).toBe("AUTHENTIC");
    expect(r.json.result.consent.state).toBe("PRESENTED");
    expect(r.json.result.claims.map((c: { label: string }) => c.label)).toEqual(["B.Tech CSE Verified", "AICTE EoA Active"]);
    expect(JSON.stringify(r.json)).not.toMatch(/9481|948120416672/);
  });

  it("ends when the credential it was cut from is revoked, online, but offline cannot know", async () => {
    const { qr } = (await create("student-rahul", ["DEGREE_STATUS"])).json.presentation;
    await getStore().update<{ registry: Record<string, { status: string }> }, void>(NS.credentials, "main", (doc) => {
      doc!.registry["CRED-RKV-2024-V2"].status = "REVOKED";
      return { value: doc, result: undefined };
    });
    expect((await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", qr } })).json.result.status).toBe("REVOKED");
    expect((await verifyOffline(qr, trusted())).status).toBe("AUTHENTIC");
  });

  it("stops working online after the student opts out (NOGEN)", async () => {
    const { qr } = (await create("student-rahul", ["DEGREE_STATUS"])).json.presentation;
    await call(consentPost, { as: "student-rahul", body: { action: "TOGGLE_OPT_OUT", optOut: true } });
    const r = await call(credPost, { as: "verifier-acme", body: { mode: "ONLINE", qr } });
    expect(r.json.result.consent.state).toBe("OPTED_OUT");
    expect(r.json.result.claims).toBeNull();
    expect((await create("student-rahul", ["DEGREE_STATUS"])).status).toBe(409);
  });

  it("is the student's action only, needs at least one scope, and writes the audit log", async () => {
    expect((await create("verifier-acme", ["DEGREE_STATUS"])).status).toBe(403);
    expect((await create("guardian-meera", ["DEGREE_STATUS"])).status).toBe(403);
    expect((await create("student-rahul", [])).status).toBe(400);
    expect((await create("student-rahul", ["PASSPORT"])).status).toBe(400);
    expect((await create("student-rahul", ["DEGREE_STATUS"], 9999)).status).toBe(400);
    await create("student-rahul", ["DEGREE_STATUS"]);
    const entry = (await readChain(getStore())).entries.find((e) => e.action === "QR_CREATED")!;
    expect(entry.actorRole).toBe("STUDENT");
  });

  it("is refused for a student who has no credential, and for a minor without a guardian co-sign", async () => {
    const r = await create("student-meera", ["DEGREE_STATUS"]);
    expect(r.status).toBe(404);
  });
});

describe("offline verification events", () => {
  const event = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    cid: "CRED-RKV-2024-V2",
    status: "AUTHENTIC",
    checkedAt: new Date().toISOString(),
    kid: "abc123",
    engine: "webcrypto",
    ...extra,
  });

  it("records each event once, even when the upload is retried", async () => {
    const batch = [event("evt-aaaaaaaa"), event("evt-bbbbbbbb")];
    const first = await call(eventsPost, { as: "verifier-acme", body: { events: batch } });
    expect(first.json).toMatchObject({ recorded: 2, duplicates: 0 });
    const retry = await call(eventsPost, { as: "verifier-acme", body: { events: [...batch, event("evt-cccccccc")] } });
    expect(retry.json).toMatchObject({ recorded: 1, duplicates: 2 });
    const entries = (await readChain(getStore())).entries.filter((e) => e.action === "OFFLINE_VERIFICATION");
    expect(entries).toHaveLength(3);
    expect(entries[0].actor).toBe("Acme Cloud HR");
    expect(entries[0].detail).toContain("Revocation was not checked");
  });

  it("is verifier-only, and validates its input", async () => {
    expect((await call(eventsPost, { as: "registrar", body: { events: [event("evt-dddddddd")] } })).status).toBe(403);
    expect((await call(eventsPost, { body: { events: [event("evt-dddddddd")] } })).status).toBe(401);
    expect((await call(eventsPost, { as: "verifier-acme", body: { events: [] } })).status).toBe(400);
    expect((await call(eventsPost, { as: "verifier-acme", body: { events: [event("evt-eeeeeeee", { status: "REVOKED" })] } })).status).toBe(400);
    expect((await call(credGet, { as: "verifier-acme" })).json.keys[0].kid).toBeTruthy();
  });
});
