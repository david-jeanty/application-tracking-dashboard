import {
  createS256Challenge,
  exchangeAuthorizationCode,
  generateOAuthState,
  generatePkceVerifier,
  isAccessTokenFresh,
  OAuthFlowError,
  parseOAuthCallback,
  refreshAccessToken,
  type TokenSet,
} from "./auth-core.js";
import type { ExtensionConfig } from "./config.js";

const ACCESS_KEY = "jobtrack_access";
const REFRESH_KEY = "jobtrack_refresh";

type StoredAccess = Pick<TokenSet, "accessToken" | "expiresAt">;

export async function restrictCredentialStorage(): Promise<void> {
  await Promise.all([
    chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
    chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  ]);
}

async function storeTokenSet(tokens: TokenSet, previousRefresh?: string) {
  const refreshToken = tokens.refreshToken ?? previousRefresh;
  await chrome.storage.session.set({
    [ACCESS_KEY]: {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    } satisfies StoredAccess,
  });
  if (refreshToken) {
    await chrome.storage.local.set({ [REFRESH_KEY]: refreshToken });
  }
}

async function readAccess(): Promise<StoredAccess | undefined> {
  const value = (await chrome.storage.session.get(ACCESS_KEY))[ACCESS_KEY];
  const candidate = value as Record<string, unknown> | undefined;
  if (
    !candidate ||
    typeof candidate.accessToken !== "string" ||
    typeof candidate.expiresAt !== "number"
  ) {
    return undefined;
  }
  return candidate as StoredAccess;
}

async function readRefresh(): Promise<string | undefined> {
  const value = (await chrome.storage.local.get(REFRESH_KEY))[REFRESH_KEY];
  return typeof value === "string" && value ? value : undefined;
}

export async function clearCredentials(): Promise<void> {
  await Promise.all([
    chrome.storage.session.remove(ACCESS_KEY),
    chrome.storage.local.remove(REFRESH_KEY),
  ]);
}

export async function hasCredentials(): Promise<boolean> {
  return Boolean((await readAccess()) || (await readRefresh()));
}

export async function connect(config: ExtensionConfig): Promise<void> {
  if (!config.oauthClientId) throw new OAuthFlowError("invalid_callback");

  const verifier = generatePkceVerifier();
  const state = generateOAuthState();
  const challenge = await createS256Challenge(verifier);
  const redirectUrl = chrome.identity.getRedirectURL("oauth2");
  const authorizeUrl = new URL("/auth/v1/oauth/authorize", config.supabaseOrigin);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: config.oauthClientId,
    redirect_uri: redirectUrl,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();

  const callback = await chrome.identity.launchWebAuthFlow({
    url: authorizeUrl.toString(),
    interactive: true,
  });
  if (!callback) throw new OAuthFlowError("invalid_callback");

  const code = parseOAuthCallback(callback, redirectUrl, state);
  const tokens = await exchangeAuthorizationCode(
    new URL("/auth/v1/oauth/token", config.supabaseOrigin).toString(),
    { code, clientId: config.oauthClientId, redirectUrl, verifier },
  );
  if (!tokens.refreshToken) {
    throw new OAuthFlowError("invalid_token_response");
  }
  await storeTokenSet(tokens);
}

export async function getAccessToken(
  config: ExtensionConfig,
  forceRefresh = false,
): Promise<string | undefined> {
  const access = await readAccess();
  if (!forceRefresh && isAccessTokenFresh(access)) return access.accessToken;

  const refreshToken = await readRefresh();
  if (!refreshToken || !config.oauthClientId) return undefined;

  try {
    const tokens = await refreshAccessToken(
      new URL("/auth/v1/oauth/token", config.supabaseOrigin).toString(),
      { clientId: config.oauthClientId, refreshToken },
    );
    await storeTokenSet(tokens, refreshToken);
    return tokens.accessToken;
  } catch {
    await clearCredentials();
    return undefined;
  }
}
