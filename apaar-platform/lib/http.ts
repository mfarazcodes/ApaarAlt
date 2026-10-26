import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";

/** An error that maps to an HTTP status. Route handlers turn it into a JSON response. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

export const DEFAULT_BODY_LIMIT = 64 * 1024;

/** Reads a JSON body with a size cap. A bad or oversized body is a 400 or 413, never a 500. */
export async function readJson(req: Request, maxBytes = DEFAULT_BODY_LIMIT): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new HttpError(413, `Request body is larger than ${Math.round(maxBytes / 1024)} KB.`);

  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, `Request body is larger than ${Math.round(maxBytes / 1024)} KB.`);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
}

export function zodMessage(error: ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((i) => `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`)
    .join("; ");
}

/** Validates `value` against a schema, throwing a 400 HttpError with a readable message. */
export function parseWith<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, zodMessage(result.error));
  return result.data;
}

export function jsonError(error: unknown, fallback = "Request failed") {
  if (error instanceof HttpError) {
    return NextResponse.json({ success: false, error: error.message, ...error.extra }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}
