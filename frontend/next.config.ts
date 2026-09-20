import type { NextConfig } from "next";

// Where the NestJS backend actually lives. The browser never talks to this
// directly — see the rewrite below — so CORS and port mismatches cannot
// break the app in development.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  /* config options here */
  // Set empty turbopack config to silence the webpack/Turbopack conflict warning
  turbopack: {},

  // Proxy every /api/* request to the backend from the Next.js server.
  // Requests become same-origin in the browser, so there is no CORS
  // preflight and no dependence on the backend port being reachable
  // from the user's browser.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
