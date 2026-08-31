import {
  canonicalPostingUrl,
  readRulesFor,
  siteFor,
  type SiteId,
  type SiteStrategy,
} from "./sites.js";
import type { ExtractedJob } from "./types.js";

/**
 * The capture coordinator: which posting a read belongs to, and whether it
 * still belongs to it by the time the read comes back.
 *
 * Capture used to be one straight line — read the tab's address, probe frames,
 * inject the collector, show whatever came back. Every step of that line is
 * asynchronous, and the page underneath it is a live application the student is
 * still using. A LinkedIn split pane rewrites `currentJobId` without a
 * navigation; a Workday detail route swaps its root in place. Nothing in that
 * line ever asked, at the end, whether the posting it started on was still the
 * posting on screen. A result assembled across a selection change could be
 * filed under the wrong job, and the popup had no way to know.
 *
 * This module is the answer, and it is deliberately the boring half of the
 * problem. It knows about generations, identities, deadlines and cancellation.
 * It knows nothing about selectors, markup, frames, or any particular site —
 * those stay exactly where they are. It reads a page's identity through the
 * pure route functions in `sites.ts`, and it drives the two phases of a capture
 * through callbacks the popup supplies, checking identity between them.
 *
 * The rule it enforces is one sentence: no value may reach the popup or a save
 * payload unless the posting observed at the end of the read is the posting the
 * read started on, and unless this attempt is still the newest one the session
 * has begun.
 *
 * What that rule does not say is as important as what it does. The identity
 * being compared is the *route's* — the address, and the posting id inside it.
 * It is not the identity of the markup that was collected. A single-page app
 * rewrites its address the instant the student clicks, and re-renders whenever
 * it gets round to it, so there is a window in which the route already says job
 * B while the DOM, the retained JSON-LD and the reused posting root all still
 * hold job A. Both checkpoints see B, agree, and accept A's fields.
 *
 * This module cannot close that window and does not pretend to. Closing it
 * needs evidence that carries the identity observed *inside the page at the
 * moment it was read*, so that job A's retained markup is rejected rather than
 * merely outranked — which is the adapter contract in P1.1 and the structured
 * source correlation in P0.4. What this module removes is the strictly
 * different failure where the route itself moves mid-read, and the failure
 * where a slow attempt outlives the selection that started it.
 */

/**
 * The posting an address names, as far as a route can tell.
 *
 * Deliberately thin. It is everything that can be known about which job is on
 * screen without reading the page — which is exactly what makes it safe to
 * re-observe mid-capture, cheaply and repeatedly, without injecting anything.
 */
export type PageIdentity = {
  tabId: number;
  /** The address as the browser reports it. */
  url: string;
  /** Which recognized surface this is, when it is one of them. */
  site?: SiteId;
  /** The named read this address resolves to: the adapter in all but name. */
  strategy?: SiteStrategy;
  /** The posting the route says is selected, where a route names one. */
  jobId?: string;
  /** The stable per-posting address, where the site can rebuild one. */
  canonicalUrl?: string;
};

/**
 * Reads a tab's posting identity, or refuses.
 *
 * Refusing matters as much as reading. An address the extension cannot make
 * sense of — absent because `activeTab` was never granted, a `chrome://` page,
 * anything that is not HTTP(S) — yields no identity at all, and a capture with
 * no identity cannot produce a saved record. That is the same judgment
 * `sites.ts` already makes about which hostnames it will parse, applied one
 * level up.
 */
export function readPageIdentity(
  tabId: number,
  url: string | undefined,
): PageIdentity | undefined {
  if (!Number.isInteger(tabId) || !url) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return undefined;
  }

  const site = siteFor(url);
  const rules = readRulesFor(url);
  const canonical = canonicalPostingUrl(url);

  return {
    tabId,
    url,
    ...(site ? { site } : {}),
    ...(rules.strategy ? { strategy: rules.strategy } : {}),
    ...(rules.jobId ? { jobId: rules.jobId } : {}),
    ...(canonical ? { canonicalUrl: canonical } : {}),
  };
}

/** The address with its fragment removed; a `#section` is not a different job. */
function withoutFragment(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";

    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * The comparable form of an identity.
 *
 * What is compared is chosen to be strict about postings and forgiving about
 * everything else. Tab, site and strategy must match outright. Where a route
 * names a posting, that name decides — which is what lets a LinkedIn search
 * page churn its scroll and tracking parameters without every capture calling
 * itself changed, while a `currentJobId` moving from one job to another is
 * caught immediately. Where no route names a posting, the whole address minus
 * its fragment is the identity, because assuming any particular parameter is
 * insignificant would be guessing at a site this file does not know.
 *
 * Nothing here rewrites an address into a canonical alias, and nothing here
 * decides that two different addresses are the same posting. That is a separate
 * question with its own risks, and it is not this task's.
 */
export function identityKey(identity: PageIdentity): string {
  return [
    String(identity.tabId),
    identity.site ?? "generic",
    identity.strategy ?? "none",
    identity.jobId ?? "",
    identity.canonicalUrl ?? withoutFragment(identity.url),
  ].join(" ");
}

/** Whether two observations are of the same posting in the same tab. */
export function sameIdentity(a: PageIdentity, b: PageIdentity): boolean {
  return identityKey(a) === identityKey(b);
}

/**
 * One read of one posting, from one popup session.
 *
 * `generation` is what makes a late answer harmless: an attempt carries the
 * number the session was on when it began, and any result it produces is
 * checked against the session's current number before it is allowed anywhere
 * near the UI. Injection cannot always be stopped once it has started, so the
 * signal is an early exit rather than a guarantee — the generation check is the
 * guarantee.
 */
export type CaptureAttempt = {
  readonly sessionId: string;
  readonly requestId: string;
  readonly tabId: number;
  readonly generation: number;
  readonly startIdentity: PageIdentity;
  readonly signal: AbortSignal;
};

/**
 * The popup's capture session: one per popup lifetime, and no memory beyond it.
 *
 * Closing the popup destroys this object along with everything it was holding,
 * so a reopened popup begins at generation zero with nothing to reuse. There is
 * no cache to invalidate because there is no cache, which is the property that
 * makes "a reopened popup always reads the page again" true by construction
 * rather than by discipline.
 */
export type CaptureSession = {
  readonly sessionId: string;
  /** The generation the session is on; zero before the first attempt. */
  readonly generation: number;
  /** Begins the newest attempt, abandoning any attempt still in flight. */
  begin: (identity: PageIdentity) => CaptureAttempt;
  /** Whether this attempt is still the one allowed to speak for the session. */
  isCurrent: (attempt: CaptureAttempt) => boolean;
};

let sessionCounter = 0;

function newSessionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();

  return uuid ?? `capture-session-${(sessionCounter += 1)}`;
}

export function createCaptureSession(options?: {
  sessionId?: string;
}): CaptureSession {
  const sessionId = options?.sessionId ?? newSessionId();
  let generation = 0;
  let live: AbortController | undefined;

  return {
    sessionId,
    get generation() {
      return generation;
    },
    begin(identity: PageIdentity): CaptureAttempt {
      // The previous attempt loses the session before the new one starts, so
      // there is never a moment when two attempts both believe they are
      // current.
      live?.abort();

      generation += 1;
      const controller = new AbortController();
      live = controller;

      return {
        sessionId,
        requestId: `${sessionId}#${generation}`,
        tabId: identity.tabId,
        generation,
        startIdentity: identity,
        signal: controller.signal,
      };
    },
    isCurrent(attempt: CaptureAttempt): boolean {
      return (
        attempt.sessionId === sessionId && attempt.generation === generation
      );
    },
  };
}

/** Why a capture produced nothing usable. */
export type CaptureFailureReason =
  /** No address, so no posting to file anything under. */
  | "no_identity"
  /** The page refused to be read at all, the way a `chrome://` page does. */
  | "page_unreadable"
  /** The posting never became readable inside the time the read was given. */
  | "timeout";

/** Where a capture was when the posting under it changed. */
export type CaptureChangeStage = "frame_selection" | "page_read";

/**
 * What one attempt produced.
 *
 * Only `full` and `partial` carry a job, and that is the point: an outcome that
 * failed its identity check has no field for a value to hide in, so no caller
 * can render or save one by accident. The distinction the popup acts on today
 * is still just "is there a job"; the vocabulary is richer than the popup needs
 * so that an honest outcome model can adopt it without this file changing
 * again.
 */
export type CaptureAttemptOutcome =
  | { outcome: "full"; job: ExtractedJob; requestId: string; passes: number }
  | { outcome: "partial"; job: ExtractedJob; requestId: string; passes: number }
  | {
      outcome: "changed_during_capture";
      requestId: string;
      stage: CaptureChangeStage;
      from: PageIdentity;
      to?: PageIdentity;
    }
  | { outcome: "superseded"; requestId: string }
  | { outcome: "failed"; requestId: string; reason: CaptureFailureReason };

/**
 * How long a posting is given to render, and when it is asked again.
 *
 * A first snapshot can legitimately be empty on a page that is still drawing,
 * and re-reading is the cheapest correct answer to that. The schedule is
 * bounded in both directions: a fixed number of passes, and a wall-clock budget
 * that stops the sequence even if every pass returns instantly.
 */
export type CaptureSchedule = {
  /** How long to wait before each re-read, in order. */
  readonly retryDelaysMs: readonly number[];
  /** The total time a capture may spend before it has to answer. */
  readonly budgetMs: number;
};

export const DEFAULT_CAPTURE_SCHEDULE: CaptureSchedule = {
  retryDelaysMs: [150, 400, 900, 1600],
  budgetMs: 3_000,
};

/**
 * The two phases of reading a page, supplied by the popup.
 *
 * They are separate because the identity check between them is the whole reason
 * this module exists. On a LinkedIn split pane, choosing which document holds
 * the posting is itself an asynchronous round trip through every frame in the
 * tab, and the student can change their selection during it. A frame chosen for
 * job A must never then be read as if it held job B.
 */
export type CaptureRunner<TPlan> = {
  /** Work done before the read, such as deciding which document to read. */
  plan?: (identity: PageIdentity, attempt: CaptureAttempt) => Promise<TPlan>;
  /**
   * Reads the page. Returning `undefined` means "nothing usable yet", which is
   * retryable; throwing means the page cannot be read at all, which is not.
   */
  read: (
    identity: PageIdentity,
    plan: TPlan | undefined,
    attempt: CaptureAttempt,
  ) => Promise<ExtractedJob | undefined>;
};

export type CaptureRun<TPlan> = {
  session: CaptureSession;
  attempt: CaptureAttempt;
  runner: CaptureRunner<TPlan>;
  /** Re-reads the active tab's identity, without touching the page. */
  observeIdentity: () => Promise<PageIdentity | undefined>;
  schedule?: CaptureSchedule;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
};

/** Whether a read established both of the fields a capture is judged on. */
function establishesJob(job: ExtractedJob): boolean {
  return Boolean(job.company?.trim()) && Boolean(job.jobTitle?.trim());
}

/** Whether a read established either of them, which says a posting is there. */
function establishesSomething(job: ExtractedJob | undefined): boolean {
  return Boolean(job && (job.company?.trim() || job.jobTitle?.trim()));
}

/**
 * How many passes every page gets regardless of what it looks like.
 *
 * A first snapshot can be empty for one uninteresting reason: it was taken too
 * early. That is as true of an employer's own careers page as it is of a
 * recognized site, and refusing the generic page a second look would encode
 * "unrecognized" as "not a posting" — the recall loss the audit warns against
 * in the opposite direction.
 *
 * So the first re-read is unconditional and costs one delay, currently 150 ms.
 * What is conditional is everything after it.
 */
const READINESS_PASSES = 2;

/**
 * Whether to keep waiting past the readiness re-read.
 *
 * The extended schedule exists for pages that are visibly mid-render, and it
 * is expensive: staying to the end of the budget means a student watching an
 * empty form for three seconds. Two things earn it. A recognized posting
 * surface earns it, because a posting is expected to appear there. So does a
 * read that already established a company or a title, because half of an
 * identity is strong evidence the other half is still drawing.
 *
 * An article, a careers index or a search results page earns neither, so it
 * answers after roughly 150 ms and hands over the form — which is the manual
 * path, arriving about as fast as it does today.
 *
 * This is a decision about waiting, not about extraction. No selector, pattern
 * or heuristic is consulted, and nothing here can make a field appear.
 */
function worthAnotherPass(
  identity: PageIdentity,
  job: ExtractedJob | undefined,
): boolean {
  return Boolean(identity.site) || establishesSomething(job);
}

const defaultWait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Runs one attempt to completion, and refuses to return a value it cannot prove
 * belongs to the posting the attempt started on.
 *
 * The shape is a loop of identical passes, each of which plans, checks, reads,
 * and checks again. A check that fails ends the whole attempt rather than the
 * pass: a posting that changed underneath the read cannot be recovered by
 * reading again, because the attempt is now about a job the student has left.
 * The popup starts a new attempt for the new posting instead, which is what
 * `begin` is for.
 */
export async function runCapture<TPlan>(
  run: CaptureRun<TPlan>,
): Promise<CaptureAttemptOutcome> {
  const {
    session,
    attempt,
    runner,
    observeIdentity,
    schedule = DEFAULT_CAPTURE_SCHEDULE,
    now = Date.now,
    wait = defaultWait,
  } = run;

  const { requestId, startIdentity } = attempt;
  const startedAt = now();
  const superseded = (): CaptureAttemptOutcome => ({
    outcome: "superseded",
    requestId,
  });

  const stillOurs = (): boolean =>
    session.isCurrent(attempt) && !attempt.signal.aborted;

  /**
   * One identity checkpoint: the tab is re-read and compared with the address
   * this attempt began on. Anything other than "the same posting, and still the
   * newest attempt" ends the attempt.
   */
  const checkpoint = async (
    stage: CaptureChangeStage,
  ): Promise<CaptureAttemptOutcome | undefined> => {
    if (!stillOurs()) return superseded();

    const observed = await observeIdentity();
    if (!observed) {
      return { outcome: "failed", requestId, reason: "no_identity" };
    }

    if (!sameIdentity(startIdentity, observed)) {
      return {
        outcome: "changed_during_capture",
        requestId,
        stage,
        from: startIdentity,
        to: observed,
      };
    }

    return stillOurs() ? undefined : superseded();
  };

  let passes = 0;

  for (;;) {
    if (!stillOurs()) return superseded();

    passes += 1;

    const plan = runner.plan
      ? await runner.plan(startIdentity, attempt)
      : undefined;

    // After frame probing. A selection that moved while every document in the
    // tab was being asked about job A must not now be read as job B.
    const afterPlan = await checkpoint("frame_selection");
    if (afterPlan) return afterPlan;

    let job: ExtractedJob | undefined;
    try {
      job = await runner.read(startIdentity, plan, attempt);
    } catch {
      // The page itself refused: a restricted URL, a revoked `activeTab`, a
      // closed tab. Waiting fixes none of those.
      return { outcome: "failed", requestId, reason: "page_unreadable" };
    }

    // After collection. This is the check the old straight-line capture never
    // made, and the one that decides whether anything read above may be used.
    const afterRead = await checkpoint("page_read");
    if (afterRead) return afterRead;

    if (job && establishesJob(job)) {
      return { outcome: "full", job, requestId, passes };
    }

    const delay = schedule.retryDelaysMs[passes - 1];
    const canWait =
      delay !== undefined &&
      // The readiness re-read is owed to every page; the rest has to be earned.
      (passes < READINESS_PASSES || worthAnotherPass(startIdentity, job)) &&
      now() - startedAt + delay <= schedule.budgetMs;

    if (!canWait) {
      if (job) {
        // Identity was proved at both checkpoints, so this is a real reading of
        // a real posting that simply did not state everything. The student
        // fills in the rest, which is the workflow this file was careful not to
        // take away.
        return { outcome: "partial", job, requestId, passes };
      }

      return {
        outcome: "failed",
        requestId,
        reason: passes > 1 ? "timeout" : "page_unreadable",
      };
    }

    await wait(delay);
  }
}
