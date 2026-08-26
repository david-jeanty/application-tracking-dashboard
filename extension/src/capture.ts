import { captureEndpoint, jobtrackUrl } from "./config.js";
import type {
  CaptureConfirmation,
  CaptureOutcome,
  CaptureWorkArrangement,
  ExtractedJob,
} from "./types.js";

/**
 * Sending one confirmed posting to the student's JobTrack account.
 *
 * The extension writes through `POST /api/browser-capture` and never touches a
 * Supabase table directly, even though the access token it holds would
 * technically be accepted by one. The server owns validation, the duplicate
 * rule, the truthful defaults, and the audit surface; a client that wrote rows
 * itself would be a second implementation of all of that, drifting quietly.
 *
 * Nothing here re-implements the server's validation either. The popup checks
 * that a company and a title are present because an empty box is a UX problem
 * worth catching before a network round trip — every other rule is answered by
 * the response.
 */

/** The caller-neutral external record shape shared with MCP. No `user_id`. */
export type CaptureRecord = {
  company: string;
  job_title: string;
  company_domain?: string;
  location?: string;
  status: "Interested" | "Applied";
  job_description?: string;
  job_url?: string;
  source?: string;
  deadline?: string;
  salary?: string;
  /**
   * The three rich fields, on the record contract's own wire names.
   *
   * `work_arrangement` also accepts `Unknown` server-side and the extension
   * never sends it, because "the page did not say" is what an omitted field
   * already means. Same for `work_term`: the server stores `Not specified`
   * when it is absent, and a client that sent the sentinel itself would be a
   * second implementation of a default only one of them can own.
   */
  work_arrangement?: CaptureWorkArrangement;
  work_term?: string;
  duration?: string;
};

/**
 * Combines what was extracted with what the student confirmed.
 *
 * The confirmation wins for the three fields the popup shows, because the
 * student was looking at the posting and the extractor was looking at markup.
 * Fields the popup does not show are passed through exactly as extracted or
 * left out entirely — the extension has no field it fills in on its own.
 *
 * `date_applied` is deliberately absent even when the status is `Applied`. The
 * extension has no idea when the student applied, and today's date would be a
 * plausible-looking guess written into a record used for follow-up timing.
 * They can set it in JobTrack, which knows how to ask.
 */
export function buildCaptureRecord(
  extracted: ExtractedJob,
  confirmation: CaptureConfirmation,
): CaptureRecord {
  const location = confirmation.location?.trim();

  return {
    company: confirmation.company.trim(),
    job_title: confirmation.jobTitle.trim(),
    status: confirmation.status,
    ...(location ? { location } : {}),
    ...(extracted.companyDomain ? { company_domain: extracted.companyDomain } : {}),
    ...(extracted.jobDescription
      ? { job_description: extracted.jobDescription }
      : {}),
    ...(extracted.jobUrl ? { job_url: extracted.jobUrl } : {}),
    ...(extracted.source ? { source: extracted.source } : {}),
    ...(extracted.deadline ? { deadline: extracted.deadline } : {}),
    ...(extracted.salary ? { salary: extracted.salary } : {}),
    ...(extracted.workArrangement
      ? { work_arrangement: extracted.workArrangement }
      : {}),
    ...(extracted.workTerm ? { work_term: extracted.workTerm } : {}),
    ...(extracted.duration ? { duration: extracted.duration } : {}),
  };
}

function readApplication(payload: unknown) {
  if (typeof payload !== "object" || payload === null) return undefined;

  const application = (payload as { application?: unknown }).application;
  if (typeof application !== "object" || application === null) return undefined;

  const fields = application as Record<string, unknown>;
  const company = fields["company"];
  const jobTitle = fields["job_title"];
  const href = fields["href"];

  if (
    typeof company !== "string" ||
    typeof jobTitle !== "string" ||
    typeof href !== "string" ||
    // A relative JobTrack path and nothing else: the link the popup offers is
    // built from the configured origin, so a response cannot point it away.
    !href.startsWith("/") ||
    href.startsWith("//")
  ) {
    return undefined;
  }

  return { company, jobTitle, url: jobtrackUrl(href) };
}

function readIssues(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];

  const issues = (payload as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];

  return issues
    .map((issue) =>
      typeof issue === "object" && issue !== null
        ? (issue as { message?: unknown }).message
        : undefined,
    )
    .filter((message): message is string => typeof message === "string")
    .slice(0, 5);
}

/**
 * One capture request. The caller decides whether a 401 is worth a retry.
 *
 * Kept free of retry logic on purpose: the single refresh-and-retry lives in
 * the background worker, where there is exactly one place to see that it
 * happens at most once.
 */
export async function postCapture(
  record: CaptureRecord,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CaptureOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(captureEndpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(record),
      cache: "no-store",
    });
  } catch {
    return { kind: "network_error" };
  }

  if (response.status === 401) return { kind: "unauthorized" };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (response.status === 201) {
    const application = readApplication(payload);
    return application ? { kind: "created", application } : { kind: "server_error" };
  }

  if (response.status === 409) {
    const application = readApplication(payload);
    return application
      ? { kind: "already_tracked", application }
      : { kind: "server_error" };
  }

  if (response.status === 400) {
    return { kind: "invalid", issues: readIssues(payload) };
  }

  return { kind: "server_error" };
}
