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
