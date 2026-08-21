import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [
      // RFC 9728 discovery for the MCP endpoint. Clients request either the
      // bare path or the path with the protected resource appended, so both
      // forms resolve to the same metadata handler.
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth-protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/oauth-protected-resource",
      },
    ];
  },
};

export default nextConfig;
