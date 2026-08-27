import {
  CAPTURE_STATUSES,
  CAPTURE_WORK_ARRANGEMENTS,
  type CaptureStatus,
  type CaptureWorkArrangement,
} from "./types.js";
import type { CaptureRecord } from "./capture.js";

/**
 * The contract between the popup and the background service worker.
 *
 * Messages are validated on arrival even though both ends ship in the same
 * package. `chrome.runtime.onMessage` is a shared inbox: content scripts and,
 * where a page is externally connectable, web pages can reach it too. The
 * background worker is the only holder of tokens in this extension, so it
 * checks who is talking and what they said before doing anything, rather than
 * inferring both from the fact that a message arrived.
 */

export type BackgroundRequest =
  | { type: "connection-state" }
  | { type: "connect" }
  | { type: "disconnect" }
  | { type: "capture"; record: CaptureRecord };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, limit: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= limit
    ? value
    : undefined;
}

/** The three arrangements a page may establish. `Unknown` is not one of them. */
function captureWorkArrangement(
  value: unknown,
): CaptureWorkArrangement | undefined {
  return typeof value === "string" &&
    (CAPTURE_WORK_ARRANGEMENTS as readonly string[]).includes(value)
    ? (value as CaptureWorkArrangement)
    : undefined;
}

function isCaptureStatus(value: unknown): value is CaptureStatus {
  return (
    typeof value === "string" &&
    (CAPTURE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Reads a capture record out of a message without trusting its shape.
 *
 * The limits mirror the server's record contract so an oversized value fails
 * here rather than after a round trip, and unknown properties are dropped by
 * construction: the returned object is rebuilt field by field, so nothing the
 * sender invented — `user_id` most of all — can ride along to the API.
 */
function readCaptureRecord(value: unknown): CaptureRecord | undefined {
  if (!isRecord(value)) return undefined;

  const company = optionalString(value["company"], 160);
  const jobTitle = optionalString(value["job_title"], 200);
  const status = value["status"];

  if (!company || !jobTitle || !isCaptureStatus(status)) return undefined;

  const location = optionalString(value["location"], 200);
  const companyDomain = optionalString(value["company_domain"], 255);
  const description = optionalString(value["job_description"], 50_000);
  const jobUrl = optionalString(value["job_url"], 2_048);
  const source = optionalString(value["source"], 100);
  const deadline = optionalString(value["deadline"], 10);
  const salary = optionalString(value["salary"], 100);
  const workArrangement = captureWorkArrangement(value["work_arrangement"]);
  const workTerm = optionalString(value["work_term"], 80);
  const duration = optionalString(value["duration"], 80);

  return {
    company,
    job_title: jobTitle,
    status,
    ...(location ? { location } : {}),
    ...(companyDomain ? { company_domain: companyDomain } : {}),
    ...(description ? { job_description: description } : {}),
    ...(jobUrl ? { job_url: jobUrl } : {}),
    ...(source ? { source } : {}),
    ...(deadline ? { deadline } : {}),
    ...(salary ? { salary } : {}),
    ...(workArrangement ? { work_arrangement: workArrangement } : {}),
    ...(workTerm ? { work_term: workTerm } : {}),
    ...(duration ? { duration } : {}),
  };
}

/** One validated request, or nothing the background worker should act on. */
export function readBackgroundRequest(
  message: unknown,
): BackgroundRequest | undefined {
  if (!isRecord(message)) return undefined;

  switch (message["type"]) {
    case "connection-state":
      return { type: "connection-state" };
    case "connect":
      return { type: "connect" };
    case "disconnect":
      return { type: "disconnect" };
    case "capture": {
      const record = readCaptureRecord(message["record"]);
      return record ? { type: "capture", record } : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Whether a message came from a document belonging to this extension.
 *
 * Both halves are needed. A content script shares the extension's id, so the id
 * alone would let page-injected code ask the background worker for things; its
 * `url` is the web page it was injected into, which is what gives it away. The
 * check is written as "the sender is a document under our own origin" rather
 * than "the sender is not in a tab", because the second phrasing also refuses
 * legitimate extension pages that happen to be open in a tab — a distinction
 * that only shows up the first time the popup is opened as one.
 *
 * No page script needs to ask the background worker for anything, and the one
 * thing it might want — a token — is exactly what must never be handed out.
 */
export function isTrustedSender(sender: {
  id?: string;
  url?: string;
  tab?: { id?: number };
}): boolean {
  if (sender.id !== chrome.runtime.id) return false;

  const ownOrigin = chrome.runtime.getURL("");

  return typeof sender.url === "string" && sender.url.startsWith(ownOrigin);
}
