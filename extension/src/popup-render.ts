import {
  alsoFound,
  canSave,
  describeExtraction,
  type PopupState,
} from "./popup-state.js";

/**
 * Draws one popup state, and nothing else.
 *
 * No Chrome API is touched here, which is what lets the real markup be
 * rendered in a test: the panels, the announcement, and the disabled state of
 * the save button are all functions of the state value, so "what does a student
 * see when the page had no company name" is a question with an answer that can
 * be asserted.
 *
 * Every value from the page or the server is written with `textContent`. None
 * of it becomes markup, at any point, in any state.
 */

/** The states in which the extension holds a connection worth signing out of. */
const CONNECTED_VIEWS = ["extracting", "ready", "saving", "saved"];

const ANNOUNCEMENTS: Record<PopupState["view"], string> = {
  loading: "Checking your JobTrack connection.",
  disconnected: "JobTrack is not connected.",
  connecting: "Waiting for you to finish signing in.",
  connect_failed: "Connecting to JobTrack did not finish.",
  extracting: "Reading this page.",
  extraction_failed: "This page could not be read.",
  ready: "Job details ready to confirm.",
  saving: "Saving to JobTrack.",
  unauthorized: "Your JobTrack connection has expired.",
  saved: "Saved.",
};

function element<T extends HTMLElement>(root: Document, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Missing popup element: ${selector}`);

  return found;
}

function setText(root: Document, selector: string, value: string): void {
  element(root, selector).textContent = value;
}

export function render(root: Document, state: PopupState): void {
  for (const panel of Array.from(
    root.querySelectorAll<HTMLElement>("[data-panel]"),
  )) {
    panel.hidden = panel.dataset["panel"] !== state.view;
  }

  const announcement = ANNOUNCEMENTS[state.view];
  setText(
    root,
    "#announcement",
    state.view === "saved"
      ? state.duplicate
        ? "Already in JobTrack."
        : "Tracked in JobTrack."
      : announcement,
  );

  element(root, "#disconnect").hidden = !CONNECTED_VIEWS.includes(state.view);

  if (state.view === "connect_failed") {
    setText(root, "#connect-error", state.message);
  }

  if (state.view === "extraction_failed") {
    setText(root, "#extraction-error", state.message);
  }

  if (state.view === "ready") {
    element<HTMLInputElement>(root, "#company").value = state.form.company;
    element<HTMLInputElement>(root, "#job-title").value = state.form.jobTitle;
    element<HTMLInputElement>(root, "#location").value = state.form.location;
    element<HTMLSelectElement>(root, "#status").value = state.form.status;

    setText(root, "#extraction-note", describeExtraction(state.job));

    const problem = element(root, "#save-problem");
    problem.hidden = !state.problem;
    problem.textContent = state.problem?.message ?? "";

    const issues = element<HTMLUListElement>(root, "#save-issues");
    issues.replaceChildren();
    issues.hidden = !state.problem?.issues?.length;
    for (const issue of state.problem?.issues ?? []) {
      const item = root.createElement("li");
      item.textContent = issue;
      issues.append(item);
    }

    // Every value here is written with `textContent`, like the rest of the
    // popup: a salary or a source that came off a page never becomes markup.
    const facts = alsoFound(state.job);
    const summary = element(root, "#also-found");
    const list = element<HTMLDListElement>(root, "#also-found-list");

    summary.hidden = facts.length === 0;
    list.replaceChildren();

    for (const fact of facts) {
      const label = root.createElement("dt");
      label.textContent = fact.label;
      const value = root.createElement("dd");
      value.textContent = fact.value;
      list.append(label, value);
    }

    element<HTMLButtonElement>(root, "#save").disabled = !canSave(state);
  }

  if (state.view === "saved") {
    setText(
      root,
      "#saved-headline",
      state.duplicate ? "Already in JobTrack" : "✓ Tracked in JobTrack",
    );
    setText(root, "#saved-company", state.application.company);
    setText(root, "#saved-title", state.application.jobTitle);
    element<HTMLAnchorElement>(root, "#open-application").href =
      state.application.url;
  }
}
