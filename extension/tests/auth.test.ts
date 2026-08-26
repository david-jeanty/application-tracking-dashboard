import { describe, expect, it, vi } from "vitest";
import {
  buildAuthorizationUrl,
  connect,
  disconnect,
  getAccessToken,
  isConnected,
  readCallback,
  refreshCredentials,
  type AuthDependencies,
} from "../src/auth.js";
import {
  createCodeVerifier,
  createState,
  deriveCodeChallenge,
  isValidCodeVerifier,
} from "../src/pkce.js";
import {
  isUsable,
  memoryCredentialStore,
  parseTokenResponse,
  type Credentials,
} from "../src/tokens.js";

/**
 * The authorization flow, exercised where it can actually be exercised.
 *
 * There is no live Supabase OAuth server in this suite and no pretence of one.
 * What is tested is everything the extension itself decides: whether a callback
 * is the one it asked for, whether a token response is believable, what happens
 * when a refresh is refused, and what is left in storage afterwards. The parts
 * that belong to Supabase and to Chrome are supplied as dependencies and are
 * verified by hand against a real project, recorded in `docs/browser-capture.md`.
 */

const REDIRECT_URI = "https://abcdefghijklmnop.chromiumapp.org/";

type TestDependencies = AuthDependencies & {
  store: ReturnType<typeof memoryCredentialStore>;
};

function dependencies({
  store = memoryCredentialStore(),
  ...overrides
}: Partial<Omit<AuthDependencies, "store">> & {
  store?: ReturnType<typeof memoryCredentialStore>;
} = {}): TestDependencies {
  return {
    fetchImpl: vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 })),
    launchWebAuthFlow: vi.fn(async () => undefined),
    redirectUri: REDIRECT_URI,
    now: () => 1_000_000,
    newState: () => "fixed-state",
    newPkcePair: async () => ({ verifier: "v".repeat(43), challenge: "challenge" }),
    ...overrides,
    store,
  };
}

function tokenResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("PKCE values", () => {
  it("generates a verifier of the shape RFC 7636 allows", () => {
    const verifier = createCodeVerifier();

    expect(isValidCodeVerifier(verifier)).toBe(true);
    expect(verifier).toHaveLength(43);
  });

  it("generates a different state every time", () => {
    const values = new Set(Array.from({ length: 25 }, () => createState()));

    expect(values.size).toBe(25);
  });

  it("derives the S256 challenge from the verifier", async () => {
    // The worked example from RFC 7636 appendix B.
    const challenge = await deriveCodeChallenge(
      "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    );

    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("asks for S256 and never for plain", () => {
    const url = new URL(
      buildAuthorizationUrl({
        redirectUri: REDIRECT_URI,
        state: "state-value",
        codeChallenge: "challenge-value",
      }),
    );

    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.toString()).not.toContain("client_secret");
  });
});

describe("reading the authorization callback", () => {
  it("accepts a code when the state matches", () => {
    expect(
      readCallback(`${REDIRECT_URI}?code=abc123&state=expected`, "expected"),
    ).toEqual({ status: "code", code: "abc123" });
  });

  it("rejects a callback whose state does not match the request", () => {
    expect(
      readCallback(`${REDIRECT_URI}?code=abc123&state=somebody-else`, "expected"),
    ).toEqual({ status: "state_mismatch" });
  });

  it("rejects a mismatched state even when it carries an error", () => {
    expect(
      readCallback(`${REDIRECT_URI}?error=access_denied&state=other`, "expected"),
    ).toEqual({ status: "state_mismatch" });
  });

  it("reports denied consent as denial rather than as failure", () => {
    expect(
      readCallback(`${REDIRECT_URI}?error=access_denied&state=expected`, "expected"),
    ).toEqual({ status: "denied" });
  });

  it("reports a callback with no code at all", () => {
    expect(readCallback(`${REDIRECT_URI}?state=expected`, "expected")).toEqual({
      status: "no_code",
    });
    expect(readCallback(undefined, "expected")).toEqual({ status: "no_code" });
  });
});

describe("token responses", () => {
  const now = 1_000_000;

  it("accepts a well-formed response", () => {
    expect(
      parseTokenResponse(
        {
          access_token: "access-1",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "refresh-1",
        },
        now,
      ),
    ).toEqual({
      accessToken: "access-1",
      expiresAt: now + 3_600_000,
      refreshToken: "refresh-1",
    });
  });

  it.each([
    ["no access token", { token_type: "bearer", expires_in: 3600 }],
    ["an empty access token", { access_token: "  ", expires_in: 3600 }],
    ["a wrong token type", { access_token: "a", token_type: "mac", expires_in: 3600 }],
    ["no expiry", { access_token: "a", token_type: "bearer" }],
    ["a nonsense expiry", { access_token: "a", expires_in: -5 }],
    ["a bare string", "access-token"],
    ["nothing", null],
  ])("refuses a response with %s", (_label, payload) => {
    expect(parseTokenResponse(payload, now)).toBeUndefined();
  });

  it("treats a token about to expire as unusable", () => {
    const credentials: Credentials = {
      accessToken: "access-1",
      expiresAt: now + 10_000,
    };

    expect(isUsable(credentials, now)).toBe(false);
    expect(isUsable({ ...credentials, expiresAt: now + 600_000 }, now)).toBe(true);
  });
});

describe("connecting", () => {
  it("stores credentials after a successful exchange", async () => {
    const auth = dependencies({
      launchWebAuthFlow: vi.fn(
        async () => `${REDIRECT_URI}?code=the-code&state=fixed-state`,
      ),
      fetchImpl: vi.fn(async () =>
        tokenResponse({
          access_token: "access-1",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "refresh-1",
        }),
      ),
    });

    expect(await connect(auth)).toEqual({ status: "connected" });
    expect(auth.store.current()?.accessToken).toBe("access-1");
    expect(auth.store.current()?.refreshToken).toBe("refresh-1");
  });

  it("sends the verifier and no client secret to the token endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      tokenResponse({ access_token: "a", token_type: "bearer", expires_in: 3600 }),
    );
    const auth = dependencies({
      launchWebAuthFlow: vi.fn(
        async () => `${REDIRECT_URI}?code=the-code&state=fixed-state`,
      ),
      fetchImpl,
    });

    await connect(auth);

    const body = String(fetchImpl.mock.calls[0]?.[1]?.body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain(`code_verifier=${"v".repeat(43)}`);
    expect(body).not.toContain("client_secret");
  });

  it("stores nothing when the state does not match", async () => {
    const auth = dependencies({
      launchWebAuthFlow: vi.fn(
        async () => `${REDIRECT_URI}?code=the-code&state=not-ours`,
      ),
    });

    expect(await connect(auth)).toEqual({ status: "state_mismatch" });
    expect(auth.store.current()).toBeUndefined();
  });

  it("stores nothing when the student declines", async () => {
    const auth = dependencies({
      launchWebAuthFlow: vi.fn(
        async () => `${REDIRECT_URI}?error=access_denied&state=fixed-state`,
      ),
    });

    expect(await connect(auth)).toEqual({ status: "denied" });
    expect(auth.store.current()).toBeUndefined();
  });

  it("treats a closed sign-in window as a cancellation", async () => {
    const auth = dependencies({
      launchWebAuthFlow: vi.fn(async () => {
        throw new Error("The user did not approve access.");
      }),
    });

    expect(await connect(auth)).toEqual({ status: "cancelled" });
    expect(auth.store.current()).toBeUndefined();
  });

  it("stores nothing when the token response is malformed", async () => {
    const auth = dependencies({
      launchWebAuthFlow: vi.fn(
        async () => `${REDIRECT_URI}?code=the-code&state=fixed-state`,
      ),
      fetchImpl: vi.fn(async () => tokenResponse({ hello: "world" })),
    });

    expect(await connect(auth)).toEqual({ status: "token_rejected" });
    expect(auth.store.current()).toBeUndefined();
  });

  it("reports an unreachable token endpoint as a network problem", async () => {
    const auth = dependencies({
      launchWebAuthFlow: vi.fn(
        async () => `${REDIRECT_URI}?code=the-code&state=fixed-state`,
      ),
      fetchImpl: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });

    expect(await connect(auth)).toEqual({ status: "network_error" });
  });
});

describe("how the token endpoint is called", () => {
  /*
   * The browser's own `fetch` throws an illegal-invocation error when it is
   * called as a method of something that is not the global scope. A plain test
   * double never notices, so this one refuses to be called that way — the real
   * failure it stands in for looked like an unreachable network and cost a
   * silent refresh in a real browser.
   */
  it("calls fetch unbound, never as a method of the dependencies object", async () => {
    const strictFetch = function (this: unknown) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(
        tokenResponse({ access_token: "a", token_type: "bearer", expires_in: 3600 }),
      );
    } as unknown as typeof fetch;

    const auth = dependencies({
      store: memoryCredentialStore({
        accessToken: "old",
        expiresAt: 0,
        refreshToken: "refresh-1",
      }),
      fetchImpl: strictFetch,
    });

    expect(await getAccessToken(auth)).toBe("a");
  });
});

describe("refreshing", () => {
  const expired: Credentials = {
    accessToken: "old-access",
    expiresAt: 0,
    refreshToken: "refresh-1",
  };

  it("exchanges an expired access token for a new one", async () => {
    const store = memoryCredentialStore(expired);
    const auth = dependencies({
      store,
      fetchImpl: vi.fn(async () =>
        tokenResponse({
          access_token: "access-2",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "refresh-2",
        }),
      ),
    });

    expect(await getAccessToken(auth)).toBe("access-2");
    expect(store.current()?.refreshToken).toBe("refresh-2");
  });

  it("keeps the existing refresh token when the response omits one", async () => {
    const store = memoryCredentialStore(expired);
    const auth = dependencies({
      store,
      fetchImpl: vi.fn(async () =>
        tokenResponse({ access_token: "access-2", token_type: "bearer", expires_in: 3600 }),
      ),
    });

    await refreshCredentials(auth);

    expect(store.current()?.refreshToken).toBe("refresh-1");
  });

  it("clears the credentials when the refresh token is refused", async () => {
    const store = memoryCredentialStore(expired);
    const auth = dependencies({
      store,
      fetchImpl: vi.fn(async () => tokenResponse({ error: "invalid_grant" }, 400)),
    });

    expect(await getAccessToken(auth)).toBeUndefined();
    expect(store.current()).toBeUndefined();
    expect(await isConnected(auth)).toBe(false);
  });

  it("keeps the credentials when refreshing merely could not reach the server", async () => {
    const store = memoryCredentialStore(expired);
    const auth = dependencies({
      store,
      fetchImpl: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });

    expect(await getAccessToken(auth)).toBeUndefined();
    expect(store.current()).toEqual(expired);
  });

  it("refreshes exactly once for one access-token request", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      tokenResponse({ error: "invalid_grant" }, 400),
    );
    const auth = dependencies({ store: memoryCredentialStore(expired), fetchImpl });

    await getAccessToken(auth);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not call the network when the stored token is still good", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => tokenResponse({}));
    const auth = dependencies({
      store: memoryCredentialStore({
        accessToken: "access-1",
        expiresAt: 1_000_000 + 600_000,
        refreshToken: "refresh-1",
      }),
      fetchImpl,
    });

    expect(await getAccessToken(auth)).toBe("access-1");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("signing out", () => {
  it("clears everything the extension holds", async () => {
    const store = memoryCredentialStore({
      accessToken: "access-1",
      expiresAt: 2_000_000,
      refreshToken: "refresh-1",
    });
    const auth = dependencies({ store });

    expect(await isConnected(auth)).toBe(true);

    await disconnect(auth);

    expect(store.current()).toBeUndefined();
    expect(await isConnected(auth)).toBe(false);
  });

  it("counts a stored refresh token alone as still connected", async () => {
    const auth = dependencies({
      store: memoryCredentialStore({
        accessToken: "",
        expiresAt: 0,
        refreshToken: "refresh-1",
      }),
    });

    expect(await isConnected(auth)).toBe(true);
  });
});
