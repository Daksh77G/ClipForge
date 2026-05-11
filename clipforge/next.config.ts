import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  // Increase API route body size limit
  async headers() {
    return [];
  },
};

export default nextConfig;