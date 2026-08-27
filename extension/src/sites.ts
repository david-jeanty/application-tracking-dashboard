import { htmlToPlainText } from "./html-text.js";
import type { UnresolvedFallback } from "./linkedin-frames.js";
import type { ExtractedJob, PageSignals } from "./types.js";

/**
 * The three job surfaces JobTrack Capture recognizes by name, and nothing else.
 *
 * Site knowledge was deliberately absent from the first version, on the theory
 * that a selector guess is worse than a blank field. Manual testing in real
 * Chrome showed the theory was half right: the blanks were correct, but the
 * generic fallback beneath them was not conservative enough, and on LinkedIn,
 * Indeed and Workday it confidently turned page furniture — "Welcome back",
 * "Search for Jobs" — into job titles. Those three carry most of a student's
 * search, so they get narrow, deterministic read paths here, and the generic
 * fallback is switched off on them entirely: a recognized site that yields
 * nothing yields blanks, never the page's first heading.
 *
 * What is in this file is a table of selectors and named relational strategies,
 * and a little URL arithmetic. It does not know that JobTrack exists. It
 * performs no network request, executes nothing from the page, and calls no
 * site API. Every value it produces is read out of the DOM the student is
 * already looking at, and every value it cannot read is absent.
 *
 * Selector preference, highest first: structured data (handled before this file
 * is reached), semantic and accessibility attributes, stable data attributes
 * the site itself maintains for its own automation, then narrowly scoped
 * component containers. Nothing here keys off generated class hashes,
 * `nth-child`, colour, or nesting depth.
 *
 * Indeed and Workday are selector tables and Workday is confirmed working in
 * real Chrome. LinkedIn is not: the class names this file first carried —
 * `.job-details-jobs-unified-top-card__job-title` and its neighbours — matched
 * nothing on the LinkedIn being served, and every field came back blank. The
 * markup that is served exposes the company through an `aria-label`, the
 * description through a `data-testid`, and the title and location only as
 * unattributed leaves whose classes are generated hashes. A list of selectors
 * cannot express "the title inside the card this company belongs to", so
 * LinkedIn is described here as named strategies instead, and the collector
 * implements those relational reads. They are strategies rather than a
 * framework: there are two, both LinkedIn's, and each exists because a live
 * failure proved the other one wrong on that route.
 *
 * This file also says, for a LinkedIn split pane, that the popup must work out
 * *which document* to read before it reads anything — the current posting can
 * be inside a same-origin iframe while the top document still holds the last
 * one. The mechanism for that is `linkedin-frames.ts`; what belongs here is the
 * fact that the route needs it, and which posting id it must corroborate.
 */

export type SiteId = "linkedin" | "indeed" | "workday";

/** One field the injected collector should try to read, in preference order. */
export type FieldRule = { key: SiteFieldKey; selectors: string[] };

export type SiteFieldKey =
  | "title"
  | "company"
  | "location"
  | "description"
  /**
   * The arrangement a selected posting states beside its own location.
   *
   * LinkedIn writes it as a parenthesized suffix — `Toronto, Ontario, Canada
   * (Hybrid)` — on the card the address names. It is read out of the same
   * bounded element the location comes from, so it is the selected posting's
   * fact and no other's, and it is returned verbatim: the mapping from that
   * word to a stored value belongs to `rich-fields.ts`, which owns the one
   * table of arrangement words.
   */
  | "workplaceType";

/**
 * A relational read the collector performs, for a site no selector list fits.
 *
 * They are named rather than described, because the alternative — a data
 * language for "walk up from this anchor until…" — would be a scraping engine,
 * and a scraping engine is the thing this extension is not.
 *
 * There are two LinkedIn strategies because its routes differ in a way that
 * matters, plus one Workday strategy because its global automation ids occur
 * in both a selected posting and its Similar Jobs rail:
 *
 * - `linkedin-job-detail` is a page showing one posting at one address. The
 *   first labelled company on it belongs to that posting.
 * - `linkedin-split-pane` is search, recommended, and Similar Jobs: a rail of
 *   other people's postings beside a detail pane, in a document that is not
 *   necessarily the one the address describes. Everything is read inside the
 *   pane's own region and nothing is read outside it.
 */
export type SiteStrategy =
  | "linkedin-job-detail"
  | "linkedin-split-pane"
  | "workday-job-detail";

/**
 * How to find the document that is actually showing the selected posting.
 *
 * A split-pane LinkedIn tab does not always render the posting in its main
 * frame. On the live Similar Jobs route the current posting is inside a
 * same-origin `/preload/?_bprMode=vanilla` iframe while the top document still
 * holds the previous one, so the popup resolves a frame before it collects
 * anything. `linkedin-frames.ts` holds that mechanism; this says which posting
 * it must corroborate, and what to do when no frame does.
 */
export type FrameResolution = {
  /** The posting the top-level address names, and the only id that decides. */
  jobId: string;
  /**
   * What to read when no frame establishes `jobId`.
   *
   * `top-document` for search and the recommended collections, where the live
   * GE Vernova diagnostic proved the selected posting really is in the top
   * document's Primary content — laid out at `0×0`, but present and correct.
   *
   * `blank` for Similar Jobs, where the top document holds the posting the
   * student came *from*. Reading it would file the previous employer under the
   * current job's address, which is the failure this whole path exists for.
   */
  unresolved: UnresolvedFallback;
};

/** What the collector should do on this page: selectors, a strategy, or both. */
export type PageReadRules = {
  fields: readonly FieldRule[];
  strategy?: SiteStrategy;
  /** The Workday tenant label, used only to corroborate sidebar branding. */
  workdayTenant?: string;
  /**
   * The posting the address says the student selected — `currentJobId`.
   *
   * Identity, not a field. Nothing is ever stored from it except through
   * `canonicalPostingUrl`, and the collector uses it only to tell the selected
   * posting's markup apart from a neighbouring card's.
   */
  jobId?: string;
  /** Present when the popup must choose a document before it collects. */
  resolveFrame?: FrameResolution;
};

/** What one address resolves to, before the site's defaults are applied. */
type RoutedRead = {
  strategy: SiteStrategy;
  jobId?: string;
  resolveFrame?: FrameResolution;
  workdayTenant?: string;
};

type SiteRule = {
  id: SiteId;
  /** Registrable-suffix matches, compared against the page's own hostname. */
  hosts: string[];
  fields: FieldRule[];
  strategy?: SiteStrategy;
  /** For a site whose routes need different reads, which one this address is. */
  route?: (url: URL) => RoutedRead;
};

/** A job identifier: digits, or the short alphanumerics Indeed hands out. */
function jobIdentifier(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed && /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : undefined;
}

/** The posting a LinkedIn address says is selected, on any of its routes. */
function selectedLinkedInJob(url: URL): string | undefined {
  return (
    jobIdentifier(url.searchParams.get("currentJobId")) ??
    jobIdentifier(/\/jobs\/view\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1])
  );
}

/** Whether this LinkedIn address is one where two postings are in play. */
function isSimilarJobsRoute(url: URL): boolean {
  return (
    Boolean(jobIdentifier(url.searchParams.get("referenceJobId"))) ||
    /^\/jobs\/collections\/similar-jobs\b/.test(url.pathname)
  );
}

/** A page whose own address names one posting: `/jobs/view/<id>`. */
function directPostingRoute(url: URL): boolean {
  return /^\/jobs\/view\/[A-Za-z0-9_-]+/.test(url.pathname);
}

/**
 * Which LinkedIn read this address needs.
 *
 * `/jobs/view/<id>` is a page. Everything else a student reads jobs on —
 * `/jobs/search/`, `/jobs/collections/recommended/`,
 * `/jobs/collections/similar-jobs/` — is a split pane: a rail of postings
 * beside one selected posting, at an address that keeps changing without a
 * navigation. `currentJobId` is the parameter LinkedIn rewrites when the
 * student picks a different posting, so it names the job they selected, and it
 * alone decides identity and the stored URL.
 *
 * What the address cannot say is which *document* is drawing that posting, and
 * three earlier theories died guessing. `referenceJobId` only names the posting
 * the student came from. `JobDetails_*_<id>` component ids go stale across an
 * in-page transition. Rendered geometry cannot see across a frame boundary, and
 * on the live search page the selected posting measures `0×0` anyway. The
 * answer is a frame probe corroborated against `currentJobId`, which is what
 * `resolveFrame` asks the popup to run.
 *
 * The two split-pane routes differ in one respect only: what is safe to read
 * when no frame establishes the posting. Search may fall back to the top
 * document, because its Primary content holds the selected posting. Similar
 * Jobs may not, because its top document holds the previous one.
 */
function linkedInRoute(url: URL): RoutedRead {
  const jobId = selectedLinkedInJob(url);

  // A job page is one posting at its own address, and stays on the read that
  // is verified for it. No frame is resolved, because there is nothing for a
  // second document to disagree with.
  if (directPostingRoute(url) || !jobId) {
    return {
      strategy: "linkedin-job-detail",
      ...(jobId ? { jobId } : {}),
    };
  }

  return {
    strategy: "linkedin-split-pane",
    jobId,
    resolveFrame: {
      jobId,
      unresolved: isSimilarJobsRoute(url) ? "blank" : "top-document",
    },
  };
}

/** Workday tenant branding corroborates sidebar evidence; it never originates it. */
function workdayRoute(url: URL): RoutedRead {
  const tenant = url.hostname.split(".")[0]?.trim().toLowerCase();

  return {
    strategy: "workday-job-detail",
    ...(tenant && /^[a-z0-9-]{1,64}$/.test(tenant)
      ? { workdayTenant: tenant }
      : {}),
  };
}

const SITE_RULES: readonly SiteRule[] = [
  {
    id: "linkedin",
    hosts: ["linkedin.com"],
    // No selector list. The classes that were here were guesses from older
    // LinkedIn markup, they matched nothing live, and leaving them in would
    // only give a future page a chance to match one of them by accident. The
    // public guest pages that did carry those classes also publish JSON-LD,
    // which the extractor reads before it ever reaches this file.
    fields: [],
    strategy: "linkedin-job-detail",
    route: linkedInRoute,
  },
  {
    id: "indeed",
    hosts: ["indeed.com", "indeed.ca"],
    fields: [
      {
        key: "title",
        selectors: [
          '[data-testid="jobsearch-JobInfoHeader-title"]',
          ".jobsearch-JobInfoHeader-title",
        ],
      },
      {
        key: "company",
        selectors: [
          '[data-testid="inlineHeader-companyName"]',
          '[data-testid="jobsearch-JobInfoHeader-companyName"]',
          '[data-testid="company-name"]',
        ],
      },
      {
        key: "location",
        selectors: [
          '[data-testid="inlineHeader-companyLocation"]',
          '[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
          '[data-testid="job-location"]',
        ],
      },
      {
        key: "description",
        selectors: [
          "#jobDescriptionText",
          '[data-testid="jobsearch-JobComponent-description"]',
        ],
      },
    ],
  },
  {
    id: "workday",
    hosts: ["myworkdayjobs.com", "myworkdaysite.com", "wd1.myworkdaycdn.com"],
    fields: [],
    route: workdayRoute,
  },
];

function hostnameOf(url: string): string | undefined {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:" && protocol !== "http:") return undefined;

    return hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function matchesHost(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function ruleFor(url: string): SiteRule | undefined {
  const hostname = hostnameOf(url);
  if (!hostname) return undefined;

  return SITE_RULES.find((rule) =>
    rule.hosts.some((suffix) => matchesHost(hostname, suffix)),
  );
}

/** Which recognized surface this page is, when it is one of them. */
export function siteFor(url: string): SiteId | undefined {
  return ruleFor(url)?.id;
}

/**
 * What the injected collector should do on this page.
 *
 * Resolved here rather than inside the page, so this file remains the single
 * place any site is described. The collector holds the mechanics of the one
 * strategy; it is told which page to use it on, and never decides for itself.
 */
export function readRulesFor(url: string): PageReadRules {
  const rule = ruleFor(url);
  if (!rule) return { fields: [] };

  let routed: RoutedRead | undefined;
  if (rule.route) {
    try {
      routed = rule.route(new URL(url));
    } catch {
      // An address that will not parse gets the site's default read.
      routed = undefined;
    }
  }

  const strategy = routed?.strategy ?? rule.strategy;

  return {
    fields: rule.fields,
    ...(strategy ? { strategy } : {}),
    ...(routed?.jobId ? { jobId: routed.jobId } : {}),
    ...(routed?.resolveFrame ? { resolveFrame: routed.resolveFrame } : {}),
    ...(routed?.workdayTenant ? { workdayTenant: routed.workdayTenant } : {}),
  };
}

/** Every rule, for tests and for asserting the recognized set has not grown. */
export const RECOGNIZED_SITES: readonly SiteId[] = SITE_RULES.map(
  (rule) => rule.id,
);

/**
 * The address a recognized posting should be filed under.
 *
 * LinkedIn and Indeed both show a selected posting inside a search page whose
 * own URL — and whose own `<link rel="canonical">` — describes the search, not
 * the job. Filing the record under that address would make every posting a
 * student opened from one search list look like the same job to JobTrack's
 * exact-URL duplicate check. The selected posting's id is in the query string,
 * so the stable per-job address can be rebuilt from it.
 *
 * The rebuilt URL always stays on the origin the student is actually on, so a
 * `ca.linkedin.com` capture is not silently refiled under `www.linkedin.com`.
 */
export function canonicalPostingUrl(pageUrl: string): string | undefined {
  const site = siteFor(pageUrl);
  if (!site) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return undefined;
  }

  if (site === "linkedin") {
    // `currentJobId` on every route, Similar Jobs included. It is the parameter
    // LinkedIn rewrites when the student picks a different posting, so it names
    // the job they selected; `referenceJobId` names the one they came from and
    // never decides anything. A `JobDetails_*` suffix in the page decides
    // nothing either — those go stale across an in-page transition, which is
    // exactly how an earlier version of this file filed the wrong job.
    const selected = selectedLinkedInJob(parsed);

    return selected ? `${parsed.origin}/jobs/view/${selected}/` : undefined;
  }

  if (site === "indeed") {
    const key =
      jobIdentifier(parsed.searchParams.get("jk")) ??
      jobIdentifier(parsed.searchParams.get("vjk"));

    return key ? `${parsed.origin}/viewjob?jk=${key}` : undefined;
  }

  // Workday job detail URLs already address one posting.
  return undefined;
}

/**
 * Indeed renders a job-post marker inside the title heading itself.
 *
 * It is part of the heading element rather than a sibling, so reading the
 * heading's text picks it up. Removing it is site knowledge, which is why it
 * lives in the site file and is anchored to the end of the string.
 */
function tidyIndeedTitle(value: string): string {
  return value.replace(/\s*[-–—]\s*job post\s*$/i, "").trim();
}

/**
 * What one recognized site says about the posting on screen.
 *
 * The caller has already taken everything the page states in structured form;
 * this only fills what is still missing. Fields a site cannot establish are
 * absent, and no site is allowed to invent an employer domain or a source —
 * those come from `source.ts`, which looks at the host and refuses to treat an
 * applicant-tracking system as either.
 */
export function readSiteFields(
  site: SiteId,
  fields: Record<string, string> | undefined,
): Pick<ExtractedJob, "company" | "jobTitle" | "location" | "jobDescription"> & {
  /** As the posting wrote it: `Hybrid`, `Remote`, `On-site`. */
  workplaceType?: string;
} {
  if (!fields) return {};

  const text = (key: SiteFieldKey): string | undefined => {
    const raw = fields[key];
    if (!raw) return undefined;

    const plain = htmlToPlainText(raw);

    return plain ? plain : undefined;
  };

  const rawTitle = text("title");
  const title =
    rawTitle && site === "indeed" ? tidyIndeedTitle(rawTitle) : rawTitle;

  return {
    ...(text("company") ? { company: text("company") } : {}),
    ...(title ? { jobTitle: title } : {}),
    ...(text("location") ? { location: text("location") } : {}),
    ...(text("description") ? { jobDescription: text("description") } : {}),
    ...(text("workplaceType") ? { workplaceType: text("workplaceType") } : {}),
  };
}

/** Whether this page is one the extension has a named read path for. */
export function isRecognizedSite(signals: PageSignals): boolean {
  return siteFor(signals.pageUrl) !== undefined;
}
