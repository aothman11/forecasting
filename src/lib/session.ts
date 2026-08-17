/**
 * Server-only session management — cookie read/write.
 * Import this only in Server Components, Server Actions, and Route Handlers.
 * For Edge-safe JWT crypto use src/lib/crypto.ts directly.
 */
import "server-only";
import { cookies } from "next/headers";
import { encrypt, decrypt, type SessionPayload } from "./crypto";

export type { SessionPayload };

const COOKIE_NAME = "awp_session";
const COOKIE_MAX_AGE_DAYS = 7;

export async function createSession(user: {
  id: string;
  email: string;
  name: string;
  role: string;
}): Promise<void> {
  const expiresAt = Date.now() + COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const token = await encrypt({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return decrypt(token);
}

export { COOKIE_NAME };
