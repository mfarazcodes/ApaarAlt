import { NextResponse } from "next/server";
import { demoMode } from "@/lib/config";
import { guard } from "@/lib/guard";
import { jsonError } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const { session } = await guard(req, { roles: "PUBLIC", scope: "me" });
    return NextResponse.json({
      success: true,
      session: session ? { personaId: session.personaId, role: session.role, name: session.name } : null,
      demoMode: demoMode(),
    });
  } catch (err) {
    return jsonError(err);
  }
}
