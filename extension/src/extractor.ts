import {
  htmlToPlainText,
  looksLikeHtml,
  normalizeWhitespace,
} from "./html-text.js";
import {
  findJobPostings,
  firstRecord,
  firstString,
  type JsonLdNode,
} from "./json-ld.js";
import {
  extractDuration,
  extractWorkArrangement,
  extractWorkTerm,
  type RichConfidence,
  type RichOrigin,
  type RichResult,
} from "./rich-fields.js";
import {
  canonicalPostingUrl,
  readSiteFields,
  siteFor,
} from "./sites.js";
import { employerDomainFromUrl, sourceForUrl } from "./source.js";
import type {
  CapturedField,
  EvidenceConfidence,
  ExtractionDiagnostics,
  ExtractionReport,
  ExtractionSource,
  ExtractionWarning,
  ExtractedJob,
  GenericFallbackCorroboration,
  PageSignals,
} from "./types.js";

/**
 * Turns what the page said about itself into the facts JobTrack can store.
 *
 * The order is a trust order, not a convenience order:
 *
 * 1. **Structured data the publisher formally asserts** — `schema.org`
 *    JobPosting, as JSON-LD or as microdata. This wins outright except on
 *    Workday, where live pages can retain a stale backend posting.
 * 2. **A recognized site's own read path** — LinkedIn, Indeed and Workday
 *    publish no structured posting data on the pages a student actually reads,
 *    and between them they carry most of a student's search. `sites.ts` names
 *    them and nothing else.
 * 3. **A conservative generic fallback** — a title, and only when the page has
 *    corroborating evidence that it is a posting at all.
 *
 * Below that there is nothing, and on a recognized site step 3 does not run:
 * if the named read path found nothing, the honest answer is blanks, not the
 * page's first heading. Manual testing showed why that matters — the previous
 * fallback happily stored "Welcome back" and "Search for Jobs" as job titles,
 * and a student who asked to save one job and got a filled-in form has no
 * reason to doubt it. An empty field asks a question. A wrong field answers one
 * nobody asked.
 */

/** JobTrack's stored description limit, mirrored so the popup can warn early. */
export const DESCRIPTION_LIMIT = 50_000;

/** The record contract's own field limits, so nothing is sent to be rejected. */
const LIMITS = {
  company: 160,
  jobTitle: 200,
  location: 200,
  salary: 100,
  jobUrl: 2_048,
} as const;

/** Said in the description itself when the posting did not fit. */
const SHORTENED_NOTICE =
  "\n\n[This description was too long for JobTrack and was shortened here. Open the posting for the complete text.]";

function clamp(value: string | undefined, limit: number): string | undefined {
  if (!value) return undefined;
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return undefined;
  return trimmed.length > limit ? trimmed.slice(0, limit).trim() : trimmed;
}

function hostnameOf(url: string): string | undefined {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:" && protocol !== "http:") return undefined;

    return hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** A same-host URL only. A page does not get to redirect the stored record. */
function sameHost(candidate: string, pageUrl: string): string | undefined {
  try {
    const resolved = new URL(candidate, pageUrl);
    const page = new URL(pageUrl);
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
      return undefined;
    }
    const strip = (host: string) => host.toLowerCase().replace(/^www\./, "");
    return strip(resolved.hostname) === strip(page.hostname)
      ? resolved.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The URL the record is stored under, which is also the duplicate key.
 *
 * A recognized site's per-posting address comes first, because LinkedIn and
 * Indeed both show the selected job inside a search page whose own URL — and
 * whose own canonical link — describes the search. Filing every job a student
 * opened from one result list under that single address would make them all
 * look like one job to JobTrack's exact-URL duplicate check.
 *
 * Otherwise a canonical link is preferred, so two visits to the same posting
 * through different tracking parameters are recognized as the same job. It is
 * accepted only when it stays on the host the student is actually looking at:
 * `<link rel="canonical">` is page-controlled, and a canonical pointing
 * somewhere else would file the posting under an address they never visited.
 */
function postingUrl(signals: PageSignals): string | undefined {
  // Workday's canonical and Open Graph URLs can describe stale SPA state. The
  // student's invoked address is the only selected-posting-safe identity there.
  if (siteFor(signals.pageUrl) === "workday") {
    const current = sameHost(signals.pageUrl, signals.pageUrl);
    return current && current.length <= LIMITS.jobUrl ? current : undefined;
  }

  const perPosting = canonicalPostingUrl(signals.pageUrl);
  const canonical = signals.canonicalUrl
    ? sameHost(signals.canonicalUrl, signals.pageUrl)
    : undefined;
  const openGraph = signals.meta["og:url"]
    ? sameHost(signals.meta["og:url"], signals.pageUrl)
    : undefined;

  const chosen = perPosting ?? canonical ?? openGraph ?? signals.pageUrl;
  const usable = sameHost(chosen, signals.pageUrl) ?? signals.pageUrl;

  return usable.length <= LIMITS.jobUrl ? usable : undefined;
}

/** `Ottawa, ON` from whichever parts of a postal address the posting supplies. */
function readLocation(posting: JsonLdNode): string | undefined {
  const place = firstRecord(posting["jobLocation"]);
  const address = place ? firstRecord(place["address"]) : undefined;

  if (address) {
    const parts = [
      firstString(address["addressLocality"]),
      firstString(address["addressRegion"]),
      firstString(address["addressCountry"]) ??
        firstString(firstRecord(address["addressCountry"])?.["name"]),
    ].filter((part): part is string => Boolean(part));

    if (parts.length > 0) return parts.join(", ");
  }

  // A plain string address, and the `name` some publishers put on the Place.
  const plainAddress = firstString(place?.["address"]);
  if (plainAddress) return plainAddress;

  const placeName = place ? firstString(place["name"]) : undefined;
  if (placeName) return placeName;

  return firstString(posting["jobLocation"]);
}

/** A bare calendar date, with no time and no zone attached to it. */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * An application deadline, only from a `validThrough` that names one calendar
 * day and cannot mean another.
 *
 * Real-site testing found a posting whose page said "apply by September 13"
 * while its `validThrough` produced September 14. Neither party was lying, and
 * neither is reliably right:
 *
 * - `validThrough` is defined as when the *posting* expires, not when the
 *   student must apply. Publishers who mean "the last day to apply is the
 *   13th" routinely write the exclusive end of that day, `2026-09-14T00:00:00`.
 * - A timestamp also carries a zone, stated or implied. `2026-09-13T23:59-04:00`
 *   is `2026-09-14T03:59Z`, and which calendar day that is depends on whose
 *   clock is asked.
 *
 * Both mechanisms are ordinary, both are invisible in the value itself, and
 * both are off by exactly one day — which is the worst possible size of error
 * for a deadline. So a `validThrough` carrying any time component is not
 * treated as an application deadline at all; a bare `YYYY-MM-DD` is, because
 * there is no boundary and no zone left to disagree about. The student can
 * always type a deadline. A deadline that is quietly a day late is the kind of
 * wrong nobody notices until it has cost them the application.
 */
function readDeadline(posting: JsonLdNode): string | undefined {
  const raw = firstString(posting["validThrough"])?.trim();
  if (!raw || !DATE_ONLY_PATTERN.test(raw)) return undefined;

  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;

  // Rejects 2026-02-31 and similar, which parse but are not the date written.
  return parsed.toISOString().slice(0, 10) === raw ? raw : undefined;
}

const PAY_PERIODS: Record<string, string> = {
  HOUR: "per hour",
  DAY: "per day",
  WEEK: "per week",
  MONTH: "per month",
  YEAR: "per year",
};

/**
 * A monetary figure, or nothing.
 *
 * Zero is the reason this exists. A real posting published
 * `baseSalary.value.value: 0`, which the first version dutifully rendered as
 * "USD 0 per year" and stored — a number that is not merely unknown but
 * actively false, sitting in a field a student would use to compare offers.
 * Zero, negative and non-finite amounts are all placeholder values a publisher
 * left in a template, never compensation.
 */
function positiveAmount(value: unknown): number | undefined {
  const raw = firstString(value);
  if (raw === undefined) return undefined;

  const numeric = Number(raw.replace(/,/g, "").trim());

  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function formatAmount(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Whether a written-out salary states nothing but zeroes. */
function statesOnlyZero(text: string): boolean {
  const numbers = text.match(/\d+(?:[.,]\d+)*/g);
  if (!numbers) return false;

  return numbers.every((number) => Number(number.replace(/,/g, "")) === 0);
}

/**
 * Pay, only when the posting states it in a shape that maps cleanly.
 *
 * `baseSalary` is one of the least consistently published fields in the
 * vocabulary. A structured `MonetaryAmount` is reassembled; a plain string is
 * taken as written. Anything else — a bare number with no currency, a range
 * with no units, a zero, a maximum below its minimum — is left out.
 *
 * A half-stated range is qualified rather than rounded off into a figure. A
 * lone `minValue` rendered as "USD 50,000 per year" reads as the salary, and it
 * is not; "USD 50,000+ per year" is what the posting actually said.
 */
function readSalary(posting: JsonLdNode): string | undefined {
  const direct =
    typeof posting["baseSalary"] === "string"
      ? firstString(posting["baseSalary"])
      : undefined;
  if (direct) {
    return statesOnlyZero(direct) ? undefined : clamp(direct, LIMITS.salary);
  }

  const amount = firstRecord(posting["baseSalary"]);
  if (!amount) return undefined;

  const currency =
    firstString(amount["currency"]) ?? firstString(amount["priceCurrency"]);
  const quantity = firstRecord(amount["value"]);
  if (!currency || !quantity) return undefined;

  const single = positiveAmount(quantity["value"]);
  const minimum = positiveAmount(quantity["minValue"]);
  const maximum = positiveAmount(quantity["maxValue"]);

  let figure: string | undefined;
  if (single !== undefined) {
    figure = formatAmount(single);
  } else if (minimum !== undefined && maximum !== undefined) {
    // A maximum below its minimum is not a range anybody meant.
    if (maximum < minimum) return undefined;
    figure =
      maximum === minimum
        ? formatAmount(minimum)
        : `${formatAmount(minimum)}–${formatAmount(maximum)}`;
  } else if (minimum !== undefined) {
    figure = `${formatAmount(minimum)}+`;
  } else if (maximum !== undefined) {
    figure = `up to ${formatAmount(maximum)}`;
  }

  if (!figure) return undefined;

  const unit = firstString(quantity["unitText"])?.toUpperCase();
  const period = unit ? PAY_PERIODS[unit] : undefined;

  return clamp(
    [currency.toUpperCase(), figure, period].filter(Boolean).join(" "),
    LIMITS.salary,
  );
}

/**
 * The employer's own site, and only from a URL the posting attributes to them.
 *
 * The address bar is never consulted. A posting on `myworkdayjobs.com` is not a
 * Workday job, and `hiringOrganization.url` pointing back at the job board is
 * rejected by `employerDomainFromUrl` for the same reason.
 */
function readCompanyDomain(organization: JsonLdNode | undefined) {
  if (!organization) return undefined;

  const candidates = [
    firstString(organization["url"]),
    firstString(organization["sameAs"]),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const domain = employerDomainFromUrl(candidate);
    if (domain) return domain;
  }

  return undefined;
}

/** Description text, shortened out loud rather than quietly, when oversized. */
function limitDescription(raw: string | undefined): {
  text?: string;
  shortened: boolean;
} {
  if (!raw) return { shortened: false };

  const text = looksLikeHtml(raw)
    ? htmlToPlainText(raw)
    : normalizeWhitespace(raw);
  if (!text) return { shortened: false };

  if (text.length <= DESCRIPTION_LIMIT) return { text, shortened: false };

  const room = DESCRIPTION_LIMIT - SHORTENED_NOTICE.length;
  return {
    text: `${text.slice(0, room).trim()}${SHORTENED_NOTICE}`,
    shortened: true,
  };
}

/**
 * A page title with its site suffix removed, when the page names its own site.
 *
 * `Business Technology Analyst Intern | IBM Careers` is a usable job title once
 * the trailing site name goes. The suffix is only removed when it matches what
 * the page itself declared as `og:site_name`, so this stays a general rule
 * rather than a list of sites the extension knows about.
 */
function trimSiteSuffix(title: string, siteName: string | undefined): string {
  if (!siteName) return title;

  const escaped = siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return title.replace(new RegExp(`\\s*[|–—-]\\s*${escaped}\\s*$`, "i"), "").trim();
}

/**
 * Navigation labels, greetings and section names — never job titles.
 *
 * A backstop rather than the mechanism. The real protection is the structural
 * evidence below: a heading is only considered at all on a page that looks like
 * a posting. This catches the residue, and it is deliberately a short list of
 * whole-string matches on page furniture rather than a growing corpus of
 * English phrases. Anything longer than one of these is judged structurally.
 */
const PAGE_CHROME_PATTERN =
  /^(home|jobs?|careers?|job search|search|search jobs?|search for jobs?|search results|all jobs|browse jobs|find jobs|job openings|open positions|current openings|sign ?in|sign ?up|log ?in|register|welcome|welcome back|jobs for you|my jobs|saved jobs|dashboard|profile|account|apply|apply now)$/i;

/** Whether a candidate title is really the site talking about itself. */
function namesTheSiteItself(candidate: string, signals: PageSignals): boolean {
  const normalized = candidate.trim().toLowerCase();
  const siteName = signals.meta["og:site_name"]?.trim().toLowerCase();
  if (siteName && normalized === siteName) return true;

  const hostname = hostnameOf(signals.pageUrl);
  const brand = hostname?.split(".")[0];

  return Boolean(
    brand && brand.length > 2 && normalized.replace(/\s+/g, "") === brand,
  );
}

/** Path segments that mean the address is about a job rather than a site. */
const JOB_PATH_SEGMENT_PATTERN =
  /^(job|jobs|career|careers|position|positions|opening|openings|vacancy|vacancies|viewjob|jobdetail|jobdetails|job-detail|job-details|posting|postings|requisition)$/i;

/** Query parameters that name one posting. */
const JOB_ID_PARAMETERS = [
  "jk",
  "vjk",
  "currentjobid",
  "jobid",
  "job_id",
  "gh_jid",
  "requisitionid",
  "reqid",
  "posting_id",
];

/**
 * Whether the address itself is about one posting.
 *
 * `/job/senior-analyst/4832` is; `/careers` and `/jobs/search` are not. The
 * distinction is a job-shaped segment followed by something that identifies a
 * particular job, or an explicit job-id parameter — structure, not vocabulary.
 */
function addressNamesOnePosting(pageUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return false;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  const index = segments.findIndex((segment) =>
    JOB_PATH_SEGMENT_PATTERN.test(segment),
  );
  if (index === -1) return false;

  for (const [key, value] of parsed.searchParams) {
    if (JOB_ID_PARAMETERS.includes(key.toLowerCase()) && value.trim()) {
      return true;
    }
  }

  return segments
    .slice(index + 1)
    .some((segment) => /\d/.test(segment) || segment.length >= 8);
}

function declaresAJobPage(signals: PageSignals): boolean {
  const type = signals.meta["og:type"]?.toLowerCase() ?? "";

  return type.includes("job");
}

/**
 * Whether the page has corroborated that it is a posting.
 *
 * Two independent signals are required before an ordinary heading is allowed to
 * become a job title, because any one of them alone is satisfied by pages that
 * are plainly not a job: a careers landing page has a job-shaped address, and a
 * search results list has apply buttons on every row.
 */
function genericFallbackCorroboration(
  signals: PageSignals,
  declaredAPosting: boolean,
): readonly GenericFallbackCorroboration[] {
  if (declaredAPosting) return ["structured_job_posting"];

  const corroboration: GenericFallbackCorroboration[] = [];
  if (addressNamesOnePosting(signals.pageUrl)) {
    corroboration.push("job_shaped_url");
  }
  if (signals.evidence?.applyAffordance === true) {
    corroboration.push("apply_control");
  }
  if (declaresAJobPage(signals)) {
    corroboration.push("declared_job_page");
  }

  return corroboration.length >= 2 ? corroboration : [];
}

/**
 * The best title the page offers when nothing better established one.
 *
 * Only reached on an unrecognized site, and only when the page has corroborated
 * that it is a posting at all. A structured JobPosting is that corroboration by
 * itself — a publisher that formally declared the page a job posting but left
 * `title` out has still answered the question this guard asks.
 */
function fallbackTitle(
  signals: PageSignals,
  corroboration: readonly GenericFallbackCorroboration[],
): string | undefined {
  if (corroboration.length === 0) return undefined;

  const siteName = signals.meta["og:site_name"];
  const candidates = [
    signals.headingText,
    signals.meta["og:title"],
    signals.meta["twitter:title"],
    signals.documentTitle,
  ];

  for (const candidate of candidates) {
    const cleaned = candidate
      ? trimSiteSuffix(normalizeWhitespace(candidate), siteName)
      : undefined;
    if (!cleaned) continue;
    if (PAGE_CHROME_PATTERN.test(cleaned)) continue;
    if (namesTheSiteItself(cleaned, signals)) continue;

    return cleaned;
  }

  return undefined;
}

/** A value a site adapter produced, refused when it is page furniture. */
function acceptFromSite(
  value: string | undefined,
  signals: PageSignals,
  context?: { site?: string; field?: "company" | "jobTitle" },
): string | undefined {
  if (!value) return undefined;
  if (PAGE_CHROME_PATTERN.test(value.trim())) return undefined;

  // A Workday employer is admitted only after the collector established it
  // from tenant-correlated sidebar branding. Its tenant label matching the
  // candidate is corroboration, not page furniture.
  if (context?.site === "workday" && context.field === "company") {
    return value;
  }

  return namesTheSiteItself(value, signals) ? undefined : value;
}

/**
 * A JobPosting the page published as microdata, as the JSON-LD reader sees it.
 *
 * Attribute-based structured data is the same `schema.org` vocabulary written
 * on the elements instead of in a script block, and employer careers sites
 * publish it far more often than job boards do. Reshaping it into the node
 * shape means one set of field readers serves both, and no site knowledge is
 * involved either way.
 */
function microdataPosting(signals: PageSignals): JsonLdNode | undefined {
  const properties = signals.microdata;
  if (!properties || Object.keys(properties).length === 0) return undefined;

  const text = (key: string): string | undefined => {
    const raw = properties[key];
    if (!raw) return undefined;

    const plain = htmlToPlainText(raw);

    return plain ? plain : undefined;
  };

  const money = properties["baseSalary.value.value"]
    ? {
        currency:
          text("baseSalary.currency") ?? text("baseSalary.priceCurrency"),
        value: {
          value: text("baseSalary.value.value"),
          minValue: text("baseSalary.value.minValue"),
          maxValue: text("baseSalary.value.maxValue"),
          unitText: text("baseSalary.value.unitText"),
        },
      }
    : text("baseSalary");

  return {
    "@type": "JobPosting",
    title: text("title"),
    description: properties["description"],
    validThrough: text("validThrough"),
    jobLocationType: text("jobLocationType"),
    baseSalary: money,
    hiringOrganization: {
      name: text("hiringOrganization.name") ?? text("hiringOrganization"),
      url: properties["hiringOrganization.url"]?.trim(),
      sameAs: properties["hiringOrganization.sameAs"]?.trim(),
    },
    jobLocation: {
      name: text("jobLocation.name"),
      address: {
        addressLocality: text("jobLocation.address.addressLocality"),
        addressRegion: text("jobLocation.address.addressRegion"),
        addressCountry: text("jobLocation.address.addressCountry"),
      },
    },
  };
}

/**
 * Reads one page's signals into the job record the student will confirm.
 *
 * Always returns a result. "Nothing was found" is an outcome the popup can show
 * and the student can complete by hand, not an error, and it is the honest
 * answer for the many job pages that publish nothing a machine can trust.
 */
function sourceForSite(site: ReturnType<typeof siteFor>): ExtractionSource | undefined {
  switch (site) {
    case "linkedin":
      return "linkedin_selected_posting";
    case "indeed":
      return "indeed_site";
    case "workday":
      return "workday_selected_posting";
    default:
      return undefined;
  }
}

function absent<T>(): CapturedField<T> {
  return { state: "absent" };
}

function established<T>(
  value: T | undefined,
  confidence: Exclude<EvidenceConfidence, "ambiguous">,
  source: ExtractionSource | undefined,
  corroboratedBy?: readonly GenericFallbackCorroboration[],
): CapturedField<T> {
  return value !== undefined && source
    ? {
        state: "established",
        value,
        confidence,
        source,
        ...(corroboratedBy && corroboratedBy.length > 0
          ? { corroboratedBy }
          : {}),
      }
    : absent();
}

/**
 * Employer identity evidence already inside the selected posting.
 *
 * This does not inspect the address bar, follow a link, or unwrap a redirect.
 * An Apply destination is stronger than the description because its role is
 * explicit. Description links must agree after rejected job-board/ATS hosts
 * are removed; choosing the first of two employers would be a guess.
 */
function selectedCompanyDomain(
  links: PageSignals["selectedLinks"],
  siteSource: ExtractionSource | undefined,
): CapturedField<string> {
  const apply = links?.applyUrl
    ? employerDomainFromUrl(links.applyUrl)
    : undefined;
  if (apply) {
    return established(apply, "exact", siteSource ?? "selected_posting_apply");
  }

  const domains = new Set(
    (links?.descriptionUrls ?? [])
      .map(employerDomainFromUrl)
      .filter((domain): domain is string => Boolean(domain)),
  );
  if (domains.size === 1) {
    return established(
      [...domains][0],
      "strong",
      siteSource ?? "selected_posting_description",
    );
  }
  if (domains.size > 1) {
    const source = siteSource ?? "selected_posting_description";
    return {
      state: "ambiguous",
      confidence: "ambiguous",
      source,
      reason: "conflicting_evidence",
    };
  }

  return absent();
}

/** Workday structured data is observable but never establishes a field. */
function workdayField<T>(
  value: T | undefined,
  source: ExtractionSource | undefined,
  structuredValue: T | undefined,
  structuredSource: ExtractionSource | undefined,
): CapturedField<T> {
  if (value !== undefined && source) {
    return {
      state: "established",
      value,
      confidence: "exact",
      source,
      ...(structuredValue !== undefined && structuredSource
        ? {
            rejected: [
              {
                source: structuredSource,
                reason: "workday_structured_data_untrusted" as const,
              },
            ],
          }
        : {}),
    };
  }

  return structuredValue !== undefined && structuredSource
    ? {
        state: "ambiguous",
        confidence: "ambiguous",
        source: structuredSource,
        reason: "workday_structured_data_untrusted",
      }
    : absent();
}

/**
 * Reads one page's signals into an evidence-aware internal result.
 *
 * `extractJob` below is the only compatibility projection. New extraction
 * consumers should start here so evidence and values cannot drift apart.
 */
export function extractJobReport(signals: PageSignals): ExtractionReport {
  const warnings: ExtractionWarning[] = [];
  const url = postingUrl(signals);
  const source = sourceForUrl(signals.pageUrl);
  const site = siteFor(signals.pageUrl);
  const siteSource = sourceForSite(site);

  const [jsonLdPosting] = findJobPostings(signals.jsonLdBlocks);
  const microdata = microdataPosting(signals);
  const structuredPosting = jsonLdPosting ?? microdata;
  const structuredSource: ExtractionSource | undefined = jsonLdPosting
    ? "json_ld_job_posting"
    : microdata
      ? "microdata_job_posting"
      : undefined;
  // Workday can retain a backend or previous SPA JobPosting after its visible
  // detail pane has changed. Its bounded site strategy is authoritative, and
  // structured fields must not revive a search-result state that established
  // no selected posting at all.
  const posting = site === "workday" ? undefined : structuredPosting;

  const fromSite = site ? readSiteFields(site, signals.siteFields) : {};

  const structuredOrganization = structuredPosting
    ? firstRecord(structuredPosting["hiringOrganization"])
    : undefined;
  const organization = posting
    ? firstRecord(posting["hiringOrganization"])
    : undefined;
  const structuredCompanyCandidate = structuredPosting
    ? clamp(
        structuredOrganization
          ? firstString(structuredOrganization["name"])
          : firstString(structuredPosting["hiringOrganization"]),
        LIMITS.company,
      )
    : undefined;
  const structuredCompany = posting ? structuredCompanyCandidate : undefined;

  const company =
    structuredCompany ??
    clamp(
      acceptFromSite(fromSite.company, signals, { site, field: "company" }),
      LIMITS.company,
    );

  const structuredTitleCandidate = structuredPosting
    ? clamp(firstString(structuredPosting["title"]), LIMITS.jobTitle)
    : undefined;
  const siteTitle = clamp(
    acceptFromSite(fromSite.jobTitle, signals, { site, field: "jobTitle" }),
    LIMITS.jobTitle,
  );
  const fallbackCorroboration = site
    ? []
    : genericFallbackCorroboration(signals, Boolean(posting));
  const fallback = site
    ? undefined
    : clamp(fallbackTitle(signals, fallbackCorroboration), LIMITS.jobTitle);
  const jobTitle =
    (posting ? clamp(firstString(posting["title"]), LIMITS.jobTitle) : undefined) ??
    siteTitle ??
    // A recognized site that found nothing found nothing. Its own heading is
    // page furniture, and that is exactly the mistake this patch removes.
    fallback;
  const titleSource = structuredTitleCandidate
    ? structuredSource
    : siteTitle
      ? siteSource
      : fallback
        ? "generic_fallback"
        : undefined;

  const structuredLocationCandidate = structuredPosting
    ? clamp(readLocation(structuredPosting), LIMITS.location)
    : undefined;
  const siteLocation = clamp(fromSite.location, LIMITS.location);
  const location =
    (posting ? clamp(readLocation(posting), LIMITS.location) : undefined) ??
    siteLocation;

  const structuredDescriptionCandidate = limitDescription(
    structuredPosting ? firstString(structuredPosting["description"]) : undefined,
  ).text;
  const descriptionSource = posting && firstString(posting["description"])
    ? structuredSource
    : fromSite.jobDescription
      ? siteSource
      : !site && (signals.meta["og:description"] ?? signals.meta["description"])
        ? "generic_metadata"
        : undefined;
  const description = limitDescription(
    (posting ? firstString(posting["description"]) : undefined) ??
      fromSite.jobDescription ??
      // Metadata describes the page rather than the job, so it is only used
      // when nothing described the job itself — and never on a recognized
      // site, where it is the board's own boilerplate.
      (site
        ? undefined
        : (signals.meta["og:description"] ?? signals.meta["description"])),
  );

  const structuredCompanyDomainCandidate = readCompanyDomain(structuredOrganization);
  const structuredDeadlineCandidate = structuredPosting
    ? readDeadline(structuredPosting)
    : undefined;
  const structuredSalaryCandidate = structuredPosting
    ? readSalary(structuredPosting)
    : undefined;
  const structuredCompanyDomain = readCompanyDomain(organization);
  const selectedCompanyDomainField = selectedCompanyDomain(
    signals.selectedLinks,
    siteSource,
  );
  const deadline = posting ? readDeadline(posting) : undefined;
  const salary = posting ? readSalary(posting) : undefined;

  const fields = {
    company:
      site === "workday"
        ? workdayField(company, siteSource, structuredCompanyCandidate, structuredSource)
        : established(company, "exact", structuredCompany ? structuredSource : siteSource),
    jobTitle:
      site === "workday"
        ? workdayField(jobTitle, siteSource, structuredTitleCandidate, structuredSource)
        : established(
            jobTitle,
            titleSource === "generic_fallback" ? "strong" : "exact",
            titleSource,
            titleSource === "generic_fallback" ? fallbackCorroboration : undefined,
          ),
    location:
      site === "workday"
        ? workdayField(location, siteSource, structuredLocationCandidate, structuredSource)
        : established(
            location,
            "exact",
            structuredLocationCandidate ? structuredSource : siteSource,
          ),
    companyDomain:
      site === "workday"
        ? selectedCompanyDomainField.state === "established"
          ? workdayField(
              selectedCompanyDomainField.value,
              selectedCompanyDomainField.source,
              structuredCompanyDomainCandidate,
              structuredSource,
            )
          : selectedCompanyDomainField.state === "ambiguous"
            ? selectedCompanyDomainField
            : workdayField(
                undefined,
                undefined,
                structuredCompanyDomainCandidate,
                structuredSource,
              )
        : structuredCompanyDomain
          ? established(structuredCompanyDomain, "exact", structuredSource)
          : selectedCompanyDomainField,
    jobDescription:
      site === "workday"
        ? workdayField(
            description.text,
            descriptionSource === siteSource ? siteSource : undefined,
            structuredDescriptionCandidate,
            structuredSource,
          )
        : established(
            description.text,
            descriptionSource === "generic_metadata" ? "strong" : "exact",
            descriptionSource,
          ),
    jobUrl: established(url, "exact", "posting_url"),
    source: established(source, "exact", "source_host"),
    deadline:
      site === "workday"
        ? workdayField(undefined, undefined, structuredDeadlineCandidate, structuredSource)
        : established(deadline, "exact", structuredSource),
    salary:
      site === "workday"
        ? workdayField(undefined, undefined, structuredSalaryCandidate, structuredSource)
        : established(salary, "exact", structuredSource),
  };

  /**
   * Rich capture: three facts stated by the posting the student selected.
   *
   * Parsed from fields that are already established and already bounded to
   * that posting — its title, its description, and the structured
   * `jobLocationType` where structured data is trusted at all — so a rich fact
   * inherits the evidence of the field it was read out of. That is why there
   * is no new source vocabulary here: a work term read out of a LinkedIn
   * selected posting came from `linkedin_selected_posting`, and naming the
   * regex instead would describe the extension rather than the page.
   */
  const establishedValue = <T>(field: CapturedField<T>): T | undefined =>
    field.state === "established" ? field.value : undefined;
  const fieldSource = <T>(field: CapturedField<T>): ExtractionSource | undefined =>
    field.state === "established" ? field.source : undefined;

  const richSource = (origin: RichOrigin): ExtractionSource | undefined => {
    if (origin === "structured") return structuredSource;
    if (origin === "site") return siteSource;
    if (origin === "title") return fieldSource(fields.jobTitle);

    return fieldSource(fields.jobDescription);
  };

  /**
   * The evidence the field this fact was read out of carries.
   *
   * A derived fact cannot be better attested than its source. A `Work
   * arrangement: Hybrid` line is an exact statement wherever it appears, but
   * when the line was found in page metadata rather than in a description the
   * posting published, the page's own claim about the job is only strong — and
   * so the arrangement read out of it is strong too. `structured` and `site`
   * facts come from the publisher's own declaration and the site's dedicated
   * field, both of which the established fields already call exact.
   */
  const richOriginConfidence = (origin: RichOrigin): RichConfidence => {
    const field =
      origin === "title"
        ? fields.jobTitle
        : origin === "description"
          ? fields.jobDescription
          : undefined;
    if (!field || field.state !== "established") return "exact";

    return field.confidence === "strong" ? "strong" : "exact";
  };

  const richField = <T extends string>(result: RichResult<T>): CapturedField<T> => {
    if (result.state === "established") {
      const source = richSource(result.origin);
      // The weaker of the pattern's own evidence and the origin field's.
      const confidence: RichConfidence =
        richOriginConfidence(result.origin) === "strong"
          ? "strong"
          : result.confidence;

      return source
        ? {
            state: "established",
            value: result.value,
            confidence,
            source,
          }
        : absent();
    }

    if (result.state === "conflict") {
      // The posting stated the fact twice and disagreed with itself. Kept as
      // sanitized evidence, never as a value.
      const source = result.origins
        .map(richSource)
        .find((candidate): candidate is ExtractionSource => Boolean(candidate));

      return source
        ? {
            state: "ambiguous",
            confidence: "ambiguous",
            source,
            reason: "conflicting_evidence",
          }
        : absent();
    }

    return absent();
  };

  /** Workday's stale structured data may be observed here, never trusted. */
  const workdayRichField = <T extends string>(
    trusted: RichResult<T>,
    structured: RichResult<T>,
  ): CapturedField<T> => {
    const field = richField(trusted);

    if (field.state === "established") {
      return structured.state === "established" && structuredSource
        ? {
            ...field,
            rejected: [
              {
                source: structuredSource,
                reason: "workday_structured_data_untrusted" as const,
              },
            ],
          }
        : field;
    }
    if (field.state === "ambiguous") return field;

    return structured.state === "established" && structuredSource
      ? {
          state: "ambiguous",
          confidence: "ambiguous",
          source: structuredSource,
          reason: "workday_structured_data_untrusted",
        }
      : absent();
  };

  const postingTitle = establishedValue(fields.jobTitle);
  const postingDescription = establishedValue(fields.jobDescription);
  const trustedLocationType = posting
    ? firstString(posting["jobLocationType"])
    : undefined;

  const richInput = { title: postingTitle, description: postingDescription };
  const workArrangement = extractWorkArrangement({
    ...richInput,
    ...(trustedLocationType ? { jobLocationType: trustedLocationType } : {}),
    ...(fromSite.workplaceType
      ? { siteWorkplaceType: fromSite.workplaceType }
      : {}),
  });
  const workTerm = extractWorkTerm(richInput);
  const duration = extractDuration(richInput);

  const structuredRichInput = {
    ...(structuredTitleCandidate ? { title: structuredTitleCandidate } : {}),
    ...(structuredDescriptionCandidate
      ? { description: structuredDescriptionCandidate }
      : {}),
  };
  const structuredLocationType = structuredPosting
    ? firstString(structuredPosting["jobLocationType"])
    : undefined;

  const richFields = {
    workArrangement:
      site === "workday"
        ? workdayRichField(
            workArrangement,
            extractWorkArrangement({
              ...structuredRichInput,
              ...(structuredLocationType
                ? { jobLocationType: structuredLocationType }
                : {}),
            }),
          )
        : richField(workArrangement),
    workTerm:
      site === "workday"
        ? workdayRichField(workTerm, extractWorkTerm(structuredRichInput))
        : richField(workTerm),
    duration:
      site === "workday"
        ? workdayRichField(duration, extractDuration(structuredRichInput))
        : richField(duration),
  } satisfies Pick<
    ExtractionReport["fields"],
    "workArrangement" | "workTerm" | "duration"
  >;

  const allFields = {
    ...fields,
    ...richFields,
  } satisfies ExtractionReport["fields"];

  if (
    fields.company.state !== "established" &&
    fields.jobTitle.state !== "established" &&
    fields.jobDescription.state !== "established"
  ) {
    warnings.push("no_job_posting_found");
  }
  if (fields.company.state !== "established") warnings.push("missing_company");
  if (fields.jobTitle.state !== "established") warnings.push("missing_job_title");
  if (fields.location.state !== "established") warnings.push("missing_location");
  if (description.shortened) warnings.push("description_too_long");

  return {
    fields: allFields,
    warnings,
    ...(site ? { recognizedSite: site } : {}),
    ...(siteSource ?? structuredSource ?? fallback
      ? { selectedStrategy: siteSource ?? structuredSource ?? "generic_fallback" }
      : {}),
    structuredData: {
      jsonLdJobPosting: Boolean(jsonLdPosting),
      microdataJobPosting: Boolean(microdata),
    },
    ...(hostnameOf(signals.pageUrl) ? { pageHost: hostnameOf(signals.pageUrl) } : {}),
  };
}

/** Backward-compatible projection: ambiguous and absent fields stay blank. */
export function toExtractedJob(report: ExtractionReport): ExtractedJob {
  // Reads the value only in the established case, so a field carrying a
  // candidate it was never allowed to project cannot leak one at runtime.
  const value = <T>(field: CapturedField<T>): T | undefined =>
    field.state === "established" ? field.value : undefined;

  return {
    ...(value(report.fields.company) ? { company: value(report.fields.company) } : {}),
    ...(value(report.fields.jobTitle)
      ? { jobTitle: value(report.fields.jobTitle) }
      : {}),
    ...(value(report.fields.location) ? { location: value(report.fields.location) } : {}),
    ...(value(report.fields.companyDomain)
      ? { companyDomain: value(report.fields.companyDomain) }
      : {}),
    ...(value(report.fields.jobDescription)
      ? { jobDescription: value(report.fields.jobDescription) }
      : {}),
    ...(value(report.fields.jobUrl) ? { jobUrl: value(report.fields.jobUrl) } : {}),
    ...(value(report.fields.source) ? { source: value(report.fields.source) } : {}),
    ...(value(report.fields.deadline) ? { deadline: value(report.fields.deadline) } : {}),
    ...(value(report.fields.salary) ? { salary: value(report.fields.salary) } : {}),
    ...(value(report.fields.workArrangement)
      ? { workArrangement: value(report.fields.workArrangement) }
      : {}),
    ...(value(report.fields.workTerm)
      ? { workTerm: value(report.fields.workTerm) }
      : {}),
    ...(value(report.fields.duration)
      ? { duration: value(report.fields.duration) }
      : {}),
    warnings: report.warnings,
  };
}

/** Removes values while retaining enough shape to diagnose a local capture. */
export function extractionDiagnostics(
  report: ExtractionReport,
): ExtractionDiagnostics {
  const diagnose = <T>(
    field: CapturedField<T>,
    includeLength = false,
  ): ExtractionDiagnostics["fields"][keyof ExtractionDiagnostics["fields"]] => {
    if (field.state === "established") {
      return {
        state: field.state,
        confidence: field.confidence,
        source: field.source,
        ...(field.corroboratedBy
          ? { corroboratedBy: field.corroboratedBy }
          : {}),
        ...(field.rejected ? { rejected: field.rejected } : {}),
        ...(includeLength ? { valueLength: String(field.value).length } : {}),
      };
    }
    if (field.state === "ambiguous") {
      return {
        state: field.state,
        confidence: field.confidence,
        source: field.source,
        reason: field.reason,
      };
    }
    return { state: field.state };
  };

  return {
    ...(report.recognizedSite ? { recognizedSite: report.recognizedSite } : {}),
    ...(report.selectedStrategy ? { selectedStrategy: report.selectedStrategy } : {}),
    structuredData: report.structuredData,
    ...(report.pageHost ? { pageHost: report.pageHost } : {}),
    warnings: report.warnings,
    fields: {
      company: diagnose(report.fields.company),
      jobTitle: diagnose(report.fields.jobTitle),
      location: diagnose(report.fields.location),
      companyDomain: diagnose(report.fields.companyDomain),
      jobDescription: diagnose(report.fields.jobDescription, true),
      jobUrl: diagnose(report.fields.jobUrl),
      source: diagnose(report.fields.source),
      deadline: diagnose(report.fields.deadline),
      salary: diagnose(report.fields.salary),
      workArrangement: diagnose(report.fields.workArrangement),
      workTerm: diagnose(report.fields.workTerm),
      duration: diagnose(report.fields.duration),
    },
  };
}

export function extractJob(signals: PageSignals): ExtractedJob {
  return toExtractedJob(extractJobReport(signals));
}
