import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createS256Challenge,
  generateOAuthState,
  generatePkceVerifier,
  isAccessTokenFresh,
  OAuthFlowError,
  parseOAuthCallback,
  parseTokenResponse,
  refreshAccessToken,
} from "../src/auth-core.js";
import { clearCredentials } from "../src/auth.js";

const fill = (byte: number) => (array: Uint8Array) => {
  array.fill(byte);
  return array;
};

afterEach(() => vi.unstubAllGlobals());

describe("PKCE and OAuth callback helpers", () => {
  it("generates a high-entropy verifier with the required URL-safe shape", () => {
    const verifier = generatePkceVerifier(fill(255));
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(verifier).toHaveLength(86);
    expect(verifier).not.toContain("=");
  });

  it("generates a cryptographically sourced state value", () => {
    const state = generateOAuthState(fill(17));
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("creates the RFC 7636 S256 challenge", async () => {
    await expect(
      createS256Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).resolves.toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("rejects a state mismatch", () => {
    expect(() =>
      parseOAuthCallback(
        "https://abc.chromiumapp.org/oauth2?code=x&state=wrong",
        "https://abc.chromiumapp.org/oauth2",
        "expected",
      ),
    ).toThrowError(expect.objectContaining({ code: "state_mismatch" }));
  });

  it("rejects a callback with no authorization code", () => {
    expect(() =>
      parseOAuthCallback(
        "https://abc.chromiumapp.org/oauth2?state=expected",
        "https://abc.chromiumapp.org/oauth2",
        "expected",
      ),
    ).toThrowError(expect.objectContaining({ code: "missing_code" }));
  });

  it("reports an OAuth denial without accepting a code", () => {
    expect(() =>
      parseOAuthCallback(
        "https://abc.chromiumapp.org/oauth2?error=access_denied&state=expected",
        "https://abc.chromiumapp.org/oauth2",
        "expected",
      ),
    ).toThrowError(expect.objectContaining({ code: "denied" }));
  });
});

describe("tokens and refresh", () => {
  it("validates a complete token response", () => {
    expect(
      parseTokenResponse(
        {
          access_token: "access",
          refresh_token: "refresh",
          token_type: "bearer",
          expires_in: 3600,
        },
        1_000,
      ),
    ).toEqual({ accessToken: "access", refreshToken: "refresh", expiresAt: 3_601_000 });
  });

  it("rejects an invalid token response", () => {
    expect(() => parseTokenResponse({ access_token: "access" })).toThrowError(
      OAuthFlowError,
    );
  });

  it("treats expired and nearly expired access tokens as stale", () => {
    expect(isAccessTokenFresh({ accessToken: "a", expiresAt: 60_000 }, 1)).toBe(false);
    expect(isAccessTokenFresh({ accessToken: "a", expiresAt: 61_002 }, 1)).toBe(true);
  });

  it("refreshes successfully as a public client and accepts rotation", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "rotated-refresh",
          token_type: "bearer",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await refreshAccessToken(
      "https://project.supabase.co/auth/v1/oauth/token",
      { clientId: "public-client", refreshToken: "old-refresh" },
      fetchImpl,
      0,
    );

    expect(result.refreshToken).toBe("rotated-refresh");
    const init = fetchImpl.mock.calls[0][1];
    expect(init?.body).toContain("grant_type=refresh_token");
    expect(init?.body).toContain("client_id=public-client");
    expect(init?.headers).not.toHaveProperty("authorization");
  });

  it("fails once when refresh is rejected", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", { status: 400 }),
    );
    await expect(
      refreshAccessToken(
        "https://project.supabase.co/auth/v1/oauth/token",
        { clientId: "public-client", refreshToken: "bad-refresh" },
        fetchImpl,
      ),
    ).rejects.toMatchObject({ code: "token_request_failed" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("clears access and refresh credentials together", async () => {
    const sessionRemove = vi.fn().mockResolvedValue(undefined);
    const localRemove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      storage: {
        session: { remove: sessionRemove },
        local: { remove: localRemove },
      },
    });
    await clearCredentials();
    expect(sessionRemove).toHaveBeenCalledWith("jobtrack_access");
    expect(localRemove).toHaveBeenCalledWith("jobtrack_refresh");
  });
});
