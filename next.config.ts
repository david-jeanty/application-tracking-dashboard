import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      /*
        No page of this application may be framed by another site.

        This used to name four routes — /oauth/consent, /login, /signup and
        /settings — on the reasoning that they were the ones handling
        credentials or authorization decisions. Two things were wrong with
        that. `source` matches a path exactly, so /settings covered the
        settings page but not /settings/delete-account beneath it; and the
        routes it left uncovered include every one-click destructive control
        in the product — permanent deletion at /applications/[id]/delete,
        archive and restore on /applications and /archive, the quick status
        change on a detail page. Each is an ordinary form posting to a Server
        Action, and Server Actions' own origin check does not help here: a
        framed page posts to its own origin, so a click landing on a hidden
        frame is same-origin and succeeds.

        Site-wide is also simply the correct default. Nothing in Interndex is
        meant to be embedded anywhere, so the interesting list was never "the
        routes that need this" but "the routes that could do without it", and
        that list is empty.

        `frame-ancestors` alone, deliberately. A wider policy — script-src and
        the rest — is worth having and is not this change: it needs a
        report-only rollout first, because a CSP that breaks does so silently.
      */
      {
        source: "/:path*",
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
