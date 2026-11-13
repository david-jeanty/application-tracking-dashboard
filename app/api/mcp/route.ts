import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifySupabaseAccessToken } from "@/lib/mcp/identity";
import { createSupabaseAgentRepository } from "@/lib/mcp/agent-repository";
import { createSupabaseJobTrackRepository } from "@/lib/mcp/repository";
import {
  configureMcpServer,
  MCP_INSTRUCTIONS_BY_KIND,
  selectMcpServerKind,
  type McpServerKind,
} from "@/lib/mcp/servers";
import { getResourceOrigin } from "@/lib/supabase/bearer";

export const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

const dependencies = {
  jobTrack: createSupabaseJobTrackRepository,
  agent: createSupabaseAgentRepository,
};

// The tools themselves live in `lib/mcp/tools.ts` and `lib/mcp/agent-tools.ts`
// so the registration the route serves is the one the tests exercise. This
// route decides two things: which data access the tools get (the RLS-protected
// repositories, bound to the identity carried by the verified access token),
// and which server a request is served by.
//
// There are two servers. `standard` is Interndex as every student knows it.
// `agent` adds the recruiting agent's tools and instructions, and is served
// only to the `OWNER_USER_ID` account (`lib/mcp/servers.ts`). `mcp-handler`
// builds a fresh server per request but never tells its setup code who is
// calling, so the route keeps one handler per kind and picks between them
// after the token is verified.
function handlerFor(kind: McpServerKind) {
  return createMcpHandler(
    (server) => configureMcpServer(server, kind, dependencies),
    {
      serverInfo: { name: "interndex", version: "0.1.0" },
      // Forwarded verbatim to the underlying `McpServer`'s `initialize` result.
      // See `lib/mcp/instructions.ts` for why this exists and what it is for.
      instructions: MCP_INSTRUCTIONS_BY_KIND[kind],
    },
  );
}

const handlers: Record<McpServerKind, (request: Request) => Promise<Response>> = {
  standard: handlerFor("standard"),
  agent: handlerFor("agent"),
};

/** `withMcpAuth` attaches the verified identity to the request as `auth`. */
function dispatch(request: Request): Promise<Response> {
  const authInfo = (request as Request & { auth?: AuthInfo }).auth;
  return handlers[selectMcpServerKind(authInfo)](request);
}

// Every request must present a Supabase-issued access token. Unauthenticated
// requests get a 401 carrying `WWW-Authenticate` with the resource metadata
// URL, which is how an MCP client discovers where to send the user to sign in.
const authenticatedHandler = withMcpAuth(dispatch, verifySupabaseAccessToken, {
  required: true,
  resourceMetadataPath: RESOURCE_METADATA_PATH,
  // Advertise the configured public origin rather than trusting forwarding
  // headers, so the discovery URL cannot be pointed elsewhere by a request.
  resourceUrl: getResourceOrigin(),
});

export { authenticatedHandler as GET, authenticatedHandler as POST };
