import { htmlToPlainText } from "./html-text.js";
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
 * What is in this file is a table of selectors and a little URL arithmetic. It
 * does not know that JobTrack exists. It performs no network request, executes
 * nothing from the page, and calls no site API. Every value it produces is read
 * out of the DOM the student is already looking at, and every value it cannot
 * read is absent.
 *
 * Selector preference, highest first: structured data (handled before this file
 * is reached), semantic and accessibility attributes, stable data attributes
 * the site itself maintains for its own automation, then narrowly scoped
 * component containers. Nothing here keys off generated class hashes,
 * `nth-child`, colour, or nesting depth.
 */

export type SiteId = "linkedin" | "indeed" | "workday";

/** One field the injected collector should try to read, in preference order. */
export type FieldRule = { key: SiteFieldKey; selectors: string[] };

export type SiteFieldKey = "title" | "company" | "location" | "description";

type SiteRule = {
  id: SiteId;
  /** Registrable-suffix matches, compared against the page's own hostname. */
  hosts: string[];
  fields: FieldRule[];
};

const SITE_RULES: readonly SiteRule[] = [
  {
    id: "linkedin",
    hosts: ["linkedin.com"],
    fields: [
      {
        key: "title",
        // Scoped to the detail pane first, because the same page also renders
        // a list of other jobs and a recommendations rail. An unscoped title
        // selector on `/jobs/search` would be a coin toss between the posting
        // the student selected and the one the feed put at the top.
        selectors: [
          ".jobs-search__job-details .job-details-jobs-unified-top-card__job-title",
          ".jobs-details .job-details-jobs-unified-top-card__job-title",
          ".job-details-jobs-unified-top-card__job-title",
          ".jobs-unified-top-card__job-title",
          ".top-card-layout__title",
        ],
      },
      {
        key: "company",
        selectors: [
          ".jobs-search__job-details .job-details-jobs-unified-top-card__company-name",
          ".jobs-details .job-details-jobs-unified-top-card__company-name",
          ".job-details-jobs-unified-top-card__company-name",
          ".jobs-unified-top-card__company-name",
          ".topcard__org-name-link",
        ],
      },
      {
        key: "location",
        selectors: [".jobs-unified-top-card__bullet", ".topcard__flavor--bullet"],
      },
      {
        key: "description",
        selectors: [
          ".jobs-search__job-details #job-details",
          "#job-details",
          ".jobs-description__content",
          ".jobs-box__html-content",
          ".show-more-less-html__markup",
          ".description__text",
        ],
      },
    ],
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
    fields: [
      // `data-automation-id` is Workday's own automation contract, maintained
      // across tenants and skins. It is the most stable thing a Workday page
      // offers short of structured data, which Workday does not publish.
      {
        key: "title",
        selectors: ['[data-automation-id="jobPostingHeader"]'],
      },
      {
        key: "location",
        // The bare `locations` container is a definition list whose term is the
        // word "locations"; only the definition is the answer.
        selectors: [
          '[data-automation-id="locations"] dd',
          '[data-automation-id="jobPostingLocation"]',
        ],
      },
      {
        key: "description",
        selectors: ['[data-automation-id="jobPostingDescription"]'],
      },
      // No company rule. A Workday tenant hostname names whoever bought
      // Workday, and the posting body does not reliably repeat the employer,
      // so employer identity stays empty for the student to supply.
    ],
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
 * The selectors the injected collector should try on this page.
 *
 * Resolved here rather than inside the page, so the injected function stays a
 * generic reader with no site knowledge of its own and this file remains the
 * single place any site is described.
 */
export function fieldRulesFor(url: string): FieldRule[] {
  return ruleFor(url)?.fields ?? [];
}

/** Every rule, for tests and for asserting the recognized set has not grown. */
export const RECOGNIZED_SITES: readonly SiteId[] = SITE_RULES.map(
  (rule) => rule.id,
);

/** A job identifier: digits, or the short alphanumerics Indeed hands out. */
function jobIdentifier(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed && /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : undefined;
}

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
    const selected = jobIdentifier(parsed.searchParams.get("currentJobId"));
    if (selected) return `${parsed.origin}/jobs/view/${selected}/`;

    const path = /\/jobs\/view\/([A-Za-z0-9_-]+)/.exec(parsed.pathname)?.[1];

    return path ? `${parsed.origin}/jobs/view/${path}/` : undefined;
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
): Pick<ExtractedJob, "company" | "jobTitle" | "location" | "jobDescription"> {
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
    // Workday has no company rule at all, so this is undefined there by
    // construction rather than by a special case.
    ...(text("company") ? { company: text("company") } : {}),
    ...(title ? { jobTitle: title } : {}),
    ...(text("location") ? { location: text("location") } : {}),
    ...(text("description") ? { jobDescription: text("description") } : {}),
  };
}

/** Whether this page is one the extension has a named read path for. */
export function isRecognizedSite(signals: PageSignals): boolean {
  return siteFor(signals.pageUrl) !== undefined;
}
