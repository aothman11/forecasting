/**
 * Seed default users into data/users.json.
 * Run once: node scripts/seed-users.js
 *
 * Re-running is safe — overwrites any existing file.
 */
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const DEFAULTS = [
  { id: "1", name: "Admin",               email: "admin@awp.com",       password: "Admin@2024",   role: "admin",               active: true },
  { id: "2", name: "Sales Planner",        email: "sales@awp.com",       password: "Sales@2024",   role: "sales_planner",       active: true },
  { id: "3", name: "Processing Planner",   email: "processing@awp.com",  password: "Process@2024", role: "processing_planner",  active: true },
  { id: "4", name: "Broiler Planner",      email: "broiler@awp.com",     password: "Broiler@2024", role: "broiler_planner",     active: true },
];

async function main() {
  const users = await Promise.all(
    DEFAULTS.map(async (u) => ({
      ...u,
      password: await bcrypt.hash(u.password, 10),
    }))
  );

  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, "users.json");
  fs.writeFileSync(file, JSON.stringify(users, null, 2), "utf-8");

  console.log("✅  Seeded data/users.json with 4 default users:");
  DEFAULTS.forEach((u) =>
    console.log(`   ${u.email.padEnd(26)} → ${u.password.padEnd(14)}  [${u.role}]`)
  );
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
