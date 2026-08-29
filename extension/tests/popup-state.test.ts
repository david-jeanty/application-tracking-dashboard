import { describe, expect, it } from "vitest";
import {
  canSave,
  describeExtraction,
  formFor,
  initialState,
  isIncomplete,
  reduce,
  type PopupState,
} from "../src/popup-state.js";
import type { ExtractedJob } from "../src/types.js";

/**
 * Every state the popup can be in, and how it gets there.
 *
 * The recoverable failures are the ones worth pinning down. A rejected save, a
 * dropped connection, and an unreachable server all return the student to the
 * form they were filling in, with the reason beside it — because the
 * alternative is a small window that throws away what someone just typed and
 * tells them to start again.
 */

const job: ExtractedJob = {
  company: "IBM",
  jobTitle: "Business Technology Analyst Intern",
  location: "Ottawa, ON",
  jobDescription: "Work with the analytics team.",
  jobUrl: "https://careers.example.com/jobs/1",
  warnings: [],
};

const application = {
  company: "IBM",
  jobTitle: "Business Technology Analyst Intern",
  url: "https://jobtrack.example.com/applications/a1",
};

function ready(): PopupState {
  return reduce({ view: "extracting" }, { type: "extracted", job });
}

function saving(): PopupState {
  return reduce(ready(), { type: "save_started" });
}

describe("connecting", () => {
  it("starts by checking the connection", () => {
    expect(initialState()).toEqual({ view: "loading" });
  });

  it("shows the disconnected state when there are no credentials", () => {
    expect(
      reduce(initialState(), { type: "connection", connected: false }),
    ).toEqual({ view: "disconnected" });
  });

  it("shows a waiting state while the sign-in window is open", () => {
    expect(
      reduce({ view: "disconnected" }, { type: "connect_started" }),
    ).toEqual({ view: "connecting" });
  });

  it("goes straight to reading the page once connected", () => {
    expect(
      reduce(
        { view: "connecting" },
        { type: "connect_result", result: { status: "connected" } },
      ),
    ).toEqual({ view: "extracting" });
  });

  it.each([
    ["cancelled", /cancelled/i],
    ["denied", /not given access/i],
    ["state_mismatch", /could not be verified/i],
    ["network_error", /could not be reached/i],
  ] as const)("explains a %s connection attempt", (status, pattern) => {
    const state = reduce(
      { view: "connecting" },
      { type: "connect_result", result: { status } },
    );

    expect(state.view).toBe("connect_failed");
    expect(state.view === "connect_failed" && state.message).toMatch(pattern);
  });
});

describe("reading the page", () => {
  it("fills the form from what was extracted and defaults to Interested", () => {
    const state = ready();

    expect(state.view).toBe("ready");
    expect(state.view === "ready" && state.form).toEqual({
      company: "IBM",
      jobTitle: "Business Technology Analyst Intern",
      location: "Ottawa, ON",
      status: "Interested",
    });
  });

  it("never infers Applied from the page", () => {
    expect(formFor({ ...job, warnings: [] }).status).toBe("Interested");
  });

  it("leaves the form blank rather than guessing when extraction found little", () => {
    const bare: ExtractedJob = {
      jobTitle: "Analyst Intern",
      warnings: ["no_job_posting_found", "missing_company", "missing_location"],
    };

    const state = reduce({ view: "extracting" }, { type: "extracted", job: bare });

    expect(state.view === "ready" && state.form.company).toBe("");
    expect(isIncomplete(bare)).toBe(true);
    expect(canSave(state)).toBe(false);
  });

  it("reports a page it could not read at all", () => {
    const state = reduce(
      { view: "extracting" },
      { type: "extraction_failed", message: "Interndex cannot read this page." },
    );

    expect(state).toEqual({
      view: "extraction_failed",
      message: "Interndex cannot read this page.",
    });
  });

  it.each([
    [[], "Job description found"],
    [["description_too_long"], "Job description found, shortened to fit Interndex."],
    [["no_job_posting_found"], "No job details found on this page — add them below."],
  ] as const)("describes what it found", (warnings, expected) => {
    expect(
      describeExtraction({ ...job, warnings: [...warnings] }),
    ).toBe(expected);
  });

  it("says plainly when there was no description", () => {
    expect(
      describeExtraction({ company: "IBM", jobTitle: "Intern", warnings: [] }),
    ).toBe("No job description found on this page");
  });
});

describe("editing", () => {
  it("keeps the student's correction", () => {
    const state = reduce(ready(), {
      type: "field_changed",
      field: "company",
      value: "International Business Machines",
    });

    expect(state.view === "ready" && state.form.company).toBe(
      "International Business Machines",
    );
  });

  it("accepts only the two statuses the popup offers", () => {
    const applied = reduce(ready(), {
      type: "field_changed",
      field: "status",
      value: "Applied",
    });
    const nonsense = reduce(ready(), {
      type: "field_changed",
      field: "status",
      value: "Offer",
    });

    expect(applied.view === "ready" && applied.form.status).toBe("Applied");
    expect(nonsense.view === "ready" && nonsense.form.status).toBe("Interested");
  });

  it("cannot save without a company and a title", () => {
    const blank = reduce(ready(), {
      type: "field_changed",
      field: "company",
      value: "   ",
    });

    expect(canSave(blank)).toBe(false);
    expect(canSave(ready())).toBe(true);
  });
});

describe("saving", () => {
  it("moves to a saving state that cannot be submitted again", () => {
    const state = saving();

    expect(state.view).toBe("saving");
    expect(canSave(state)).toBe(false);
  });

  it("confirms a newly tracked job", () => {
    const state = reduce(saving(), {
      type: "save_result",
      outcome: { kind: "created", application },
    });

    expect(state).toEqual({ view: "saved", duplicate: false, application });
  });

  it("shows the existing record instead of saving a second copy", () => {
    const state = reduce(saving(), {
      type: "save_result",
      outcome: { kind: "already_tracked", application },
    });

    expect(state).toEqual({ view: "saved", duplicate: true, application });
  });

  it("returns to the form with the server's reasons on a rejected record", () => {
    const state = reduce(saving(), {
      type: "save_result",
      outcome: { kind: "invalid", issues: ["Company name is required."] },
    });

    expect(state.view).toBe("ready");
    expect(state.view === "ready" && state.problem?.issues).toEqual([
      "Company name is required.",
    ]);
    expect(state.view === "ready" && state.form.company).toBe("IBM");
  });

  it("keeps the typed form when the network fails", () => {
    const state = reduce(saving(), {
      type: "save_result",
      outcome: { kind: "network_error" },
    });

    expect(state.view === "ready" && state.problem?.message).toMatch(
      /could not be reached/i,
    );
  });

  it("keeps the typed form when Interndex fails", () => {
    const state = reduce(saving(), {
      type: "save_result",
      outcome: { kind: "server_error" },
    });

    expect(state.view === "ready" && state.problem?.message).toMatch(
      /could not save/i,
    );
  });

  it("asks the student to reconnect when the credential is rejected", () => {
    expect(
      reduce(saving(), { type: "save_result", outcome: { kind: "unauthorized" } }),
    ).toEqual({ view: "unauthorized" });
  });

  it("clears a stale problem as soon as the student edits the field", () => {
    const rejected = reduce(saving(), {
      type: "save_result",
      outcome: { kind: "invalid", issues: ["Company name is required."] },
    });

    const edited = reduce(rejected, {
      type: "field_changed",
      field: "company",
      value: "IBM Canada",
    });

    expect(edited.view === "ready" && edited.problem).toBeUndefined();
  });

  it("ignores a save result that arrives when nothing is being saved", () => {
    const state = ready();

    expect(
      reduce(state, { type: "save_result", outcome: { kind: "created", application } }),
    ).toBe(state);
  });
});
