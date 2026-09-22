import type { NextConfig } from "next";

const buildTimestamp = new Date().toISOString();

const nextConfig: NextConfig = {
  generateBuildId: async () => process.env.VERCEL_GIT_COMMIT_SHA ?? buildTimestamp.replace(/[^0-9]/g, ""),
  env: {
    NEXT_PUBLIC_BUILD_TIMESTAMP: buildTimestamp,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
