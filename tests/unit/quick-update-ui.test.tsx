import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";
import type { ApplicationRecord } from "@/lib/applications/types";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

// The quick controls post to Server Actions, which cannot run in a unit
// environment. Which action each form targets is asserted separately; what
// these tests are about is what a student is offered.
vi.mock("@/lib/applications/actions", () => ({
  clearNextActionAction: vi.fn(),
  updateApplicationStatusAction: vi.fn(),
  updateNextActionAction: vi.fn(),
}));

const { QuickUpdate } = await import("@/components/applications/quick-update");

function application(
  overrides: Partial<ApplicationRecord> = {},
): ApplicationRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    company_name: "RBC",
    original_job_title: "Business Analyst Intern",
    normalized_job_category: "Business Analysis",
    classification_confidence: null,
    location: "Toronto, ON",
    work_arrangement: "Hybrid",
    application_url: null,
    application_source: "LinkedIn",
    job_description: null,
    application_deadline: null,
    date_applied: "2026-08-01",
    current_status: "Applied",
    work_term_season: "Winter 2027",
    work_term_duration: null,
    salary: null,
    notes: null,
    next_action: null,
    next_action_due_date: null,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

describe("an active application gets the quick controls", () => {
  it("offers every status in the shared enum", () => {
    render(<QuickUpdate application={application()} />);

    const status = screen.getByLabelText("Status");
    const offered = Array.from(
      status.querySelectorAll("option"),
    ).map((option) => option.textContent);

    // The same ten statuses the full form uses, from the same constant, so a
    // student is never offered a smaller vocabulary in the quick control.
    expect(offered).toEqual([...APPLICATION_STATUSES]);
  });

  it("opens on the status the application actually has", () => {
    render(
      <QuickUpdate application={application({ current_status: "Interview" })} />,
    );

    expect(screen.getByLabelText("Status")).toHaveValue("Interview");
  });

  it("lets a student move backward as readily as forward", () => {
    render(
      <QuickUpdate application={application({ current_status: "Interview" })} />,
    );

    const offered = Array.from(
      screen.getByLabelText("Status").querySelectorAll("option"),
    ).filter((option) => !option.disabled);

    // Nothing is disabled by where the application currently sits. Searches
    // go sideways and backwards, and the control does not argue.
    expect(offered).toHaveLength(APPLICATION_STATUSES.length);
  });

  it("shows the next action and due date it already holds", () => {
    render(
      <QuickUpdate
        application={application({
          next_action: "Follow up with recruiter",
          next_action_due_date: "2026-09-01",
        })}
      />,
    );

    expect(screen.getByLabelText("Next action")).toHaveValue(
      "Follow up with recruiter",
    );
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-09-01");
  });

  it("says plainly that a due date needs an action to stay", () => {
    render(<QuickUpdate application={application()} />);

    expect(
      screen.getByText(/due date is kept only alongside a next action/i),
    ).toBeInTheDocument();
  });

  it("offers saving and clearing as separate, named choices", () => {
    render(<QuickUpdate application={application()} />);

    expect(
      screen.getByRole("button", { name: "Save status" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save next action" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("keeps status and next action in separate forms", () => {
    const { container } = render(<QuickUpdate application={application()} />);

    // Two forms, so saving a status posts no next-action fields and saving a
    // follow-up posts no status.
    const forms = Array.from(container.querySelectorAll("form"));
    expect(forms).toHaveLength(2);

    const names = forms.map((form) =>
      Array.from(form.elements)
        .map((element) => (element as HTMLInputElement).name)
        .filter(Boolean)
        .sort(),
    );
    expect(names).toContainEqual(["applicationId", "currentStatus"]);
    expect(names).toContainEqual([
      "applicationId",
      "nextAction",
      "nextActionDueDate",
    ]);
  });

  it("never accepts an owner from the page", () => {
    const { container } = render(<QuickUpdate application={application()} />);

    const names = Array.from(container.querySelectorAll("input")).map(
      (input) => input.name,
    );

    // Identity is derived on the server from the session. Nothing resembling a
    // user id is posted, so nothing could be trusted from a crafted form.
    expect(names).not.toContain("userId");
    expect(names).not.toContain("user_id");
  });
});

describe("an archived application gets no quick controls", () => {
  it("renders nothing at all", () => {
    const { container } = render(
      <QuickUpdate
        application={application({ archived_at: "2026-08-10T10:00:00.000Z" })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("offers no status control, no next-action field, and no clear button", () => {
    render(
      <QuickUpdate
        application={application({
          archived_at: "2026-08-10T10:00:00.000Z",
          next_action: "Follow up with recruiter",
        })}
      />,
    );

    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next action")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("the full edit workflow is untouched by this ticket", () => {
  const source = (path: string) => readFileSync(path, "utf8");

  it("still has its own route", () => {
    // Quick update covers two fields. Everything else — company, title,
    // category, salary, dates, notes — still belongs to the full form.
    expect(() =>
      source("app/(app)/applications/[id]/edit/page.tsx"),
    ).not.toThrow();
  });

  it("is still linked from the detail page", () => {
    const detail = source("app/(app)/applications/[id]/page.tsx");

    expect(detail).toContain("Edit application");
    expect(detail).toContain("/edit`");
  });

  it("still writes the whole record under optimistic concurrency", () => {
    const repository = source("lib/applications/repository.ts");

    // The quick mutations deliberately skip `expectedUpdatedAt`; the full
    // update must not, because it genuinely can overwrite another change.
    expect(repository).toContain('.eq("updated_at", input.expectedUpdatedAt)');
  });
});
