import type { NextConfig } from "next";
import path from "path";

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? "http://127.0.0.1:7001";
const assetOrigin = process.env.NEXT_PUBLIC_ASSET_ORIGIN;

function buildRemotePatterns() {
  const defaults = [
    {
      protocol: "http" as const,
      hostname: "localhost",
      port: "8001",
      pathname: "/images/**",
    },
  ];

  if (!assetOrigin) {
    return defaults;
  }

  const url = new URL(assetOrigin);
  const pathnamePrefix = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");

  return [
    ...defaults,
    {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      port: url.port,
      pathname: `${pathnamePrefix}/**` || "/**",
    },
  ];
}

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  images: {
    remotePatterns: buildRemotePatterns(),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
