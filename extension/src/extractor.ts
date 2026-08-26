import { htmlToPlainText, looksLikeHtml, normalizeWhitespace } from "./html-text.js";
import {
  findJobPostings,
  firstRecord,
  firstString,
  type JsonLdNode,
} from "./json-ld.js";
import { employerDomainFromUrl, sourceForUrl } from "./source.js";
import type { ExtractedJob, ExtractionWarning, PageSignals } from "./types.js";

/**
 * Turns what the page said about itself into the facts JobTrack can store.
 *
 * The order is a trust order, not a convenience order. Structured `JobPosting`
 * data is what the publisher formally asserts, so it wins. Standard metadata is
 * a weaker claim about the page rather than the job, so it only fills gaps.
 * Ordinary page text is the weakest and supplies a title at most.
 *
 * Below that there is nothing. No selector guesses at which `<div>` on an
 * unfamiliar site holds a company name, because a guess that lands on the
 * wrong element produces a confident, wrong record — and the student, who
 * asked to save one job and got a filled-in form, has no reason to doubt it.
 * An empty field asks a question. A wrong field answers one nobody asked.
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
 * A canonical link is preferred because two visits to the same posting through
 * different tracking parameters should be recognized as the same job by
 * JobTrack's exact-URL check. It is accepted only when it stays on the host the
 * student is actually looking at: `<link rel="canonical">` is page-controlled,
 * and a canonical pointing somewhere else would file the posting under an
 * address the student never visited.
 */
function postingUrl(signals: PageSignals): string | undefined {
  const canonical = signals.canonicalUrl
    ? sameHost(signals.canonicalUrl, signals.pageUrl)
    : undefined;
  const openGraph = signals.meta["og:url"]
    ? sameHost(signals.meta["og:url"], signals.pageUrl)
    : undefined;

  const chosen = canonical ?? openGraph ?? signals.pageUrl;
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

/** `YYYY-MM-DD` from `validThrough`, and nothing that is not a real date. */
function readDeadline(posting: JsonLdNode): string | undefined {
  const raw = firstString(posting["validThrough"]);
  if (!raw) return undefined;

  const datePart = /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1];
  if (!datePart) return undefined;

  const parsed = new Date(`${datePart}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;

  // Rejects 2026-02-31 and similar, which parse but are not the date written.
  return parsed.toISOString().slice(0, 10) === datePart ? datePart : undefined;
}

const PAY_PERIODS: Record<string, string> = {
  HOUR: "per hour",
  DAY: "per day",
  WEEK: "per week",
  MONTH: "per month",
  YEAR: "per year",
};

function formatAmount(value: string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : value;
}

/**
 * Pay, only when the posting states it in a shape that maps cleanly.
 *
 * `baseSalary` is one of the least consistently published fields in the
 * vocabulary. A structured `MonetaryAmount` is reassembled; a plain string is
 * taken as written. Anything else — a bare number with no currency, a range
 * with no units — is left out, because a salary that reads `50000` could be an
 * hourly rate in a currency nobody named.
 */
function readSalary(posting: JsonLdNode): string | undefined {
  const direct = typeof posting["baseSalary"] === "string"
    ? firstString(posting["baseSalary"])
    : undefined;
  if (direct) return clamp(direct, LIMITS.salary);

  const amount = firstRecord(posting["baseSalary"]);
  if (!amount) return undefined;

  const currency =
    firstString(amount["currency"]) ?? firstString(amount["priceCurrency"]);
  const quantity = firstRecord(amount["value"]);
  if (!currency || !quantity) return undefined;

  const single = firstString(quantity["value"]);
  const minimum = firstString(quantity["minValue"]);
  const maximum = firstString(quantity["maxValue"]);

  const figure = single
    ? formatAmount(single)
    : minimum && maximum
      ? `${formatAmount(minimum)}–${formatAmount(maximum)}`
      : (minimum ?? maximum)
        ? formatAmount((minimum ?? maximum) as string)
        : undefined;

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
function readDescription(posting: JsonLdNode): {
  text?: string;
  shortened: boolean;
} {
  const raw = firstString(posting["description"]);
  if (!raw) return { shortened: false };

  const text = looksLikeHtml(raw)
    ? htmlToPlainText(raw)
    : normalizeWhitespace(raw);
  if (!text) return { shortened: false };

  if (text.length <= DESCRIPTION_LIMIT) return { text, shortened: false };

  const room = DESCRIPTION_LIMIT - SHORTENED_NOTICE.length;
  return { text: `${text.slice(0, room).trim()}${SHORTENED_NOTICE}`, shortened: true };
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

/** The best title the page offers when it publishes no structured posting. */
function fallbackTitle(signals: PageSignals): string | undefined {
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
    if (cleaned) return cleaned;
  }

  return undefined;
}

/**
 * Reads one page's signals into the job record the student will confirm.
 *
 * Always returns a result. "Nothing was found" is an outcome the popup can show
 * and the student can complete by hand, not an error, and it is the honest
 * answer for the many job pages that publish no structured data at all.
 */
export function extractJob(signals: PageSignals): ExtractedJob {
  const warnings: ExtractionWarning[] = [];
  const url = postingUrl(signals);
  const source = sourceForUrl(signals.pageUrl);

  const [posting] = findJobPostings(signals.jsonLdBlocks);

  if (!posting) {
    const title = clamp(fallbackTitle(signals), LIMITS.jobTitle);
    const metaDescription =
      signals.meta["og:description"] ?? signals.meta["description"];

    warnings.push("no_job_posting_found");
    if (!title) warnings.push("missing_job_title");
    warnings.push("missing_company", "missing_location");

    return {
      ...(title ? { jobTitle: title } : {}),
      ...(metaDescription
        ? { jobDescription: normalizeWhitespace(metaDescription) }
        : {}),
      ...(url ? { jobUrl: url } : {}),
      ...(source ? { source } : {}),
      warnings,
    };
  }

  const organization = firstRecord(posting["hiringOrganization"]);
  const company = clamp(
    organization
      ? firstString(organization["name"])
      : firstString(posting["hiringOrganization"]),
    LIMITS.company,
  );
  const jobTitle =
    clamp(firstString(posting["title"]), LIMITS.jobTitle) ??
    clamp(fallbackTitle(signals), LIMITS.jobTitle);
  const location = clamp(readLocation(posting), LIMITS.location);
  const description = readDescription(posting);

  if (!company) warnings.push("missing_company");
  if (!jobTitle) warnings.push("missing_job_title");
  if (!location) warnings.push("missing_location");
  if (description.shortened) warnings.push("description_too_long");

  return {
    ...(company ? { company } : {}),
    ...(jobTitle ? { jobTitle } : {}),
    ...(location ? { location } : {}),
    ...(readCompanyDomain(organization)
      ? { companyDomain: readCompanyDomain(organization) }
      : {}),
    ...(description.text ? { jobDescription: description.text } : {}),
    ...(url ? { jobUrl: url } : {}),
    ...(source ? { source } : {}),
    ...(readDeadline(posting) ? { deadline: readDeadline(posting) } : {}),
    ...(readSalary(posting) ? { salary: readSalary(posting) } : {}),
    warnings,
  };
}
