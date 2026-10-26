import { NextResponse } from "next/server";
import { z } from "zod";
import { listAllDisputes, resolveDispute } from "@/lib/consentEngine";
import { actorOf, guard } from "@/lib/guard";
import { jsonError, parseWith, readJson } from "@/lib/http";

const Body = z.object({
  action: z.literal("RESOLVE"),
  studentId: z.string().max(30),
  ticketId: z.string().max(20),
  decision: z.enum(["RESOLVED", "REJECTED"]),
  resolution: z.string().trim().min(3, "Give a reason the student will see.").max(500),
});

/** The registrar's dispute inbox. Students raise tickets in their wallet; only the registrar can close them. */
export async function GET(req: Request) {
  try {
    const { store } = await guard(req, { roles: ["REGISTRAR"], scope: "disputes" });
    const disputes = await listAllDisputes(store);
    return NextResponse.json({ success: true, disputes, open: disputes.filter((d) => d.status === "OPEN").length });
  } catch (err) {
    return jsonError(err, "Failed to load disputes");
  }
}

export async function POST(req: Request) {
  try {
    const { session, store } = await guard(req, { roles: ["REGISTRAR"], scope: "disputes" });
    const body = parseWith(Body, await readJson(req));
    const dispute = await resolveDispute(store, body.studentId, body.ticketId, body.decision, body.resolution, actorOf(session!));
    return NextResponse.json({ success: true, dispute });
  } catch (err) {
    return jsonError(err, "Failed to update the dispute");
  }
}
