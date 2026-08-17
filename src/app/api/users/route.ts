/**
 * /api/users — CRUD for user management.
 * All endpoints require an authenticated admin session.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { loadUsers, saveUsers, hashPassword, nextId, type StoredUser } from "@/lib/auth";

async function verifyAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

// ── GET /api/users — list all users (sanitised) ───────────────────────────
export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const users = loadUsers().map(({ password: _pw, ...u }) => u);
  return NextResponse.json(users);
}

// ── POST /api/users — create a new user ───────────────────────────────────
export async function POST(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as Partial<StoredUser & { plainPassword: string }>;
  const { name, email, role, active = true, plainPassword } = body;

  if (!name || !email || !role || !plainPassword) {
    return NextResponse.json({ error: "name, email, role, and plainPassword are required." }, { status: 400 });
  }

  const users = loadUsers();
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
  }

  const newUser: StoredUser = {
    id: nextId(users),
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password: await hashPassword(plainPassword),
    role,
    active,
  };
  saveUsers([...users, newUser]);
  const { password: _pw, ...safe } = newUser;
  return NextResponse.json(safe, { status: 201 });
}

// ── PUT /api/users — update an existing user ──────────────────────────────
export async function PUT(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as Partial<StoredUser & { plainPassword: string }>;
  const { id, name, email, role, active, plainPassword } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const updated = { ...users[idx] };
  if (name !== undefined) updated.name = name.trim();
  if (email !== undefined) updated.email = email.toLowerCase().trim();
  if (role !== undefined) updated.role = role;
  if (active !== undefined) updated.active = active;
  if (plainPassword) updated.password = await hashPassword(plainPassword);

  users[idx] = updated;
  saveUsers(users);
  const { password: _pw, ...safe } = updated;
  return NextResponse.json(safe);
}

// ── DELETE /api/users — soft-delete (active=false) ────────────────────────
export async function DELETE(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await req.json() as { id: string };
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Soft delete — never erase users permanently
  users[idx] = { ...users[idx], active: false };
  saveUsers(users);
  return NextResponse.json({ ok: true });
}
