import type {
  CaptureRecord,
  ConnectionStatus,
  ExtensionError,
  ExtractionResult,
  TrackedApplication,
} from "./types.js";

export type PopupState =
  | { view: "loading" }
  | { view: "disconnected"; connection: ConnectionStatus; error?: ExtensionError }
  | { view: "connecting" }
  | { view: "extracting" }
  | { view: "editing"; extraction: ExtractionResult }
  | { view: "extraction_error"; error: ExtensionError }
  | { view: "saving"; extraction: ExtractionResult; record: CaptureRecord }
  | {
      view: "save_error";
      extraction: ExtractionResult;
      record: CaptureRecord;
      error: ExtensionError;
    }
  | {
      view: "result";
      outcome: "created" | "already_tracked";
      application: TrackedApplication;
      descriptionOmitted: boolean;
    };

export type PopupEvent =
  | { type: "CONNECTION"; connection: ConnectionStatus }
  | { type: "CONNECT_STARTED" }
  | { type: "CONNECTION_FAILED"; connection: ConnectionStatus; error: ExtensionError }
  | { type: "CONNECTED" }
  | { type: "EXTRACTED"; extraction: ExtractionResult }
  | { type: "EXTRACTION_FAILED"; error: ExtensionError }
  | { type: "SAVE_STARTED"; record: CaptureRecord }
  | { type: "SAVE_FAILED"; error: ExtensionError }
  | {
      type: "CAPTURED";
      outcome: "created" | "already_tracked";
      application: TrackedApplication;
    }
  | { type: "DISCONNECTED"; connection: ConnectionStatus };

export const initialPopupState: PopupState = { view: "loading" };

export function popupReducer(state: PopupState, event: PopupEvent): PopupState {
  switch (event.type) {
    case "CONNECTION":
      return event.connection.connected
        ? { view: "extracting" }
        : { view: "disconnected", connection: event.connection };
    case "CONNECT_STARTED":
      return { view: "connecting" };
    case "CONNECTION_FAILED":
      return {
        view: "disconnected",
        connection: event.connection,
        error: event.error,
      };
    case "CONNECTED":
      return { view: "extracting" };
    case "EXTRACTED":
      return { view: "editing", extraction: event.extraction };
    case "EXTRACTION_FAILED":
      return { view: "extraction_error", error: event.error };
    case "SAVE_STARTED":
      if (state.view !== "editing" && state.view !== "save_error") return state;
      return {
        view: "saving",
        extraction: state.extraction,
        record: event.record,
      };
    case "SAVE_FAILED":
      if (state.view !== "saving") return state;
      return {
        view: "save_error",
        extraction: state.extraction,
        record: state.record,
        error: event.error,
      };
    case "CAPTURED":
      if (state.view !== "saving") return state;
      return {
        view: "result",
        outcome: event.outcome,
        application: event.application,
        descriptionOmitted: state.extraction.warnings.includes(
          "description_oversized",
        ),
      };
    case "DISCONNECTED":
      return { view: "disconnected", connection: event.connection };
  }
}

export function missingRequiredFields(extraction: ExtractionResult): string[] {
  return [
    ...(extraction.record.company ? [] : ["company"]),
    ...(extraction.record.job_title ? [] : ["job title"]),
  ];
}
