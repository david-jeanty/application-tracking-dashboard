import { authorizeRedirectResponse } from "@/lib/oauth/upstream";

// Never cached: every authorization request carries fresh state and PKCE values.
export const dynamic = "force-dynamic";

/**
 * Compatibility alias for MCP clients that synthesize `/authorize` on the
 * resource origin instead of using the authorization server named in our
 * RFC 9728 metadata. Forwards to Supabase unchanged.
 */
export function GET(request: Request): Response {
  return authorizeRedirectResponse(request);
}
