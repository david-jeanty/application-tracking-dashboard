import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/server";
import { verifyBearerToken } from "@/lib/auth/bearer-identity";
import type { McpUserExtra } from "@/lib/mcp/user";

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
  const identity = await verifyBearerToken(bearerToken);
  if (!identity) return undefined;

  return {
    token: identity.token,
    clientId: identity.clientId,
    // Supabase OAuth scopes control ID-token contents, not database access.
    // Authorization comes from row-level security, so no scope is required.
    scopes: [],
    extra: { userId: identity.userId } satisfies McpUserExtra,
  };
}
