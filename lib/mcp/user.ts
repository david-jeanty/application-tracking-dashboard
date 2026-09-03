import type { AuthInfo } from "@modelcontextprotocol/server";

/**
 * The authenticated user id carried on a verified MCP request.
 *
 * It is read from the access token by Supabase Auth, never from tool
 * arguments. No MCP tool accepts a `user_id` parameter, so a caller cannot
 * ask to act as somebody else.
 *
 * This lives apart from `lib/mcp/identity.ts` because that module reaches
 * Supabase and is server-only, while reading the id off a verified request is
 * pure — which is what lets the tool registration itself be unit-tested.
 *
 * `authDurationMs` rides along for latency instrumentation: how long the
 * token verification in `lib/mcp/identity.ts` took, measured there because
 * that is the only place doing the work. It is a duration, never anything
 * about the token or the user, so it carries no confidentiality concern.
 */
export type McpUserExtra = { userId: string; authDurationMs?: number };

export function readUserId(authInfo: AuthInfo | undefined): string | null {
  const extra = authInfo?.extra as McpUserExtra | undefined;
  return extra?.userId ?? null;
}
