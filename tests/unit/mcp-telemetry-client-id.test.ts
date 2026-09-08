/**
 * The client id MCP telemetry logs is the one the token was issued to.
 *
 * `lib/mcp/telemetry.ts` logs whatever `clientId` the verified `AuthInfo`
 * carries. Until 2026-09-08 `lib/auth/bearer-identity.ts` looked for it in
 * `app_metadata`, where Supabase never puts it, so every OAuth client session
 * logged as `unknown` and the field told nobody anything. This test runs the
 * real path end to end — token verification, then an instrumented tool call —
 * with only Supabase's `getUser` stood in for, and asserts the log line names
 * the client.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/bearer", () => ({
  createBearerClient: (token: string) => ({
    auth: { getUser: (argument?: string) => getUser(argument ?? token) },
  }),
}));

const { verifySupabaseAccessToken } = await import("@/lib/mcp/identity");
const { NO_OAUTH_CLIENT } = await import("@/lib/auth/bearer-identity");
const { instrumentToolCall } = await import("@/lib/mcp/telemetry");

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_ID = "461d1918-6343-447b-80f8-73f22e75b34d";
const request = new Request("https://tracker.example.com/api/mcp");

function tokenWith(claims: Record<string, unknown>): string {
  const segment = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${segment({ alg: "HS256", typ: "JWT" })}.${segment({
    sub: USER_ID,
    role: "authenticated",
    ...claims,
  })}.signature`;
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getUser.mockReset();
  getUser.mockResolvedValue({
    data: {
      user: { id: USER_ID, app_metadata: { provider: "email", providers: ["email"] } },
    },
    error: null,
  });
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

async function loggedClientIdFor(token: string): Promise<unknown> {
  const authInfo = await verifySupabaseAccessToken(request, token);
  expect(authInfo).toBeDefined();

  await instrumentToolCall(
    "list_jobs",
    { mcpReq: { id: 1 }, sessionId: "session-1", http: { authInfo } },
    async () => ({ content: [] }),
  );

  expect(logSpy).toHaveBeenCalledTimes(1);
  const payload = JSON.parse((logSpy.mock.calls[0] as [string])[0]);
  expect(payload.at).toBe("mcp.tool_call");
  return payload.clientId;
}

describe("MCP telemetry and the OAuth client", () => {
  it("records the real client id for an OAuth client session, not the placeholder", async () => {
    const clientId = await loggedClientIdFor(tokenWith({ client_id: CLIENT_ID }));

    expect(clientId).toBe(CLIENT_ID);
    expect(clientId).not.toBe(NO_OAUTH_CLIENT);
  });

  it("records the placeholder for a session login used directly as a bearer token", async () => {
    expect(await loggedClientIdFor(tokenWith({ session_id: "s-1" }))).toBe(
      NO_OAUTH_CLIENT,
    );
  });

  it("logs the client id without the token it was read from", async () => {
    const token = tokenWith({ client_id: CLIENT_ID });
    await loggedClientIdFor(token);

    const line = (logSpy.mock.calls[0] as [string])[0];
    expect(line).toContain(CLIENT_ID);
    expect(line).not.toContain(token);
    expect(line).not.toContain(token.split(".")[1]);
  });
});
