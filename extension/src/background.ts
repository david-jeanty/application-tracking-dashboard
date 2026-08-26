import {
  connect,
  disconnect,
  getAccessToken,
  isConnected,
  refreshCredentials,
  type AuthDependencies,
} from "./auth.js";
import { postCapture, type CaptureRecord } from "./capture.js";
import { isTrustedSender, readBackgroundRequest } from "./messages.js";
import { chromeCredentialStore } from "./tokens.js";
import type { CaptureOutcome, ConnectionState } from "./types.js";

/**
 * The only context in JobTrack Capture that holds a credential.
 *
 * The popup asks for outcomes, never for tokens; the injected collector is
 * never given a way to ask at all. Keeping the whole authenticated surface in
 * one file is the point — there is exactly one place to check that a token is
 * not logged, not echoed into a response, and not handed to a page.
 */

function dependencies(): AuthDependencies {
  return {
    store: chromeCredentialStore(),
    // Wrapped rather than passed by reference so it stays bound to the worker's
    // global scope no matter how a caller invokes it.
    fetchImpl: (input, init) => fetch(input, init),
    launchWebAuthFlow: (details) => chrome.identity.launchWebAuthFlow(details),
    redirectUri: chrome.identity.getRedirectURL(),
    now: () => Date.now(),
  };
}

/**
 * Saves one confirmed posting, with at most one refresh and one retry.
 *
 * The retry exists because an access token can expire between the popup opening
 * and the student pressing the button, and asking them to sign in again for
 * that would be a bug wearing a login screen. It runs once: if the second
 * attempt is also unauthorized, the credentials are wrong rather than stale,
 * so they are cleared and the popup asks the student to reconnect. There is no
 * loop and no third attempt.
 */
async function capture(record: CaptureRecord): Promise<CaptureOutcome> {
  const auth = dependencies();

  const token = await getAccessToken(auth);
  if (!token) return { kind: "unauthorized" };

  const first = await postCapture(record, token, auth.fetchImpl);
  if (first.kind !== "unauthorized") return first;

  const refreshed = await refreshCredentials(auth);
  if (!refreshed) return { kind: "unauthorized" };

  const second = await postCapture(record, refreshed.accessToken, auth.fetchImpl);
  if (second.kind === "unauthorized") await auth.store.clear();

  return second;
}

async function handle(
  request: NonNullable<ReturnType<typeof readBackgroundRequest>>,
): Promise<ConnectionState | CaptureOutcome | { status: string }> {
  switch (request.type) {
    case "connection-state":
      return { connected: await isConnected(dependencies()) };
    case "connect": {
      const result = await connect(dependencies());
      return result;
    }
    case "disconnect":
      await disconnect(dependencies());
      return { status: "disconnected" };
    case "capture":
      return capture(request.record);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isTrustedSender(sender)) return undefined;

  const request = readBackgroundRequest(message);
  if (!request) {
    sendResponse({ status: "bad_request" });
    return true;
  }

  handle(request)
    .then(sendResponse)
    .catch(() => {
      // Deliberately opaque. A thrown error on these paths can carry a request
      // body holding an authorization code or a token, and this response
      // travels to the popup.
      sendResponse({ status: "error" });
    });

  // Keeps the message channel open for the asynchronous reply above.
  return true;
});
