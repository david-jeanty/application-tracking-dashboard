import { describe, expect, it } from "vitest";
import {
  initialPopupState,
  missingRequiredFields,
  popupReducer,
} from "../src/popup-state.js";
import type { ExtensionError, ExtractionResult } from "../src/types.js";

const connection = {
  connected: false,
  configured: true,
  redirectUrl: "https://abc.chromiumapp.org/oauth2",
};
const complete: ExtractionResult = {
  record: { company: "IBM", job_title: "Analyst", job_description: "Details" },
  method: "json_ld",
  jobPostingFound: true,
  warnings: [],
};
const incomplete: ExtractionResult = {
  record: { job_title: "Analyst" },
  method: "metadata",
  jobPostingFound: false,
  warnings: [],
};
const error = (code: ExtensionError["code"]): ExtensionError => ({
  code,
  message: code,
});

describe("popup state transitions", () => {
  it("represents the disconnected state", () => {
    expect(
      popupReducer(initialPopupState, { type: "CONNECTION", connection }),
    ).toMatchObject({ view: "disconnected" });
  });

  it("represents connection in progress", () => {
    expect(
      popupReducer(
        { view: "disconnected", connection },
        { type: "CONNECT_STARTED" },
      ),
    ).toEqual({ view: "connecting" });
  });

  it("moves a connected popup into extraction", () => {
    expect(
      popupReducer(initialPopupState, {
        type: "CONNECTION",
        connection: { ...connection, connected: true },
      }),
    ).toEqual({ view: "extracting" });
  });

  it("represents a complete extraction", () => {
    expect(
      popupReducer({ view: "extracting" }, { type: "EXTRACTED", extraction: complete }),
    ).toMatchObject({ view: "editing", extraction: complete });
  });

  it("keeps an incomplete extraction editable and names what is missing", () => {
    const state = popupReducer(
      { view: "extracting" },
      { type: "EXTRACTED", extraction: incomplete },
    );
    expect(state.view).toBe("editing");
    expect(missingRequiredFields(incomplete)).toEqual(["company"]);
  });

  it("represents extraction failure", () => {
    expect(
      popupReducer(
        { view: "extracting" },
        { type: "EXTRACTION_FAILED", error: error("extraction_failed") },
      ),
    ).toMatchObject({ view: "extraction_error" });
  });

  it("represents save in progress", () => {
    expect(
      popupReducer(
        { view: "editing", extraction: complete },
        { type: "SAVE_STARTED", record: complete.record },
      ),
    ).toMatchObject({ view: "saving" });
  });

  it.each(["invalid", "network", "authorization_denied"] as const)(
    "keeps the confirmed record available after a %s response",
    (code) => {
      const saving = popupReducer(
        { view: "editing", extraction: complete },
        { type: "SAVE_STARTED", record: complete.record },
      );
      expect(
        popupReducer(saving, { type: "SAVE_FAILED", error: error(code) }),
      ).toMatchObject({ view: "save_error", record: complete.record, error: { code } });
    },
  );

  it.each(["created", "already_tracked"] as const)(
    "represents a %s result with an application link",
    (outcome) => {
      const saving = popupReducer(
        { view: "editing", extraction: complete },
        { type: "SAVE_STARTED", record: complete.record },
      );
      expect(
        popupReducer(saving, {
          type: "CAPTURED",
          outcome,
          application: {
            id: "application-1",
            company: "IBM",
            job_title: "Analyst",
            href: "/applications/application-1",
          },
        }),
      ).toMatchObject({ view: "result", outcome });
    },
  );
});
