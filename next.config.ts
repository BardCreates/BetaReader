import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Manuscripts can be large; allow uploads up to 10 MB through server actions.
    serverActions: { bodySizeLimit: "10mb" },
  },
  serverExternalPackages: ["mammoth"],
};

export default nextConfig;
