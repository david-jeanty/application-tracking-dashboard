import { canonicalPostingUrl, readRulesFor, siteFor, type SiteId } from "./sites.js";
import type { JsonLdNode } from "./json-ld.js";

/**
 * Which posting a structured record is about, and whether that is the posting
 * the student is looking at.
 *
 * The extension's structured path used to take the first `JobPosting` it found
 * and treat it as the page's own. That is wrong for a reason no selector can
 * fix: a page may publish several postings, and a single-page app may still be
 * carrying the record for a job the student has left. "First" is an accident of
 * document order, not a claim about identity, and a stale record that happens
 * to be first outranks the correct one that happens to be second.
 *
 * So every candidate is evaluated, and each is asked the only question that
 * matters — does this record name the posting this route names? A record that
 * says so wins. A record that says otherwise is rejected. A page where the
 * answer cannot be established does not get to supply authoritative fields at
 * all, because a coin toss written into a student's tracker is worse than an
 * empty box they can see and fill in.
 *
 * Everything here is pure and reuses the route parsing already in `sites.ts`.
 * No selector, no pattern, no site knowledge is added.
 */

/**
 * The posting an address names, independent of any tab.
 *
 * This is the tab-free core of the capture session's `PageIdentity`: the same
 * route facts, without the tab that observed them. The identity guard needs the
 * tab because it is comparing two observations of one browser; the extractor
 * needs only the address it was handed.
 */
export type RouteIdentity = {
  pageUrl: string;
  site?: SiteId;
  /** The posting the route names, where a route names one. */
  jobId?: string;
  /** The stable per-posting address, where the site can rebuild one. */
  canonicalUrl?: string;
};

/** What a page-local root says about the posting it belongs to. */
export type ObservedIdentityState =
  | "verified"
  | "mismatched"
  | "unobserved"
  | "ambiguous";

/**
 * Correlates ids observed at one evidence root with the id in the route.
 *
 * Seeing the expected id among several ids is ambiguous, not verification:
 * the matching token cannot explain which posting supplied the field.
 */
export function correlateObservedPosting(
  observedJobIds: readonly string[],
  expectedJobId: string | undefined,
): ObservedIdentityState {
  const distinct = new Set(observedJobIds.filter(Boolean));
  if (distinct.size === 0 || !expectedJobId) return "unobserved";
  if (distinct.size > 1) return "ambiguous";
  return distinct.has(expectedJobId) ? "verified" : "mismatched";
}

export function routeIdentityFor(pageUrl: string): RouteIdentity {
  const site = siteFor(pageUrl);
  const rules = readRulesFor(pageUrl);
  const canonical = canonicalPostingUrl(pageUrl);

  return {
    pageUrl,
    ...(site ? { site } : {}),
    ...(rules.jobId ? { jobId: rules.jobId } : {}),
    ...(canonical ? { canonicalUrl: canonical } : {}),
  };
}

/**
 * Query parameters that identify a referral rather than a posting.
 *
 * Deliberately short, and deliberately only the cross-site trackers that mean
 * the same thing everywhere. The temptation is to strip anything that looks
 * decorative, and that is how two different postings end up comparing equal: on
 * an employer's own site a parameter this file has never heard of is far more
 * likely to name the job than to name a campaign. Unknown parameters are
 * therefore identity-significant, and stay in the comparison.
 */
const TRACKING_PARAMETERS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "yclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "_ga",
]);

/**
 * One address reduced to the part that identifies a posting.
 *
 * Host without `www.`, path without a trailing slash, remaining query sorted so
 * parameter order cannot make two identical addresses differ. The scheme is
 * dropped because `http` and `https` are the same posting, and the fragment is
 * dropped because `#requirements` is a place on a page rather than a page.
 */
export function normalizePostingUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return undefined;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.replace(/\/+$/, "");

  const kept: string[] = [];
  for (const [key, value] of parsed.searchParams) {
    if (TRACKING_PARAMETERS.has(key.toLowerCase())) continue;
    kept.push(`${key}=${value}`);
  }
  kept.sort();

  return `${host}${path}${kept.length > 0 ? `?${kept.join("&")}` : ""}`;
}

/** The host an address is on, normalized the same way. */
function hostOf(url: string): string | undefined {
  return normalizePostingUrl(url)?.split(/[/?]/)[0];
}

/**
 * Every comparable form of one address.
 *
 * A LinkedIn split pane and a LinkedIn job page are the same posting at two
 * addresses, and `canonicalPostingUrl` is the existing function that knows how
 * to rebuild the stable one from the route. Comparing both forms is what lets a
 * record that cites `/jobs/view/111/` match a student sitting on
 * `/jobs/search/?currentJobId=111`, without this file learning anything about
 * LinkedIn.
 */
function comparableForms(url: string): string[] {
  const forms: string[] = [];
  const direct = normalizePostingUrl(url);
  if (direct) forms.push(direct);

  const canonical = canonicalPostingUrl(url);
  if (canonical) {
    const normalized = normalizePostingUrl(canonical);
    if (normalized && !forms.includes(normalized)) forms.push(normalized);
  }

  return forms;
}

/** A ceiling on identity strings read out of one node. */
const MAXIMUM_IDENTITY_VALUES = 24;

/**
 * Identity strings inside one structured value.
 *
 * `identifier` is the property with the most shapes in the wild: a string, a
 * number, an array of either, or a `schema.org` `PropertyValue` whose `value`
 * carries the requisition number. All of them are read, and nothing else about
 * the object is: a name, a description or a title is not identity, and reading
 * one here would be inferring identity from similarity.
 */
function collectIdentityStrings(
  value: unknown,
  into: string[],
  depth = 0,
): void {
  if (depth > 4 || into.length >= MAXIMUM_IDENTITY_VALUES) return;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) into.push(trimmed);
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    into.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) collectIdentityStrings(entry, into, depth + 1);
    return;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    collectIdentityStrings(record["value"], into, depth + 1);
    collectIdentityStrings(record["@id"], into, depth + 1);
  }
}

/** What one JobPosting candidate claims about which posting it is. */
export type CandidateIdentity = {
  /** Comparable forms of every address the node cites. */
  urlForms: readonly string[];
  /** Hosts those addresses are on. */
  hosts: readonly string[];
  /** Identity tokens that are not addresses: requisition and platform ids. */
  tokens: readonly string[];
};

/**
 * The identity evidence one candidate carries, and nothing else.
 *
 * Only `url`, `@id` and `identifier` are read. Title and company are
 * deliberately absent: two postings at one employer routinely share both, and
 * "these look alike" is not the same claim as "this is that one".
 */
export function candidateIdentity(node: JsonLdNode): CandidateIdentity {
  const raw: string[] = [];
  collectIdentityStrings(node["url"], raw);
  collectIdentityStrings(node["@id"], raw);
  collectIdentityStrings(node["identifier"], raw);

  const urlForms: string[] = [];
  const hosts: string[] = [];
  const tokens: string[] = [];

  for (const entry of raw) {
    const forms = comparableForms(entry);
    if (forms.length === 0) {
      tokens.push(entry);
      continue;
    }

    for (const form of forms) {
      if (!urlForms.includes(form)) urlForms.push(form);
    }

    const host = hostOf(entry);
    if (host && !hosts.includes(host)) hosts.push(host);
  }

  return { urlForms, hosts, tokens };
}

/**
 * What one candidate says about the current posting.
 *
 * `mismatch` is claimed only on address evidence, and only when the candidate's
 * address is on the route's own host. That restraint is deliberate: a posting
 * legitimately cites addresses elsewhere — an apply destination, a syndicated
 * copy, an employer's careers domain — and treating those as contradictions
 * would reject good records. Within one host, a different address is a
 * different posting, and that is a fact rather than an inference.
 */
type Verdict = "match" | "mismatch" | "unknown";

function verdictFor(
  candidate: CandidateIdentity,
  route: RouteIdentity,
  routeForms: readonly string[],
  routeHosts: readonly string[],
): Verdict {
  if (route.jobId && candidate.tokens.includes(route.jobId)) return "match";

  if (candidate.urlForms.some((form) => routeForms.includes(form))) {
    return "match";
  }

  if (candidate.hosts.some((host) => routeHosts.includes(host))) {
    return "mismatch";
  }

  return "unknown";
}

/**
 * The outcome of correlating a page's structured candidates with its route.
 *
 * `unique_unidentified` is retained as an observable outcome rather than folded
 * into `absent`, because "a posting was published and it never said which one"
 * is a fact a partial-capture UI will want to explain. It is not authoritative:
 * see `isAuthoritative`.
 */
export type StructuredSelectionStatus =
  /** Exactly one candidate names the current posting. */
  | "matched"
  /** Candidates exist but none carried identity evidence to correlate. */
  | "unique_unidentified"
  /** Several candidates, and none of them uniquely names the current posting. */
  | "ambiguous"
  /** Every candidate names a different posting on this host. */
  | "mismatched"
  /** The page published no JobPosting at all. */
  | "absent";

export type StructuredSelection = {
  status: StructuredSelectionStatus;
  /** Present only for `matched` and `unique_unidentified`. */
  node?: JsonLdNode;
  /** How many candidates were observed and not selected. */
  rejected: number;
  /** How many candidates were observed in total. */
  candidates: number;
};

/**
 * Whether a selection may supply authoritative fields.
 *
 * Only a record that named the current posting. Being the only record on the
 * page is not a substitute: a single-page application that has moved on can be
 * carrying exactly one leftover record, and counting it does not make it
 * current. Identity is established by evidence or not at all.
 */
export function isAuthoritative(selection: StructuredSelection): boolean {
  return selection.status === "matched";
}

/**
 * Whether a selection is a positive statement that identity disagrees.
 *
 * `unique_unidentified` is deliberately not one. A record that said nothing
 * about which posting it is has not contradicted anything — it has simply
 * failed to establish itself, which is a reason to ignore it rather than a
 * reason to distrust the page. The visible DOM on such a page is still the
 * best evidence available and keeps its normal role.
 */
export function isIdentityConflict(selection: StructuredSelection): boolean {
  return selection.status === "ambiguous" || selection.status === "mismatched";
}

/**
 * Chooses the structured record that belongs to the current posting.
 *
 * Document order is never consulted. Every candidate is evaluated, and the
 * selection is made on what they claim about identity — so the same page
 * produces the same answer whichever order its publisher happened to emit its
 * blocks in, which is the property "first wins" could never offer.
 *
 * A record that carries no identity evidence at all is reported as
 * `unique_unidentified` and establishes nothing. It is tempting to trust it
 * when it is the only one on the page — but "only one" is a statement about the
 * page's markup, not about the posting on screen. A single-page application
 * that has changed route can be holding exactly one record, for the job the
 * student has just left, and counting to one does not detect that. There is no
 * safe version of this shortcut, so there is no shortcut.
 *
 * The cost is recall, and it is a real cost rather than a theoretical one:
 * pages that publish a `JobPosting` without a `url`, an `@id` or an
 * `identifier` will now fall through to the visible DOM, and where that is thin
 * the student will confirm the fields by hand. That is the intended trade. A
 * page that makes the extension ask is a smaller failure than a page that
 * silently files the wrong job under the right one, because only one of those
 * is visible to the person it happens to.
 */
export function selectStructuredCandidate(
  candidates: readonly JsonLdNode[],
  route: RouteIdentity,
): StructuredSelection {
  if (candidates.length === 0) {
    return { status: "absent", rejected: 0, candidates: 0 };
  }

  const routeForms = [
    ...comparableForms(route.pageUrl),
    ...(route.canonicalUrl ? comparableForms(route.canonicalUrl) : []),
  ];
  const routeHosts = [
    hostOf(route.pageUrl),
    ...(route.canonicalUrl ? [hostOf(route.canonicalUrl)] : []),
  ].filter((host): host is string => Boolean(host));

  const verdicts = candidates.map((node) =>
    verdictFor(candidateIdentity(node), route, routeForms, routeHosts),
  );

  const matched = verdicts.flatMap((verdict, index) =>
    verdict === "match" ? [index] : [],
  );

  if (matched.length === 1) {
    const index = matched[0] as number;

    return {
      status: "matched",
      node: candidates[index] as JsonLdNode,
      rejected: candidates.length - 1,
      candidates: candidates.length,
    };
  }

  // Two records both claiming the current posting is a page contradicting
  // itself. Picking one would reintroduce document order through the back door.
  if (matched.length > 1) {
    return {
      status: "ambiguous",
      rejected: candidates.length,
      candidates: candidates.length,
    };
  }

  // The route names a posting, so a candidate that cannot be tied to it has
  // failed the only test that was available. No concession applies here.
  const routeNamesAPosting = Boolean(route.jobId ?? route.canonicalUrl);

  if (
    candidates.length === 1 &&
    verdicts[0] === "unknown" &&
    !routeNamesAPosting
  ) {
    return {
      status: "unique_unidentified",
      node: candidates[0] as JsonLdNode,
      rejected: 0,
      candidates: 1,
    };
  }

  return {
    status: verdicts.every((verdict) => verdict === "mismatch")
      ? "mismatched"
      : "ambiguous",
    rejected: candidates.length,
    candidates: candidates.length,
  };
}
