import { requireAdmin } from "@/lib/dal";
import { loadUsers } from "@/lib/auth";
import UsersClient from "./UsersClient";

export const metadata = { title: "User Management — AWP COP" };

export default async function UsersPage() {
  // Enforces admin role — redirects to / otherwise
  await requireAdmin();

  // Load users server-side; strip password hashes before passing to client
  const users = loadUsers().map(({ password: _pw, ...u }) => u);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <UsersClient initialUsers={users} />
    </div>
  );
}
