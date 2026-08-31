import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CAPTURE_SCHEDULE,
  createCaptureSession,
  readPageIdentity,
  runCapture,
  type CaptureAttemptOutcome,
  type PageIdentity,
} from "../src/capture-session.js";
import { canSave, initialState, reduce } from "../src/popup-state.js";
import type { ExtractedJob } from "../src/types.js";

/**
 * The capture-session identity guard.
 *
 * Everything here is about one question: does the value that came back belong
 * to the posting the student is looking at? The extractor is not under test and
 * is never called — each case supplies the job a read produced and then moves
 * the page underneath it, which is the failure mode no amount of selector work
 * could have caught.
 *
 * Identities are built from real addresses through `readPageIdentity`, so the
 * route parsing in `sites.ts` is exercised rather than mocked. A LinkedIn
 * search page whose `currentJobId` moves is the same URL in every respect
 * except the one that names the job.
 */

const TAB = 7;

/** A LinkedIn split pane with job 111 selected. */
const JOB_A =
  "https://www.linkedin.com/jobs/search/?currentJobId=111&keywords=intern";
/** The same page, after the student clicked the next posting in the rail. */
const JOB_B =
  "https://www.linkedin.com/jobs/search/?currentJobId=222&keywords=intern";
/** An ordinary employer posting: no recognized site, no split pane. */
const DIRECT = "https://careers.example.com/postings/data-intern";

function identityOf(url: string, tabId = TAB): PageIdentity {
  const identity = readPageIdentity(tabId, url);
  if (!identity) throw new Error(`No identity for ${url}`);

  return identity;
}

function job(fields: Partial<ExtractedJob> = {}): ExtractedJob {
  return { warnings: [], ...fields };
}

const FOUND = job({ company: "Northwind", jobTitle: "Data Intern" });
const EMPTY = job({ warnings: ["no_job_posting_found"] });

/** A clock that only moves when the coordinator decides to wait on it. */
function fakeClock() {
  let time = 0;
  const waited: number[] = [];

  return {
    now: () => time,
    wait: async (ms: number) => {
      waited.push(ms);
      time += ms;
    },
    waited,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

/** Whether an outcome carries anything that could reach a save payload. */
function carriesJob(outcome: CaptureAttemptOutcome): boolean {
  return "job" in outcome;
}

describe("capture session identity guard", () => {
  it("accepts a stable direct capture, having revalidated the posting after the read", async () => {
    const session = createCaptureSession({ sessionId: "s1" });
    const attempt = session.begin(identityOf(DIRECT));
    const observeIdentity = vi.fn(async () => readPageIdentity(TAB, DIRECT));
    const read = vi.fn(async () => FOUND);

    const result = await runCapture({
      session,
      attempt,
      observeIdentity,
      runner: { read },
    });

    expect(result).toMatchObject({
      outcome: "full",
      job: FOUND,
      requestId: "s1#1",
      passes: 1,
    });
    expect(read).toHaveBeenCalledTimes(1);
    // Once before the read and once after it. The second call is the check the
    // old straight-line capture never made.
    expect(observeIdentity).toHaveBeenCalledTimes(2);
  });

  it("discards a read that finished after the student moved from job A to job B", async () => {
    const session = createCaptureSession({ sessionId: "s1" });
    const attempt = session.begin(identityOf(JOB_A));
    let showing = JOB_A;

    const result = await runCapture({
      session,
      attempt,
      observeIdentity: async () => readPageIdentity(TAB, showing),
      runner: {
        read: async () => {
          // The selection moves while the collector is still working.
          showing = JOB_B;

          return FOUND;
        },
      },
    });

    expect(result).toMatchObject({
      outcome: "changed_during_capture",
      stage: "page_read",
      from: { jobId: "111" },
      to: { jobId: "222" },
    });
    // Job A's title and company existed and were thrown away rather than filed
    // under job B.
    expect(carriesJob(result)).toBe(false);
  });

  it("never reads a frame chosen for job A once the selection has become job B", async () => {
    const session = createCaptureSession({ sessionId: "s1" });
    const attempt = session.begin(identityOf(JOB_A));
    let showing = JOB_A;
    const read = vi.fn(async () => FOUND);

    const result = await runCapture({
      session,
      attempt,
      observeIdentity: async () => readPageIdentity(TAB, showing),
      runner: {
        // Probing every document in the tab takes long enough for the student
        // to click the next posting.
        plan: async () => {
          showing = JOB_B;

          return { frameId: 4, strategy: true };
        },
        read,
      },
    });

    expect(result).toMatchObject({
      outcome: "changed_during_capture",
      stage: "frame_selection",
    });
    expect(read).not.toHaveBeenCalled();
    expect(carriesJob(result)).toBe(false);
  });

  it("drops attempt A's late result when attempt B has already begun", async () => {
    const session = createCaptureSession({ sessionId: "s1" });
    const first = session.begin(identityOf(JOB_A));
    const slowRead = deferred<ExtractedJob>();

    const running = runCapture({
      session,
      attempt: first,
      observeIdentity: async () => readPageIdentity(TAB, JOB_A),
      runner: { read: async () => slowRead.promise },
    });

    // The popup starts a fresh capture — a reconnect, a retry — while the first
    // one is still inside the collector.
    const second = session.begin(identityOf(JOB_A));
    expect(session.isCurrent(first)).toBe(false);
    expect(session.isCurrent(second)).toBe(true);
    expect(first.signal.aborted).toBe(true);

    slowRead.resolve(FOUND);
    const result = await running;

    expect(result).toEqual({ outcome: "superseded", requestId: "s1#1" });
    expect(carriesJob(result)).toBe(false);
  });

  it("waits for critical fields that arrive late, within the bounded schedule", async () => {
    const session = createCaptureSession({ sessionId: "s1" });
    const attempt = session.begin(identityOf(JOB_A));
    const clock = fakeClock();
    const reads = [EMPTY, FOUND];

    const result = await runCapture({
      session,
      attempt,
      observeIdentity: async () => readPageIdentity(TAB, JOB_A),
      runner: { read: async () => reads.shift() },
      now: clock.now,
      wait: clock.wait,
    });

    expect(result).toMatchObject({ outcome: "full", job: FOUND, passes: 2 });
    expect(clock.waited).toEqual([DEFAULT_CAPTURE_SCHEDULE.retryDelaysMs[0]]);
  });

  it("reports a timeout rather than a ready form when nothing readable ever appears", async () => {
    const session = createCaptureSession({ sessionId: "s1" });
    const attempt = session.begin(identityOf(JOB_A));
    const clock = fakeClock();

    const result = await runCapture({
      session,
      attempt,
      observeIdentity: async () => readPageIdentity(TAB, JOB_A),
      runner: { read: async () => undefined },
      now: clock.now,
      wait: clock.wait,
    });

    expect(result).toEqual({
      outcome: "failed",
      requestId: "s1#1",
      reason: "timeout",
    });
    // The wall-clock budget stops the sequence before the schedule runs out:
    // 150 + 400 + 900 leaves no room for the fourth 1,600 ms wait inside 3 s.
    expect(clock.waited).toEqual([150, 400, 900]);
    expect(carriesJob(result)).toBe(false);
  });

  it("gives a reopened popup a fresh generation with nothing carried over", async () => {
    const first = createCaptureSession({ sessionId: "s1" });
    const attempt = first.begin(identityOf(JOB_A));
    expect(attempt.requestId).toBe("s1#1");

    // Closing the popup destroys the session; reopening builds a new one.
    const reopened = createCaptureSession({ sessionId: "s2" });
    expect(reopened.generation).toBe(0);
    expect(reopened.isCurrent(attempt)).toBe(false);

    const read = vi.fn(async () => FOUND);
    const fresh = reopened.begin(identityOf(JOB_A));
    expect(fresh.requestId).toBe("s2#1");
    expect(fresh.generation).toBe(1);

    const result = await runCapture({
      session: reopened,
      attempt: fresh,
      observeIdentity: async () => readPageIdentity(TAB, JOB_A),
      runner: { read },
    });

    // The page is read again rather than answered from anything the previous
    // session held.
    expect(read).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ outcome: "full", requestId: "s2#1" });

    // The old attempt cannot speak for the reopened popup even though both are
    // on generation 1.
    const stale = await runCapture({
      session: reopened,
      attempt,
      observeIdentity: async () => readPageIdentity(TAB, JOB_A),
      runner: { read: async () => FOUND },
    });
    expect(stale).toMatchObject({ outcome: "superseded" });
  });

  it("gives an unrecognized page one readiness re-read and no extended wait", async () => {
    const session = createCaptureSession({ sessionId: "s1" });
    const attempt = session.begin(identityOf(DIRECT));
    const clock = fakeClock();
    const read = vi.fn(async () => EMPTY);

    const result = await runCapture({
      session,
      attempt,
      observeIdentity: async () => readPageIdentity(TAB, DIRECT),
      runner: { read },
      now: clock.now,
      wait: clock.wait,
    });

    // Read twice, waited once, and handed over the form. An unsupported page
    // costs the student one 150 ms delay, not the whole three-second budget.
    expect(read).toHaveBeenCalledTimes(2);
    expect(clock.waited).toEqual([150]);
    expect(clock.now()).toBe(150);
    expect(result).toMatchObject({ outcome: "partial", job: EMPTY, passes: 2 });
  });

  it("recovers an unrecognized posting whose fields land on the second read", async () => {
    const session = createCaptureSession({ sessionId: "s1" });
    const attempt = session.begin(identityOf(DIRECT));
    const clock = fakeClock();
    const reads = [EMPTY, FOUND];

    const result = await runCapture({
      session,
      attempt,
      observeIdentity: async () => readPageIdentity(TAB, DIRECT),
      runner: { read: async () => reads.shift() },
      now: clock.now,
      wait: clock.wait,
    });

    // The readiness re-read is what makes this recoverable at all: under a
    // site-only rule this page would have answered blank at zero milliseconds.
    expect(result).toMatchObject({ outcome: "full", job: FOUND, passes: 2 });
    expect(clock.waited).toEqual([150]);
  });

  it("extends the schedule for an unrecognized page that established half an identity", async () => {
    const session = createCaptureSession({ sessionId: "s1" });
    const attempt = session.begin(identityOf(DIRECT));
    const clock = fakeClock();
    const halfway = job({ jobTitle: "Data Intern" });

    const result = await runCapture({
      session,
      attempt,
      observeIdentity: async () => readPageIdentity(TAB, DIRECT),
      runner: { read: async () => halfway },
      now: clock.now,
      wait: clock.wait,
    });

    // A title with no company says a posting is there and half-drawn, which is
    // what earns the rest of the budget.
    expect(clock.waited).toEqual([150, 400, 900]);
    expect(result).toMatchObject({ outcome: "partial", job: halfway, passes: 4 });
  });

  it("leaves no savable state behind a changed, superseded or unverified attempt", async () => {
    const observeIdentity = async () => readPageIdentity(TAB, JOB_A);

    const changedSession = createCaptureSession({ sessionId: "s1" });
    let showing = JOB_A;
    const changed = await runCapture({
      session: changedSession,
      attempt: changedSession.begin(identityOf(JOB_A)),
      observeIdentity: async () => readPageIdentity(TAB, showing),
      runner: {
        read: async () => {
          showing = JOB_B;

          return FOUND;
        },
      },
    });

    const supersededSession = createCaptureSession({ sessionId: "s2" });
    const abandoned = supersededSession.begin(identityOf(JOB_A));
    supersededSession.begin(identityOf(JOB_A));
    const superseded = await runCapture({
      session: supersededSession,
      attempt: abandoned,
      observeIdentity,
      runner: { read: async () => FOUND },
    });

    const unverifiedSession = createCaptureSession({ sessionId: "s3" });
    const unverified = await runCapture({
      session: unverifiedSession,
      attempt: unverifiedSession.begin(identityOf(JOB_A)),
      // `activeTab` stops answering: a closed tab, a revoked grant.
      observeIdentity: async () => undefined,
      runner: { read: async () => FOUND },
    });

    for (const result of [changed, superseded, unverified]) {
      expect(result.outcome).not.toBe("full");
      expect(result.outcome).not.toBe("partial");
      // There is no field on these outcomes for a value to travel in, so
      // nothing extracted can reach `buildCaptureRecord`.
      expect(carriesJob(result)).toBe(false);
    }

    // And the popup states they produce cannot be saved from. `extracted` is
    // dispatched only for `full` and `partial`; every outcome above lands on a
    // view with no form, so the submit path in `popup.ts` — which requires a
    // `ready` view — is unreachable.
    const extracting = reduce(initialState(), { type: "extraction_started" });
    expect(canSave(extracting)).toBe(false);

    const failed = reduce(extracting, {
      type: "extraction_failed",
      message: "The page changed while Interndex was reading it.",
    });
    expect(failed.view).toBe("extraction_failed");
    expect(canSave(failed)).toBe(false);

    // A superseded attempt dispatches nothing at all, so the popup stays where
    // the newest attempt left it.
    expect(canSave(extracting)).toBe(false);
  });
});
