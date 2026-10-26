import { NextResponse } from "next/server";
import { z } from "zod";
import { AUDIT_TYPES, listAudit, readChain, verifyChain, type AuditEntry, type AuditType } from "@/lib/audit";
import { getIssuerKeySet } from "@/lib/tokenization";
import { guard } from "@/lib/guard";
import { jsonError, parseWith, readJson } from "@/lib/http";

const ROLES = ["AICTE", "REGISTRAR"] as const;

const Query = z.object({
  type: z.enum(AUDIT_TYPES as [AuditType, ...AuditType[]]).optional(),
  subject: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** The unified audit log. Subjects are pseudonymous ids, never names or ID numbers. */
export async function GET(req: Request) {
  try {
    const { store } = await guard(req, { roles: [...ROLES], scope: "audit" });
    const url = new URL(req.url);
    const q = parseWith(Query, Object.fromEntries(url.searchParams));
    const { entries, total, chain } = await listAudit(store, q);
    const { head } = await readChain(store);
    return NextResponse.json({ success: true, entries, total, chain, head, types: AUDIT_TYPES, keys: getIssuerKeySet().map((k) => ({ kid: k.kid, status: k.status })) });
  } catch (err) {
    return jsonError(err, "Failed to read the audit log");
  }
}

const Entry = z.object({
  logId: z.string(), seq: z.number(), timestamp: z.string(), type: z.enum(AUDIT_TYPES as [AuditType, ...AuditType[]]),
  subject: z.string(), action: z.string(), actorRole: z.string(), actor: z.string(), detail: z.string(),
  purposeModified: z.string().optional(), newValue: z.boolean().optional(), previousHash: z.string(), sha256Hash: z.string(),
});

const Verify = z.object({
  action: z.literal("VERIFY"),
  /** A copy to check, for example a tampered one. Omit to check the stored log. */
  entries: z.array(Entry).max(1000).optional(),
  /** Also compare against the server's signed head, which catches a log that was cut short. */
  checkHead: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const { store } = await guard(req, { roles: [...ROLES], scope: "audit" });
    const body = parseWith(Verify, await readJson(req, 512 * 1024));
    const stored = await readChain(store);
    const entries = (body.entries ?? stored.entries) as AuditEntry[];
    return NextResponse.json({ success: true, chain: verifyChain(entries, body.checkHead ? stored.head : undefined) });
  } catch (err) {
    return jsonError(err, "Failed to verify the audit log");
  }
}
