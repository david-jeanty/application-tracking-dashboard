import { describe, expect, it } from "vitest";
import {
  createResumeLolClient,
  editorUrlFor,
  RESUMELOL_ENDPOINT,
  ResumeLolError,
} from "@/lib/agent/resumelol/client";

const KEY = "rl_test_key_should_never_leak_123456";

type Call = { url: string; headers: Record<string, string>; body: { method: string; params?: unknown; id?: number } };

/** A fake resume.lol MCP endpoint. `reply` answers each tools/call. */
function fakeServer(
  reply: (name: string, args: Record<string, unknown>) => { text: string; isError?: boolean } | Response,
  options: { sse?: boolean } = {},
) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), headers, body });
    if (body.id === undefined) return new Response(null, { status: 202 });

    let result: unknown;
    if (body.method === "initialize") {
      result = { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake" } };
    } else {
      const answer = reply(body.params.name, body.params.arguments);
      if (answer instanceof Response) return answer;
      result = { content: [{ type: "text", text: answer.text }], ...(answer.isError ? { isError: true } : {}) };
    }
    const message = JSON.stringify({ jsonrpc: "2.0", id: body.id, result });
    return options.sse
      ? new Response(`event: message\ndata: ${message}\n\n`, { headers: { "content-type": "text/event-stream" } })
      : new Response(message, { headers: { "content-type": "application/json" } });
  };
  return { calls, fetchImpl: fetchImpl as typeof fetch };
}

const RESUME = {
  id: "r1",
  name: "Base",
  markdown: "# {NAME}",
  css: "body{}",
  meta_css: "@page{}",
  updated_at: "2026-11-11T23:35:16.324911+00:00",
};

describe("resume.lol client", () => {
  it("initializes once, then calls tools with the bearer key", async () => {
    const server = fakeServer(() => ({ text: JSON.stringify(RESUME) }), { sse: true });
    const client = createResumeLolClient({ apiKey: KEY, fetch: server.fetchImpl });
    expect(await client.getResume("r1")).toEqual(RESUME);
    await client.getResume("r1");

    const methods = server.calls.map((call) => call.body.method);
    expect(methods).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/call"]);
    for (const call of server.calls) {
      expect(call.url).toBe(RESUMELOL_ENDPOINT);
      expect(call.headers.authorization).toBe(`Bearer ${KEY}`);
      expect(call.headers.accept).toBe("application/json, text/event-stream");
    }
    expect(server.calls[2].body.params).toEqual({ name: "get_resume", arguments: { resume_id: "r1" } });
  });

  it("creates a resume with all three documents and returns its id", async () => {
    const server = fakeServer((name, args) => {
      expect(name).toBe("create_resume");
      expect(args).toEqual({ name: "David_Jeanty_X_Y", markdown: "md", css: "c", meta_css: "m" });
      return { text: JSON.stringify({ id: "new-1", name: "David_Jeanty_X_Y", updated_at: "t1" }) };
    });
    const client = createResumeLolClient({ apiKey: KEY, fetch: server.fetchImpl });
    expect(await client.createResume({ name: "David_Jeanty_X_Y", markdown: "md", css: "c", meta_css: "m" })).toEqual({
      id: "new-1",
      updated_at: "t1",
    });
  });

  it("returns printable HTML as text", async () => {
    const server = fakeServer(() => ({ text: "<!doctype html><html></html>" }));
    const client = createResumeLolClient({ apiKey: KEY, fetch: server.fetchImpl });
    expect(await client.getResumeHtml("r1")).toBe("<!doctype html><html></html>");
  });

  it("updates only the markdown, with the conflict guard", async () => {
    const server = fakeServer((name, args) => {
      expect(name).toBe("update_resume");
      expect(args).toEqual({ resume_id: "r9", markdown: "md2", expected_updated_at: "t1" });
      return { text: JSON.stringify({ updated_at: "t2" }) };
    });
    const client = createResumeLolClient({ apiKey: KEY, fetch: server.fetchImpl });
    expect(await client.updateResumeMarkdown({ resume_id: "r9", markdown: "md2", expected_updated_at: "t1" })).toEqual({
      updated_at: "t2",
    });
  });

  it("never updates a protected base resume, and makes no call trying", async () => {
    const server = fakeServer(() => ({ text: "{}" }));
    const client = createResumeLolClient({ apiKey: KEY, fetch: server.fetchImpl, protectedIds: ["base-1"] });
    await expect(
      client.updateResumeMarkdown({ resume_id: "base-1", markdown: "x", expected_updated_at: "t" }),
    ).rejects.toMatchObject({ kind: "protected" });
    expect(server.calls).toHaveLength(0);
  });

  it("reports a rejected update as a conflict", async () => {
    const server = fakeServer(() => ({ text: "Conflict: resume changed since expected_updated_at", isError: true }));
    const client = createResumeLolClient({ apiKey: KEY, fetch: server.fetchImpl });
    await expect(
      client.updateResumeMarkdown({ resume_id: "r9", markdown: "x", expected_updated_at: "t" }),
    ).rejects.toMatchObject({ kind: "conflict" });
  });

  it("refuses to run without a key, without calling out", async () => {
    const server = fakeServer(() => ({ text: "{}" }));
    const client = createResumeLolClient({ apiKey: "  ", fetch: server.fetchImpl });
    await expect(client.getResume("r1")).rejects.toMatchObject({ kind: "not_configured" });
    expect(server.calls).toHaveLength(0);
  });

  it("never puts the key in an error, even when the server echoes it", async () => {
    const echo = fakeServer(() => new Response(`bad key ${KEY}`, { status: 401 }));
    const client = createResumeLolClient({ apiKey: KEY, fetch: echo.fetchImpl });
    const error = await client.getResume("r1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ResumeLolError);
    expect((error as ResumeLolError).kind).toBe("auth");
    expect(String((error as Error).message)).not.toContain(KEY);
    expect(JSON.stringify(error)).not.toContain(KEY);

    const toolError = fakeServer(() => ({ text: `no such resume, key ${KEY}`, isError: true }));
    const second = createResumeLolClient({ apiKey: KEY, fetch: toolError.fetchImpl });
    const message = await second.getResume("r1").catch((caught: Error) => caught.message);
    expect(message).not.toContain(KEY);
    expect(message).toContain("[redacted]");
  });

  it("reports a malformed answer as a protocol error", async () => {
    const server = fakeServer(() => ({ text: "not json" }));
    const client = createResumeLolClient({ apiKey: KEY, fetch: server.fetchImpl });
    await expect(client.getResume("r1")).rejects.toMatchObject({ kind: "protocol" });
  });

  it("builds the editor link for a resume id", () => {
    expect(editorUrlFor("abc-123")).toBe("https://www.resume.lol/editor/abc-123");
  });
});
