import { NextResponse } from "next/server";
import { configReport } from "@/lib/config";
import { guard } from "@/lib/guard";
import { jsonError } from "@/lib/http";

/** Which settings are present. Booleans only, never values. The UI uses it to show a banner instead of a 500. */
export async function GET(req: Request) {
  try {
    await guard(req, { roles: "PUBLIC", scope: "health" });
    const report = configReport();
    return NextResponse.json({ success: true, ...report }, { status: report.ok ? 200 : 503 });
  } catch (err) {
    return jsonError(err);
  }
}
