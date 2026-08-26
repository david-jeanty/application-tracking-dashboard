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
 * The strategies it implements are LinkedIn's, because LinkedIn's live markup
 * puts the title and the location in unattributed leaves whose classes are
 * generated hashes, and the only way to reach them without guessing is through
 * their relationship to an element that *is* semantically labelled. There are
 * two because one LinkedIn route shows a posting its own address does not name,
 * and reading it needs the page's answer rather than the URL's.
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
  /** What the region the fields came from said it was, when it said so. */
  let statedJobId: string | undefined;

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
  /** `Company, Micron Technology.` — the label, and the employer inside it. */
  const COMPANY_LABEL_PATTERN = /^\s*company\s*[,:]\s*([\s\S]*)$/i;
  /** The title leaf's one observed structural relationship. */
  const TITLE_SELECTOR = 'div[data-display-contents="true"] > p';
  const DESCRIPTION_SELECTOR = '[data-testid="expandable-text-box"]';
  const ABOUT_HEADING_PATTERN = /^about the job$/i;
  const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"]';
  const RESULT_CARD_SELECTOR = 'li, [role="listitem"]';
  const MAXIMUM_LOCATION_CHARACTERS = 120;

  function trimmedText(node: Element | null): string {
    return (node?.textContent ?? "").trim();
  }

  /**
   * The employer an element's own label names, as the page renders it.
   *
   * The element's text is the employer as written on screen; the label is the
   * same value inside a spoken sentence, so its trailing punctuation belongs to
   * the sentence rather than to the employer. A label naming nothing — the bare
   * `Company,` — yields nothing.
   */
  function companyNameFrom(element: Element): string | undefined {
    const match = COMPANY_LABEL_PATTERN.exec(
      element.getAttribute("aria-label") ?? "",
    );
    if (!match) return undefined;

    const fromText = trimmedText(element);
    const fromLabel = (match[1] ?? "")
      .trim()
      .replace(/[.,;:]+$/, "")
      .trim();

    const name =
      fromText && fromText.length <= 160 && !fromText.includes("\n")
        ? fromText
        : fromLabel;

    return name ? name : undefined;
  }

  /** LinkedIn renders every search or similar-jobs result as a list item. */
  function inAResultCard(element: Element): boolean {
    return Boolean(element.closest(RESULT_CARD_SELECTOR));
  }

  function aboutTheJobHeadings(): Element[] {
    return Array.from(document.querySelectorAll(HEADING_SELECTOR))
      .slice(0, MAXIMUM_HEADING_CANDIDATES)
      .filter((heading) => ABOUT_HEADING_PATTERN.test(trimmedText(heading)));
  }

  /**
   * The description, anchored to a visible "About the job" heading.
   *
   * More than one element on the page carries the description container's
   * `data-testid` — a hiring-insights upsell uses the same one — so taking the
   * first on the page would store an advertisement as the job description. The
   * heading is the only thing that says which box is the posting, so the box
   * must both share a small ancestor with it and follow it in the document.
   */
  function descriptionUnder(headings: readonly Element[]): string | undefined {
    for (const heading of headings) {
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
        if (value) return value;
        if (node === document.body) break;
        node = node.parentElement;
      }
    }

    return undefined;
  }

  function readLinkedInJobDetail(): void {
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
        if (inAResultCard(element)) continue;

        const name = companyNameFrom(element);
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

    // The first "About the job" heading on the page, and only that one: on
    // these routes the page shows one posting, so a second would be furniture.
    const [about] = aboutTheJobHeadings();
    const description = about ? descriptionUnder([about]) : undefined;
    if (description) siteFields["description"] = description;
  }

  /**
   * LinkedIn's Similar Jobs route, where the address does not name the pane.
   *
   * `/jobs/collections/similar-jobs/?currentJobId=A&referenceJobId=B` shows one
   * posting and names two, and live Chrome evidence says neither parameter
   * reliably names the one on screen. On the page that produced this code the
   * address read `currentJobId=4455239909`, while inside
   * `section[aria-label="Primary content"]` every `JobDetails_*` component id —
   * the manage banner, the about-the-job block, the resume review, the company
   * insights, the similar-jobs slot — ended `_4455304273`, and the company
   * label in that same region named that posting's employer. Nothing carrying
   * 4455239909 was rendered outside a result card at all.
   *
   * An earlier correction assumed `currentJobId` was authoritative and read the
   * wrong pane. Assuming `referenceJobId` instead would be the same mistake
   * with a different parameter. So neither decides: **the active detail pane is
   * authoritative about which posting it is**, it says so in its own component
   * ids, and the address is context rather than an answer.
   *
   * Identity has to agree with itself before it counts. Several independent
   * components must name the same posting, no component may name a different
   * one, and a single uncorroborated id is not enough. When identity does not
   * resolve, every field stays blank and no URL is built from a parameter —
   * because a record filed under one posting's address carrying another
   * posting's fields is worse than a blank the student types over.
   */
  function readLinkedInSimilarJob(): void {
    /** `JobDetails_AboutTheJob_4455304273` — the component, and the posting. */
    const COMPONENT_ID_PATTERN = /^JobDetails[A-Za-z0-9_]*_(\d{5,})$/;
    /** The one region that holds the posting the student is looking at. */
    const PRIMARY_CONTENT_SELECTORS = [
      'section[aria-label="Primary content"]',
      '[aria-label="Primary content"]',
    ];
    /** The rail of other postings, named by the same id convention. */
    const RAIL_ID_PATTERN = /similarjobs|morejobs/i;
    const MINIMUM_AGREEING_COMPONENTS = 2;

    let primary: Element | null = null;
    for (const selector of PRIMARY_CONTENT_SELECTORS) {
      primary = document.querySelector(selector);
      if (primary) break;
    }
    // No bounded active region, nothing to be sure about. Blank.
    if (!primary) return;

    const region = primary;

    /**
     * Whether an element belongs to the rail of other postings.
     *
     * Structural containment rather than "is inside a list item". The rail is
     * a `JobDetails*SimilarJobs*` slot inside the same region, and the top card
     * beside it is not — where the blanket list-item test could not tell the
     * two apart, because LinkedIn builds parts of the active pane out of lists
     * too. Outside this region the list-item test still stands: that is where
     * search results live.
     */
    function inTheRail(element: Element): boolean {
      let node: Element | null = element;

      while (node && node !== region) {
        if (node.id && RAIL_ID_PATTERN.test(node.id)) return true;
        node = node.parentElement;
      }

      return false;
    }

    /**
     * Which posting this region says it is, or nothing.
     *
     * Every `JobDetails_*_<id>` component in the region votes. They must agree
     * unanimously and there must be more than one of them: a lone id could be a
     * leftover, and two components disagreeing means the page is mid-swap and
     * no answer is safe.
     */
    function statedIdentity(): string | undefined {
      const found = new Set<string>();

      for (const element of Array.from(region.querySelectorAll("[id]")).slice(
        0,
        MAXIMUM_LABELLED_CANDIDATES,
      )) {
        const stated = COMPONENT_ID_PATTERN.exec(element.id)?.[1];
        if (!stated) continue;
        // A card in the rail names its own posting; it is not this pane's.
        if (inTheRail(element)) continue;

        found.add(stated);
        if (found.size > 1) return undefined;
      }

      const [only] = Array.from(found);
      if (!only) return undefined;

      // Corroboration: count the components that agreed, not just the ids.
      const agreeing = Array.from(region.querySelectorAll("[id]")).filter(
        (element) =>
          COMPONENT_ID_PATTERN.exec(element.id)?.[1] === only &&
          !inTheRail(element),
      ).length;

      return agreeing >= MINIMUM_AGREEING_COMPONENTS ? only : undefined;
    }

    const identity = statedIdentity();
    if (!identity) return;

    // Stated before any field is read, and read from the same region, so the
    // stored URL and the stored fields cannot describe two different postings.
    statedJobId = identity;

    /**
     * The employer, then the card it belongs to, then that card's title and
     * location — the mechanics the verified routes already use, pointed at this
     * region instead of at the whole document.
     */
    let anchor: { element: Element; name: string } | null = null;
    for (const element of Array.from(region.querySelectorAll("[aria-label]"))) {
      if (inTheRail(element)) continue;

      const name = companyNameFrom(element);
      if (name) {
        anchor = { element, name };
        break;
      }
    }

    if (anchor) {
      siteFields["company"] = clamp(anchor.name, MAXIMUM_FIELD_CHARACTERS);

      let card: Element | null = anchor.element.parentElement;
      let titleText = "";
      for (let depth = 0; card && depth < MAXIMUM_ANCESTOR_DEPTH; depth += 1) {
        if (card === region || card === document.body) {
          card = null;
          break;
        }
        if (card.querySelector(TITLE_SELECTOR)) break;
        card = card.parentElement;
      }

      if (card) {
        for (const candidate of Array.from(
          card.querySelectorAll(TITLE_SELECTOR),
        )) {
          if (inTheRail(candidate)) continue;
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

        for (const candidate of Array.from(card.querySelectorAll("p > span"))) {
          if (inTheRail(candidate) || anchor.element.contains(candidate)) {
            continue;
          }

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
    }

    /**
     * The description, from this posting's own About-the-job component.
     *
     * The component names the posting in its id, so scoping to it settles both
     * questions at once: which posting the text belongs to, and which of the
     * page's several `expandable-text-box` elements is the job rather than a
     * Premium upsell. Where no such component exists the heading anchoring the
     * verified routes use stands in, still bounded to this region.
     */
    const aboutComponent = Array.from(region.querySelectorAll("[id]")).find(
      (element) =>
        COMPONENT_ID_PATTERN.exec(element.id)?.[1] === identity &&
        /abouthejob|aboutthejob/i.test(element.id) &&
        !inTheRail(element),
    );

    if (aboutComponent) {
      const box = Array.from(
        aboutComponent.querySelectorAll(DESCRIPTION_SELECTOR),
      ).find((candidate) => !inTheRail(candidate));

      const value = markupOf(box ?? null);
      if (value) siteFields["description"] = value;
    }

    if (!siteFields["description"]) {
      const headings = aboutTheJobHeadings().filter(
        (heading) => region.contains(heading) && !inTheRail(heading),
      );
      const value = descriptionUnder(headings);
      if (value) siteFields["description"] = value;
    }
  }

  if (rules.strategy === "linkedin-job-detail") readLinkedInJobDetail();
  if (rules.strategy === "linkedin-similar-jobs") readLinkedInSimilarJob();

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
    ...(statedJobId ? { siteJobId: statedJobId } : {}),
    evidence: {
      applyAffordance,
      jobPostingMicrodata: Boolean(microdataRoot),
    },
  };
}
