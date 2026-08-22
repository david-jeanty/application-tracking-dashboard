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
 */
export type McpUserExtra = { userId: string };

export function readUserId(authInfo: AuthInfo | undefined): string | null {
  const extra = authInfo?.extra as McpUserExtra | undefined;
  return extra?.userId ?? null;
}
