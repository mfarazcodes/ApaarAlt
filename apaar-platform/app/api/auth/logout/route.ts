import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { jsonError } from "@/lib/http";
import { clearedCookie } from "@/lib/session";

export async function POST(req: Request) {
  try {
    await guard(req, { roles: "PUBLIC", scope: "logout" });
    const res = NextResponse.json({ success: true });
    res.headers.append("Set-Cookie", clearedCookie());
    return res;
  } catch (err) {
    return jsonError(err, "Sign-out failed");
  }
}
