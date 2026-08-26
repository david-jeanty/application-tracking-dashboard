import { authorizationEndpoint, tokenEndpoint, EXTENSION_CONFIG } from "./config.js";
import { createPkcePair, createState, type PkcePair } from "./pkce.js";
import {
  isUsable,
  parseTokenResponse,
  type CredentialStore,
  type Credentials,
} from "./tokens.js";

/**
 * Connecting the extension to the student's own JobTrack account.
 *
 * Authorization Code with PKCE against the same Supabase authorization server
 * the web app and MCP already use, through a dedicated public client so that
 * "JobTrack Capture" and a connected AI assistant are separate grants a student
 * can allow and revoke independently.
 *
 * Everything the flow needs from the outside world arrives as a dependency:
 * the browser's auth-flow launcher, `fetch`, the clock, the credential store,
 * and the random-value generators. That is what makes state mismatch, denied
 * consent, a malformed token response, and a failed refresh testable without
 * pretending to run a live OAuth server.
 */

export type AuthDependencies = {
  store: CredentialStore;
  fetchImpl: typeof fetch;
  launchWebAuthFlow: (details: {
    url: string;
    interactive: boolean;
  }) => Promise<string | undefined>;
  redirectUri: string;
  now: () => number;
  newState?: () => string;
  newPkcePair?: () => Promise<PkcePair>;
};

export type ConnectResult =
  | { status: "connected" }
  | { status: "cancelled" }
  | { status: "denied" }
  | { status: "state_mismatch" }
  | { status: "no_code" }
  | { status: "token_rejected" }
  | { status: "network_error" };

/**
 * The authorization request, with PKCE and an unguessable state.
 *
 * No scope is requested. Supabase issues an ordinary user access token here,
 * and asking for a narrower scope that the authorization server does not
 * enforce would be decoration. `docs/browser-capture.md` records this as the
 * open least-privilege question for the release review rather than papering
 * over it with a parameter that changes nothing.
 */
export function buildAuthorizationUrl(options: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(authorizationEndpoint());

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", EXTENSION_CONFIG.oauthClientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("state", options.state);
  url.searchParams.set("code_challenge", options.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

export type CallbackReading =
  | { status: "code"; code: string }
  | { status: "denied" }
  | { status: "state_mismatch" }
  | { status: "no_code" };

/**
 * Reads the redirect Chrome hands back, checking state before anything else.
 *
 * State is compared first and on every path. A callback whose state does not
 * match the request the extension actually made is not an error to report in
 * terms of its contents — it is a response to somebody else's request, and its
 * `code` and `error` values are not evidence of anything.
 */
export function readCallback(
  callbackUrl: string | undefined,
  expectedState: string,
): CallbackReading {
  if (!callbackUrl) return { status: "no_code" };

  let parameters: URLSearchParams;
  try {
    const url = new URL(callbackUrl);
    // Supabase returns the code in the query string; a fragment response is
    // read too so a provider that uses one does not look like a silent failure.
    parameters = new URLSearchParams(
      url.search ? url.search.slice(1) : url.hash.replace(/^#/, ""),
    );
  } catch {
    return { status: "no_code" };
  }

  if (parameters.get("state") !== expectedState) return { status: "state_mismatch" };

  const error = parameters.get("error");
  if (error) {
    return error === "access_denied" ? { status: "denied" } : { status: "no_code" };
  }

  const code = parameters.get("code");
  if (!code) return { status: "no_code" };

  return { status: "code", code };
}

async function requestToken(
  dependencies: AuthDependencies,
  body: URLSearchParams,
): Promise<Credentials | "network_error" | "rejected"> {
  // Called as a plain function rather than as `dependencies.fetchImpl(...)`.
  // A method call would pass the dependencies object as `this`, and the
  // browser's own `fetch` rejects that with an illegal-invocation error — a
  // failure that looks exactly like an unreachable network from the outside,
  // and that a test double would never reproduce.
  const { fetchImpl } = dependencies;

  let response: Response;
  try {
    response = await fetchImpl(tokenEndpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
      cache: "no-store",
    });
  } catch {
    // The thrown error can quote the request body, which holds the
    // authorization code and the code verifier. It is never logged or shown.
    return "network_error";
  }

  if (!response.ok) return "rejected";

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return "rejected";
  }

  return parseTokenResponse(payload, dependencies.now()) ?? "rejected";
}

/**
 * Runs the whole connect flow and stores the result, or nothing at all.
 *
 * Credentials are written only after a token response has been validated, so a
 * half-finished authorization never leaves the extension looking connected.
 */
export async function connect(
  dependencies: AuthDependencies,
): Promise<ConnectResult> {
  const state = (dependencies.newState ?? createState)();
  const { verifier, challenge } = await (
    dependencies.newPkcePair ?? createPkcePair
  )();

  let callbackUrl: string | undefined;
  try {
    callbackUrl = await dependencies.launchWebAuthFlow({
      url: buildAuthorizationUrl({
        redirectUri: dependencies.redirectUri,
        state,
        codeChallenge: challenge,
      }),
      interactive: true,
    });
  } catch {
    // Chrome rejects this when the student closes the window, which is a
    // cancellation rather than a failure worth alarming them about.
    return { status: "cancelled" };
  }

  const reading = readCallback(callbackUrl, state);
  if (reading.status !== "code") return { status: reading.status };

  const result = await requestToken(
    dependencies,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: reading.code,
      redirect_uri: dependencies.redirectUri,
      client_id: EXTENSION_CONFIG.oauthClientId,
      code_verifier: verifier,
    }),
  );

  if (result === "network_error") return { status: "network_error" };
  if (result === "rejected") return { status: "token_rejected" };

  await dependencies.store.write(result);

  return { status: "connected" };
}

/**
 * Exchanges the stored refresh token for a new access token.
 *
 * A rejected refresh token is a settled answer — revoked, expired, or already
 * used — so the credentials are cleared and the extension returns to its
 * disconnected state rather than retrying. A network failure is not settled,
 * so the credentials are left alone and the student can try again.
 */
export async function refreshCredentials(
  dependencies: AuthDependencies,
): Promise<Credentials | undefined> {
  const existing = await dependencies.store.read();
  if (!existing?.refreshToken) return undefined;

  const result = await requestToken(
    dependencies,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: existing.refreshToken,
      client_id: EXTENSION_CONFIG.oauthClientId,
    }),
  );

  if (result === "network_error") return undefined;

  if (result === "rejected") {
    await dependencies.store.clear();
    return undefined;
  }

  // Supabase rotates refresh tokens; keep the previous one only if the
  // response omitted a replacement.
  const credentials: Credentials = {
    ...result,
    ...(result.refreshToken ? {} : { refreshToken: existing.refreshToken }),
  };

  await dependencies.store.write(credentials);

  return credentials;
}

/**
 * The access token to use for one capture, refreshing first if needed.
 *
 * There is no loop here and there is deliberately no retry: this either returns
 * a token that was valid a moment ago or it returns nothing.
 */
export async function getAccessToken(
  dependencies: AuthDependencies,
): Promise<string | undefined> {
  const existing = await dependencies.store.read();
  if (!existing) return undefined;

  if (isUsable(existing, dependencies.now())) return existing.accessToken;

  return (await refreshCredentials(dependencies))?.accessToken;
}

/** Whether the extension currently has any credential worth trying. */
export async function isConnected(
  dependencies: AuthDependencies,
): Promise<boolean> {
  const existing = await dependencies.store.read();
  if (!existing) return false;

  return (
    Boolean(existing.refreshToken) || isUsable(existing, dependencies.now())
  );
}

/**
 * Signs out by discarding what the extension holds.
 *
 * This does not revoke the grant, and the extension does not pretend it does:
 * revocation belongs to JobTrack Settings, where Supabase is the source of
 * truth about who still has access. Clearing here removes this browser's
 * ability to act; the student is told where to revoke the connection itself.
 */
export async function disconnect(
  dependencies: AuthDependencies,
): Promise<void> {
  await dependencies.store.clear();
}
