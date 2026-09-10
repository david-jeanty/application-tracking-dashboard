import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      // These routes handle credentials or authorization decisions and have
      // no reason to be framed by another site, so they get an explicit
      // clickjacking defense. Not applied site-wide: most routes (including
      // /privacy and /auth/callback) have no such need.
      {
        source: "/oauth/consent",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      {
        source: "/login",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      {
        source: "/signup",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      {
        source: "/settings",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
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
      // OpenAI apps domain verification. Handled by a route handler instead
      // of a static file so we control the response headers exactly —
      // Vercel adds a `content-disposition: inline; filename=...` header to
      // extensionless static files, which some verifiers reject.
      {
        source: "/.well-known/openai-apps-challenge",
        destination: "/api/openai-apps-challenge",
      },
    ];
  },
};

export default nextConfig;
