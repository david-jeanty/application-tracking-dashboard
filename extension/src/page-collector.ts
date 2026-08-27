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
 * two because a job page and a split pane are different documents: one shows a
 * posting, the other shows a rail of other people's postings beside it.
 *
 * It does not decide which *document* it runs in either. On a LinkedIn split
 * pane the popup resolves that first, and this function is then injected into
 * the frame that was chosen. So nothing here asks whether an element is drawn:
 * the question "is this the posting on screen?" is settled before the read
 * begins, and the live search page lays the right answer out at `0×0` anyway.
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

  /**
   * A posting's arrangement, written as a fact of its own rather than as a
   * suffix on its location.
   *
   * Live LinkedIn states it both ways. `Toronto, Ontario, Canada (Hybrid)` is
   * handled where the location is read; this is the other shape — a small
   * standalone `Hybrid`, `Remote` or `On-site` beside the location line. The
   * value has to *be* one of those words: `Remote-first`, `Mostly remote` and
   * `Flexible` are prose about the company, and `Full-time`, `Internship` and
   * `Contract` are the employment type, which is a different field entirely.
   *
   * The surrounding parentheses are optional because the same pill is
   * sometimes drawn as `(Hybrid)` beside the place name.
   */
  const ARRANGEMENT_PILL_PATTERN =
    /^[(\[]?\s*(remote|hybrid|on[\s-]?site)\s*[)\]]?$/i;
  const PILL_SELECTOR = "span, li, p, div, strong, em, button";
  const MAXIMUM_PILL_CANDIDATES = 300;

  /**
   * Every arrangement stated inside one region that is already the selected
   * posting's, as the page wrote it.
   *
   * The region is the whole scope: this never looks at the document, because a
   * results rail, a Similar Jobs block, a recommended card or a previous SPA
   * state all say `Remote` about somebody else's job, and the first `Remote` on
   * a LinkedIn page is almost never the selected posting's.
   *
   * Only leaves are read. A pill is a leaf, and counting containers too would
   * report one statement several times and let a wrapper's assembled text
   * qualify as a stated word.
   */
  function statedArrangements(
    region: Element,
    locationElement?: Element | null,
    rejected?: (element: Element) => boolean,
  ): string[] {
    /** Keyed by the word, so `On-site`, `Onsite` and `On site` are one fact. */
    const stated = new Map<string, string>();

    const candidates = Array.from(region.querySelectorAll(PILL_SELECTOR)).slice(
      0,
      MAXIMUM_PILL_CANDIDATES,
    );

    for (const candidate of candidates) {
      if (candidate.firstElementChild) continue;
      // The place is never the evidence. A location reading `Remote` is where
      // the work happens as the posting files it, and inferring an arrangement
      // from a place is the mistake this whole field is careful about.
      if (
        locationElement &&
        (locationElement === candidate ||
          locationElement.contains(candidate) ||
          candidate.contains(locationElement))
      ) {
        continue;
      }
      if (rejected?.(candidate)) continue;

      const word = ARRANGEMENT_PILL_PATTERN.exec(trimmedText(candidate))?.[1];
      if (word) stated.set(word.toLowerCase().replace(/[\s-]/g, ""), word);
    }

    return [...stated.values()];
  }

  /**
   * Records what the selected posting stated, without choosing between them.
   *
   * One value is the fact. Two contradictory ones are both recorded, because
   * `rich-fields.ts` resolves a site's candidates exactly the way it resolves
   * any others: disagreement ends the field. Picking the first would be a coin
   * toss written into a record the student has no reason to doubt.
   */
  function recordArrangements(values: readonly string[]): void {
    if (values.length === 0) return;

    siteFields["workplaceType"] = clamp(
      values.join(", "),
      MAXIMUM_FIELD_CHARACTERS,
    );
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
      let locationElement: Element | null = null;
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
        locationElement = candidate;
        break;
      }

      // The arrangement, read only inside the card the employer, the title and
      // the location all came from. Nothing outside that card is consulted.
      recordArrangements(statedArrangements(topCard, locationElement));
    }

    // The first "About the job" heading on the page, and only that one: on
    // these routes the page shows one posting, so a second would be furniture.
    const [about] = aboutTheJobHeadings();
    const description = about ? descriptionUnder([about]) : undefined;
    if (description) siteFields["description"] = description;
  }

  /**
   * LinkedIn's split panes: search, recommended, and Similar Jobs.
   *
   * These routes show a rail of other people's postings beside one selected
   * posting, and two live failures proved that reading them like a job page
   * cannot work.
   *
   * On Similar Jobs the posting on screen is not even in this document by
   * default: LinkedIn renders it inside a same-origin `/preload/` iframe while
   * the top document keeps the previous posting, component ids and all. That is
   * resolved before this function runs — `linkedin-frames.ts` picks the
   * document, and this read then happens inside it.
   *
   * On `/jobs/search/` the selected posting *is* in the top document, and the
   * ordinary LinkedIn read still missed it: that read scans the first labelled
   * elements in the whole page, which on a results page means the rail. A live
   * GE Vernova capture came back blank in every field while
   * `section[aria-label="Primary content"]` plainly held
   * `aria-label="Company, GE Vernova."`, the title leaf, the location and the
   * description — every one of them laid out at `0×0`.
   *
   * So the read is bounded rather than global, and geometry decides nothing.
   * Everything comes from inside the Primary content region; the rail inside it
   * is excluded structurally, by LinkedIn's own card attributes and by links
   * that name a posting other than the selected one. If that region cannot
   * establish a coherent posting — no labelled employer, or two different ones
   * — every field stays blank.
   */
  function readLinkedInSplitPane(): void {
    /** The one region holding the posting the student is looking at. */
    const PRIMARY_CONTENT_SELECTORS = [
      'section[aria-label="Primary content"]',
      '[aria-label="Primary content"]',
    ];
    /** The rail of other postings, and the description block, by convention. */
    const RAIL_ID_PATTERN = /similarjobs|morejobs/i;
    const ABOUT_ID_PATTERN = /aboutthejob/i;
    /** `/jobs/view/4459003223/` — the posting a link in a card advertises. */
    const POSTING_LINK_PATTERN = /\/jobs\/view\/([A-Za-z0-9_-]+)/;
    const MAXIMUM_REGION_DEPTH = 24;
    const MAXIMUM_CARD_LINKS = 20;

    /** The posting the top-level address says is selected, or nothing. */
    const selected =
      typeof rules.jobId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(rules.jobId)
        ? rules.jobId
        : "";

    let found: Element | null = null;
    for (const selector of PRIMARY_CONTENT_SELECTORS) {
      found = document.querySelector(selector);
      if (found) break;
    }
    /**
     * LinkedIn's same-origin `/preload/` document has no Primary-content
     * region. It does, however, mark the selected card with the same
     * current-job id the top-level route supplied to this collector. This is
     * deliberately structural, rather than an address check: any document
     * without a Primary-content region gets this path only when it can name
     * the selected job itself.
     */
    if (!found) {
      if (!selected) return;

      const root =
        document.querySelector(`[data-job-id="${selected}"]`) ??
        document.querySelector(`[data-occludable-job-id="${selected}"]`);
      if (!root) {
        /**
         * Search-results detail has neither a Primary-content landmark nor a
         * selected-card marker. Its current-job link and labelled employer do
         * still share a compact header, which establishes the posting without
         * consulting the surrounding results rail.
         */
        const exactLinks = Array.from(
          document.querySelectorAll('a[href*="/jobs/view/"]'),
        ).filter((link) => {
          const id = POSTING_LINK_PATTERN.exec(
            link.getAttribute("href") ?? "",
          )?.[1];
          return id === selected;
        });

        const companies = Array.from(
          document.querySelectorAll("[aria-label]"),
        )
          .slice(0, MAXIMUM_LABELLED_CANDIDATES)
          .map((element) => ({ element, name: companyNameFrom(element) }))
          .filter(
            (
              candidate,
            ): candidate is { element: Element; name: string } =>
              Boolean(candidate.name),
          );

        function boundedCommonHeader(
          link: Element,
          company: Element,
        ): { header: Element; distance: number } | null {
          const linkAncestors: Element[] = [];
          let node: Element | null = link.parentElement;

          for (
            let depth = 0;
            node && node !== document.body && depth < MAXIMUM_ANCESTOR_DEPTH;
            depth += 1
          ) {
            linkAncestors.push(node);
            node = node.parentElement;
          }

          node = company.parentElement;
          for (
            let depth = 1;
            node && node !== document.body && depth < MAXIMUM_ANCESTOR_DEPTH;
            depth += 1
          ) {
            const linkDistance = linkAncestors.indexOf(node) + 1;
            if (linkDistance > 0) {
              return { header: node, distance: linkDistance + depth };
            }
            node = node.parentElement;
          }

          return null;
        }

        const headers: Array<{
          link: Element;
          company: { element: Element; name: string };
          header: Element;
          distance: number;
        }> = [];

        for (const link of exactLinks) {
          for (const company of companies) {
            const relation = boundedCommonHeader(link, company.element);
            if (relation) {
              headers.push({ link, company, ...relation });
            }
          }
        }

        // A result rail can have a larger common ancestor with the selected
        // link. Only one *closest* bounded relationship establishes the
        // header; a tie is ambiguous and deliberately stays blank.
        const shortestDistance = Math.min(
          ...headers.map((relation) => relation.distance),
        );
        const closestHeaders = headers.filter(
          (relation) => relation.distance === shortestDistance,
        );
        if (closestHeaders.length !== 1) return;

        const closest = closestHeaders[0];
        if (!closest) return;
        const { link, company, header } = closest;
        const title = trimmedText(link);
        if (
          !title ||
          title.length > MAXIMUM_TITLE_CHARACTERS ||
          title.includes("\n")
        ) {
          return;
        }

        siteFields["title"] = clamp(title, MAXIMUM_FIELD_CHARACTERS);
        siteFields["company"] = clamp(company.name, MAXIMUM_FIELD_CHARACTERS);

        const locationLine = Array.from(header.children).find(
          (child) => child.tagName === "P",
        );
        const rawLocation = trimmedText(locationLine ?? null);
        const location = rawLocation.split("·", 1)[0]?.trim() ?? "";
        if (
          location &&
          location.length <= MAXIMUM_LOCATION_CHARACTERS &&
          !location.includes("\n")
        ) {
          siteFields["location"] = clamp(location, MAXIMUM_FIELD_CHARACTERS);
        }

        // The arrangement, inside the same compact header the selected
        // posting's own link and employer established. The results rail around
        // it shares no such header, so its pills are out of scope.
        recordArrangements(statedArrangements(header, locationLine));

        const [about] = aboutTheJobHeadings();
        const description = about ? descriptionUnder([about]) : undefined;
        if (description) siteFields["description"] = description;

        return;
      }

      const exactPostingLink = Array.from(
        root.querySelectorAll('a[href*="/jobs/view/"]'),
      ).find((link) => {
        const href = link.getAttribute("href") ?? "";
        const id = POSTING_LINK_PATTERN.exec(href)?.[1];
        return id === selected;
      });
      if (!exactPostingLink) return;

      // The accessible name includes LinkedIn's "with verification" suffix.
      // A clean text descendant is the on-screen title and avoids persisting
      // that presentation-only annotation.
      const labelledTitle = (exactPostingLink.getAttribute("aria-label") ?? "")
        .replace(/\s+with verification\s*$/i, "")
        .trim();
      const titleNode = Array.from(
        exactPostingLink.querySelectorAll("span, strong"),
      ).find((candidate) => {
        const value = trimmedText(candidate);
        return (
          !candidate.querySelector("span, strong") &&
          Boolean(value) &&
          value.length <= MAXIMUM_TITLE_CHARACTERS &&
          !value.includes("\n") &&
          !/\bwith verification\b/i.test(value) &&
          (!labelledTitle || value === labelledTitle)
        );
      });
      const title = titleNode ? trimmedText(titleNode) : "";
      if (!title) return;
      siteFields["title"] = clamp(title, MAXIMUM_FIELD_CHARACTERS);

      /** The card's sibling blocks: title wrapper, company, then location. */
      function nextElementSibling(node: Element): Element | null {
        return node.nextElementSibling;
      }

      let titleWrapper: Element | null = exactPostingLink.parentElement;
      let companyBlock: Element | null = null;
      let locationBlock: Element | null = null;

      // The link is nested inside its title wrapper. The first ancestor with
      // two sibling blocks is the metadata block's title child; only those
      // siblings may provide employer and location.
      for (
        let depth = 0;
        titleWrapper && depth < MAXIMUM_ANCESTOR_DEPTH;
        depth += 1
      ) {
        const company = nextElementSibling(titleWrapper);
        const location = company ? nextElementSibling(company) : null;
        if (company && location) {
          companyBlock = company;
          locationBlock = location;
          break;
        }
        if (titleWrapper === root) break;
        titleWrapper = titleWrapper.parentElement;
      }

      const companyElement = companyBlock
        ? Array.from(companyBlock.children).find(
            (child) => child.tagName === "SPAN",
          )
        : undefined;
      const company = trimmedText(companyElement ?? null);
      if (
        company &&
        company !== title &&
        !/\bwith verification\b/i.test(company)
      ) {
        siteFields["company"] = clamp(company, MAXIMUM_FIELD_CHARACTERS);
      }

      const locationList = locationBlock
        ? Array.from(locationBlock.children).find(
            (child) => child.tagName === "UL",
          )
        : undefined;
      const locationElement = locationList
        ? locationList.querySelector("li > span")
        : null;
      const rawLocation = trimmedText(locationElement);
      /** Every way this card stated its arrangement, deduplicated below. */
      const arrangements: string[] = [];
      if (rawLocation && rawLocation.length <= MAXIMUM_LOCATION_CHARACTERS) {
        // `Toronto, Ontario, Canada (Hybrid)`. The parenthesized half is the
        // selected posting's own statement of how the role is worked, and it
        // was already being computed here only to be discarded. It is kept as
        // its own bounded fact; the location it is removed from is unchanged.
        const arrangement = /\s+\((on-site|hybrid|remote)\)\s*$/i.exec(
          rawLocation,
        )?.[1];
        if (arrangement) arrangements.push(arrangement);

        const location = rawLocation
          .replace(/\s+\((?:on-site|hybrid|remote)\)\s*$/i, "")
          .trim();
        if (location) {
          siteFields["location"] = clamp(location, MAXIMUM_FIELD_CHARACTERS);
        }
      }

      // The other shape: a standalone pill inside this card. `root` is the
      // element LinkedIn itself marked with the selected job's id, so a
      // neighbouring card's pill is not in scope here at all.
      for (const stated of statedArrangements(root, locationElement)) {
        const known = arrangements.some(
          (value) =>
            value.toLowerCase().replace(/[\s-]/g, "") ===
            stated.toLowerCase().replace(/[\s-]/g, ""),
        );
        if (!known) arrangements.push(stated);
      }
      recordArrangements(arrangements);

      const details = document.querySelector("#job-details");
      const about = details
        ? Array.from(details.querySelectorAll("h2")).find((heading) =>
            ABOUT_HEADING_PATTERN.test(trimmedText(heading)),
          )
        : undefined;
      if (details && about) {
        // Preserve the bounded rich description, excluding only its label.
        const copy = details.cloneNode(true) as Element;
        for (const heading of Array.from(copy.querySelectorAll("h2"))) {
          if (ABOUT_HEADING_PATTERN.test(trimmedText(heading))) heading.remove();
        }
        const description = markupOf(copy);
        if (description) {
          siteFields["description"] = description;
        }
      }

      return;
    }

    const region = found;

    /** Whether a card links to some posting other than the selected one. */
    function advertisesAnotherPosting(node: Element): boolean {
      const links = Array.from(
        node.querySelectorAll('a[href*="/jobs/view/"]'),
      ).slice(0, MAXIMUM_CARD_LINKS);

      for (const link of links) {
        const id = POSTING_LINK_PATTERN.exec(
          link.getAttribute("href") ?? "",
        )?.[1];
        if (id && id !== selected) return true;
      }

      return false;
    }

    /**
     * Whether an element belongs to the rail rather than to the detail pane.
     *
     * Three structural tests, walked up to the region, and no test of the form
     * "is inside a list item" — the Similar Jobs detail header renders its own
     * employer inside a list, so that blanket rule would discard the very field
     * being looked for.
     *
     * `data-occludable-job-id` is LinkedIn's own marker for a card in the
     * virtualized results list, and nothing in a detail pane carries it. A
     * `data-job-id` naming a *different* posting is a block about some other
     * job. And a list item linking to another posting is a result card whatever
     * it is called this deploy — which is the test that does not depend on
     * LinkedIn keeping any particular attribute name.
     */
    function inTheRail(element: Element): boolean {
      let node: Element | null = element;

      for (
        let depth = 0;
        node && node !== region && depth < MAXIMUM_REGION_DEPTH;
        depth += 1
      ) {
        if (node.id && RAIL_ID_PATTERN.test(node.id)) return true;
        if (node.hasAttribute("data-occludable-job-id")) return true;

        const block = node.getAttribute("data-job-id");
        if (block && block !== selected) return true;

        if (
          (node.tagName === "LI" || node.getAttribute("role") === "listitem") &&
          advertisesAnotherPosting(node)
        ) {
          return true;
        }

        node = node.parentElement;
      }

      return false;
    }

    /**
     * The employer, from the detail pane and only from there.
     *
     * Every labelled company in the region that is not in the rail votes. One
     * employer means the region is describing one posting; two different ones
     * mean it is not, and a region describing two employers cannot be captured
     * correctly by picking either.
     */
    const labelled = Array.from(region.querySelectorAll("[aria-label]")).slice(
      0,
      MAXIMUM_LABELLED_CANDIDATES,
    );

    let anchor: { element: Element; name: string } | null = null;
    const employers = new Set<string>();

    for (const element of labelled) {
      if (inTheRail(element)) continue;

      const name = companyNameFrom(element);
      if (!name) continue;

      employers.add(name);
      if (employers.size > 1) return;
      if (!anchor) anchor = { element, name };
    }

    // No employer, no coherent selected posting, nothing stored.
    if (!anchor) return;

    const company = anchor;
    siteFields["company"] = clamp(company.name, MAXIMUM_FIELD_CHARACTERS);

    // The title and the location: the card the employer belongs to, read
    // exactly the way the verified job-detail route reads its own.
    let card: Element | null = company.element.parentElement;
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
          candidate.contains(company.element) ||
          company.element.contains(candidate)
        ) {
          continue;
        }

        const value = markupOf(candidate);
        if (value && trimmedText(candidate) !== company.name) {
          siteFields["title"] = value;
          titleText = trimmedText(candidate);
          break;
        }
      }

      let locationElement: Element | null = null;
      for (const candidate of Array.from(card.querySelectorAll("p > span"))) {
        if (inTheRail(candidate) || company.element.contains(candidate)) continue;

        const value = trimmedText(candidate);
        if (
          !value ||
          value.length > MAXIMUM_LOCATION_CHARACTERS ||
          value.includes("\n") ||
          value === company.name ||
          value === titleText
        ) {
          continue;
        }

        siteFields["location"] = value;
        locationElement = candidate;
        break;
      }

      // The arrangement, from the detail pane's own card and never the rail's.
      recordArrangements(statedArrangements(card, locationElement, inTheRail));
    }

    /**
     * The description, from an About-the-job block inside this region.
     *
     * The block is recognized by the component-name half of its id, never by
     * the job number on the end of it — that number is one of the things that
     * goes stale. More than one element on the page carries the description
     * container's `data-testid`, and one of them is a Premium upsell, so the
     * About structure is what says which box is the posting.
     */
    const aboutBlocks = Array.from(region.querySelectorAll("[id]")).filter(
      (element) => ABOUT_ID_PATTERN.test(element.id) && !inTheRail(element),
    );

    for (const block of aboutBlocks) {
      const box = Array.from(block.querySelectorAll(DESCRIPTION_SELECTOR)).find(
        (candidate) => !inTheRail(candidate),
      );

      const value = markupOf(box ?? null);
      if (value) {
        siteFields["description"] = value;
        break;
      }
    }

    if (!siteFields["description"]) {
      // No such block: fall back to the heading the verified route anchors to,
      // still bounded to this region and still excluding the rail.
      for (const heading of aboutTheJobHeadings()) {
        if (!region.contains(heading) || inTheRail(heading)) continue;

        let node: Element | null = heading.parentElement;
        for (let depth = 0; node && depth < MAXIMUM_ANCESTOR_DEPTH; depth += 1) {
          const box = Array.from(
            node.querySelectorAll(DESCRIPTION_SELECTOR),
          ).find(
            (candidate) =>
              !inTheRail(candidate) &&
              (heading.compareDocumentPosition(candidate) &
                Node.DOCUMENT_POSITION_FOLLOWING) !==
                0,
          );

          const value = markupOf(box ?? null);
          if (value) {
            siteFields["description"] = value;
            break;
          }
          if (node === region) break;
          node = node.parentElement;
        }

        if (siteFields["description"]) break;
      }
    }
  }

  /** Workday's selected posting is the only safe scope for its automation ids. */
  function readWorkdayJobDetail(): void {
    const posting = document.querySelector(
      '[data-automation-id="jobPostingPage"]',
    );
    // Search results also expose titles and locations, but not a posting root.
    if (!posting) return;

    const title = posting.querySelector(
      '[data-automation-id="jobPostingHeader"]',
    );
    const titleValue = markupOf(title);
    if (titleValue) siteFields["title"] = titleValue;

    const details = posting.querySelector(
      '[data-automation-id="job-posting-details"]',
    );
    const locations = details?.querySelector(
      '[data-automation-id="locations"]',
    );
    const locationValue = markupOf(locations?.querySelector("dd") ?? null);
    if (locationValue) siteFields["location"] = locationValue;

    const description = posting.querySelector(
      '[data-automation-id="jobPostingDescription"]',
    );
    const descriptionValue = markupOf(description);
    if (descriptionValue) siteFields["description"] = descriptionValue;

    // Workday tenancy corroborates branded sidebar copy but never originates an
    // employer: a page with no specific sidebar signal still has no company.
    const sidebar = document.querySelector('[data-automation-id="jobSidebar"]');
    const normalized = (value: string): string =>
      value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const tenant =
      typeof rules.workdayTenant === "string"
        ? normalized(rules.workdayTenant)
        : "";
    const corroboratesTenant = (candidate: string): boolean =>
      Boolean(tenant) && normalized(candidate) === tenant;
    const genericBrand = (candidate: string): boolean =>
      /^(?:logo|company|career|search(?: for)? jobs?|jobs)$/i.test(
        candidate.trim(),
      );
    const logoCandidate = (alt: string): string | undefined => {
      const candidate = /^\s*([A-Za-z0-9][A-Za-z0-9 .,&'’-]{0,80}?)\s+logo\s*$/i.exec(
        alt,
      )?.[1]?.trim();
      return candidate && !genericBrand(candidate) ? candidate : undefined;
    };
    const richTextCandidate = (text: string): string | undefined => {
      const candidate =
        /^\s*At\s+([A-Z][A-Za-z0-9 .&'’-]{1,80}?),/.exec(text)?.[1] ??
        /^\s*([A-Z][A-Za-z0-9 .&'’-]{1,80}?)\s+is\b/.exec(text)?.[1];
      return candidate?.trim();
    };

    if (!sidebar) return;

    const logos = Array.from(
      sidebar.querySelectorAll('[data-automation-id="image"][alt]'),
    )
      .map((image) => logoCandidate(image.getAttribute("alt") ?? ""))
      .filter((candidate): candidate is string => Boolean(candidate));
    const [logo] = logos;

    if (logo) {
      if (logos.length === 1 && corroboratesTenant(logo)) {
        siteFields["company"] = clamp(logo, MAXIMUM_FIELD_CHARACTERS);
      }
      return;
    }

    const richText = sidebar.querySelector(
      '[data-automation-id="richText"]',
    );
    const company = richTextCandidate(trimmedText(richText));
    if (company && corroboratesTenant(company)) {
      siteFields["company"] = clamp(company, MAXIMUM_FIELD_CHARACTERS);
    }
  }

  if (rules.strategy === "linkedin-job-detail") readLinkedInJobDetail();
  if (rules.strategy === "linkedin-split-pane") readLinkedInSplitPane();
  if (rules.strategy === "workday-job-detail") readWorkdayJobDetail();

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
