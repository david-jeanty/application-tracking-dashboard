import { proxyTokenRequest } from "@/lib/oauth/upstream";

// Never cached: the body carries a single-use authorization code.
export const dynamic = "force-dynamic";

/**
 * Compatibility alias for MCP clients that synthesize `/token` on the resource
 * origin. Proxies the exchange to Supabase, which mints every token.
 */
export function POST(request: Request): Promise<Response> {
  return proxyTokenRequest(request);
}
