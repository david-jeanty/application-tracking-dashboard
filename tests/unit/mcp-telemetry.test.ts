import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  instrumentToolCall,
  logToolCall,
  timeDbCall,
  type ToolCallContext,
} from "@/lib/mcp/telemetry";

function ctx(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    mcpReq: { id: 7 },
    sessionId: "session-1",
    http: { authInfo: { token: "t", clientId: "claude", scopes: [], extra: {} } },
    ...overrides,
  };
}

describe("timeDbCall", () => {
  it("runs the query exactly once, whether or not a tool call is timing it", async () => {
    const query = vi.fn().mockResolvedValue({ data: [1, 2], error: null });

    const outsideResult = await timeDbCall(query);
    expect(query).toHaveBeenCalledTimes(1);
    expect(outsideResult).toEqual({ data: [1, 2], error: null });

    const insideResult = await instrumentToolCall("probe", ctx(), async () => {
      const result = await timeDbCall(query);
      return { content: [], data: result };
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(insideResult.data).toEqual({ data: [1, 2], error: null });
  });

  it("propagates a rejected query rather than swallowing it", async () => {
    const failure = new Error("connection reset");
    const query = vi.fn().mockRejectedValue(failure);

    await expect(timeDbCall(query)).rejects.toBe(failure);
  });
});

describe("logToolCall", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("logs only an allowlisted set of fields, never a tool argument or result", () => {
    logToolCall({
      tool: "get_job",
      requestId: "session-1:7",
      clientId: "claude",
      outcome: "success",
      totalMs: 12.345,
      authMs: 5.1,
      dbMs: 4.2,
      serializeMs: 3.045,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0] as [string];
    const payload = JSON.parse(line);

    expect(Object.keys(payload).sort()).toEqual(
      [
        "at",
        "authMs",
        "clientId",
        "dbMs",
        "outcome",
        "requestId",
        "serializeMs",
        "tool",
        "totalMs",
      ].sort(),
    );
    expect(payload).toMatchObject({
      at: "mcp.tool_call",
      tool: "get_job",
      outcome: "success",
      clientId: "claude",
    });
  });

  it("rounds durations rather than logging raw floating-point noise", () => {
    logToolCall({
      tool: "list_jobs",
      requestId: "1",
      clientId: null,
      outcome: "success",
      totalMs: 1.23456,
      authMs: null,
      dbMs: 0.001,
      serializeMs: 1.2335,
    });

    const payload = JSON.parse((logSpy.mock.calls[0] as [string])[0]);
    expect(payload.totalMs).toBe(1.23);
    expect(payload.authMs).toBeNull();
    expect(payload.dbMs).toBe(0);
    expect(payload.serializeMs).toBe(1.23);
  });
});

describe("instrumentToolCall", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function loggedPayload() {
    return JSON.parse((logSpy.mock.calls[0] as [string])[0]);
  }

  it("builds a correlation id from the session and the JSON-RPC request id", async () => {
    await instrumentToolCall(
      "list_jobs",
      ctx({ sessionId: "abc", mcpReq: { id: 42 } }),
      async () => ({ content: [] }),
    );

    expect(loggedPayload().requestId).toBe("abc:42");
  });

  it("falls back to the bare request id when the transport has no session", async () => {
    await instrumentToolCall(
      "list_jobs",
      ctx({ sessionId: undefined, mcpReq: { id: 42 } }),
      async () => ({ content: [] }),
    );

    expect(loggedPayload().requestId).toBe("42");
  });

  it("reports success for an ordinary result", async () => {
    await instrumentToolCall("save_job", ctx(), async () => ({
      content: [{ type: "text", text: "Saved." }],
      structuredContent: { application_id: "1" },
    }));

    expect(loggedPayload().outcome).toBe("success");
  });

  it("reports tool_error for a handled failure, without throwing", async () => {
    const result = await instrumentToolCall("get_job", ctx(), async () => ({
      isError: true,
      content: [{ type: "text", text: "Not signed in." }],
    }));

    expect(result.isError).toBe(true);
    expect(loggedPayload().outcome).toBe("tool_error");
  });

  it("reports exception and rethrows when the handler itself throws", async () => {
    const failure = new Error("unexpected");

    await expect(
      instrumentToolCall("update_job", ctx(), async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(loggedPayload().outcome).toBe("exception");
  });

  it("reads the auth duration off the access token's extra data, without logging the token", async () => {
    await instrumentToolCall(
      "list_jobs",
      ctx({
        http: {
          authInfo: {
            token: "super-secret-token",
            clientId: "chatgpt",
            scopes: [],
            extra: { userId: "u1", authDurationMs: 8.4 },
          },
        },
      }),
      async () => ({ content: [] }),
    );

    const payload = loggedPayload();
    expect(payload.authMs).toBe(8.4);
    expect(payload.clientId).toBe("chatgpt");
    expect(JSON.stringify(payload)).not.toContain("super-secret-token");
  });

  it("reports a null auth duration when none was recorded", async () => {
    await instrumentToolCall(
      "list_jobs",
      ctx({ http: { authInfo: { token: "t", clientId: "claude", scopes: [], extra: {} } } }),
      async () => ({ content: [] }),
    );

    expect(loggedPayload().authMs).toBeNull();
  });

  it("sums every database call the handler makes into one dbMs figure", async () => {
    const query = () =>
      new Promise<{ ok: true }>((resolve) => setTimeout(() => resolve({ ok: true }), 5));

    await instrumentToolCall("list_jobs", ctx(), async () => {
      await timeDbCall(query);
      await timeDbCall(query);
      return { content: [] };
    });

    expect(loggedPayload().dbMs).toBeGreaterThan(0);
  });

  it("never lets a handler's structured content reach the log line", async () => {
    await instrumentToolCall("get_job", ctx(), async () => ({
      content: [{ type: "text", text: "Business Analyst at RBC, status Applied." }],
      structuredContent: {
        job_description: "Confidential recruiter notes about the retail banking team.",
        notes: "Referred by a classmate — do not share.",
      },
    }));

    const line = (logSpy.mock.calls[0] as [string])[0];
    expect(line).not.toContain("Confidential recruiter notes");
    expect(line).not.toContain("Referred by a classmate");
    expect(line).not.toContain("Business Analyst");
  });
});
