import "server-only";

import { createBearerClient } from "@/lib/supabase/bearer";

export type BearerIdentity = {
  token: string;
  userId: string;
  clientId: string;
  supabase: ReturnType<typeof createBearerClient>;
};

/**
 * What `clientId` reads for a verified token that names no OAuth client: a
 * password or session login used directly as a bearer credential.
 */
export const NO_OAUTH_CLIENT = "unknown";

/**
 * Reads one strict RFC 6750-style bearer credential from a request.
 *
 * A missing header, a different authentication scheme, an empty token, or a
 * credential containing whitespace is unusable. The token is never logged or
 * copied into an error response.
 */
export function readBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization) return undefined;

  return /^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
}

/**
 * The OAuth client a Supabase-issued access token was issued to, or
 * `undefined` when the token was not issued through the OAuth server.
 *
 * Supabase Auth's OAuth 2.1 server writes the client's id into the access
 * token as a top-level `client_id` claim (`AccessTokenClaims.ClientID` in
 * supabase/auth's `internal/tokens/service.go`), and a password or session
 * login carries none. It is never in `app_metadata`: that claim, like the
 * `app_metadata` on the user `getUser` returns, is the user's own metadata
 * row, which knows nothing about which client a token was minted for. This is
 * the same claim `public.is_oauth_client_session()` reads through
 * `auth.jwt()` in Postgres.
 *
 * Only ever called with the exact token string Supabase Auth has just
 * verified, so decoding the payload here without checking the signature again
 * widens no trust: a forged or altered token never reaches this function,
 * because `getUser` refused it first. The value is identity metadata for
 * telemetry, not an input to any authorization decision; those are made by
 * row-level security, from the same claim, inside the database.
 */
function readClientIdClaim(verifiedToken: string): string | undefined {
  const segments = verifiedToken.split(".");
  if (segments.length !== 3) return undefined;

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(segments[1], "base64url").toString("utf8"),
    );
    if (typeof payload !== "object" || payload === null) return undefined;

    const clientId = (payload as { client_id?: unknown }).client_id;
    return typeof clientId === "string" && clientId.length > 0
      ? clientId
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Verifies a Supabase-issued access token and returns its one authenticated
 * identity together with the same token-scoped client that performed the
 * check. Callers use that client for database work so RLS evaluates as the
 * token's user; no service-role key or JWT signing secret is involved.
 */
export async function verifyBearerToken(
  bearerToken?: string,
): Promise<BearerIdentity | undefined> {
  if (!bearerToken) return undefined;

  const supabase = createBearerClient(bearerToken);
  const { data, error } = await supabase.auth.getUser(bearerToken);

  if (error || !data.user) return undefined;

  return {
    token: bearerToken,
    userId: data.user.id,
    clientId: readClientIdClaim(bearerToken) ?? NO_OAUTH_CLIENT,
    supabase,
  };
}

/** Authenticates the bearer credential carried by an ordinary HTTP request. */
export function authenticateBearerRequest(request: Request) {
  return verifyBearerToken(readBearerToken(request));
}
