import {
  InMemoryTransport,
  LATEST_PROTOCOL_VERSION,
  McpServer,
  type JSONRPCMessage,
} from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_SERVER_INSTRUCTIONS } from "@/lib/mcp/instructions";

// Declared and mocked at true module scope, not inside a `describe`, because
// `vi.mock` is hoisted above every import regardless of where it is written
// — nesting it only moves the factory itself out of reach of variables
// declared alongside it in a block, producing a `ReferenceError` instead of
// the intended mock.
const createMcpHandler = vi.fn<(...args: unknown[]) => string>(
  () => "handler-stub",
);
const withMcpAuth = vi.fn<(...args: unknown[]) => string>(
  () => "authenticated-handler-stub",
);

vi.mock("mcp-handler", () => ({
  createMcpHandler,
  withMcpAuth,
}));

/**
 * These pin the specific unnecessary-tool-call patterns the latency-and-UX
 * audit traced back to model orchestration rather than server processing:
 * a tool call for a bare greeting, a `get_job` per row after `list_jobs`
 * already answered the question, and a confirmatory re-read after a write
 * whose own result already said what changed. Each already cost several
 * seconds of host "thinking" time per round trip that this server's own
 * processing (measured under 100ms per call — see `mcp-telemetry.test.ts`)
 * never did.
 */
describe("MCP_SERVER_INSTRUCTIONS content", () => {
  it("tells the model not to call a tool for a greeting or small talk", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/greeting/i);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/no tool call at all/i);
  });

  it("tells the model list_jobs already carries dates, so no per-row get_job follow-up is needed", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/list_jobs/);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/date_applied/);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(
      /do not call get_job once per application/i,
    );
  });

  it("tells the model not to re-read after save_job, import_jobs, or update_job", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/save_job/);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/import_jobs/);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/update_job/);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(
      /do not call get_job or list_jobs again immediately afterward/i,
    );
  });

  it("tells the model not to restate the rendered list in prose", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/do not restate the applications/i);
  });

  it("stays short enough to not dominate every turn's context", () => {
    // A rough ceiling, not a target: this is guidance riding along on every
    // turn, not a place to grow a second copy of the tool descriptions.
    expect(MCP_SERVER_INSTRUCTIONS.length).toBeLessThan(1500);
  });

  it("never mentions credentials, tokens, or a specific student's data", () => {
    expect(MCP_SERVER_INSTRUCTIONS).not.toMatch(/token|bearer|password/i);
  });
});

/**
 * `instructions` is a plain string forwarded to `McpServer`'s constructor by
 * `mcp-handler` (confirmed by reading its compiled output: `new
 * server.McpServer(serverInfo, mcpServerOptions)`, where `mcpServerOptions`
 * is everything in `createMcpHandler`'s options object other than
 * `serverInfo`/`verboseLogs`/`onEvent`/`maxSubscriptions`). This proves the
 * mechanism itself — the MCP SDK actually surfaces a server's `instructions`
 * on `initialize`, over a real server and a real transport, rather than
 * trusting that a constructor option with that name does what its docstring
 * says.
 */
describe("a server's instructions reach a connecting client's initialize result", () => {
  it("surfaces the exact instructions text this server configures", async () => {
    const server = new McpServer(
      { name: "interndex", version: "0.1.0" },
      { instructions: MCP_SERVER_INSTRUCTIONS },
    );
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const pending = new Map<number, (message: JSONRPCMessage) => void>();
    clientTransport.onmessage = (message) => {
      const id = (message as { id?: number }).id;
      if (typeof id === "number") pending.get(id)?.(message);
    };
    await clientTransport.start();

    const response = new Promise<{ result?: { instructions?: string } }>(
      (resolve) => pending.set(1, resolve as (message: JSONRPCMessage) => void),
    );
    await clientTransport.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "test-client", version: "0.1.0" },
      },
    });

    const message = await response;

    expect(message.result?.instructions).toBe(MCP_SERVER_INSTRUCTIONS);
    await server.close();
  });
});

/**
 * The route is the only place `instructions` is actually configured for
 * production traffic — `registerJobTrackTools` (what the other MCP unit
 * tests drive directly) has no say in it, since it is a `createMcpHandler`
 * option rather than something registered on a already-constructed server.
 * `mcp-handler` is mocked so this proves what the route passes, without
 * spinning up the real handler chain or requiring a Supabase-issued token
 * to get past `withMcpAuth`.
 */
describe("the MCP route configures the shared instructions", () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example-project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      "sb_publishable_123456789012345678901234567890";
    process.env.NEXT_PUBLIC_SITE_URL = "https://tracker.example.com";
    vi.resetModules();
    createMcpHandler.mockClear();
    withMcpAuth.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("passes the shared instructions constant alongside the existing serverInfo", async () => {
    await import("@/app/api/mcp/route");

    expect(createMcpHandler).toHaveBeenCalledTimes(1);
    const [, options] = createMcpHandler.mock.calls[0] as [unknown, Record<string, unknown>];

    expect(options).toMatchObject({
      serverInfo: { name: "interndex", version: "0.1.0" },
      instructions: MCP_SERVER_INSTRUCTIONS,
    });
  });

  it("still requires auth on every request, unaffected by the instructions change", async () => {
    await import("@/app/api/mcp/route");

    expect(withMcpAuth).toHaveBeenCalledTimes(1);
    const [, , authOptions] = withMcpAuth.mock.calls[0] as [
      unknown,
      unknown,
      Record<string, unknown>,
    ];
    expect(authOptions.required).toBe(true);
  });
});
