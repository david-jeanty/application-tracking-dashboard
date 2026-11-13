import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { isAgentOwner } from "@/lib/agent/owner";
import {
  AGENT_SERVER_INSTRUCTIONS,
  registerAgentTools,
  type AgentRepositoryFactory,
  type AgentServices,
} from "@/lib/mcp/agent-tools";
import { MCP_SERVER_INSTRUCTIONS } from "@/lib/mcp/instructions";
import {
  registerJobTrackTools,
  type JobTrackRepositoryFactory,
} from "@/lib/mcp/tools";
import { readUserId } from "@/lib/mcp/user";

/**
 * Which MCP server a verified request is served by.
 *
 * `standard` is Interndex as every student knows it: the five tracker tools and
 * the server instructions in `lib/mcp/instructions.ts`, byte for byte.
 *
 * `agent` is the same five tools plus the recruiting agent's tools and the
 * agent instructions, and it is only ever chosen for the `OWNER_USER_ID`
 * account. The choice is made per request from the verified access token,
 * because `mcp-handler` builds a fresh server for every request but never
 * tells the server's setup code who is calling. So the route keeps one
 * handler per kind and sends each request to the right one.
 */
export type McpServerKind = "standard" | "agent";

export function selectMcpServerKind(
  authInfo: AuthInfo | undefined,
  environment: Record<string, string | undefined> = process.env,
): McpServerKind {
  return isAgentOwner(readUserId(authInfo), environment) ? "agent" : "standard";
}

export const MCP_INSTRUCTIONS_BY_KIND: Readonly<Record<McpServerKind, string>> =
  {
    standard: MCP_SERVER_INSTRUCTIONS,
    agent: AGENT_SERVER_INSTRUCTIONS,
  };

export type McpServerDependencies = {
  jobTrack: JobTrackRepositoryFactory;
  agent: AgentRepositoryFactory;
  /** resume.lol and headless Chrome, used only by the agent's resume tools. */
  agentServices: AgentServices;
};

/** Registers the tools one kind of server offers. Used by the route and tests. */
export function configureMcpServer(
  server: McpServer,
  kind: McpServerKind,
  dependencies: McpServerDependencies,
): void {
  registerJobTrackTools(server, dependencies.jobTrack);
  if (kind === "agent") {
    registerAgentTools(server, dependencies.agent, dependencies.agentServices);
  }
}
