import {
  clearCredentials,
  connect,
  getAccessToken,
  hasCredentials,
  restrictCredentialStorage,
} from "./auth.js";
import { OAuthFlowError } from "./auth-core.js";
import { getExtensionConfig } from "./config.js";
import { extractCurrentPage } from "./extractor.js";
import {
  isExtractionResult,
  isPopupRequest,
  type CaptureRecord,
  type ExtensionError,
  type PopupRequest,
  type PopupResponse,
  type TrackedApplication,
} from "./types.js";

void restrictCredentialStorage().catch(() => undefined);
chrome.runtime.onInstalled.addListener(() => {
  void restrictCredentialStorage().catch(() => undefined);
});

function failure(error: ExtensionError): PopupResponse {
  return { ok: false, error };
}

function isTrackedApplication(value: unknown): value is TrackedApplication {
  if (!value || typeof value !== "object") return false;
  const app = value as Record<string, unknown>;
  return ["id", "company", "job_title", "href"].every(
    (key) => typeof app[key] === "string" && app[key].length > 0,
  );
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function callCaptureApi(record: CaptureRecord): Promise<PopupResponse> {
  const config = await getExtensionConfig();
  let token = await getAccessToken(config);
  if (!token) {
    return failure({
      code: "not_connected",
      message: "Reconnect Interndex to track this job.",
    });
  }

  const request = (accessToken: string) =>
    fetch(new URL("/api/browser-capture", config.jobTrackOrigin), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(record),
    });

  let response: Response;
  try {
    response = await request(token);
    if (response.status === 401) {
      token = await getAccessToken(config, true);
      if (!token) {
        return failure({
          code: "token_expired",
          message: "Your Interndex connection expired. Reconnect to continue.",
        });
      }
      response = await request(token);
      if (response.status === 401) {
        await clearCredentials();
        return failure({
          code: "token_expired",
          message: "Your Interndex connection expired. Reconnect to continue.",
        });
      }
    }
  } catch {
    return failure({
      code: "network",
      message: "Interndex could not be reached. Check your connection and try again.",
    });
  }

  const body = await parseJson(response);
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : undefined;

  if (
    (response.status === 201 || response.status === 409) &&
    isTrackedApplication(payload?.application)
  ) {
    return {
      ok: true,
      data: {
        type: "CAPTURED",
        outcome: response.status === 201 ? "created" : "already_tracked",
        application: payload.application,
      },
    };
  }

  if (response.status === 400) {
    const issues = Array.isArray(payload?.issues)
      ? payload.issues
          .map((issue) =>
            issue && typeof issue === "object" &&
            typeof (issue as Record<string, unknown>).message === "string"
              ? String((issue as Record<string, unknown>).message)
              : undefined,
          )
          .filter((issue): issue is string => Boolean(issue))
      : undefined;
    return failure({
      code: "invalid",
      message: "Check the job details and try again.",
      ...(issues?.length ? { issues } : {}),
    });
  }
  if (response.status === 403) {
    return failure({
      code: "authorization_denied",
      message: "Interndex did not allow this save. Reconnect and try again.",
    });
  }
  return failure({
    code: "server",
    message: "Interndex could not save this job. Try again in a moment.",
  });
}

async function extractActivePage(): Promise<PopupResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return failure({
      code: "extraction_failed",
      message: "No active page was available to read.",
    });
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractCurrentPage,
    });
    if (!isExtractionResult(result?.result)) {
      throw new Error("No extraction result");
    }
    return {
      ok: true,
      data: { type: "EXTRACTED", extraction: result.result },
    };
  } catch {
    return failure({
      code: "restricted_page",
      message:
        "Chrome does not allow this page to be read. Open a public job posting and try again.",
    });
  }
}

async function handleRequest(request: PopupRequest): Promise<PopupResponse> {
  const config = await getExtensionConfig();

  switch (request.type) {
    case "GET_CONNECTION":
      return {
        ok: true,
        data: {
          type: "CONNECTION",
          status: {
            connected: await hasCredentials(),
            configured: Boolean(config.oauthClientId),
            redirectUrl: chrome.identity.getRedirectURL("oauth2"),
          },
        },
      };
    case "CONNECT":
      if (!config.oauthClientId) {
        return failure({
          code: "not_configured",
          message: "This build needs an Interndex OAuth client ID before it can connect.",
        });
      }
      try {
        await connect(config);
        return { ok: true, data: { type: "CONNECTED" } };
      } catch (error) {
        if (error instanceof OAuthFlowError && error.code === "denied") {
          return failure({
            code: "oauth_denied",
            message: "Connection was not approved. You can try again when ready.",
          });
        }
        return failure({
          code: "connection_failed",
          message: "Interndex could not be connected. Try the connection again.",
        });
      }
    case "DISCONNECT":
      await clearCredentials();
      return { ok: true, data: { type: "DISCONNECTED" } };
    case "EXTRACT_ACTIVE_PAGE":
      return extractActivePage();
    case "SAVE_CAPTURE":
      return callCaptureApi(request.record);
    case "OPEN_APPLICATION": {
      if (!/^\/applications\/[0-9a-f-]+$/i.test(request.href)) {
        return failure({ code: "server", message: "That application link is invalid." });
      }
      const url = new URL(request.href, config.jobTrackOrigin);
      if (url.origin !== config.jobTrackOrigin) {
        return failure({ code: "server", message: "That application link is invalid." });
      }
      await chrome.tabs.create({ url: url.toString() });
      return { ok: true, data: { type: "OPENED" } };
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isPopupRequest(message)) return false;

  void handleRequest(message)
    .then(sendResponse)
    .catch(() =>
      sendResponse(
        failure({
          code: "server",
          message: "Interndex Capture hit an unexpected error. Try again.",
        }),
      ),
    );
  return true;
});
