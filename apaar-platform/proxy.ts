import { NextResponse, type NextRequest } from "next/server";
import { PAGE_ACCESS } from "@/lib/personas";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Gates the three portals by role before anything renders. This is a convenience for users: the API routes
 * enforce the same rules themselves, so a request that skips the proxy still gets a 401 or 403.
 */
export async function proxy(req: NextRequest) {
  const base = `/${req.nextUrl.pathname.split("/")[1]}` as keyof typeof PAGE_ACCESS;
  const allowed = PAGE_ACCESS[base];
  if (!allowed) return NextResponse.next();

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const login = new URL("/login", req.url);
  login.searchParams.set("next", base);

  if (!session) return NextResponse.redirect(login);
  if (!allowed.includes(session.role)) {
    login.searchParams.set("denied", base);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/student/:path*", "/admin/:path*", "/employer/:path*"] };
