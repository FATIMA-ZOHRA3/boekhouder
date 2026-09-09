import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/auth";

// Pilier 2 — Sécurité / Permissions
//
// Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported function `proxy`, not
// `middleware`) and made it run on the Node.js runtime unconditionally — the Edge runtime
// is no longer an option for it (see https://nextjs.org/docs/app/guides/upgrading/version-16).
// That's actually convenient here: `@/lib/prisma` uses `@prisma/adapter-pg` (node-postgres,
// raw TCP sockets), which would NOT have worked in the old Edge-only middleware. No
// `experimental.nodeMiddleware` flag is needed — it's the default and only mode in v16.
//
// This only protects PAGES (so a client can no longer even see the bookkeeper/admin shell
// by typing the URL, which was previously possible — see Pilier 2 audit). It does not
// replace the per-route `requirePermission()` checks in the API layer; those still run and
// are the actual data-access guard. This is a defense-in-depth / UX layer on top.
//
// CORS for the dev-only mobile-web client is handled in next.config.ts's headers()
// instead of here — Route Handlers auto-generate their own OPTIONS response for
// preflight requests, and that response doesn't reliably pick up headers added here.

const SESSION_COOKIE = "boekhouder_session";
const SESSION_INACTIVITY_MS = 30 * 60 * 1000; // must match src/lib/auth.ts

const PROTECTED_PREFIXES: { prefix: string; allowed: Role[] }[] = [
  { prefix: "/admin", allowed: ["admin"] },
  { prefix: "/bookkeeper", allowed: ["bookkeeper", "admin"] },
  { prefix: "/client", allowed: ["client", "bookkeeper", "admin"] },
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const match = PROTECTED_PREFIXES.find((p) => pathname.startsWith(p.prefix));
  if (!match) return NextResponse.next();

  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { select: { role: true } } },
  });

  if (!session || Date.now() - session.lastActivity.getTime() > SESSION_INACTIVITY_MS) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  const role = (session.user?.role as Role) ?? "client";
  if (!match.allowed.includes(role)) {
    return NextResponse.redirect(new URL("/403", request.url));
  }

  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/admin/:path*", "/bookkeeper/:path*", "/client/:path*"],
};