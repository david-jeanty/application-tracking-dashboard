import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { render } from "../src/popup-render.js";
import { reduce, type PopupState } from "../src/popup-state.js";
import type { ExtractedJob } from "../src/types.js";

/**
 * The real popup markup, rendered into each state.
 *
 * `popup.html` is read from disk rather than reproduced here, so a control that
 * is renamed or removed breaks these tests instead of leaving them asserting a
 * copy of a page that no longer exists.
 */

const markup = readFileSync(join(import.meta.dirname, "../popup.html"), "utf8");

const job: ExtractedJob = {
  company: "IBM",
  jobTitle: "Business Technology Analyst Intern",
  location: "Ottawa, ON",
  jobDescription: "Work with the analytics team.",
  warnings: [],
};

const application = {
  company: "IBM",
  jobTitle: "Business Technology Analyst Intern",
  url: "https://jobtrack.example.com/applications/a1",
};

function visiblePanels(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-panel]"))
    .filter((panel) => !panel.hidden)
    .map((panel) => panel.dataset["panel"] ?? "");
}

function ready(): PopupState {
  return reduce({ view: "extracting" }, { type: "extracted", job });
}

beforeEach(() => {
  document.documentElement.innerHTML = markup;
});

describe("what the popup shows", () => {
  it.each([
    ["loading", { view: "loading" }],
    ["disconnected", { view: "disconnected" }],
    ["connecting", { view: "connecting" }],
    ["extracting", { view: "extracting" }],
    ["unauthorized", { view: "unauthorized" }],
  ] as const)("shows exactly the %s panel", (name, state) => {
    render(document, state as PopupState);

    expect(visiblePanels()).toEqual([name]);
  });

  it("fills the form and enables saving when the page was read", () => {
    render(document, ready());

    expect(visiblePanels()).toEqual(["ready"]);
    expect(
      document.querySelector<HTMLInputElement>("#company")?.value,
    ).toBe("IBM");
    expect(
      document.querySelector<HTMLInputElement>("#job-title")?.value,
    ).toBe("Business Technology Analyst Intern");
    expect(
      document.querySelector<HTMLInputElement>("#location")?.value,
    ).toBe("Ottawa, ON");
    expect(document.querySelector<HTMLSelectElement>("#status")?.value).toBe(
      "Interested",
    );
    expect(document.querySelector<HTMLButtonElement>("#save")?.disabled).toBe(
      false,
    );
  });

  it("disables saving while a required field is empty", () => {
    render(
      document,
      reduce(ready(), { type: "field_changed", field: "company", value: "" }),
    );

    expect(document.querySelector<HTMLButtonElement>("#save")?.disabled).toBe(
      true,
    );
  });

  it("shows the server's reasons beside the form it kept", () => {
    const rejected = reduce(
      reduce(ready(), { type: "save_started" }),
      {
        type: "save_result",
        outcome: { kind: "invalid", issues: ["Company name is required."] },
      },
    );

    render(document, rejected);

    expect(document.querySelector("#save-problem")?.textContent).toMatch(
      /could not accept/i,
    );
    expect(document.querySelector("#save-issues")?.textContent).toContain(
      "Company name is required.",
    );
    expect(
      document.querySelector<HTMLInputElement>("#company")?.value,
    ).toBe("IBM");
  });

  it("confirms a saved job and links to it", () => {
    render(document, { view: "saved", duplicate: false, application });

    expect(visiblePanels()).toEqual(["saved"]);
    expect(document.querySelector("#saved-headline")?.textContent).toBe(
      "✓ Tracked in JobTrack",
    );
    expect(document.querySelector<HTMLAnchorElement>("#open-application")?.href).toBe(
      application.url,
    );
  });

  it("says a duplicate is already tracked rather than reporting a failure", () => {
    render(document, { view: "saved", duplicate: true, application });

    expect(document.querySelector("#saved-headline")?.textContent).toBe(
      "Already in JobTrack",
    );
    expect(document.querySelector("#announcement")?.textContent).toBe(
      "Already in JobTrack.",
    );
  });

  it("offers signing out only while there is a connection to sign out of", () => {
    render(document, { view: "disconnected" });
    expect(document.querySelector<HTMLElement>("#disconnect")?.hidden).toBe(true);

    render(document, ready());
    expect(document.querySelector<HTMLElement>("#disconnect")?.hidden).toBe(false);
  });
});

describe("what the popup announces", () => {
  it("keeps a live region that reports each state", () => {
    const announcement = document.querySelector("#announcement");

    expect(announcement).toHaveProperty("role", "status");
    expect(announcement?.getAttribute("aria-live")).toBe("polite");

    render(document, reduce(ready(), { type: "save_started" }));
    expect(announcement?.textContent).toBe("Saving to JobTrack.");
  });
});

describe("accessibility of the capture form", () => {
  it("gives every control a label that names it", () => {
    for (const [id, label] of [
      ["company", "Company"],
      ["job-title", "Job title"],
      ["location", "Location"],
      ["status", "Status"],
    ] as const) {
      const control = document.getElementById(id);
      const associated = document.querySelector(`label[for="${id}"]`);

      expect(control).not.toBeNull();
      expect(associated?.textContent).toBe(label);
    }
  });

  it("renders page and server text as text, never as markup", () => {
    render(document, {
      view: "saved",
      duplicate: false,
      application: {
        ...application,
        company: "<img src=x onerror=alert(1)>Acme",
      },
    });

    const company = document.querySelector("#saved-company");
    expect(company?.querySelector("img")).toBeNull();
    expect(company?.textContent).toBe("<img src=x onerror=alert(1)>Acme");
  });
});

/**
 * What the student is told is being saved on their behalf.
 *
 * They confirm a company, a title, a location and a status. A description, a
 * deadline, a salary, a source and the posting URL go with it untouched, and
 * before this section they went silently. Important data should not enter a
 * tracker invisibly — least of all a deadline or a salary, which are exactly
 * the values a wrong extraction makes plausible and costly.
 */
describe("the read-only summary of what else is saved", () => {
  function summaryRows(): [string, string][] {
    const list = document.querySelector("#also-found-list");
    const terms = Array.from(list?.querySelectorAll("dt") ?? []);
    const values = Array.from(list?.querySelectorAll("dd") ?? []);

    return terms.map((term, index) => [
      term.textContent ?? "",
      values[index]?.textContent ?? "",
    ]);
  }

  it("names each fact that will be stored without being typed", () => {
    const state = reduce(
      { view: "extracting" },
      {
        type: "extracted",
        job: {
          ...job,
          deadline: "2026-09-13",
          salary: "CAD 25 per hour",
          source: "LinkedIn",
          jobUrl: "https://www.linkedin.com/jobs/view/4123456789/",
        },
      },
    );

    render(document, state);

    expect(summaryRows()).toEqual([
      ["Job description", "Saved"],
      ["Deadline", "Sep 13, 2026"],
      ["Salary", "CAD 25 per hour"],
      ["Source", "LinkedIn"],
      ["Original posting", "Saved"],
    ]);
  });

  it("says a description was shortened rather than only that it was saved", () => {
    const state = reduce(
      { view: "extracting" },
      {
        type: "extracted",
        job: { ...job, warnings: ["description_too_long"] },
      },
    );

    render(document, state);

    expect(summaryRows()).toEqual([["Job description", "Saved, shortened"]]);
  });

  it("lists only what will actually be stored", () => {
    render(document, ready());

    // No deadline was extracted, so none is promised here.
    expect(summaryRows().map(([label]) => label)).toEqual([
      "Job description",
    ]);
  });

  it("disappears entirely when there is nothing extra to report", () => {
    const state = reduce(
      { view: "extracting" },
      { type: "extracted", job: { company: "IBM", warnings: [] } },
    );

    render(document, state);

    expect(document.querySelector<HTMLElement>("#also-found")?.hidden).toBe(
      true,
    );
  });

  it("is a labelled region rather than a loose list", () => {
    render(document, ready());

    const summary = document.querySelector("#also-found");

    expect(summary?.getAttribute("aria-labelledby")).toBe("also-found-heading");
    expect(document.querySelector("#also-found-heading")?.textContent).toBe(
      "Also found",
    );
  });

  it("writes page values as text, never as markup", () => {
    const state = reduce(
      { view: "extracting" },
      {
        type: "extracted",
        job: { ...job, source: "<img src=x onerror=alert(1)>" },
      },
    );

    render(document, state);

    expect(document.querySelector("#also-found-list img")).toBeNull();
    expect(summaryRows()).toContainEqual([
      "Source",
      "<img src=x onerror=alert(1)>",
    ]);
  });
});
