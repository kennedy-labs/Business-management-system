import type { NextConfig } from "next";

// Ensure BACKEND_URL has a valid protocol if provided
const rawBackend = process.env.BACKEND_URL?.trim();
const BACKEND_URL = rawBackend
  ? rawBackend.startsWith("http://") || rawBackend.startsWith("https://")
    ? rawBackend
    : `https://${rawBackend}`
  : undefined;

// Only proxy to external backend if USE_REMOTE_BACKEND is explicitly true.
// Otherwise, Next.js internal API route handlers handle requests locally with seeded in-memory store.
const USE_REMOTE_BACKEND = process.env.USE_REMOTE_BACKEND === "true";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "*.run.app",
    "ais-dev-ntsdwnl4k6ta5sjsc4qlbk-263355470755.europe-west2.run.app",
    "ais-pre-ntsdwnl4k6ta5sjsc4qlbk-263355470755.europe-west2.run.app",
    "localhost",
    "localhost:3000",
    "localhost:8080",
    "127.0.0.1",
    "127.0.0.1:3000",
  ],
  output: "standalone",
  turbopack: {},
  devIndicators: false,

  async redirects() {
    return [
      {
        source: "/worker/shift/:path*",
        destination: "/worker",
        permanent: false,
      },
    ];
  },

  async rewrites() {
    if (!USE_REMOTE_BACKEND || !BACKEND_URL) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
