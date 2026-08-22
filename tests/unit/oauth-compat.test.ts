import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeRedirectResponse,
  buildUpstreamUrl,
  proxyTokenRequest,
  upstreamAuthorizeUrl,
  upstreamTokenUrl,
} from "@/lib/oauth/upstream";

const SUPABASE_URL = "https://example-project.supabase.co";
const AUTHORIZE = `${SUPABASE_URL}/auth/v1/oauth/authorize`;
const TOKEN = `${SUPABASE_URL}/auth/v1/oauth/token`;

const originalEnvironment = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_123456789012345678901234567890";
  process.env.NEXT_PUBLIC_SITE_URL = "https://tracker.example.com";
});

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.restoreAllMocks();
});

function authorizeRequest(query: string) {
  return new Request(`https://tracker.example.com/authorize${query}`);
}

function locationOf(query: string): URL {
  const response = authorizeRedirectResponse(authorizeRequest(query));
  return new URL(response.headers.get("location") ?? "");
}

describe("/authorize compatibility alias", () => {
  it("redirects to Supabase rather than serving a page", () => {
    const response = authorizeRedirectResponse(authorizeRequest("?a=1"));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(AUTHORIZE);
  });

  it("preserves every OAuth parameter Claude sends", () => {
    const parameters = {
      response_type: "code",
      client_id: "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
      state: "opaque-state-value",
      scope: "openid email profile",
      resource: "https://tracker.example.com/api/mcp",
    };
    const query = `?${new URLSearchParams(parameters)}`;

    const location = locationOf(query);

    for (const [name, value] of Object.entries(parameters)) {
      expect(location.searchParams.get(name)).toBe(value);
    }
  });

  it("does not invent, drop, or reorder parameters", () => {
    const query =
      "?response_type=code&client_id=abc&state=xyz&unknown_future_param=keep-me";

    const location = locationOf(query);

    expect(location.search).toBe(query);
    expect(location.searchParams.get("unknown_future_param")).toBe("keep-me");
  });

  it("keeps repeated parameters intact", () => {
    const location = locationOf("?scope=openid&scope=email");

    expect(location.searchParams.getAll("scope")).toEqual(["openid", "email"]);
  });

  it("passes an empty query through without inventing one", () => {
    const location = locationOf("");

    expect(location.toString()).toBe(AUTHORIZE);
  });

  it("always targets the configured Supabase authorize endpoint", () => {
    const location = locationOf("?client_id=abc");

    expect(location.origin).toBe(SUPABASE_URL);
    expect(location.pathname).toBe("/auth/v1/oauth/authorize");
  });

  it("must not be cached", () => {
    const response = authorizeRedirectResponse(authorizeRequest("?state=abc"));

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("/authorize destination cannot be influenced by the caller", () => {
  it.each([
    "?redirect_uri=https://attacker.example/steal",
    "?resource=https://attacker.example",
    "?client_id=abc%26host%3Dattacker.example",
    // An absolute URL smuggled where a relative value is expected.
    "?next=https://attacker.example",
    // Attempts to terminate the path and append another host.
    "?state=%2F%2Fattacker.example",
    "?state=..%2F..%2F..%2Fattacker",
  ])("ignores %s when choosing the destination host", (query) => {
    const location = locationOf(query);

    expect(location.origin).toBe(SUPABASE_URL);
    expect(location.pathname).toBe("/auth/v1/oauth/authorize");
  });

  it("forwards redirect_uri untouched for Supabase to validate", () => {
    const redirectUri = "https://claude.ai/api/mcp/auth_callback";
    const location = locationOf(
      `?redirect_uri=${encodeURIComponent(redirectUri)}`,
    );

    // Passed through, but it decides nothing on our side.
    expect(location.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(location.origin).toBe(SUPABASE_URL);
  });

  it("uses only the origin of the configured URL, never a path or query on it", () => {
    expect(
      buildUpstreamUrl(
        "https://example-project.supabase.co/some/path?injected=1",
        "/auth/v1/oauth/authorize",
        "?client_id=abc",
      ),
    ).toBe(`${AUTHORIZE}?client_id=abc`);
  });

  it("derives both endpoints from the same configured origin", () => {
    expect(upstreamAuthorizeUrl()).toBe(AUTHORIZE);
    expect(upstreamTokenUrl()).toBe(TOKEN);
  });
});

describe("/token compatibility proxy", () => {
  const code = "authorization-code-should-never-be-logged";
  const verifier = "pkce-code-verifier-should-never-be-logged";
  const accessToken = "access-token-should-never-be-logged";

  function tokenRequest() {
    return new Request("https://tracker.example.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: "Basic Y2xpZW50OnNlY3JldA==",
        cookie: "sb-access-token=session-cookie-value",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: "abc",
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      }).toString(),
    });
  }

  it("forwards the exchange to Supabase with body and headers intact", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: accessToken }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await proxyTokenRequest(tokenRequest(), fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(TOKEN);
    expect(init.method).toBe("POST");
    expect(init.body).toContain(`code=${code}`);
    expect(init.body).toContain("grant_type=authorization_code");

    const forwarded = new Headers(init.headers);
    expect(forwarded.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(forwarded.get("authorization")).toBe("Basic Y2xpZW50OnNlY3JldA==");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ access_token: accessToken });
  });

  it("never relays browser cookies upstream", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await proxyTokenRequest(tokenRequest(), fetchImpl);

    const forwarded = new Headers(fetchImpl.mock.calls[0][1].headers);
    expect(forwarded.get("cookie")).toBeNull();
  });

  it("passes an upstream rejection through unchanged", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await proxyTokenRequest(tokenRequest(), fetchImpl);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_grant" });
  });

  it("marks token responses uncacheable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    const response = await proxyTokenRequest(tokenRequest(), fetchImpl);

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("returns an opaque error that cannot echo the code or verifier", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error(`connect failed while sending ${code}`));

    const response = await proxyTokenRequest(tokenRequest(), fetchImpl);
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toContain(code);
    expect(text).not.toContain(verifier);
  });

  it("logs nothing at all during a successful or failed exchange", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => {}),
    );

    const ok = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: accessToken, refresh_token: "r" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await proxyTokenRequest(tokenRequest(), ok);

    const failing = vi.fn().mockRejectedValue(new Error(code));
    await proxyTokenRequest(tokenRequest(), failing);

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
