/**
 * Where the extension keeps the student's JobTrack credentials, and how it
 * reads a token response it is not obliged to believe.
 *
 * Only the background service worker ever calls into this file. Nothing here is
 * reachable from a job page: the injected collector is a separate script that
 * is handed no reference to any of it, and the popup asks the background to act
 * rather than being given a token to act with.
 */

/** What the extension holds after a successful authorization or refresh. */
export type Credentials = {
  accessToken: string;
  /** Epoch milliseconds. Absolute, so a sleeping service worker cannot drift. */
  expiresAt: number;
  refreshToken?: string;
};

/** The storage the background worker uses, behind one seam the tests can fill. */
export type CredentialStore = {
  read(): Promise<Credentials | undefined>;
  write(credentials: Credentials): Promise<void>;
  clear(): Promise<void>;
};

const ACCESS_KEY = "jobtrack.access";
const REFRESH_KEY = "jobtrack.refresh";

/**
 * Chrome-backed storage, split deliberately across two areas.
 *
 * The access token lives in `chrome.storage.session`, which Chrome keeps in
 * memory and discards when the browser closes. A short-lived credential has no
 * business surviving on disk.
 *
 * The refresh token has to outlive the browser session, or "Connect JobTrack"
 * becomes a daily chore and the extension trains students to click through an
 * OAuth screen without reading it. That means `chrome.storage.local`, which is
 * on disk and not encrypted by Chrome. The exposure this accepts is real and
 * worth stating plainly: `storage.local` is readable by this extension's own
 * contexts and by anyone with the profile directory and the local account it
 * belongs to. It is not readable by web pages, by other extensions, or across
 * profiles, and `chrome.storage.session` is additionally unreachable from
 * content scripts by default. Signing out clears both areas, and revoking the
 * connection in JobTrack Settings invalidates the token regardless of what is
 * still stored here. `docs/browser-capture.md` records this trade-off.
 */
export function chromeCredentialStore(): CredentialStore {
  return {
    async read() {
      const [session, local] = await Promise.all([
        chrome.storage.session.get(ACCESS_KEY),
        chrome.storage.local.get(REFRESH_KEY),
      ]);

      const access = session[ACCESS_KEY];
      const refresh = local[REFRESH_KEY];

      const accessToken =
        typeof access === "object" && access !== null
          ? (access as { accessToken?: unknown }).accessToken
          : undefined;
      const expiresAt =
        typeof access === "object" && access !== null
          ? (access as { expiresAt?: unknown }).expiresAt
          : undefined;

      const refreshToken = typeof refresh === "string" ? refresh : undefined;

      if (typeof accessToken !== "string" || typeof expiresAt !== "number") {
        // A refresh token on its own is still a connection: the worker can
        // exchange it for a new access token without asking the student again.
        return refreshToken
          ? { accessToken: "", expiresAt: 0, refreshToken }
          : undefined;
      }

      return { accessToken, expiresAt, ...(refreshToken ? { refreshToken } : {}) };
    },

    async write(credentials) {
      await chrome.storage.session.set({
        [ACCESS_KEY]: {
          accessToken: credentials.accessToken,
          expiresAt: credentials.expiresAt,
        },
      });

      if (credentials.refreshToken) {
        await chrome.storage.local.set({
          [REFRESH_KEY]: credentials.refreshToken,
        });
      }
    },

    async clear() {
      await Promise.all([
        chrome.storage.session.remove(ACCESS_KEY),
        chrome.storage.local.remove(REFRESH_KEY),
      ]);
    },
  };
}

/** In-memory storage, used by the tests and by nothing that ships. */
export function memoryCredentialStore(
  initial?: Credentials,
): CredentialStore & { current(): Credentials | undefined } {
  let held = initial;

  return {
    current: () => held,
    read: async () => held,
    write: async (credentials) => {
      held = credentials;
    },
    clear: async () => {
      held = undefined;
    },
  };
}

/**
 * Refresh this long before expiry rather than at it.
 *
 * A token that is valid for another two seconds is not usable in practice: the
 * request has to reach the server. Treating the last minute as expired turns a
 * race into an ordinary refresh.
 */
export const EXPIRY_MARGIN_MS = 60_000;

export function isUsable(credentials: Credentials, now: number): boolean {
  return (
    credentials.accessToken.length > 0 &&
    credentials.expiresAt - EXPIRY_MARGIN_MS > now
  );
}

/**
 * Reads a token endpoint response, refusing anything that is not one.
 *
 * The extension talks to a configured Supabase origin over HTTPS, but a token
 * response is still parsed rather than trusted: a proxy, a captive portal, or a
 * misconfigured origin can all produce a 200 with JSON that is not a token, and
 * storing an empty string as a credential produces a confusing signed-in state
 * that never works.
 */
export function parseTokenResponse(
  payload: unknown,
  now: number,
): Credentials | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;

  const body = payload as Record<string, unknown>;
  const accessToken = body["access_token"];
  const tokenType = body["token_type"];
  const expiresIn = body["expires_in"];
  const refreshToken = body["refresh_token"];

  if (typeof accessToken !== "string" || accessToken.trim() === "") {
    return undefined;
  }

  if (typeof tokenType === "string" && tokenType.toLowerCase() !== "bearer") {
    return undefined;
  }

  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return undefined;
  }

  return {
    accessToken,
    expiresAt: now + expiresIn * 1_000,
    ...(typeof refreshToken === "string" && refreshToken.trim() !== ""
      ? { refreshToken }
      : {}),
  };
}
