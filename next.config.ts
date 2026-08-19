import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native Node.js addon (.node binary).
  // Next.js bundles server code with webpack by default, which cannot handle
  // native modules. Adding it here tells Next.js to leave it as a real
  // `require()` call so Node loads the .node file at runtime.
  serverExternalPackages: ["better-sqlite3"],

  // Ensure data/ files (users.json, plans.db) are included in serverless traces.
  outputFileTracingIncludes: {
    "/**": ["./data/**"],
  },
};

export default nextConfig;
