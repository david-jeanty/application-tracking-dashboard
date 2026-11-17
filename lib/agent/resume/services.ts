import "server-only";

import { renderResumeHtml } from "@/lib/agent/resume/render";
import { createResumeLolClient } from "@/lib/agent/resumelol/client";
import type { AgentServices } from "@/lib/mcp/agent-tools";

/**
 * The real outside services for the agent's resume tools, used by the MCP
 * route. Tests inject fakes instead.
 *
 * `RESUMELOL_API_KEY` is read here, per call, and handed straight to the
 * client. It is never logged, stored or returned.
 *
 * The log line follows `lib/mcp/telemetry.ts`: one JSON line, names and
 * outcomes only. For builds it says which path ran (`chromium` or `skipped`,
 * with the reason), never resume content.
 */
export const agentServices: AgentServices = {
  resumeLol: (protectedIds) =>
    createResumeLolClient({ apiKey: process.env.RESUMELOL_API_KEY, protectedIds }),
  render: renderResumeHtml,
  log: (event) => {
    const { event: name, ...fields } = event;
    console.log(JSON.stringify({ at: `agent.${String(name)}`, ...fields }));
  },
};
