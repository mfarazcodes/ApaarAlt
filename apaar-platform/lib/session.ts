import { SignJWT, jwtVerify } from "jose";
import { isProduction, requireSecret } from "./config";
import { PERSONAS, type Persona, type Role } from "./personas";

export const SESSION_COOKIE = "apaar_session";
const MAX_AGE_SECONDS = 8 * 60 * 60;

export interface Session {
  personaId: string;
  role: Role;
  name: string;
  studentId?: string;
  verifierId?: string;
}

// Development fallback only. requireSecret throws a ConfigError outside development and test.
const DEV_SESSION_SECRET = "dev-only-session-secret-not-for-production-use";
const key = () => new TextEncoder().encode(requireSecret("SESSION_SECRET", DEV_SESSION_SECRET));

export async function createSessionToken(persona: Persona): Promise<string> {
  const claims: Session = { personaId: persona.id, role: persona.role, name: persona.name, studentId: persona.studentId, verifierId: persona.verifierId };
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key());
}

/** Null for a missing, forged or expired token. The persona is re-read from code, so a token cannot add powers. */
export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const persona = PERSONAS.find((p) => p.id === payload.personaId);
    if (!persona) return null;
    return { personaId: persona.id, role: persona.role, name: persona.name, studentId: persona.studentId, verifierId: persona.verifierId };
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export const sessionFromRequest = (req: Request) => verifySessionToken(readCookie(req.headers.get("cookie"), SESSION_COOKIE));

const base = () => `Path=/; HttpOnly; SameSite=Lax${isProduction() ? "; Secure" : ""}`;
export const sessionCookie = (token: string) => `${SESSION_COOKIE}=${token}; ${base()}; Max-Age=${MAX_AGE_SECONDS}`;
export const clearedCookie = () => `${SESSION_COOKIE}=; ${base()}; Max-Age=0`;
