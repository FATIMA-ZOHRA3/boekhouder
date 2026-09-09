import type { NextConfig } from "next";

// Dev-only CORS so the mobile app (mobile/) can talk to this backend when
// run as a web page via `expo start --web` (typically http://localhost:8081).
// On a real phone there's no browser and no CORS restriction applies — this
// only matters for local web testing, so it's skipped entirely in
// production. Handled here (Route Handlers via next.config headers()) rather
// than in proxy.ts, because Route Handlers auto-generate their own OPTIONS
// response for CORS preflight requests, and that response doesn't reliably
// pick up headers added in proxy.ts.
const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    if (!isDev) return [];
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "http://localhost:8081" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;