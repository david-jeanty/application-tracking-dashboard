import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/bearer", () => ({
  createBearerClient: (token: string) => ({
    auth: { getUser: (argument?: string) => getUser(argument ?? token) },
  }),
}));

const { verifySupabaseAccessToken } = await import("@/lib/mcp/identity");
const { NO_OAUTH_CLIENT, readBearerToken, verifyBearerToken } = await import(
  "@/lib/auth/bearer-identity"
);

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** The extension's registered public client, as `docs/chrome-web-store-release.md` records it. */
const CLIENT_ID = "461d1918-6343-447b-80f8-73f22e75b34d";
const request = new Request("https://tracker.example.com/api/mcp");

/**
 * What Supabase Auth returns from `getUser`: the user's own row. Its
 * `app_metadata` is the provider bookkeeping the auth service keeps per user;
 * it never records which OAuth client a token was issued to.
 */
function supabaseUser(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      user: {
        id: USER_ID,
        app_metadata: { provider: "email", providers: ["email"] },
        ...overrides,
      },
    },
    error: null,
  };
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

/**
 * A token shaped the way Supabase Auth shapes one: three base64url segments,
 * with the claims in the middle. The signature is not checked here — the
 * mocked `getUser` stands in for Supabase's verification — so it is filler.
 */
function tokenWith(claims: Record<string, unknown>): string {
  return [
    base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    base64Url(JSON.stringify({ sub: USER_ID, role: "authenticated", ...claims })),
    "signature",
  ].join(".");
}

/** A token the OAuth 2.1 server issued to a client, on the student's behalf. */
const CLIENT_TOKEN = tokenWith({ client_id: CLIENT_ID });
/** A password or session login: the same subject, no client. */
const SESSION_TOKEN = tokenWith({ session_id: "s-1" });

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

    expect(authInfo?.extra).toMatchObject({ userId: USER_ID });
    expect(authInfo?.token).toBe("good-token");
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

    expect(authInfo?.extra).toMatchObject({ userId: USER_ID });
  });
});

describe("the OAuth client a token was issued to", () => {
  it("is read from the token's own top-level client_id claim", async () => {
    getUser.mockResolvedValue(supabaseUser());

    expect((await verifySupabaseAccessToken(request, CLIENT_TOKEN))?.clientId).toBe(
      CLIENT_ID,
    );
    expect((await verifyBearerToken(CLIENT_TOKEN))?.clientId).toBe(CLIENT_ID);
  });

  it("is the placeholder for a session login, which names no client", async () => {
    getUser.mockResolvedValue(supabaseUser());

    expect((await verifySupabaseAccessToken(request, SESSION_TOKEN))?.clientId).toBe(
      NO_OAUTH_CLIENT,
    );
  });

  it("is never taken from app_metadata, where Supabase does not put it", async () => {
    // A user attribute is not a token attribute: even if a row carried a
    // `client_id` there, it would say nothing about which client this
    // particular token was minted for.
    getUser.mockResolvedValue(
      supabaseUser({ app_metadata: { provider: "email", client_id: "claude" } }),
    );

    expect((await verifySupabaseAccessToken(request, SESSION_TOKEN))?.clientId).toBe(
      NO_OAUTH_CLIENT,
    );
  });

  it("is not read at all from a token Supabase refused", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });

    expect(await verifySupabaseAccessToken(request, CLIENT_TOKEN)).toBeUndefined();
  });

  it.each([
    ["an opaque token", "opaque-token"],
    ["a token whose payload is not JSON", `h.${base64Url("not json")}.s`],
    ["a token whose payload is not an object", `h.${base64Url("[1]")}.s`],
    ["an empty client_id claim", tokenWith({ client_id: "" })],
    ["a client_id claim that is not a string", tokenWith({ client_id: 42 })],
  ])("falls back to the placeholder rather than failing for %s", async (_, token) => {
    getUser.mockResolvedValue(supabaseUser());

    expect((await verifySupabaseAccessToken(request, token))?.clientId).toBe(
      NO_OAUTH_CLIENT,
    );
  });
});

describe("auth verification records its own duration", () => {
  it("carries a non-negative duration alongside the resolved identity", async () => {
    getUser.mockResolvedValue(supabaseUser());

    const authInfo = await verifySupabaseAccessToken(request, "good-token");
    const extra = authInfo?.extra as { authDurationMs?: number };

    expect(typeof extra.authDurationMs).toBe("number");
    expect(extra.authDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("never carries the token itself in that duration field", async () => {
    getUser.mockResolvedValue(supabaseUser());

    const authInfo = await verifySupabaseAccessToken(request, "secret-token");

    expect(Object.keys(authInfo?.extra as object).sort()).toEqual(
      ["authDurationMs", "userId"].sort(),
    );
  });
});

describe("token contents never leak", () => {
  it("writes nothing to the console on success or on rejection", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => {}),
    );

    getUser.mockResolvedValue(supabaseUser());
    await verifySupabaseAccessToken(request, CLIENT_TOKEN);

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
