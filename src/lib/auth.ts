/**
 * Authentication helpers — user store (data/users.json) read/write.
 * Server-only: never imported by client components.
 */
import "server-only";
import fs from "fs";
import path from "path";
import { compare, hash } from "bcryptjs";

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  password: string; // bcrypt hash
  role: string;
  active: boolean;
}

const USERS_FILE = path.join(process.cwd(), "data", "users.json");

export function loadUsers(): StoredUser[] {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")) as StoredUser[];
  } catch {
    return [];
  }
}

export function saveUsers(users: StoredUser[]): void {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

/** Verify credentials and return the sanitised user (no password). */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<{ id: string; name: string; email: string; role: string } | null> {
  const users = loadUsers();
  const user = users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase().trim() && u.active
  );
  if (!user) return null;
  const ok = await compare(password, user.password);
  if (!ok) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/** Hash a plain-text password (bcrypt, cost 10). */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, 10);
}

/** Generate a simple numeric ID not already in the list. */
export function nextId(users: StoredUser[]): string {
  const max = users.reduce((m, u) => Math.max(m, parseInt(u.id, 10) || 0), 0);
  return String(max + 1);
}
