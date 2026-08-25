import "server-only";

import { createBearerClient } from "@/lib/supabase/bearer";

export type BearerIdentity = {
  token: string;
  userId: string;
  clientId: string;
  supabase: ReturnType<typeof createBearerClient>;
};

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
    clientId:
      typeof data.user.app_metadata?.client_id === "string"
        ? data.user.app_metadata.client_id
        : "unknown",
    supabase,
  };
}

/** Authenticates the bearer credential carried by an ordinary HTTP request. */
export function authenticateBearerRequest(request: Request) {
  return verifyBearerToken(readBearerToken(request));
}
