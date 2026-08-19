import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure data/ files (users.json) are included in serverless traces.
  outputFileTracingIncludes: {
    "/**": ["./data/**"],
  },
};

export default nextConfig;
