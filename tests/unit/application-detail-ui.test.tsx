import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationDetail } from "@/components/applications/application-detail";
import type { ApplicationRecord } from "@/lib/applications/types";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

function application(
  overrides: Partial<ApplicationRecord> = {},
): ApplicationRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    company_name: "RBC",
    company_domain: null,
    original_job_title: "Business Analyst Intern",
    normalized_job_category: "Business Analysis",
    classification_confidence: "High",
    location: "Toronto",
    work_arrangement: "Hybrid",
    application_url: null,
    application_source: "LinkedIn",
    job_description: "Support procurement transformation work.",
    application_deadline: "2026-09-21",
    date_applied: "2026-08-22",
    current_status: "Applied",
    work_term_season: "Winter 2027",
    work_term_duration: "4 months",
    salary: "$23/hour",
    notes: "Met the campus recruiter at the Telfer networking event.",
    next_action: "Follow up with recruiter",
    next_action_due_date: "2026-08-28",
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-22T10:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

/** The `<details>` element whose summary carries the given heading. */
function disclosure(title: string): HTMLDetailsElement {
  const element = screen
    .getByRole("heading", { name: new RegExp(`^${title}`) })
    .closest("details");
  if (!element) throw new Error(`No disclosure titled ${title}.`);
  return element as HTMLDetailsElement;
}

describe("long-form sections start closed", () => {
  it("collapses Notes by default", () => {
    render(<ApplicationDetail application={application()} />);

    expect(disclosure("Notes").open).toBe(false);
  });

  it("collapses the job description by default", () => {
    render(<ApplicationDetail application={application()} />);

    expect(disclosure("Job description").open).toBe(false);
  });

  it("uses a native disclosure, so it needs no script and no stored state", () => {
    render(<ApplicationDetail application={application()} />);

    // A `summary` is focusable and operable by keyboard because the browser
    // makes it so; nothing here manages that.
    const notes = disclosure("Notes");
    expect(notes.querySelector("summary")).toBeInTheDocument();
    expect(notes.tagName).toBe("DETAILS");
  });

  it("still holds the content, ready to be opened", () => {
    render(<ApplicationDetail application={application()} />);

    expect(
      within(disclosure("Notes")).getByText(/Telfer networking event/),
    ).toBeInTheDocument();
    expect(
      within(disclosure("Job description")).getByText(/procurement transformation/),
    ).toBeInTheDocument();
  });

  it("says so on the summary when there is nothing inside", () => {
    render(
      <ApplicationDetail
        application={application({ notes: null, job_description: null })}
      />,
    );

    // So an empty section need not be opened to find that out.
    expect(within(disclosure("Notes")).getByText("No notes")).toBeInTheDocument();
    expect(
      within(disclosure("Job description")).getByText("Not saved"),
    ).toBeInTheDocument();
  });
});

describe("the order of the record", () => {
  it("puts the student's own notes before the saved posting", () => {
    const { container } = render(
      <ApplicationDetail application={application()} />,
    );

    // Every section is a real heading, collapsed ones included, so the
    // outline a screen reader walks is the order on the page.
    const headings = Array.from(container.querySelectorAll("h2")).map(
      (node) => node.textContent,
    );

    expect(headings).toEqual([
      "Overview",
      "Notes",
      "Job description",
      "Record details",
    ]);
  });
});

describe("what stays plainly visible", () => {
  it("keeps the overview open, because it is what the page is for", () => {
    render(<ApplicationDetail application={application()} />);

    expect(screen.getByText("Toronto")).toBeVisible();
    expect(screen.getByText("Business Analysis")).toBeVisible();
    expect(screen.getByText("$23/hour")).toBeVisible();
  });

  it("keeps every field it had, none dropped by the collapse", () => {
    render(<ApplicationDetail application={application()} />);

    for (const label of [
      "Location",
      "Work arrangement",
      "Category",
      "Source",
      "Date applied",
      "Deadline",
      "Work term",
      "Duration",
      "Salary",
      "Job posting",
      "Created",
      "Last updated",
      "Archive state",
      "Category confidence",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("still shows the archived notice above everything", () => {
    render(
      <ApplicationDetail
        application={application({ archived_at: "2026-08-24T10:00:00.000Z" })}
      />,
    );

    expect(screen.getByText(/This application is archived/)).toBeInTheDocument();
  });
});
