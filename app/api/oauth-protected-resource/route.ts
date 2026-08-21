import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from "mcp-handler";
import {
  getAuthorizationServerUrl,
  getMcpResourceUrl,
} from "@/lib/supabase/bearer";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728).
 *
 * This tells an MCP client that our `/api/mcp` endpoint is protected, and that
 * the authorization server able to issue tokens for it is our Supabase
 * project. The client follows that pointer to Supabase's own discovery
 * document, registers itself, and sends the user to our consent screen.
 *
 * Served at `/.well-known/oauth-protected-resource` through a rewrite in
 * `next.config.ts`, because a directory named `.well-known` inside `app/` is
 * not reliably routed.
 */
const handler = protectedResourceHandler({
  authServerUrls: [getAuthorizationServerUrl()],
  // The MCP endpoint is the protected resource, not the site root.
  resourceUrl: getMcpResourceUrl(),
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
