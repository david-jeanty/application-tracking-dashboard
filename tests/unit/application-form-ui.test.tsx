import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationFormValues } from "@/lib/applications/types";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

// Both forms post to Server Actions, which cannot run in a unit environment.
// The identity of the action is asserted; running it is not this suite's job.
const createApplicationAction = vi.fn();
const updateApplicationAction = Object.assign(vi.fn(), {
  bind: vi.fn(() => createApplicationAction),
});
vi.mock("@/lib/applications/actions", () => ({
  createApplicationAction: (...args: unknown[]) =>
    createApplicationAction(...args),
  updateApplicationAction,
}));

const { ApplicationCreatePanel } = await import(
  "@/components/applications/application-form"
);
const { ApplicationEditForm } = await import(
  "@/components/applications/application-edit-form"
);

/** Every field the two forms share, by the name it posts under. */
const REQUIRED_FIELDS = [
  "companyName",
  "originalJobTitle",
  "normalizedJobCategory",
  "currentStatus",
  "workTermSeason",
];
const OPTIONAL_FIELDS = [
  "location",
  "workArrangement",
  "companyDomain",
  "applicationUrl",
  "applicationSource",
  "applicationDeadline",
  "dateApplied",
  "workTermDuration",
  "salary",
  "nextAction",
  "nextActionDueDate",
  "jobDescription",
  "notes",
];

function values(): ApplicationFormValues {
  return {
    companyName: "RBC",
    originalJobTitle: "Business Analyst Intern",
    normalizedJobCategory: "Business Analysis",
    currentStatus: "Applied",
    workTermSeason: "Winter 2027",
    location: "Toronto, ON",
    workArrangement: "Hybrid",
    companyDomain: "rbc.com",
    applicationUrl: "",
    applicationSource: "",
    applicationDeadline: "",
    dateApplied: "2026-08-22",
    workTermDuration: "",
    salary: "",
    nextAction: "",
    nextActionDueDate: "",
    jobDescription: "",
    notes: "",
  };
}

function openCreatePanel() {
  const result = render(<ApplicationCreatePanel />);
  fireEvent.click(screen.getByRole("button", { name: "Add application" }));
  return result;
}

describe("adding an application", () => {
  it("stays a single button until it is opened", () => {
    render(<ApplicationCreatePanel />);

    expect(
      screen.getByRole("button", { name: "Add application" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Company name/)).not.toBeInTheDocument();
  });

  it("opens under a heading, with a way to close it again", () => {
    openCreatePanel();

    expect(
      screen.getByRole("heading", { level: 2, name: "Add application" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close application form" }),
    ).toBeInTheDocument();
  });

  it("keeps every field it has always posted", () => {
    const { container } = openCreatePanel();

    for (const name of [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]) {
      expect(container.querySelector(`[name="${name}"]`)).not.toBeNull();
    }
  });

  it("marks exactly the required fields as required", () => {
    const { container } = openCreatePanel();

    for (const name of REQUIRED_FIELDS) {
      expect(container.querySelector(`[name="${name}"]`)).toBeRequired();
    }
    for (const name of OPTIONAL_FIELDS) {
      expect(container.querySelector(`[name="${name}"]`)).not.toBeRequired();
    }
  });

  it("starts with optional details closed", () => {
    const { container } = openCreatePanel();

    const disclosure = container.querySelector("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute("open");
  });

  it("says what the asterisk means, and nothing about a development phase", () => {
    openCreatePanel();

    expect(
      screen.getByText("Required fields are marked with an asterisk."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("manual in this phase");
  });

  it("keeps the submit control wired to the create action", () => {
    const { container } = openCreatePanel();

    expect(
      screen.getByRole("button", { name: "Save application" }),
    ).toHaveAttribute("type", "submit");
    expect(container.querySelector("form")?.getAttribute("action")).toBeTruthy();
  });
});

describe("editing an application", () => {
  function renderEditForm() {
    return render(
      <ApplicationEditForm
        applicationId="11111111-1111-4111-8111-111111111111"
        defaultValues={values()}
        expectedUpdatedAt="2026-08-24T10:00:00.000Z"
      />,
    );
  }

  it("keeps every field, prefilled from the record", () => {
    const { container } = renderEditForm();

    for (const name of [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]) {
      expect(container.querySelector(`[name="${name}"]`)).not.toBeNull();
    }
    expect(screen.getByLabelText(/Company name/)).toHaveValue("RBC");
    expect(screen.getByLabelText(/Date applied/)).toHaveValue("2026-08-22");
  });

  it("starts with optional details open, because they are already filled in", () => {
    const { container } = renderEditForm();

    expect(container.querySelector("details")).toHaveAttribute("open");
  });

  it("still posts the version it read, so a stale write is caught", () => {
    const { container } = renderEditForm();

    expect(
      container.querySelector('input[name="expectedUpdatedAt"]'),
    ).toHaveValue("2026-08-24T10:00:00.000Z");
  });

  it("keeps Cancel pointing back at the record", () => {
    renderEditForm();

    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/applications/11111111-1111-4111-8111-111111111111",
    );
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toHaveAttribute("type", "submit");
  });

  it("binds the update action to this application", () => {
    renderEditForm();

    expect(updateApplicationAction.bind).toHaveBeenCalledWith(
      null,
      "11111111-1111-4111-8111-111111111111",
    );
  });
});

describe("the fields themselves", () => {
  it("associates each hint with the control it describes", () => {
    const { container } = openCreatePanel();

    const domain = container.querySelector('[name="companyDomain"]');
    expect(domain).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("companyDomain-hint"),
    );
    expect(
      screen.getByText("Optional. Used to display the company logo."),
    ).toHaveAttribute("id", "companyDomain-hint");
  });

  it("keeps the disclosure native, so the keyboard works without any script", () => {
    const { container } = openCreatePanel();

    const summary = container.querySelector("details > summary");
    expect(summary).not.toBeNull();
    expect(summary).toHaveTextContent("Optional details");
  });

  it("keeps the length limits the database expects", () => {
    const { container } = openCreatePanel();

    expect(container.querySelector('[name="companyName"]')).toHaveAttribute(
      "maxLength",
      "160",
    );
    expect(container.querySelector('[name="notes"]')).toHaveAttribute(
      "maxLength",
      "20000",
    );
    expect(
      container.querySelector('[name="jobDescription"]'),
    ).toHaveAttribute("maxLength", "50000");
  });
});
