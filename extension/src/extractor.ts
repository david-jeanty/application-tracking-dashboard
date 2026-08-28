import type { CaptureRecord, ExtractionResult } from "./types.js";

/**
 * Runs inside the explicitly selected tab through chrome.scripting. Every
 * helper is nested so Chrome can serialize this function without importing
 * extension code into the page. It only reads the document and returns plain
 * data; it does not mutate the page, contact a server, or receive credentials.
 */
export function extractCurrentPage(
  pageDocument: Document = document,
  pageUrl: string = document.location.href,
): ExtractionResult {
  const DESCRIPTION_LIMIT = 50_000;

  type JsonObject = Record<string, unknown>;

  const isObject = (value: unknown): value is JsonObject =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const cleanString = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const cleaned = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    return cleaned || undefined;
  };

  const firstString = (...values: unknown[]): string | undefined => {
    for (const value of values) {
      const cleaned = cleanString(value);
      if (cleaned) return cleaned;
    }
    return undefined;
  };

  const hasJobPostingType = (value: unknown): boolean => {
    if (typeof value === "string") return value === "JobPosting";
    return Array.isArray(value) && value.some((item) => item === "JobPosting");
  };

  const collectObjects = (value: unknown, output: JsonObject[]) => {
    if (Array.isArray(value)) {
      for (const item of value) collectObjects(item, output);
      return;
    }
    if (!isObject(value)) return;
    output.push(value);
    if (Array.isArray(value["@graph"])) collectObjects(value["@graph"], output);
  };

  const candidates: JsonObject[] = [];
  for (const script of pageDocument.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      collectObjects(JSON.parse(script.textContent ?? ""), candidates);
    } catch {
      // One malformed block must not discard valid structured data elsewhere.
    }
  }

  const score = (candidate: JsonObject): number =>
    [
      candidate.title,
      isObject(candidate.hiringOrganization)
        ? candidate.hiringOrganization.name
        : undefined,
      candidate.description,
      candidate.jobLocation,
      candidate.validThrough,
      candidate.baseSalary,
      candidate.url,
    ].filter(Boolean).length;

  const jobPosting = candidates
    .filter((candidate) => hasJobPostingType(candidate["@type"]))
    .sort((left, right) => score(right) - score(left))[0];

  const meta = (selector: string): string | undefined =>
    cleanString(pageDocument.querySelector<HTMLMetaElement>(selector)?.content);

  const link = (selector: string): string | undefined =>
    pageDocument.querySelector<HTMLLinkElement>(selector)?.getAttribute("href") ||
    undefined;

  const validHttpUrl = (value: unknown): string | undefined => {
    const candidate = cleanString(value);
    if (!candidate) return undefined;
    try {
      const url = new URL(candidate, pageUrl);
      return url.protocol === "http:" || url.protocol === "https:"
        ? url.toString()
        : undefined;
    } catch {
      return undefined;
    }
  };

  const canonicalLink = validHttpUrl(link('link[rel~="canonical"]'));
  const canonicalUrl =
    canonicalLink ??
    validHttpUrl(jobPosting?.url) ??
    validHttpUrl(pageUrl);

  const pageHostname = (() => {
    try {
      return new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  const source = (() => {
    if (pageHostname === "linkedin.com" || pageHostname.endsWith(".linkedin.com")) {
      return "LinkedIn" as const;
    }
    if (
      pageHostname === "indeed.com" ||
      pageHostname.endsWith(".indeed.com") ||
      pageHostname.startsWith("indeed.") ||
      pageHostname.includes(".indeed.")
    ) {
      return "Indeed" as const;
    }
    return undefined;
  })();

  const organization = isObject(jobPosting?.hiringOrganization)
    ? jobPosting.hiringOrganization
    : undefined;

  const companyDomain = (() => {
    const organizationUrl = validHttpUrl(organization?.url);
    if (!organizationUrl) return undefined;
    const hostname = new URL(organizationUrl).hostname.toLowerCase().replace(/^www\./, "");
    const blocked = [
      "workday.com",
      "myworkdayjobs.com",
      "greenhouse.io",
      "greenhouse.com",
      "lever.co",
      "linkedin.com",
      "indeed.com",
      "glassdoor.com",
      "smartrecruiters.com",
      "jobvite.com",
      "icims.com",
    ];
    if (blocked.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return undefined;
    }
    return hostname || undefined;
  })();

  const plainTextDescription = (html: unknown): string | undefined => {
    if (typeof html !== "string" || !html.trim()) return undefined;
    const parsed = new DOMParser().parseFromString(html, "text/html");
    for (const unsafe of parsed.querySelectorAll(
      "script, style, noscript, template, svg, canvas",
    )) {
      unsafe.remove();
    }

    const blocks = new Set([
      "ADDRESS",
      "ARTICLE",
      "ASIDE",
      "BLOCKQUOTE",
      "DIV",
      "DL",
      "DT",
      "DD",
      "FIGCAPTION",
      "FIGURE",
      "FOOTER",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "HEADER",
      "HR",
      "LI",
      "MAIN",
      "NAV",
      "OL",
      "P",
      "PRE",
      "SECTION",
      "TABLE",
      "TR",
      "UL",
    ]);
    const chunks: string[] = [];
    const newline = () => {
      if (chunks.at(-1) !== "\n") chunks.push("\n");
    };
    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        chunks.push(node.textContent ?? "");
        return;
      }
      if (!(node instanceof Element)) return;
      if (node.tagName === "BR") {
        newline();
        return;
      }
      if (blocks.has(node.tagName)) newline();
      if (node.tagName === "LI") chunks.push("• ");
      for (const child of node.childNodes) visit(child);
      if (blocks.has(node.tagName)) newline();
    };
    for (const child of parsed.body.childNodes) visit(child);

    const text = chunks
      .join("")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((line) => line.replace(/[\t ]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text || undefined;
  };

  const locationText = (value: unknown): string | undefined => {
    if (Array.isArray(value)) {
      return value.map(locationText).filter(Boolean).join("; ") || undefined;
    }
    const direct = cleanString(value);
    if (direct) return direct;
    if (!isObject(value)) return undefined;

    const address = isObject(value.address) ? value.address : value;
    const country = isObject(address.addressCountry)
      ? firstString(address.addressCountry.name, address.addressCountry["@id"])
      : cleanString(address.addressCountry);
    const pieces = [
      cleanString(address.addressLocality),
      cleanString(address.addressRegion),
      country,
    ].filter((item): item is string => Boolean(item));
    return [...new Set(pieces)].join(", ") || cleanString(value.name);
  };

  const dateOnly = (value: unknown): string | undefined => {
    const candidate = cleanString(value)?.slice(0, 10);
    if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return undefined;
    const [year, month, day] = candidate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? candidate
      : undefined;
  };

  const salaryText = (value: unknown): string | undefined => {
    const direct = firstString(value, typeof value === "number" ? String(value) : undefined);
    if (direct) return direct.slice(0, 200);
    if (!isObject(value)) return undefined;

    const currency = firstString(value.currency, jobPosting?.salaryCurrency);
    const amount = value.value;
    if (typeof amount === "string" || typeof amount === "number") {
      const result = [currency, String(amount)].filter(Boolean).join(" ");
      return result.slice(0, 200) || undefined;
    }
    if (!isObject(amount)) return undefined;

    const exact = firstString(
      amount.value,
      typeof amount.value === "number" ? String(amount.value) : undefined,
    );
    const minimum = firstString(
      amount.minValue,
      typeof amount.minValue === "number" ? String(amount.minValue) : undefined,
    );
    const maximum = firstString(
      amount.maxValue,
      typeof amount.maxValue === "number" ? String(amount.maxValue) : undefined,
    );
    const range = exact ?? (minimum && maximum ? `${minimum}–${maximum}` : minimum ?? maximum);
    if (!range) return undefined;
    const unit = cleanString(amount.unitText)?.toLowerCase();
    return [currency, range, unit ? `per ${unit}` : undefined]
      .filter(Boolean)
      .join(" ")
      .slice(0, 200);
  };

  const rawDescription = plainTextDescription(
    jobPosting?.description ??
      meta('meta[name="description"]') ??
      meta('meta[property="og:description"]'),
  );
  const warnings: ExtractionResult["warnings"] = [];
  const description = (() => {
    if (!rawDescription) return undefined;
    if (rawDescription.length > DESCRIPTION_LIMIT) {
      warnings.push("description_oversized");
      return undefined;
    }
    return rawDescription;
  })();

  const structuredTitle = cleanString(jobPosting?.title);
  const openGraphTitle = meta('meta[property="og:title"]');
  const documentTitle = cleanString(pageDocument.title);
  const heading = cleanString(pageDocument.querySelector("h1")?.textContent);
  const title = structuredTitle ?? openGraphTitle ?? documentTitle ?? heading;

  const record: CaptureRecord = {
    ...(cleanString(organization?.name)
      ? { company: cleanString(organization?.name) }
      : {}),
    ...(title ? { job_title: title } : {}),
    ...(companyDomain ? { company_domain: companyDomain } : {}),
    ...(locationText(jobPosting?.jobLocation)
      ? { location: locationText(jobPosting?.jobLocation) }
      : {}),
    ...(description ? { job_description: description } : {}),
    ...(canonicalUrl ? { job_url: canonicalUrl } : {}),
    ...(source ? { source } : {}),
    ...(dateOnly(jobPosting?.validThrough)
      ? { deadline: dateOnly(jobPosting?.validThrough) }
      : {}),
    ...(salaryText(jobPosting?.baseSalary)
      ? { salary: salaryText(jobPosting?.baseSalary) }
      : {}),
  };

  const method = jobPosting
    ? "json_ld"
    : openGraphTitle || documentTitle || canonicalLink
      ? "metadata"
      : heading
        ? "heading"
        : "none";

  return {
    record,
    method,
    jobPostingFound: Boolean(jobPosting),
    warnings,
  };
}
