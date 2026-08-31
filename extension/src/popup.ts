import { buildCaptureRecord } from "./capture.js";
import {
  createCaptureSession,
  readPageIdentity,
  runCapture,
  type CaptureAttemptOutcome,
  type CaptureFailureReason,
  type PageIdentity,
} from "./capture-session.js";
import { extractJob } from "./extractor.js";
import {
  chooseLinkedInFrame,
  planLinkedInRead,
  probeLinkedInFrame,
  withTopLevelIdentity,
  type LinkedInFrameEvidence,
  type LinkedInFrameProbe,
  type LinkedInReadPlan,
} from "./linkedin-frames.js";
import { collectPageSignals } from "./page-collector.js";
import { readRulesFor, type PageReadRules } from "./sites.js";
import { render } from "./popup-render.js";
import {
  canSave,
  initialState,
  reduce,
  type PopupEvent,
  type PopupState,
} from "./popup-state.js";
import {
  isPageSignals,
  type CaptureOutcome,
  type PageSignals,
} from "./types.js";
import type { ConnectResult } from "./auth.js";

/**
 * The popup: the student's intent, and the only place capture begins.
 *
 * Nothing in Interndex Capture reads a page until this window is open and this
 * code asks it to. There is no content script in the manifest, no host
 * permission for job sites, and no listener watching navigation — the extension
 * has no way to see a page until the student clicks the toolbar button, and
 * `activeTab` grants that access for that one page and that one moment.
 *
 * This file also never holds a credential. It asks the background worker for
 * outcomes and renders them.
 */

let state: PopupState = initialState();

/**
 * This popup's capture session, created when this window opened and destroyed
 * with it.
 *
 * Because it lives and dies with the popup, a reopened popup cannot inherit a
 * result from a previous one: there is nothing left to inherit. Within one
 * popup, it is what makes a second capture cancel the first rather than race
 * it — `beginConnect` can start a read while `start` still has one in flight.
 */
const session = createCaptureSession();

/**
 * The posting the student is looking at right now, read from the tab alone.
 *
 * No injection, no page contact — `activeTab` supplies the address once the
 * student has invoked the extension, and `sites.ts` turns it into a posting
 * identity with the same pure route functions the read itself uses. That is
 * what makes it cheap enough to ask again in the middle of a capture, which is
 * the entire point: the address is the one thing that can be compared before
 * and after without trusting anything the page said.
 */
async function observeIdentity(): Promise<PageIdentity | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== "number") return undefined;

  return readPageIdentity(tab.id, tab.url);
}

function apply(event: PopupEvent): void {
  state = reduce(state, event);
  render(document, state);
}

async function ask<T>(message: unknown): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch {
    // The worker was asleep and the channel closed, or the popup is closing.
    return undefined;
  }
}

/**
 * Runs the collector in one document of the tab, once.
 *
 * `world: "ISOLATED"` is the point of this call's shape: the extension reads
 * the page's DOM without sharing a JavaScript context with it, so page code
 * cannot reach this function or anything it returns.
 */
async function collectFrom(
  tabId: number,
  rules: PageReadRules,
  frameId?: number,
): Promise<PageSignals | undefined> {
  const results = await chrome.scripting.executeScript<PageSignals>({
    target:
      typeof frameId === "number"
        ? { tabId, frameIds: [frameId] }
        : { tabId },
    func: collectPageSignals,
    args: [rules],
    world: "ISOLATED",
  });

  const signals = results[0]?.result;
  return isPageSignals(signals) ? signals : undefined;
}

/**
 * Asks every same-origin document in the tab what it knows about one posting.
 *
 * The probe returns counts and booleans, so this is a far smaller act than
 * reading every frame: the extension learns which document to read, not what
 * any of the other documents said. A cross-origin frame is not readable and
 * simply does not answer.
 *
 * A probe that fails outright answers with nothing rather than failing the
 * capture. "No frame established the posting" is already a case each route has
 * a safe answer for, and a broken probe should land in that case rather than
 * turn a page the extension could have read into an error.
 */
async function probeFrames(
  tabId: number,
  jobId: string,
): Promise<LinkedInFrameProbe[]> {
  let results: chrome.scripting.InjectionResult<LinkedInFrameEvidence>[];
  try {
    results = await chrome.scripting.executeScript<LinkedInFrameEvidence>({
      target: { tabId, allFrames: true },
      func: probeLinkedInFrame,
      args: [jobId],
      world: "ISOLATED",
    });
  } catch {
    return [];
  }

  return results.flatMap((result) =>
    result.result ? [{ frameId: result.frameId, ...result.result }] : [],
  );
}

/**
 * Reads the current tab, because the student asked, and only ever answers for
 * the posting they were on.
 *
 * The mechanics of the read are unchanged: the same rules, the same collector,
 * the same frame probe, the same extractor. What is new is that all of it now
 * runs inside one capture attempt, and `capture-session.ts` re-reads the tab's
 * posting identity between the frame probe and the read and again after it. A
 * selection that moved during any of that discards the whole attempt rather
 * than filing job A's fields under job B.
 *
 * A page still drawing is asked again on a bounded schedule instead of being
 * reported as empty on its first, earliest snapshot — which is why this is no
 * longer strictly one read.
 *
 * `chrome.scripting.executeScript` rejects on pages an extension may never
 * touch — `chrome://` pages, the Web Store, a PDF viewer, a file URL without
 * permission — and that is reported as "this page cannot be read" rather than
 * as a failure of the posting.
 *
 * On a LinkedIn split pane there is a step before the read: which of the tab's
 * documents is drawing the posting. The current posting can be inside a
 * same-origin `/preload/` iframe while the top document still holds the
 * previous one, and injecting into the main frame — which is what this function
 * used to do, unconditionally — read a page the student could not see.
 */
async function readActivePage(): Promise<CaptureAttemptOutcome> {
  const identity = await observeIdentity();
  if (!identity) {
    return { outcome: "failed", requestId: "", reason: "no_identity" };
  }

  // Every read from here on belongs to this attempt, and to no other. Beginning
  // it abandons anything still in flight from a previous one.
  const attempt = session.begin(identity);
  const { tabId, url } = identity;

  // Which named read path applies is decided here, from the address, and
  // handed to the collector as data. `sites.ts` stays the one place any site
  // is described, and the collector never decides for itself which page it is
  // looking at.
  const rules = readRulesFor(url);
  const resolveFrame = rules.resolveFrame;

  if (!resolveFrame) {
    return runCapture<undefined>({
      session,
      attempt,
      observeIdentity,
      runner: {
        read: async () => {
          const signals = await collectFrom(tabId, rules);

          return signals ? extractJob(signals) : undefined;
        },
      },
    });
  }

  /**
   * The same page, read with no site strategy at all.
   *
   * What "fail blank" means in practice: the fields stay empty, and the
   * posting's identity — rebuilt from the top-level `currentJobId` — still
   * reaches the record, so an empty capture is filed under the right job
   * rather than becoming a second failure.
   */
  const withoutAStrategy: PageReadRules = {
    fields: rules.fields,
    ...(rules.jobId ? { jobId: rules.jobId } : {}),
  };

  return runCapture<LinkedInReadPlan>({
    session,
    attempt,
    observeIdentity,
    runner: {
      // Frame probing is its own phase because the coordinator checks identity
      // between the two. Asking every document in the tab about a posting takes
      // long enough for the student to select a different one, and a frame
      // chosen for that earlier posting is exactly the wrong document to read.
      plan: async () =>
        planLinkedInRead(
          chooseLinkedInFrame(await probeFrames(tabId, resolveFrame.jobId)),
          resolveFrame.unresolved,
        ),
      read: async (_identity, plan) => {
        const signals = await collectFrom(
          tabId,
          plan?.strategy ? rules : withoutAStrategy,
          plan?.frameId,
        );

        // Identity belongs to the tab. Fields may have come out of `/preload/`;
        // the record is filed under the address the student is actually on, and
        // that address has now been proved to be the one this attempt began on.
        return signals
          ? extractJob(withTopLevelIdentity(signals, url))
          : undefined;
      },
    },
  });
}

/**
 * What the popup says when a capture did not produce a posting.
 *
 * Each is a distinct thing that happened, and none of them is described as a
 * successful read of an empty page. `changed_during_capture` in particular is
 * not a failure of the posting: the extension read one job while the student
 * moved to another, threw all of it away, and is saying so.
 */
const CAPTURE_MESSAGES: Record<CaptureFailureReason | "changed", string> = {
  no_identity:
    "Interndex cannot read this page. Open the job posting and try again.",
  page_unreadable:
    "Interndex cannot read this page. Open the job posting and try again.",
  timeout:
    "This posting did not finish loading in time. Try again once it has.",
  changed:
    "The page changed while Interndex was reading it, so nothing was kept. Try again.",
};

async function startExtraction(): Promise<void> {
  // The previous job and everything the student had typed over it go now,
  // before a single read begins. Nothing from an older posting stays on screen
  // underneath a newer one.
  apply({ type: "extraction_started" });

  let result: CaptureAttemptOutcome;
  try {
    result = await readActivePage();
  } catch {
    result = { outcome: "failed", requestId: "", reason: "page_unreadable" };
  }

  switch (result.outcome) {
    case "full":
    case "partial":
      // Identity was proved at the end of the read as well as the start, so
      // these values are known to belong to the posting on screen. A `partial`
      // is still shown and still savable: the student confirms and fills what
      // the page did not state, which is the manual path this capture has
      // always had.
      apply({ type: "extracted", job: result.job });
      return;

    case "superseded":
      // A newer attempt owns the popup. Saying anything here would be this
      // attempt overwriting a fresher one with an older page.
      return;

    case "changed_during_capture":
      apply({
        type: "extraction_failed",
        message: CAPTURE_MESSAGES.changed,
      });
      return;

    case "failed":
      apply({
        type: "extraction_failed",
        message: CAPTURE_MESSAGES[result.reason],
      });
  }
}

async function beginConnect(): Promise<void> {
  apply({ type: "connect_started" });

  const result = await ask<ConnectResult>({ type: "connect" });
  apply({
    type: "connect_result",
    result: result ?? { status: "network_error" },
  });

  if (result?.status === "connected") await startExtraction();
}

async function save(): Promise<void> {
  const current = state;
  if (current.view !== "ready" || !canSave(current)) return;

  const { job, form } = current;
  // The submit button is disabled for the whole request, so an impatient
  // second click cannot start a second capture of the same posting.
  apply({ type: "save_started" });

  const outcome = await ask<CaptureOutcome>({
    type: "capture",
    record: buildCaptureRecord(job, form),
  });

  apply({ type: "save_result", outcome: outcome ?? { kind: "network_error" } });
}

function field(id: string): HTMLInputElement | HTMLSelectElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing popup field: ${id}`);

  return found as HTMLInputElement | HTMLSelectElement;
}

function wire(): void {
  document.getElementById("connect")?.addEventListener("click", beginConnect);
  document
    .getElementById("connect-retry")
    ?.addEventListener("click", beginConnect);
  document.getElementById("reconnect")?.addEventListener("click", beginConnect);

  document.getElementById("disconnect")?.addEventListener("click", async () => {
    await ask({ type: "disconnect" });
    apply({ type: "connection", connected: false });
  });

  for (const [id, name] of [
    ["company", "company"],
    ["job-title", "jobTitle"],
    ["location", "location"],
    ["status", "status"],
  ] as const) {
    field(id).addEventListener("input", (event) => {
      apply({
        type: "field_changed",
        field: name,
        value: (event.target as HTMLInputElement | HTMLSelectElement).value,
      });
    });
  }

  document.getElementById("capture-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void save();
  });
}

async function start(): Promise<void> {
  wire();
  render(document, state);

  const connection = await ask<{ connected: boolean }>({
    type: "connection-state",
  });

  apply({ type: "connection", connected: connection?.connected === true });

  if (connection?.connected) await startExtraction();
}

void start();
