import { buildCaptureRecord } from "./capture.js";
import { extractJob } from "./extractor.js";
import { collectPageSignals } from "./page-collector.js";
import { render } from "./popup-render.js";
import {
  canSave,
  initialState,
  reduce,
  type PopupEvent,
  type PopupState,
} from "./popup-state.js";
import type { CaptureOutcome, ExtractedJob, PageSignals } from "./types.js";
import type { ConnectResult } from "./auth.js";

/**
 * The popup: the student's intent, and the only place capture begins.
 *
 * Nothing in JobTrack Capture reads a page until this window is open and this
 * code asks it to. There is no content script in the manifest, no host
 * permission for job sites, and no listener watching navigation — the extension
 * has no way to see a page until the student clicks the toolbar button, and
 * `activeTab` grants that access for that one page and that one moment.
 *
 * This file also never holds a credential. It asks the background worker for
 * outcomes and renders them.
 */

let state: PopupState = initialState();

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
 * Reads the current tab, once, because the student asked.
 *
 * `chrome.scripting.executeScript` rejects on pages an extension may never
 * touch — `chrome://` pages, the Web Store, a PDF viewer, a file URL without
 * permission — and that is reported as "this page cannot be read" rather than
 * as a failure of the posting.
 */
async function readActivePage(): Promise<ExtractedJob | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== "number") return undefined;

  const results = await chrome.scripting.executeScript<PageSignals>({
    target: { tabId: tab.id },
    func: collectPageSignals,
    // The isolated world: the extension reads the page's DOM without sharing a
    // JavaScript context with it, so page code cannot reach this function or
    // anything it returns.
    world: "ISOLATED",
  });

  const signals = results[0]?.result;

  return signals ? extractJob(signals) : undefined;
}

async function startExtraction(): Promise<void> {
  apply({ type: "extraction_started" });

  try {
    const job = await readActivePage();
    if (!job) {
      apply({
        type: "extraction_failed",
        message: "JobTrack cannot read this page. Open the job posting and try again.",
      });
      return;
    }

    apply({ type: "extracted", job });
  } catch {
    apply({
      type: "extraction_failed",
      message: "JobTrack cannot read this page. Open the job posting and try again.",
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
