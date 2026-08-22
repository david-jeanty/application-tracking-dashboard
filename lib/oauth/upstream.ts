import { getPublicEnvironment } from "@/lib/env";

/**
 * Compatibility aliases for MCP clients that ignore our authorization server.
 *
 * Supabase is the real OAuth 2.1 authorization server. We advertise it
 * correctly in the RFC 9728 protected-resource metadata served at
 * `/.well-known/oauth-protected-resource`.
 *
 * Claude's custom connector currently ignores that `authorization_servers`
 * value and instead synthesizes `/authorize` (and potentially `/token`) on the
 * MCP resource origin. These aliases forward such requests to Supabase so the
 * flow completes. Nothing about the authorization model changes: Supabase
 * still issues every token, validates every redirect URI, and remains the sole
 * identity authority. This file introduces no secret and no new trust.
 *
 * Remove these once the client honours the metadata.
 */

export const UPSTREAM_AUTHORIZE_PATH = "/auth/v1/oauth/authorize";
export const UPSTREAM_TOKEN_PATH = "/auth/v1/oauth/token";

/**
 * Builds an upstream URL from the *configured* Supabase origin.
 *
 * Only the origin of the trusted environment value is used, so neither a path
 * nor a query smuggled into configuration — and nothing at all from the
 * incoming request — can move the destination to another host.
 */
export function buildUpstreamUrl(
  supabaseUrl: string,
  path: string,
  search = "",
): string {
  const { origin } = new URL(supabaseUrl);
  const query = !search || search.startsWith("?") ? search : `?${search}`;

  return `${origin}${path}${query}`;
}

export function upstreamAuthorizeUrl(search = ""): string {
  return buildUpstreamUrl(
    getPublicEnvironment().NEXT_PUBLIC_SUPABASE_URL,
    UPSTREAM_AUTHORIZE_PATH,
    search,
  );
}

export function upstreamTokenUrl(): string {
  return buildUpstreamUrl(
    getPublicEnvironment().NEXT_PUBLIC_SUPABASE_URL,
    UPSTREAM_TOKEN_PATH,
  );
}

/**
 * Redirects an authorization request to Supabase with its query string intact.
 *
 * The query is copied verbatim rather than parsed: `state`, `code_challenge`,
 * `redirect_uri`, `resource`, and any parameter added by a future revision of
 * the spec must reach Supabase exactly as the client sent them, or PKCE and
 * state validation break. `redirect_uri` is passed through unexamined by
 * design — Supabase validates it against the registered client, which is where
 * that check belongs.
 */
export function authorizeRedirectResponse(request: Request): Response {
  const { search } = new URL(request.url);

  return new Response(null, {
    status: 302,
    headers: {
      Location: upstreamAuthorizeUrl(search),
      // An authorization request carries single-use state and PKCE values.
      "Cache-Control": "no-store",
    },
  });
}

/** Request headers that are meaningful to a token exchange. */
const FORWARDED_REQUEST_HEADERS = ["content-type", "authorization", "accept"];

/**
 * Server-side proxy for the token exchange.
 *
 * A redirect cannot be used here: token requests are POSTs whose body carries
 * the authorization code and PKCE verifier, and clients are not required to
 * replay a body across a cross-origin redirect.
 *
 * Nothing in this function logs. The request body holds an authorization code
 * and `code_verifier`; the response holds access and refresh tokens. Headers
 * are copied through an allowlist so cookies and forwarding headers are never
 * relayed upstream.
 */
export async function proxyTokenRequest(
  request: Request,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const body = await request.text();

  let upstream: Response;
  try {
    upstream = await fetchImpl(upstreamTokenUrl(), {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    // Deliberately opaque: the caught error can quote the request body.
    return new Response(
      JSON.stringify({
        error: "temporarily_unavailable",
        error_description: "The authorization server could not be reached.",
      }),
      {
        status: 502,
        headers: {
          "content-type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const responseHeaders = new Headers({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  });
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}
