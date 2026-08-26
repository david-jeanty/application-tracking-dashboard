/**
 * The values that cross a context boundary inside JobTrack Capture.
 *
 * Three contexts exist and they trust each other unequally. The injected
 * collector runs inside a page nobody controls and may only hand back plain
 * data. The popup renders and takes the student's confirmation. The background
 * service worker is the only context that ever holds a token or speaks to
 * Supabase or JobTrack. These types are the shapes allowed to move between
 * them, and `messages.ts` is where they are re-validated on arrival.
 */

/** Raw material read from the page, before any interpretation. */
export type PageSignals = {
  /** The text of each `application/ld+json` block, unparsed. */
  jsonLdBlocks: string[];
  /** `<meta>` values keyed by lowercased `name`/`property`. */
  meta: Record<string, string>;
  /** `<link rel="canonical">`, when the page supplies one. */
  canonicalUrl?: string;
  /** The address the page is actually being served from. */
  pageUrl: string;
  /** `document.title`, trimmed. */
  documentTitle?: string;
  /** The first non-empty `<h1>`, trimmed. */
  headingText?: string;
  /**
   * `schema.org` JobPosting microdata, flattened to dotted property paths.
   *
   * The same vocabulary as the JSON-LD path, expressed in attributes on the
   * page instead of in a script block. Employer careers sites publish it far
   * more often than job boards do, and reading it costs no site knowledge.
   */
  microdata?: Record<string, string>;
  /**
   * Markup read through a recognized site's selector table, by field name.
   *
   * Raw inner HTML, bounded. It is turned into text by the same string-only
   * converter the description path uses; nothing is parsed as markup.
   */
  siteFields?: Record<string, string>;
  /**
   * Structural facts used to decide whether a page is a posting at all.
   *
   * The generic fallback needs corroboration before it will call a heading a
   * job title, and these are the cheap, non-textual signals available for it.
   */
  evidence?: {
    /** A control on the page offers to apply for something. */
    applyAffordance?: boolean;
    /** The page carries `schema.org` JobPosting microdata. */
    jobPostingMicrodata?: boolean;
  };
};

/** Why a field could not be filled, so the popup can say so honestly. */
export type ExtractionWarning =
  | "no_job_posting_found"
  | "missing_company"
  | "missing_job_title"
  | "missing_location"
  | "description_too_long";

/**
 * How directly the current posting establishes a field.
 *
 * `exact` is tied to this posting by one bounded, deterministic signal.
 * `strong` is a conservative fallback corroborated by multiple page signals.
 * `ambiguous` means a candidate existed but could not safely be attributed to
 * the posting, so it is deliberately not projected into a saved job.
 */
export type EvidenceConfidence = "exact" | "strong" | "ambiguous";

/** The small, stable vocabulary of extraction mechanisms the extension has. */
export type ExtractionSource =
  | "json_ld_job_posting"
  | "microdata_job_posting"
  | "linkedin_selected_posting"
  | "indeed_site"
  | "workday_selected_posting"
  | "generic_fallback"
  | "generic_metadata"
  | "posting_url"
  | "source_host";

/** The bounded signals that qualify a generic title fallback as a job posting. */
export type GenericFallbackCorroboration =
  | "job_shaped_url"
  | "apply_control"
  | "declared_job_page"
  | "structured_job_posting";

/**
 * Why a candidate was observed but intentionally not trusted.
 *
 * `conflicting_evidence` is the rich-capture case: the posting stated a fact
 * twice and did not state the same thing twice. Choosing one of them would be
 * a coin toss written into a record the student has no reason to doubt.
 */
export type EvidenceRejectionReason =
  | "workday_structured_data_untrusted"
  | "conflicting_evidence";

export type RejectedEvidence = {
  source: ExtractionSource;
  reason: EvidenceRejectionReason;
};

/**
 * One field's extraction outcome. Values occur only in the established case;
 * an ambiguous candidate has no value to accidentally project into a capture.
 */
export type CapturedField<T> =
  | {
      state: "established";
      value: T;
      confidence: Exclude<EvidenceConfidence, "ambiguous">;
      source: ExtractionSource;
      /** Present for a strong generic title fallback; contains no page content. */
      corroboratedBy?: readonly GenericFallbackCorroboration[];
      rejected?: readonly RejectedEvidence[];
    }
  | {
      state: "ambiguous";
      confidence: "ambiguous";
      source: ExtractionSource;
      reason: EvidenceRejectionReason;
    }
  | { state: "absent" };

/**
 * The work arrangements a page is allowed to establish.
 *
 * The stored contract also has `Unknown`, and the extension never sends it: a
 * page that did not say is a page that did not say, and the server's mapper
 * already turns an absent arrangement into `Unknown`. Defaulting here would
 * mean two implementations of one default, and the client's would be the one
 * nobody could see.
 */
export const CAPTURE_WORK_ARRANGEMENTS = ["Remote", "Hybrid", "On-site"] as const;

export type CaptureWorkArrangement = (typeof CAPTURE_WORK_ARRANGEMENTS)[number];

/** What each extracted field holds, for the fields that are not plain strings. */
type ExtractionFieldValues = {
  company: string;
  jobTitle: string;
  location: string;
  companyDomain: string;
  jobDescription: string;
  jobUrl: string;
  source: string;
  deadline: string;
  salary: string;
  workArrangement: CaptureWorkArrangement;
  workTerm: string;
  duration: string;
};

export type ExtractionFieldName = keyof ExtractionFieldValues;

export type ExtractionFields = {
  [Field in ExtractionFieldName]: CapturedField<ExtractionFieldValues[Field]>;
};

/** Internal extraction truth. `toExtractedJob` is its compatibility boundary. */
export type ExtractionReport = {
  fields: ExtractionFields;
  warnings: ExtractionWarning[];
  recognizedSite?: "linkedin" | "indeed" | "workday";
  selectedStrategy?: ExtractionSource;
  structuredData: { jsonLdJobPosting: boolean; microdataJobPosting: boolean };
  pageHost?: string;
};

/** Sanitized, local-only troubleshooting data derived from an ExtractionReport. */
export type ExtractionDiagnostics = {
  recognizedSite?: ExtractionReport["recognizedSite"];
  selectedStrategy?: ExtractionSource;
  structuredData: ExtractionReport["structuredData"];
  pageHost?: string;
  warnings: ExtractionWarning[];
  fields: {
    [Field in ExtractionFieldName]: {
      state: CapturedField<string>["state"];
      confidence?: EvidenceConfidence;
      source?: ExtractionSource;
      corroboratedBy?: readonly GenericFallbackCorroboration[];
      reason?: EvidenceRejectionReason;
      rejected?: readonly RejectedEvidence[];
      /** Present only for description; its contents never leave the extractor. */
      valueLength?: number;
    };
  };
};

/**
 * What the extension believes about the posting on screen.
 *
 * Every field is optional except the warnings, because "we could not tell" is
 * a legitimate and common answer. A field is absent rather than guessed: the
 * student can type what is missing, and a wrong value they do not notice is
 * worse than an empty box they do.
 */
export type ExtractedJob = {
  company?: string;
  jobTitle?: string;
  location?: string;
  /** Only when employer-owned data supplied it. Never the page host. */
  companyDomain?: string;
  /** Plain text, already within JobTrack's stored limit. */
  jobDescription?: string;
  /** Canonical posting URL when offered, otherwise the page URL. */
  jobUrl?: string;
  /** Where the student found it, only when the host makes that unambiguous. */
  source?: string;
  /** `YYYY-MM-DD`, from `validThrough`. */
  deadline?: string;
  salary?: string;
  /** Only when the posting explicitly stated it. Never inferred from a city. */
  workArrangement?: CaptureWorkArrangement;
  /** The recruiting term the posting names, such as `Summer 2027`. */
  workTerm?: string;
  /** The term length the posting states, such as `4 months`. */
  duration?: string;
  warnings: ExtractionWarning[];
};

/** The two statuses a capture is allowed to set. */
export const CAPTURE_STATUSES = ["Interested", "Applied"] as const;

export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

/** What the student confirmed in the popup, on top of the extracted job. */
export type CaptureConfirmation = {
  company: string;
  jobTitle: string;
  location?: string;
  status: CaptureStatus;
};

/** Whether the extension currently holds usable JobTrack credentials. */
export type ConnectionState = { connected: boolean };

/**
 * The outcome of one capture attempt, as the popup needs to render it.
 *
 * `already_tracked` and `created` both name the record so the popup can offer
 * one "Open application" link either way, which is what makes a duplicate feel
 * like an answer rather than a failure.
 */
export type CaptureOutcome =
  | {
      kind: "created";
      application: { company: string; jobTitle: string; url: string };
    }
  | {
      kind: "already_tracked";
      application: { company: string; jobTitle: string; url: string };
    }
  | { kind: "invalid"; issues: string[] }
  | { kind: "unauthorized" }
  | { kind: "network_error" }
  | { kind: "server_error" };
