const TOKEN = "0UUoWVBWZMpsfGBPztaeA6QxqnqEfVJ_LetY7jO_-nA";

/**
 * OpenAI apps domain verification challenge.
 *
 * Served at `/.well-known/openai-apps-challenge` through a rewrite in
 * `next.config.ts` (see the `oauth-protected-resource` route for why this
 * lives under `/api` rather than directly in `app/.well-known`). Returned as
 * a Response built by hand, rather than a static file, so no
 * `Content-Disposition` header gets attached — Vercel adds one to static
 * files without an extension, which some verifiers reject.
 */
export function GET() {
  return new Response(TOKEN, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
