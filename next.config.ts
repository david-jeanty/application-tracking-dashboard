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
  async headers() {
    return [
      // The file has no extension, so Vercel's static server would otherwise
      // serve it as application/octet-stream, which some domain-verification
      // fetchers refuse to read as text.
      {
        source: "/.well-known/openai-apps-challenge",
        headers: [
          {
            key: "Content-Type",
            value: "text/plain; charset=utf-8",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
