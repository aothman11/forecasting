/**
 * Next.js middleware (compatibility shim for Vercel deployment).
 * Next.js 16 renamed this to proxy.ts, but Vercel's build infrastructure
 * still requires middleware.ts. This file is the canonical auth guard.
 *
 * Intentionally imports ONLY from src/lib/crypto (pure jose, Edge-safe).
 * Never imports server-only session.ts or auth.ts here.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/crypto";

// Must match COOKIE_NAME in src/lib/session.ts — kept in sync manually
const COOKIE_NAME = "awp_session";

// Paths that don't require authentication
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/_next", "/favicon.ico"];

// Static file extensions — never redirect these
const STATIC_EXT = /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf|css|js|map)$/i;

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow static assets
  if (STATIC_EXT.test(pathname)) return NextResponse.next();

  // Always allow the AI chat API (intentionally left unprotected)
  if (pathname.startsWith("/api/chat")) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = await decrypt(token);

  // ── /login ────────────────────────────────────────────────────────────
  if (pathname === "/login") {
    // Already authenticated → bounce to app
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // ── Other public paths ─────────────────────────────────────────────────
  if (isPublic(pathname)) return NextResponse.next();

  // ── Protected routes ──────────────────────────────────────────────────
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── /admin/* — require admin role ─────────────────────────────────────
  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on every request; individual checks above handle static exclusions
  matcher: ["/((?!_next/static|_next/image).*)"],
};
