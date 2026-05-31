import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Google service-account key is read from the filesystem at runtime in a
  // server-only module; keep it out of any client bundle. Nothing extra needed here yet.
};

export default nextConfig;
