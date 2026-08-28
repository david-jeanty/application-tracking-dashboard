import {
  initialPopupState,
  missingRequiredFields,
  popupReducer,
  type PopupEvent,
  type PopupState,
} from "./popup-state.js";
import {
  isPopupResponse,
  type CaptureRecord,
  type ConnectionStatus,
  type PopupRequest,
  type PopupResponse,
} from "./types.js";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing popup element: ${id}`);
  return value as T;
}

const views = {
  loading: element<HTMLElement>("loading-view"),
  disconnected: element<HTMLElement>("disconnected-view"),
  working: element<HTMLElement>("working-view"),
  extractionError: element<HTMLElement>("extraction-error-view"),
  editor: element<HTMLElement>("editor-view"),
  result: element<HTMLElement>("result-view"),
};
const footer = element<HTMLElement>("connected-footer");
const liveStatus = element<HTMLParagraphElement>("live-status");
const companyInput = element<HTMLInputElement>("company");
const titleInput = element<HTMLInputElement>("job-title");
const locationInput = element<HTMLInputElement>("location");
const statusInput = element<HTMLSelectElement>("status");
const trackButton = element<HTMLButtonElement>("track-button");

let state: PopupState = initialPopupState;
let connection: ConnectionStatus = {
  connected: false,
  configured: false,
  redirectUrl: "",
};
let applicationHref = "";

function dispatch(event: PopupEvent) {
  state = popupReducer(state, event);
  render();
}

function showOnly(view?: HTMLElement) {
  for (const candidate of Object.values(views)) candidate.hidden = candidate !== view;
}

function announce(message: string) {
  liveStatus.textContent = "";
  requestAnimationFrame(() => {
    liveStatus.textContent = message;
  });
}

function setEditorValues(record: CaptureRecord) {
  companyInput.value = record.company ?? "";
  titleInput.value = record.job_title ?? "";
  locationInput.value = record.location ?? "";
  statusInput.value = record.status ?? "Interested";
}

function render() {
  footer.hidden = ![
    "extracting",
    "editing",
    "saving",
    "save_error",
    "extraction_error",
    "result",
  ].includes(state.view);

  if (state.view === "loading") {
    showOnly(views.loading);
    return;
  }

  if (state.view === "disconnected") {
    showOnly(views.disconnected);
    const error = element<HTMLParagraphElement>("connection-error");
    error.hidden = !state.error;
    error.textContent = state.error?.message ?? "";
    const setup = element<HTMLElement>("setup-note");
    setup.hidden = state.connection.configured;
    element<HTMLElement>("redirect-url").textContent = state.connection.redirectUrl;
    const button = element<HTMLButtonElement>("connect-button");
    button.disabled = !state.connection.configured;
    button.textContent = state.connection.configured
      ? "Connect Interndex"
      : "OAuth client not configured";
    if (state.error) announce(state.error.message);
    return;
  }

  if (state.view === "connecting" || state.view === "extracting" || state.view === "saving") {
    showOnly(views.working);
    const title = element<HTMLElement>("working-title");
    const copy = element<HTMLElement>("working-copy");
    if (state.view === "connecting") {
      title.textContent = "Connecting Interndex…";
      copy.textContent = "Finish signing in and approving the connection in the window Chrome opened.";
      announce("Connection in progress.");
    } else if (state.view === "saving") {
      title.textContent = "Tracking this job…";
      copy.textContent = "Saving the confirmed details to your Interndex account.";
      announce("Save in progress.");
    } else {
      title.textContent = "Reading this posting…";
      copy.textContent = "Looking for structured job information on the current page.";
      announce("Reading the current page.");
    }
    return;
  }

  if (state.view === "extraction_error") {
    showOnly(views.extractionError);
    element<HTMLElement>("extraction-error").textContent = state.error.message;
    announce(state.error.message);
    return;
  }

  if (state.view === "editing" || state.view === "save_error") {
    showOnly(views.editor);
    const extraction = state.extraction;
    if (state.view === "editing") setEditorValues(extraction.record);

    const missing = missingRequiredFields(extraction);
    const extractionWarning = element<HTMLElement>("extraction-warning");
    const warnings: string[] = [];
    if (!extraction.jobPostingFound) {
      warnings.push("We could not confirm structured job data on this page. Check the details before saving.");
    }
    if (missing.length) {
      warnings.push(`Add the missing ${missing.join(" and ")} before saving.`);
    }
    if (extraction.warnings.includes("description_oversized")) {
      warnings.push("The description exceeds Interndex’s limit, so this job will be saved without the full description.");
    }
    extractionWarning.textContent = warnings.join(" ");
    extractionWarning.hidden = warnings.length === 0;

    const saveError = element<HTMLElement>("save-error");
    saveError.hidden = state.view !== "save_error";
    saveError.textContent =
      state.view === "save_error"
        ? [state.error.message, ...(state.error.issues ?? [])].join(" ")
        : "";

    const description = element<HTMLElement>("description-state");
    description.textContent = extraction.record.job_description
      ? "Job description found"
      : extraction.warnings.includes("description_oversized")
        ? "Job description is too long to save"
        : "Job description not found";
    trackButton.disabled = false;
    trackButton.textContent = "Track job";
    if (state.view === "save_error") announce(state.error.message);
    return;
  }

  showOnly(views.result);
  const duplicate = state.outcome === "already_tracked";
  element<HTMLElement>("result-title").textContent = duplicate
    ? "Already in Interndex"
    : "Tracked in Interndex";
  element<HTMLElement>("result-company").textContent = state.application.company;
  element<HTMLElement>("result-job-title").textContent = state.application.job_title;
  element<HTMLElement>("result-warning").hidden = !state.descriptionOmitted;
  applicationHref = state.application.href;
  announce(duplicate ? "This job is already in Interndex." : "Job tracked in Interndex.");
}

async function send(request: PopupRequest): Promise<PopupResponse> {
  try {
    const response: unknown = await chrome.runtime.sendMessage(request);
    if (isPopupResponse(response)) return response;
  } catch {
    // Converted to the same actionable, non-technical popup error below.
  }
  return {
    ok: false,
    error: { code: "server", message: "Interndex Capture could not respond. Try again." },
  };
}

async function extract() {
  const response = await send({ type: "EXTRACT_ACTIVE_PAGE" });
  if (!response.ok || response.data.type !== "EXTRACTED") {
    dispatch({
      type: "EXTRACTION_FAILED",
      error: response.ok
        ? { code: "extraction_failed", message: "This page could not be read." }
        : response.error,
    });
    return;
  }
  dispatch({ type: "EXTRACTED", extraction: response.data.extraction });
}

async function start() {
  const response = await send({ type: "GET_CONNECTION" });
  if (!response.ok || response.data.type !== "CONNECTION") {
    connection = { connected: false, configured: false, redirectUrl: "" };
    dispatch({
      type: "CONNECTION_FAILED",
      connection,
      error: response.ok
        ? { code: "server", message: "Connection status could not be read." }
        : response.error,
    });
    return;
  }
  connection = response.data.status;
  dispatch({ type: "CONNECTION", connection });
  if (connection.connected) await extract();
}

element<HTMLButtonElement>("connect-button").addEventListener("click", async () => {
  dispatch({ type: "CONNECT_STARTED" });
  const response = await send({ type: "CONNECT" });
  if (!response.ok || response.data.type !== "CONNECTED") {
    dispatch({
      type: "CONNECTION_FAILED",
      connection: { ...connection, connected: false },
      error: response.ok
        ? { code: "connection_failed", message: "Interndex could not be connected." }
        : response.error,
    });
    return;
  }
  connection = { ...connection, connected: true };
  dispatch({ type: "CONNECTED" });
  await extract();
});

element<HTMLButtonElement>("retry-extraction-button").addEventListener("click", async () => {
  dispatch({ type: "CONNECTED" });
  await extract();
});

element<HTMLFormElement>("capture-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.view !== "editing" && state.view !== "save_error") return;
  const form = event.currentTarget as HTMLFormElement;
  if (!form.reportValidity()) return;

  const clean = (value: string) => value.trim() || undefined;
  const record: CaptureRecord = {
    ...state.extraction.record,
    company: companyInput.value.trim(),
    job_title: titleInput.value.trim(),
    status: statusInput.value === "Applied" ? "Applied" : "Interested",
  };
  const location = clean(locationInput.value);
  if (location) record.location = location;
  else delete record.location;
  dispatch({ type: "SAVE_STARTED", record });

  const response = await send({ type: "SAVE_CAPTURE", record });
  if (!response.ok || response.data.type !== "CAPTURED") {
    dispatch({
      type: "SAVE_FAILED",
      error: response.ok
        ? { code: "server", message: "Interndex returned an unexpected response." }
        : response.error,
    });
    if (!response.ok && ["not_connected", "token_expired"].includes(response.error.code)) {
      connection = { ...connection, connected: false };
    }
    return;
  }
  dispatch({
    type: "CAPTURED",
    outcome: response.data.outcome,
    application: response.data.application,
  });
});

element<HTMLButtonElement>("open-application-button").addEventListener("click", async () => {
  if (applicationHref) await send({ type: "OPEN_APPLICATION", href: applicationHref });
});

element<HTMLButtonElement>("disconnect-button").addEventListener("click", async () => {
  await send({ type: "DISCONNECT" });
  connection = { ...connection, connected: false };
  dispatch({ type: "DISCONNECTED", connection });
});

render();
void start();
