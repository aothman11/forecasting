import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure data/users.json is bundled into every serverless function.
  // Next.js output-file tracing follows static `import` / `require` chains only;
  // dynamic fs.readFileSync calls (auth.ts loadUsers) are invisible to the
  // tracer and the file would be missing on Vercel without this explicit inclusion.
  outputFileTracingIncludes: {
    "/**": ["./data/**"],
  },
};

export default nextConfig;
