import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Google service-account key is read from the filesystem at runtime in a
  // server-only module; keep it out of any client bundle. Nothing extra needed here yet.

  // Emit a self-contained server bundle (.next/standalone) so the Docker image
  // for Cloud Run stays small and starts fast.
  output: "standalone",
};

export default nextConfig;
