import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Tenant ID / agreement uploads go through server actions
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
