import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { McpUserExtra } from "@/lib/mcp/user";

/**
 * Server-side latency instrumentation for MCP tool calls.
 *
 * One structured line is logged per tool call, carrying only names, an
 * outcome, and durations — never a tool argument, never `content` or
 * `structuredContent`, never the access token. That is what makes it safe to
 * log unconditionally rather than gating it behind a debug flag: there is
 * nothing in the line a job description, a note, or a bearer token could ever
 * reach.
 */

type ToolCallMetrics = { dbDurationMs: number };

/**
 * Carries one tool call's accumulated database time from wherever the
 * repository work actually happens back to the call that is timing it,
 * without threading a metrics object through `list-jobs.ts`, `get-job.ts`,
 * `update-job.ts`, and `import-jobs.ts` — none of which otherwise have any
 * reason to know they are being measured.
 */
const toolCallStorage = new AsyncLocalStorage<ToolCallMetrics>();

/**
 * Times one database round trip and folds it into the enclosing tool call's
 * total, when one is running. `lib/mcp/repository.ts` wraps every repository
 * method with this. Outside a tool call — the fake repositories other unit
 * tests inject never run inside `instrumentToolCall` — there is no store to
 * report to, so this is just `run()`.
 */
export async function timeDbCall<T>(run: () => Promise<T>): Promise<T> {
  const metrics = toolCallStorage.getStore();
  if (!metrics) return run();

  const startedAt = performance.now();
  try {
    return await run();
  } finally {
    metrics.dbDurationMs += performance.now() - startedAt;
  }
}

/** The auth duration `lib/mcp/identity.ts` recorded on the access token. */
function readAuthDurationMs(authInfo: AuthInfo | undefined): number | null {
  const extra = authInfo?.extra as McpUserExtra | undefined;
  return typeof extra?.authDurationMs === "number" ? extra.authDurationMs : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ToolOutcome = "success" | "tool_error" | "exception";

/**
 * Logs one line for a completed tool call.
 *
 * `dbMs` is every repository round trip the call made, added together.
 * `serializeMs` is what remains of the handler's own time once the database
 * is subtracted — argument validation, merging a patch onto a stored record,
 * building the response object. It approximates "serialization/response"
 * cost; the actual wire encoding happens in the transport after this
 * function returns, which this process has no hook into.
 */
export function logToolCall(fields: {
  tool: string;
  requestId: string;
  clientId: string | null;
  outcome: ToolOutcome;
  totalMs: number;
  authMs: number | null;
  dbMs: number;
  serializeMs: number;
}): void {
  console.log(
    JSON.stringify({
      at: "mcp.tool_call",
      tool: fields.tool,
      requestId: fields.requestId,
      clientId: fields.clientId,
      outcome: fields.outcome,
      totalMs: round(fields.totalMs),
      authMs: fields.authMs === null ? null : round(fields.authMs),
      dbMs: round(fields.dbMs),
      serializeMs: round(fields.serializeMs),
    }),
  );
}

/** The slice of a tool's `ctx` this module needs, structurally. */
export type ToolCallContext = {
  mcpReq: { id: unknown };
  sessionId?: string;
  http?: { authInfo?: AuthInfo };
};

/**
 * The slice of a tool's result this module needs, structurally.
 *
 * The index signature exists only to keep this a normal structural type
 * rather than a "weak type" of all-optional properties, which TypeScript
 * would otherwise refuse to match against the tools' actual result objects —
 * `{ content, structuredContent }` shares no property with `{ isError }`, and
 * a weak type requires at least one to. It does not widen what this module
 * reads: only `isError` is ever inspected below.
 */
export type InstrumentedToolResult = {
  isError?: boolean;
  [key: string]: unknown;
};

/**
 * Wraps one tool invocation with latency instrumentation and runs it.
 *
 * Every registered tool calls this around its body, so total, auth,
 * database, and response-building time are recorded the same way for every
 * tool. The correlation id is the JSON-RPC request id the transport already
 * assigned (prefixed with the session id, when the transport has one), not a
 * freshly minted one, so a slow line here can be matched directly against the
 * transport's own logs for the same request.
 *
 * `totalMs` adds the auth duration to the time spent inside this call,
 * because auth happens before the handler runs and is not otherwise part of
 * anything measured here — it is the honest end-to-end cost of the tool call,
 * not just the part downstream of authentication.
 */
export async function instrumentToolCall<R extends InstrumentedToolResult>(
  toolName: string,
  ctx: ToolCallContext,
  run: () => Promise<R>,
): Promise<R> {
  const startedAt = performance.now();
  const authInfo = ctx.http?.authInfo;
  const authMs = readAuthDurationMs(authInfo);
  const requestId = ctx.sessionId
    ? `${ctx.sessionId}:${String(ctx.mcpReq.id)}`
    : String(ctx.mcpReq.id);
  const metrics: ToolCallMetrics = { dbDurationMs: 0 };

  const finish = (outcome: ToolOutcome) => {
    const handlerMs = performance.now() - startedAt;
    logToolCall({
      tool: toolName,
      requestId,
      clientId: authInfo?.clientId ?? null,
      outcome,
      totalMs: handlerMs + (authMs ?? 0),
      authMs,
      dbMs: metrics.dbDurationMs,
      serializeMs: Math.max(0, handlerMs - metrics.dbDurationMs),
    });
  };

  try {
    const result = await toolCallStorage.run(metrics, run);
    finish(result.isError ? "tool_error" : "success");
    return result;
  } catch (error) {
    finish("exception");
    throw error;
  }
}
