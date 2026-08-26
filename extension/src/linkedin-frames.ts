import type { PageSignals } from "./types.js";

/**
 * Which document on a LinkedIn tab is actually showing the posting.
 *
 * LinkedIn's split-pane routes turned out not to be a stale-DOM problem inside
 * one document. On a live Similar Jobs tab the posting the student is reading
 * is rendered inside a **same-origin iframe** — `/preload/?_bprMode=vanilla` —
 * while the top document still holds the posting they came from:
 *
 * ```
 * top URL   /jobs/collections/similar-jobs/?currentJobId=4446257399
 *                                          &referenceJobId=4443429701
 * top DOM   exacare ai · Solutions Consultant · JobDetails_*_4443429701
 * iframe    /preload/?_bprMode=vanilla
 *           a[href*="/jobs/view/4446257399"], [data-job-id="4446257399"],
 *           [data-occludable-job-id="4446257399"]  — the IBM posting on screen
 * ```
 *
 * `chrome.scripting.executeScript` reads the main frame unless it is told
 * otherwise, so Capture was reading a document the student could not see. That
 * is what this file fixes, and it is the reason every earlier theory about the
 * route — rendered geometry, document order, `referenceJobId`, the numeric
 * suffix on a `JobDetails_*` id — was wrong: none of them can reach across a
 * frame boundary, so none of them was ever looking at the right document.
 *
 * The mechanism is deliberately small and split in three, so each part can be
 * tested for what it is:
 *
 * 1. `probeLinkedInFrame` runs in every same-origin frame and reports bounded
 *    structural evidence — counts and booleans. It returns no page text and no
 *    DOM, so widening the read to every frame does not widen what leaves the
 *    page.
 * 2. `chooseLinkedInFrame` is a pure decision over that evidence. It is the
 *    part worth arguing about, and it is testable without a browser.
 * 3. `withTopLevelIdentity` keeps the tab's address as the posting's identity,
 *    whatever document the fields came out of.
 *
 * Nothing here is a permission change. `activeTab` already covers the tab the
 * student invoked the extension on; `allFrames` only says which of that tab's
 * documents the one injected read visits, and a cross-origin frame stays
 * unreadable exactly as before.
 */

/** Bounded structural evidence one frame offers about the selected posting. */
export type LinkedInFrameEvidence = {
  /** The frame's own address. Diagnostic only — never the posting's URL. */
  frameUrl: string;
  /** Exact `/jobs/view/<currentJobId>` links, counted rather than collected. */
  currentIdLinks: number;
  /** `[data-job-id="<currentJobId>"]` is present. */
  dataJobId: boolean;
  /** `[data-occludable-job-id="<currentJobId>"]` is present. */
  dataOccludableJobId: boolean;
  /** A `data-entity-urn` naming this posting is present. */
  dataEntityUrn: boolean;
};

/** One frame's evidence, with the id Chrome will accept as an injection target. */
export type LinkedInFrameProbe = LinkedInFrameEvidence & { frameId: number };

/**
 * Which document to read, or why none was chosen.
 *
 * `unresolved` and `ambiguous` are separate answers because the caller treats
 * them differently: nothing established the posting, versus more than one
 * document did and picking between them would be a guess.
 */
export type LinkedInFrameChoice =
  | { kind: "frame"; frameId: number }
  | { kind: "unresolved" }
  | { kind: "ambiguous" };

/**
 * What a route allows when no frame establishes the posting.
 *
 * Declared here, next to the decision that consumes it, and imported by
 * `sites.ts` — which is where each LinkedIn route says which of the two it is.
 */
export type UnresolvedFallback = "top-document" | "blank";

/**
 * Where to run the collector, and whether the LinkedIn read may run at all.
 *
 * The whole branch table, in one pure function, so it can be argued with in a
 * test rather than reconstructed from the popup's control flow.
 */
export type LinkedInReadPlan = {
  /** The frame to inject into. Absent means the tab's main frame. */
  frameId?: number;
  /**
   * Whether the bounded split-pane read runs.
   *
   * When it does not, the collector is handed no strategy: the fields come back
   * empty and the posting's identity, rebuilt from `currentJobId`, still
   * reaches the record. That is what "fail blank" means here — a blank capture
   * filed under the right job, not a capture of the wrong one.
   */
  strategy: boolean;
};

export function planLinkedInRead(
  choice: LinkedInFrameChoice,
  unresolved: UnresolvedFallback,
): LinkedInReadPlan {
  // One document establishes the posting: read that one, wherever it is.
  if (choice.kind === "frame") {
    return { frameId: choice.frameId, strategy: true };
  }

  // Nothing established it, but this route's top document is where the posting
  // lives — the live GE Vernova search capture proved that. Read it, bounded.
  if (choice.kind === "unresolved" && unresolved === "top-document") {
    return { strategy: true };
  }

  // Either two documents claimed the posting, or this route's top document
  // holds the posting the student came from. Guessing between them is the
  // failure this path exists to avoid.
  return { strategy: false };
}

/**
 * How many independent signals a frame must offer before it is believed.
 *
 * One is not enough. A single `/jobs/view/<id>` href appears in any list that
 * happens to contain the selected posting — including the results rail of a
 * document that is not on screen — so believing one href would be choosing a
 * frame by coincidence. Two independent signals is corroboration: a link and a
 * data attribute, or two attributes LinkedIn maintains for different purposes.
 */
const REQUIRED_SIGNALS = 2;

/** How many independent things in this frame name the selected posting. */
export function frameSignals(evidence: LinkedInFrameEvidence): number {
  return (
    (evidence.currentIdLinks > 0 ? 1 : 0) +
    (evidence.dataJobId ? 1 : 0) +
    (evidence.dataOccludableJobId ? 1 : 0) +
    (evidence.dataEntityUrn ? 1 : 0)
  );
}

/** Whether this frame establishes the selected posting beyond coincidence. */
export function establishesSelectedJob(evidence: LinkedInFrameEvidence): boolean {
  return frameSignals(evidence) >= REQUIRED_SIGNALS;
}

/**
 * The one document that establishes the posting the address says is selected.
 *
 * Corroboration decides this, and nothing else does. Not the frame's URL:
 * `/preload/` is where the live posting happened to be, not a rule, and a
 * `/preload/` document with no evidence for `currentJobId` loses to one that
 * has it. Not document order, not "the only iframe", not the first matching
 * href. Geometry cannot decide it either — the frame that mattered reported
 * `0×0` for every element in it.
 *
 * When two documents both establish the posting there is no safe way to pick
 * one, so nothing is picked. A blank capture the student fills in themselves is
 * a smaller failure than a confidently wrong one they do not check.
 */
export function chooseLinkedInFrame(
  probes: readonly LinkedInFrameProbe[],
): LinkedInFrameChoice {
  const establishing = probes.filter(establishesSelectedJob);

  if (establishing.length === 1) {
    return { kind: "frame", frameId: establishing[0]!.frameId };
  }

  return establishing.length > 1 ? { kind: "ambiguous" } : { kind: "unresolved" };
}

/**
 * The posting's identity, which belongs to the tab and never to the frame.
 *
 * Fields may come out of `/preload/?_bprMode=vanilla`; the record must not.
 * The saved address is rebuilt from the top-level `currentJobId` by
 * `sites.ts` — `https://www.linkedin.com/jobs/view/4446257399/` — so the page
 * URL handed to the extractor is the tab's, and the frame's own
 * `<link rel="canonical">` is dropped rather than allowed to describe a
 * document the student never navigated to.
 */
export function withTopLevelIdentity(
  signals: PageSignals,
  tabUrl: string,
): PageSignals {
  const { canonicalUrl: _fromTheFrame, ...rest } = signals;

  return { ...rest, pageUrl: tabUrl };
}

/**
 * What one frame will say about the selected posting, and nothing more.
 *
 * Chrome serializes this with `Function.prototype.toString()` before injecting
 * it into every same-origin frame, so like the collector it closes over
 * nothing and declares its own helpers.
 *
 * It returns counts and booleans. No text, no markup, no href, no attribute
 * value — the only string is the frame's own address, which the caller uses to
 * explain a decision and never to identify a posting. That is what makes
 * visiting every frame a smaller act than it sounds: the extension learns which
 * document to read, not what any of the other documents said.
 */
export function probeLinkedInFrame(jobId: string): LinkedInFrameEvidence {
  const MAXIMUM_LINK_CANDIDATES = 400;
  const MAXIMUM_URN_CANDIDATES = 400;
  const MAXIMUM_URL_CHARACTERS = 2_048;

  const evidence: {
    frameUrl: string;
    currentIdLinks: number;
    dataJobId: boolean;
    dataOccludableJobId: boolean;
    dataEntityUrn: boolean;
  } = {
    frameUrl: (window.location.href ?? "").slice(0, MAXIMUM_URL_CHARACTERS),
    currentIdLinks: 0,
    dataJobId: false,
    dataOccludableJobId: false,
    dataEntityUrn: false,
  };

  // The id arrives from the top-level address and is checked again here,
  // because it is about to be spliced into selectors and matched as a pattern.
  if (typeof jobId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(jobId)) {
    return evidence;
  }

  // `/jobs/view/4446257399` must not be found inside `/jobs/view/44462573990`,
  // so the id is matched to the end of its path segment rather than as a
  // substring of the href.
  const exactPosting = new RegExp(`/jobs/view/${jobId}(?:[/?#]|$)`);

  const links = document.querySelectorAll('a[href*="/jobs/view/"]');
  for (let index = 0; index < links.length && index < MAXIMUM_LINK_CANDIDATES; index += 1) {
    const href = links[index]?.getAttribute("href") ?? "";
    if (exactPosting.test(href)) evidence.currentIdLinks += 1;
  }

  evidence.dataJobId = Boolean(
    document.querySelector(`[data-job-id="${jobId}"]`),
  );
  evidence.dataOccludableJobId = Boolean(
    document.querySelector(`[data-occludable-job-id="${jobId}"]`),
  );

  // `urn:li:jobPosting:4446257399`, and the `fsd_` variants of the same name.
  const exactUrn = new RegExp(`jobPosting:${jobId}(?:[,)\\s]|$)`, "i");
  const urns = document.querySelectorAll("[data-entity-urn]");
  for (let index = 0; index < urns.length && index < MAXIMUM_URN_CANDIDATES; index += 1) {
    if (exactUrn.test(urns[index]?.getAttribute("data-entity-urn") ?? "")) {
      evidence.dataEntityUrn = true;
      break;
    }
  }

  return evidence;
}
