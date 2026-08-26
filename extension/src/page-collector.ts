import type { FieldRule } from "./sites.js";
import type { PageSignals } from "./types.js";

/**
 * Reads the posting the student explicitly asked JobTrack to capture.
 *
 * This is the only code that ever touches a job site, it runs exactly once per
 * click, and it is deliberately the least capable part of the extension. It
 * reads; it does not interpret, store, transmit, or modify anything. It has no
 * access to tokens because it is never given any, and it makes no network
 * request of its own — the values it returns travel back to the extension and
 * are turned into a job record there, where the code is testable and the page
 * cannot reach it.
 *
 * It also knows nothing about LinkedIn, Indeed or Workday. The selectors for a
 * recognized site arrive as an argument, resolved from the page's address by
 * `sites.ts`, so this stays a generic reader and every site is described in one
 * place. When the argument is empty — an unrecognized page, or a tab whose URL
 * the popup could not see — nothing site-specific is collected and the result
 * is the honest generic one.
 *
 * Chrome serializes this function with `Function.prototype.toString()` before
 * injecting it, so it must be self-contained: every helper it uses is declared
 * inside the body, and it closes over nothing. That constraint is the reason
 * this file holds one function instead of a tidy module.
 *
 * Everything it collects is bounded. A page is untrusted input, and an
 * extension that hands an unbounded string to the rest of itself has only moved
 * the problem.
 */
export function collectPageSignals(
  fieldRules: readonly FieldRule[] = [],
): PageSignals {
  const MAXIMUM_JSON_LD_BLOCKS = 20;
  const MAXIMUM_JSON_LD_CHARACTERS = 400_000;
  const MAXIMUM_META_CHARACTERS = 5_000;
  const MAXIMUM_TITLE_CHARACTERS = 500;
  const MAXIMUM_FIELD_CHARACTERS = 200_000;
  const MAXIMUM_MICRODATA_PROPERTIES = 60;
  const MAXIMUM_APPLY_CANDIDATES = 400;

  /**
   * The metadata names worth reading, rather than every `<meta>` on the page.
   *
   * An allowlist keeps analytics identifiers, ad-network payloads, and whatever
   * else a job board decided to put in its head out of the extension entirely.
   */
  const WANTED_META = [
    "og:title",
    "og:description",
    "og:url",
    "og:site_name",
    "og:type",
    "twitter:title",
    "twitter:description",
    "description",
    "title",
  ];

  /**
   * Accessible names that mean "this page can be applied to".
   *
   * Structural corroboration, not a title source: no value matched here is ever
   * stored. It exists so a heading on a page with no apply control and no
   * job-shaped address is not promoted into a job title.
   */
  const APPLY_PATTERN =
    /^(apply|apply now|apply online|apply for this job|apply to this job|submit application|start application|easy apply)\b/i;

  function clamp(value: string, limit: number): string {
    return value.length > limit ? value.slice(0, limit) : value;
  }

  function textOf(node: Element | null): string | undefined {
    const value = node?.textContent?.trim();
    return value ? value : undefined;
  }

  /** The markup inside an element, bounded, or nothing when it is empty. */
  function markupOf(node: Element | null): string | undefined {
    if (!node) return undefined;
    if (!node.textContent?.trim()) return undefined;

    return clamp(node.innerHTML, MAXIMUM_FIELD_CHARACTERS);
  }

  const jsonLdBlocks: string[] = [];
  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]',
  );
  for (const script of Array.from(scripts)) {
    if (jsonLdBlocks.length >= MAXIMUM_JSON_LD_BLOCKS) break;
    const raw = script.textContent?.trim();
    if (raw) jsonLdBlocks.push(clamp(raw, MAXIMUM_JSON_LD_CHARACTERS));
  }

  const meta: Record<string, string> = {};
  for (const element of Array.from(document.querySelectorAll("meta"))) {
    const key = (
      element.getAttribute("property") ??
      element.getAttribute("name") ??
      ""
    )
      .trim()
      .toLowerCase();
    if (!key || !WANTED_META.includes(key)) continue;

    const content = element.getAttribute("content")?.trim();
    if (content && !(key in meta)) {
      meta[key] = clamp(content, MAXIMUM_META_CHARACTERS);
    }
  }

  /**
   * JobPosting microdata, flattened to the dotted paths the structured reader
   * already understands: `hiringOrganization.name`,
   * `jobLocation.address.addressLocality`, and so on.
   *
   * The walk is bounded and starts at the JobPosting itemscope, so properties
   * belonging to a breadcrumb, an organization footer, or a related-jobs list
   * elsewhere on the page are never mistaken for the posting's own.
   */
  const microdataRoot = document.querySelector(
    '[itemscope][itemtype*="JobPosting"]',
  );
  const microdata: Record<string, string> = {};

  if (microdataRoot) {
    const properties = Array.from(
      microdataRoot.querySelectorAll("[itemprop]"),
    ).slice(0, MAXIMUM_MICRODATA_PROPERTIES);

    for (const element of properties) {
      const names: string[] = [];
      let node: Element | null = element;

      // The path is read upwards, stopping at the posting itself, so nesting
      // depth never has to be assumed.
      while (node && node !== microdataRoot) {
        const name = node.getAttribute("itemprop")?.trim();
        if (name) names.unshift(name);
        node = node.parentElement;
      }
      if (names.length === 0 || node !== microdataRoot) continue;

      const key = names.join(".");
      if (key in microdata) continue;

      // `meta`, `link` and `time` state their value in an attribute; every
      // other element states it as its contents.
      const attribute =
        element.getAttribute("content") ??
        (element.tagName === "TIME"
          ? element.getAttribute("datetime")
          : null) ??
        (element.tagName === "LINK" || element.tagName === "A"
          ? element.getAttribute("href")
          : null);

      const value = attribute?.trim() || markupOf(element);
      if (value) microdata[key] = clamp(value, MAXIMUM_FIELD_CHARACTERS);
    }
  }

  const siteFields: Record<string, string> = {};
  for (const rule of fieldRules) {
    for (const selector of rule.selectors) {
      let found: Element | null = null;
      try {
        found = document.querySelector(selector);
      } catch {
        // A selector this browser will not parse is skipped rather than fatal.
        continue;
      }

      const value = markupOf(found);
      if (value) {
        siteFields[rule.key] = value;
        break;
      }
    }
  }

  let applyAffordance = false;
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'a, button, [role="button"], input[type="submit"]',
    ),
  ).slice(0, MAXIMUM_APPLY_CANDIDATES);

  for (const candidate of candidates) {
    const label = (
      candidate.getAttribute("aria-label")?.trim() ||
      candidate.getAttribute("value")?.trim() ||
      candidate.textContent?.trim() ||
      ""
    ).slice(0, 200);

    if (label && APPLY_PATTERN.test(label)) {
      applyAffordance = true;
      break;
    }
  }

  const canonical = document
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href")
    ?.trim();

  const heading = textOf(document.querySelector("h1"));
  const title = document.title?.trim();

  return {
    jsonLdBlocks,
    meta,
    ...(canonical ? { canonicalUrl: clamp(canonical, 2_048) } : {}),
    pageUrl: window.location.href,
    ...(title ? { documentTitle: clamp(title, MAXIMUM_TITLE_CHARACTERS) } : {}),
    ...(heading
      ? { headingText: clamp(heading, MAXIMUM_TITLE_CHARACTERS) }
      : {}),
    ...(Object.keys(microdata).length > 0 ? { microdata } : {}),
    ...(Object.keys(siteFields).length > 0 ? { siteFields } : {}),
    evidence: {
      applyAffordance,
      jobPostingMicrodata: Boolean(microdataRoot),
    },
  };
}
