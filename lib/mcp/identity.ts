import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/server";
import type { McpUserExtra } from "@/lib/mcp/user";
import { createBearerClient } from "@/lib/supabase/bearer";

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
