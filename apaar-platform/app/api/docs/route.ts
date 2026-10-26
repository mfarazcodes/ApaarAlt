import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { jsonError } from "@/lib/http";
import { openApiDocument } from "@/lib/openapi";

/** The OpenAPI description of the public API. Public: it documents the interface, not any data. */
export async function GET(req: Request) {
  try {
    await guard(req, { roles: "PUBLIC", scope: "docs" });
    return NextResponse.json(openApiDocument(new URL(req.url).origin));
  } catch (err) {
    return jsonError(err);
  }
}
