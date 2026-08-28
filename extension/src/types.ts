export const CAPTURE_STATUSES = ["Interested", "Applied"] as const;

export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

export type CaptureRecord = {
  company?: string;
  job_title?: string;
  company_domain?: string;
  location?: string;
  job_description?: string;
  job_url?: string;
  source?: "LinkedIn" | "Indeed";
  deadline?: string;
  salary?: string;
  status?: CaptureStatus;
};

export type ExtractionMethod = "json_ld" | "metadata" | "heading" | "none";
export type ExtractionWarning = "description_oversized";

export type ExtractionResult = {
  record: CaptureRecord;
  method: ExtractionMethod;
  jobPostingFound: boolean;
  warnings: ExtractionWarning[];
};

export type TrackedApplication = {
  id: string;
  company: string;
  job_title: string;
  href: string;
};

export type ExtensionErrorCode =
  | "not_configured"
  | "not_connected"
  | "connection_failed"
  | "oauth_denied"
  | "authorization_denied"
  | "token_expired"
  | "restricted_page"
  | "extraction_failed"
  | "invalid"
  | "network"
  | "server";

export type ExtensionError = {
  code: ExtensionErrorCode;
  message: string;
  issues?: string[];
};

export type PopupRequest =
  | { type: "GET_CONNECTION" }
  | { type: "CONNECT" }
  | { type: "DISCONNECT" }
  | { type: "EXTRACT_ACTIVE_PAGE" }
  | { type: "SAVE_CAPTURE"; record: CaptureRecord }
  | { type: "OPEN_APPLICATION"; href: string };

export type ConnectionStatus = {
  connected: boolean;
  configured: boolean;
  redirectUrl: string;
};

export type PopupResponseData =
  | { type: "CONNECTION"; status: ConnectionStatus }
  | { type: "CONNECTED" }
  | { type: "DISCONNECTED" }
  | { type: "EXTRACTED"; extraction: ExtractionResult }
  | {
      type: "CAPTURED";
      outcome: "created" | "already_tracked";
      application: TrackedApplication;
    }
  | { type: "OPENED" };

export type PopupResponse =
  | { ok: true; data: PopupResponseData }
  | { ok: false; error: ExtensionError };

const REQUEST_TYPES = new Set([
  "GET_CONNECTION",
  "CONNECT",
  "DISCONNECT",
  "EXTRACT_ACTIVE_PAGE",
  "SAVE_CAPTURE",
  "OPEN_APPLICATION",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function isCaptureRecord(value: unknown): value is CaptureRecord {
  if (!isPlainObject(value)) return false;

  const allowed = [
    "company",
    "job_title",
    "company_domain",
    "location",
    "job_description",
    "job_url",
    "source",
    "deadline",
    "salary",
    "status",
  ] as const;
  if (!hasOnlyKeys(value, allowed)) return false;

  for (const [key, item] of Object.entries(value)) {
    if (key === "status") {
      if (!CAPTURE_STATUSES.includes(item as CaptureStatus)) return false;
    } else if (key === "source") {
      if (item !== "LinkedIn" && item !== "Indeed") return false;
    } else if (typeof item !== "string") {
      return false;
    }
  }
  return true;
}

export function isPopupRequest(value: unknown): value is PopupRequest {
  if (!isPlainObject(value) || !REQUEST_TYPES.has(String(value.type))) {
    return false;
  }

  if (value.type === "SAVE_CAPTURE") {
    return hasOnlyKeys(value, ["type", "record"]) && isCaptureRecord(value.record);
  }
  if (value.type === "OPEN_APPLICATION") {
    return (
      hasOnlyKeys(value, ["type", "href"]) &&
      typeof value.href === "string" &&
      value.href.length <= 2_048
    );
  }
  return hasOnlyKeys(value, ["type"]);
}

export function isExtractionResult(value: unknown): value is ExtractionResult {
  if (!isPlainObject(value) || !isCaptureRecord(value.record)) return false;
  if (
    !["json_ld", "metadata", "heading", "none"].includes(String(value.method)) ||
    typeof value.jobPostingFound !== "boolean" ||
    !Array.isArray(value.warnings)
  ) {
    return false;
  }
  return value.warnings.every((warning) => warning === "description_oversized");
}

export function isPopupResponse(value: unknown): value is PopupResponse {
  if (!isPlainObject(value) || typeof value.ok !== "boolean") return false;
  if (value.ok) {
    return isPlainObject(value.data) && typeof value.data.type === "string";
  }
  return (
    isPlainObject(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string"
  );
}
