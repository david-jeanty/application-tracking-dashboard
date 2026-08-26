import type { PageReadRules } from "./sites.js";
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
 * It does not decide which site it is on. The selectors, and the one named
 * relational strategy, arrive as an argument resolved from the page's address
 * by `sites.ts`, so that file remains the single place any site is described.
 * When the argument is empty — an unrecognized page, or a tab whose URL the
 * popup could not see — nothing site-specific is collected and the result is
 * the honest generic one.
 *
 * The one strategy it implements is LinkedIn's, because LinkedIn's live markup
 * puts the title and the location in unattributed leaves whose classes are
 * generated hashes, and the only way to reach them without guessing is through
 * their relationship to an element that *is* semantically labelled.
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
  rules: PageReadRules = { fields: [] },
): PageSignals {
  const MAXIMUM_JSON_LD_BLOCKS = 20;
  const MAXIMUM_JSON_LD_CHARACTERS = 400_000;
  const MAXIMUM_META_CHARACTERS = 5_000;
  const MAXIMUM_TITLE_CHARACTERS = 500;
  const MAXIMUM_FIELD_CHARACTERS = 200_000;
  const MAXIMUM_MICRODATA_PROPERTIES = 60;
  const MAXIMUM_APPLY_CANDIDATES = 400;
  const MAXIMUM_LABELLED_CANDIDATES = 400;
  const MAXIMUM_HEADING_CANDIDATES = 200;
  /** How far a relational read may climb before it gives up. */
  const MAXIMUM_ANCESTOR_DEPTH = 8;

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
  for (const rule of rules.fields) {
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

  /**
   * LinkedIn's job detail, read through the one thing on it that is labelled.
   *
   * The live page names the employer in an `aria-label` of the form
   * `Company, <employer>.` — an accessibility attribute, the highest-preference
   * signal short of structured data — and marks the description container with
   * `data-testid="expandable-text-box"`. The title and the location carry no
   * id, role, `aria-label` or `data-testid` of their own, and their classes are
   * generated hashes that will differ on the next deploy. They are reachable
   * only by their relationship to the labelled company: both live inside the
   * same top card.
   *
   * So the read is: find the company, climb to the card it belongs to, and take
   * the title and the location from inside that card and nowhere else. Every
   * step is bounded, and any step that cannot be completed leaves its field
   * blank rather than falling back to something that merely looks right.
   */
  function readLinkedInJobDetail(): void {
    /** `Company, Micron Technology.` — the label, and the employer inside it. */
    const COMPANY_LABEL_PATTERN = /^\s*company\s*[,:]\s*([\s\S]*)$/i;
    /** The title leaf's one observed structural relationship. */
    const TITLE_SELECTOR = 'div[data-display-contents="true"] > p';
    const DESCRIPTION_SELECTOR = '[data-testid="expandable-text-box"]';
    const ABOUT_HEADING_PATTERN = /^about the job$/i;
    const MAXIMUM_LOCATION_CHARACTERS = 120;

    function trimmedText(node: Element | null): string {
      return (node?.textContent ?? "").trim();
    }

    /**
     * The labelled company, and the element carrying the label.
     *
     * A candidate inside a list item is skipped: LinkedIn's search view renders
     * every result as a list item, and each of those names a company too.
     * Taking one of them would store the job the student did not select — the
     * exact failure the scoping in this file exists to prevent.
     */
    function findCompanyAnchor(): { element: Element; name: string } | null {
      const labelled = Array.from(
        document.querySelectorAll("[aria-label]"),
      ).slice(0, MAXIMUM_LABELLED_CANDIDATES);

      let fallback: { element: Element; name: string } | null = null;

      for (const element of labelled) {
        const match = COMPANY_LABEL_PATTERN.exec(
          element.getAttribute("aria-label") ?? "",
        );
        if (!match) continue;
        if (element.closest('li, [role="listitem"]')) continue;

        // The element's own text is the employer as the page renders it; the
        // label is the same value inside a spoken sentence, so its trailing
        // punctuation is the sentence's rather than the employer's.
        const fromText = trimmedText(element);
        const fromLabel = (match[1] ?? "")
          .trim()
          .replace(/[.,;:]+$/, "")
          .trim();

        const name =
          fromText && fromText.length <= 160 && !fromText.includes("\n")
            ? fromText
            : fromLabel;
        if (!name) continue;

        const candidate = { element, name };
        if (element.closest("main")) return candidate;
        if (!fallback) fallback = candidate;
      }

      return fallback;
    }

    /** The smallest bounded ancestor of the company that holds a title leaf. */
    function findTopCard(anchor: Element): Element | null {
      let node: Element | null = anchor.parentElement;

      for (let depth = 0; node && depth < MAXIMUM_ANCESTOR_DEPTH; depth += 1) {
        if (node === document.body || node.tagName === "MAIN") return null;
        if (node.querySelector(TITLE_SELECTOR)) return node;
        node = node.parentElement;
      }

      return null;
    }

    const anchor = findCompanyAnchor();
    if (!anchor) return;

    siteFields["company"] = clamp(anchor.name, MAXIMUM_FIELD_CHARACTERS);

    const topCard = findTopCard(anchor.element);
    if (topCard) {
      // The title: the first leaf in the card standing in the one relationship
      // the live markup actually exposes, and never the company's own element.
      // The card wraps its metadata paragraph the same way, so "first" is what
      // separates the title from the line beneath it.
      let titleText = "";
      for (const candidate of Array.from(
        topCard.querySelectorAll(TITLE_SELECTOR),
      )) {
        if (
          candidate.contains(anchor.element) ||
          anchor.element.contains(candidate)
        ) {
          continue;
        }

        const value = markupOf(candidate);
        if (value && trimmedText(candidate) !== anchor.name) {
          siteFields["title"] = value;
          titleText = trimmedText(candidate);
          break;
        }
      }

      // The location: the first `span` inside a `p` in the same card. The live
      // card renders location, posting age and applicant count as sibling spans
      // of one paragraph, and the location leads it — so the first span is the
      // place, and the rest of the line is not swept in with it.
      for (const candidate of Array.from(
        topCard.querySelectorAll("p > span"),
      )) {
        if (anchor.element.contains(candidate)) continue;

        const value = trimmedText(candidate);
        if (
          !value ||
          value.length > MAXIMUM_LOCATION_CHARACTERS ||
          value.includes("\n") ||
          value === anchor.name ||
          value === titleText
        ) {
          continue;
        }

        siteFields["location"] = value;
        break;
      }
    }

    /**
     * The description, anchored to the visible "About the job" heading.
     *
     * More than one element on the page carries the description container's
     * `data-testid` — a hiring-insights upsell uses the same one — so taking
     * the first on the page would store an advertisement as the job
     * description. The heading is the only thing that says which box is the
     * posting, so the box must both share a small ancestor with it and follow
     * it in the document.
     */
    const headings = Array.from(
      document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'),
    ).slice(0, MAXIMUM_HEADING_CANDIDATES);

    for (const heading of headings) {
      if (!ABOUT_HEADING_PATTERN.test(trimmedText(heading))) continue;

      let node: Element | null = heading.parentElement;
      for (let depth = 0; node && depth < MAXIMUM_ANCESTOR_DEPTH; depth += 1) {
        const boxes = Array.from(node.querySelectorAll(DESCRIPTION_SELECTOR));
        const following = boxes.find(
          (box) =>
            (heading.compareDocumentPosition(box) &
              Node.DOCUMENT_POSITION_FOLLOWING) !==
            0,
        );

        const value = markupOf(following ?? null);
        if (value) {
          siteFields["description"] = value;
          break;
        }
        if (node === document.body) break;
        node = node.parentElement;
      }

      break;
    }
  }

  if (rules.strategy === "linkedin-job-detail") readLinkedInJobDetail();

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
