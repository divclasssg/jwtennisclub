import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  outputFileTracingIncludes: {
    "/reports/monthly": [
      "src/features/reports/fonts/IBMPlexSansKR-Regular.ttf",
    ],
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
