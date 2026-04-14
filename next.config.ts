import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ['sharp', 'playwright-core', '@react-pdf/renderer', 'prisma'],
};

export default nextConfig;
