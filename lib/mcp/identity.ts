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
  // Timed regardless of outcome: `supabase.auth.getUser` is a network round
  // trip to Supabase Auth on every call, success or failure, and that round
  // trip is the dominant cost of authenticating an MCP request. The duration
  // travels onward on the returned `extra` so a tool call can report it
  // alongside its own timing without this function logging anything itself —
  // it stays exactly as silent on every path as it was before.
  const authStartedAt = performance.now();
  const identity = await verifyBearerToken(bearerToken);
  const authDurationMs = performance.now() - authStartedAt;
  if (!identity) return undefined;

  return {
    token: identity.token,
    clientId: identity.clientId,
    // Supabase OAuth scopes control ID-token contents, not database access.
    // Authorization comes from row-level security, so no scope is required.
    scopes: [],
    extra: { userId: identity.userId, authDurationMs } satisfies McpUserExtra,
  };
}
