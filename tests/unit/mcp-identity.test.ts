import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/bearer", () => ({
  createBearerClient: (token: string) => ({
    auth: { getUser: (argument?: string) => getUser(argument ?? token) },
  }),
}));

const { verifySupabaseAccessToken } = await import("@/lib/mcp/identity");
const { readBearerToken, verifyBearerToken } = await import(
  "@/lib/auth/bearer-identity"
);

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const request = new Request("https://tracker.example.com/api/mcp");

function supabaseUser(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      user: {
        id: USER_ID,
        app_metadata: { client_id: "claude" },
        ...overrides,
      },
    },
    error: null,
  };
}

beforeEach(() => {
  getUser.mockReset();
});

describe("a request without a usable token is not authenticated", () => {
  it("rejects a missing token without asking Supabase", async () => {
    expect(await verifySupabaseAccessToken(request)).toBeUndefined();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects an empty token without asking Supabase", async () => {
    expect(await verifySupabaseAccessToken(request, "")).toBeUndefined();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects a malformed token that Supabase refuses", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });

    expect(
      await verifySupabaseAccessToken(request, "not-a-jwt"),
    ).toBeUndefined();
  });

  it("rejects an expired or revoked token", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "JWT expired" },
    });

    expect(await verifySupabaseAccessToken(request, "expired")).toBeUndefined();
  });

  it("fails closed when Supabase answers without an error but without a user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    expect(await verifySupabaseAccessToken(request, "token")).toBeUndefined();
  });

  it("verifies the token Supabase was given, not one the caller described", async () => {
    getUser.mockResolvedValue(supabaseUser());

    await verifySupabaseAccessToken(request, "the-real-token");

    expect(getUser).toHaveBeenCalledWith("the-real-token");
  });
});

describe("generic HTTP bearer parsing", () => {
  it("accepts one well-formed bearer credential", () => {
    const bearerRequest = new Request("https://tracker.example.com/api/browser-capture", {
      headers: { authorization: "Bearer good-token" },
    });

    expect(readBearerToken(bearerRequest)).toBe("good-token");
  });

  it.each([
    undefined,
    "Basic credentials",
    "Bearer",
    "Bearer ",
    "Bearer two tokens",
  ])("rejects a missing or malformed credential: %s", (authorization) => {
    const bearerRequest = new Request("https://tracker.example.com/api/browser-capture", {
      headers: authorization ? { authorization } : undefined,
    });

    expect(readBearerToken(bearerRequest)).toBeUndefined();
  });

  it("fails closed when Supabase rejects a bearer token", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });

    expect(await verifyBearerToken("invalid-token")).toBeUndefined();
  });
});

describe("a valid token establishes exactly one identity", () => {
  it("returns the subject Supabase resolved", async () => {
    getUser.mockResolvedValue(supabaseUser());

    const authInfo = await verifySupabaseAccessToken(request, "good-token");

    expect(authInfo?.extra).toEqual({ userId: USER_ID });
    expect(authInfo?.token).toBe("good-token");
  });

  it("records the OAuth client the token was issued to", async () => {
    getUser.mockResolvedValue(supabaseUser());

    expect((await verifySupabaseAccessToken(request, "t"))?.clientId).toBe(
      "claude",
    );
  });

  it("falls back to a placeholder client rather than failing", async () => {
    getUser.mockResolvedValue(supabaseUser({ app_metadata: {} }));

    expect((await verifySupabaseAccessToken(request, "t"))?.clientId).toBe(
      "unknown",
    );
  });

  it("requests no scopes, because authorization comes from row-level security", async () => {
    getUser.mockResolvedValue(supabaseUser());

    expect((await verifySupabaseAccessToken(request, "t"))?.scopes).toEqual([]);
  });

  it("never takes an identity from the request itself", async () => {
    getUser.mockResolvedValue(supabaseUser());

    // A request carrying a different user id must not change the outcome.
    const spoofed = new Request(
      "https://tracker.example.com/api/mcp?user_id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      { headers: { "x-user-id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } },
    );

    const authInfo = await verifySupabaseAccessToken(spoofed, "good-token");

    expect(authInfo?.extra).toEqual({ userId: USER_ID });
  });
});

describe("token contents never leak", () => {
  it("writes nothing to the console on success or on rejection", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => {}),
    );

    getUser.mockResolvedValue(supabaseUser());
    await verifySupabaseAccessToken(request, "secret-token");

    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT: secret-token" },
    });
    await verifySupabaseAccessToken(request, "secret-token");

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it("returns no error object that could carry the token onward", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT: secret-token" },
    });

    // Rejection is a bare `undefined`: there is no field for a message that
    // quotes the token to travel back to the client in.
    expect(await verifySupabaseAccessToken(request, "secret-token")).toBe(
      undefined,
    );
  });
});
