import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { MCP_SERVER_INSTRUCTIONS } from "@/lib/mcp/instructions";
import { verifySupabaseAccessToken } from "@/lib/mcp/identity";
import { createSupabaseJobTrackRepository } from "@/lib/mcp/repository";
import { registerJobTrackTools } from "@/lib/mcp/tools";
import { getResourceOrigin } from "@/lib/supabase/bearer";

export const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

// The tools themselves live in `lib/mcp/tools.ts` so the same registration the
// route serves is the one the tests exercise. All this route decides is which
// data access those tools get: the RLS-protected repository, bound to the
// identity carried by the verified access token.
const handler = createMcpHandler(
  (server) => registerJobTrackTools(server, createSupabaseJobTrackRepository),
  {
    serverInfo: { name: "interndex", version: "0.1.0" },
    // Forwarded verbatim to the underlying `McpServer`'s `initialize` result —
    // see `lib/mcp/instructions.ts` for why this exists and what it is for.
    instructions: MCP_SERVER_INSTRUCTIONS,
  },
);

// Every request must present a Supabase-issued access token. Unauthenticated
// requests get a 401 carrying `WWW-Authenticate` with the resource metadata
// URL, which is how an MCP client discovers where to send the user to sign in.
const authenticatedHandler = withMcpAuth(handler, verifySupabaseAccessToken, {
  required: true,
  resourceMetadataPath: RESOURCE_METADATA_PATH,
  // Advertise the configured public origin rather than trusting forwarding
  // headers, so the discovery URL cannot be pointed elsewhere by a request.
  resourceUrl: getResourceOrigin(),
});

export { authenticatedHandler as GET, authenticatedHandler as POST };
