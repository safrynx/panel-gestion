import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a build run next to a live `next dev` without fighting over .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@libsql/client", "libsql"]
};

export default nextConfig;
