import { NextResponse } from "next/server";
import { z } from "zod";
import { demoMode } from "@/lib/config";
import { HttpError, jsonError, parseWith, readJson } from "@/lib/http";
import { guard } from "@/lib/guard";
import { PERSONAS } from "@/lib/personas";
import { createSessionToken, sessionCookie } from "@/lib/session";

const Body = z.object({ personaId: z.string().max(60) });

/** One-click demo sign-in. Only available while DEMO_MODE is on. */
export async function POST(req: Request) {
  try {
    await guard(req, { roles: "PUBLIC", scope: "login", rate: { limit: 20, windowMs: 60_000 } });
    if (!demoMode()) throw new HttpError(403, "Demo sign-in is switched off on this deployment.");

    const { personaId } = parseWith(Body, await readJson(req));
    const persona = PERSONAS.find((p) => p.id === personaId);
    if (!persona) throw new HttpError(400, "Unknown demo persona.");

    const res = NextResponse.json({ success: true, persona: { id: persona.id, role: persona.role, name: persona.name, home: persona.home } });
    res.headers.append("Set-Cookie", sessionCookie(await createSessionToken(persona)));
    return res;
  } catch (err) {
    return jsonError(err, "Sign-in failed");
  }
}
