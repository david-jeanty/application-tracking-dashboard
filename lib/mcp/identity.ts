import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/server";
import { createBearerClient } from "@/lib/supabase/bearer";

/**
 * The authenticated user id carried on a verified MCP request.
 *
 * It is read from the access token by Supabase Auth, never from tool
 * arguments. No MCP tool accepts a `user_id` parameter, so a caller cannot
 * ask to act as somebody else.
 */
export type McpUserExtra = { userId: string };

export function readUserId(authInfo: AuthInfo | undefined): string | null {
  const extra = authInfo?.extra as McpUserExtra | undefined;
  return extra?.userId ?? null;
}

/**
 * Validates the bearer token presented by an MCP client.
 *
 * `supabase.auth.getUser(token)` asks Supabase Auth to verify the signature,
 * expiry, and revocation state of the token and to return its subject. A token
 * that fails any of those checks yields `undefined`, which `withMcpAuth` turns
 * into a 401 carrying the `WWW-Authenticate` header that tells the client where
 * to authenticate.
 */
export async function verifySupabaseAccessToken(
  _request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const supabase = createBearerClient(bearerToken);
  const { data, error } = await supabase.auth.getUser(bearerToken);

  if (error || !data.user) return undefined;

  return {
    token: bearerToken,
    // Supabase records the OAuth client on the token itself. Falling back to
    // "unknown" keeps a first-party session usable during local testing.
    clientId:
      typeof data.user.app_metadata?.client_id === "string"
        ? data.user.app_metadata.client_id
        : "unknown",
    // Supabase OAuth scopes control ID-token contents, not database access.
    // Authorization comes from row-level security, so no scope is required.
    scopes: [],
    extra: { userId: data.user.id } satisfies McpUserExtra,
  };
}
