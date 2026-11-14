import type { NextConfig } from "next";

// The browser talks to this Next server; /api is proxied to the FastAPI backend,
// so case documents never leave the machine the two run on.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  async rewrites() {
    const target = process.env.BACKEND_URL ?? "http://127.0.0.1:8100";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;
