export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export class OAuthFlowError extends Error {
  constructor(
    public readonly code:
      | "state_mismatch"
      | "missing_code"
      | "denied"
      | "invalid_callback"
      | "invalid_token_response"
      | "token_request_failed",
  ) {
    super(code);
  }
}

function base64Url(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generatePkceVerifier(
  getRandomValues: (array: Uint8Array) => Uint8Array = (array) =>
    crypto.getRandomValues(array),
): string {
  return base64Url(getRandomValues(new Uint8Array(64)));
}

export function generateOAuthState(
  getRandomValues: (array: Uint8Array) => Uint8Array = (array) =>
    crypto.getRandomValues(array),
): string {
  return base64Url(getRandomValues(new Uint8Array(32)));
}

export async function createS256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

export function parseOAuthCallback(
  callback: string,
  expectedRedirectUrl: string,
  expectedState: string,
): string {
  let url: URL;
  try {
    url = new URL(callback);
  } catch {
    throw new OAuthFlowError("invalid_callback");
  }

  const redirect = new URL(expectedRedirectUrl);
  if (url.origin !== redirect.origin || url.pathname !== redirect.pathname) {
    throw new OAuthFlowError("invalid_callback");
  }
  if (url.searchParams.get("state") !== expectedState) {
    throw new OAuthFlowError("state_mismatch");
  }
  if (url.searchParams.has("error")) {
    throw new OAuthFlowError("denied");
  }

  const code = url.searchParams.get("code")?.trim();
  if (!code) throw new OAuthFlowError("missing_code");
  return code;
}

export function parseTokenResponse(value: unknown, now = Date.now()): TokenSet {
  if (!value || typeof value !== "object") {
    throw new OAuthFlowError("invalid_token_response");
  }
  const token = value as Record<string, unknown>;
  if (
    typeof token.access_token !== "string" ||
    !token.access_token ||
    (token.token_type !== "bearer" && token.token_type !== "Bearer") ||
    typeof token.expires_in !== "number" ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0 ||
    (token.refresh_token !== undefined &&
      (typeof token.refresh_token !== "string" || !token.refresh_token))
  ) {
    throw new OAuthFlowError("invalid_token_response");
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token as string | undefined,
    expiresAt: now + token.expires_in * 1_000,
  };
}

export function isAccessTokenFresh(
  token: Pick<TokenSet, "accessToken" | "expiresAt"> | undefined,
  now = Date.now(),
): token is Pick<TokenSet, "accessToken" | "expiresAt"> {
  return Boolean(token?.accessToken && token.expiresAt - now > 60_000);
}

async function tokenRequest(
  tokenEndpoint: string,
  body: URLSearchParams,
  fetchImpl: typeof fetch,
  now?: number,
): Promise<TokenSet> {
  let response: Response;
  try {
    response = await fetchImpl(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    throw new OAuthFlowError("token_request_failed");
  }
  if (!response.ok) throw new OAuthFlowError("token_request_failed");

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new OAuthFlowError("invalid_token_response");
  }
  return parseTokenResponse(value, now);
}

export function exchangeAuthorizationCode(
  tokenEndpoint: string,
  values: {
    code: string;
    clientId: string;
    redirectUrl: string;
    verifier: string;
  },
  fetchImpl: typeof fetch = fetch,
  now?: number,
): Promise<TokenSet> {
  return tokenRequest(
    tokenEndpoint,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: values.code,
      client_id: values.clientId,
      redirect_uri: values.redirectUrl,
      code_verifier: values.verifier,
    }),
    fetchImpl,
    now,
  );
}

export function refreshAccessToken(
  tokenEndpoint: string,
  values: { clientId: string; refreshToken: string },
  fetchImpl: typeof fetch = fetch,
  now?: number,
): Promise<TokenSet> {
  return tokenRequest(
    tokenEndpoint,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: values.refreshToken,
      client_id: values.clientId,
    }),
    fetchImpl,
    now,
  );
}
