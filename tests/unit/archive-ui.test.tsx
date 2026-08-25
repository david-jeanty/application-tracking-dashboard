import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationListItem } from "@/lib/applications/types";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

// Restore posts to a Server Action, which cannot run in a unit environment.
// What matters here is that the archive still points at the same one.
const restoreApplicationAction = vi.fn();
vi.mock("@/lib/applications/actions", () => ({
  restoreApplicationAction: (...args: unknown[]) =>
    restoreApplicationAction(...args),
}));

const supabase = {
  auth: {
    getUser: async () => ({
      data: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
    }),
  },
};
const listApplications = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/applications/repository", () => ({
  listApplications: (...args: unknown[]) => listApplications(...args),
}));

const { ArchivedApplicationsList, ArchivedApplicationsEmptyState } =
  await import("@/components/applications/archived-list");
const { default: ArchivePage } = await import("@/app/(app)/archive/page");

function archived(
  overrides: Partial<ApplicationListItem> = {},
): ApplicationListItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    company_name: "RBC",
    company_domain: null,
    original_job_title: "Business Analyst Intern",
    normalized_job_category: "Business Analysis",
    current_status: "Rejected",
    location: "Toronto",
    work_arrangement: "Hybrid",
    work_term_season: "Winter 2027",
    date_applied: "2026-08-22",
    application_deadline: "2026-09-30",
    next_action: "Follow up with the recruiter",
    next_action_due_date: "2026-09-02",
    created_at: "2026-08-20T10:00:00.000Z",
    archived_at: "2026-08-24T10:00:00.000Z",
    ...overrides,
  };
}

function renderPage(
  result: { data: ApplicationListItem[] | null; error?: { code: string } },
  searchParams: { delete?: string } = {},
) {
  listApplications.mockResolvedValue({
    data: result.data,
    error: result.error ?? null,
  });
  return ArchivePage({ searchParams: Promise.resolve(searchParams) });
}

describe("the archived record", () => {
  it("leads with the role and follows it with the company", () => {
    render(<ArchivedApplicationsList applications={[archived()]} />);

    const record = within(
      screen.getByRole("listitem"),
    );
    // The role is the heading and the link; the company is the line beneath.
    expect(
      record.getByRole("heading", { name: "Business Analyst Intern" }),
    ).toBeInTheDocument();
    expect(
      record.getByRole("link", { name: "Business Analyst Intern" }),
    ).toHaveAttribute(
      "href",
      "/applications/11111111-1111-4111-8111-111111111111",
    );
    expect(record.getByText("RBC")).toBeInTheDocument();
    expect(
      record.queryByRole("heading", { name: "RBC" }),
    ).not.toBeInTheDocument();
  });

  it("shows where the application ended and the day it was put away", () => {
    render(<ArchivedApplicationsList applications={[archived()]} />);

    const record = within(screen.getByRole("listitem"));
    expect(record.getByText("Rejected")).toBeInTheDocument();
    // The calendar day, not the minute: what hour a rejection was tidied away
    // is not something the archive has any reason to report.
    expect(screen.getByRole("listitem").textContent).toContain(
      "Archived Aug 24, 2026",
    );
  });

  it("says nothing rather than guessing when the timestamp is missing", () => {
    render(
      <ArchivedApplicationsList
        applications={[archived({ archived_at: null })]}
      />,
    );

    expect(screen.getByRole("listitem").textContent).toContain("Archived —");
  });

  it("leaves out everything an archived application no longer needs", () => {
    const { container } = render(
      <ArchivedApplicationsList applications={[archived()]} />,
    );

    const record = screen.getByRole("listitem");
    // No deadline, no next action, no category: the record is finished, and
    // the archive is not a second place to work it.
    expect(record.textContent).not.toContain("Follow up with the recruiter");
    expect(record.textContent).not.toContain("Business Analysis");
    expect(record.textContent).not.toContain("deadline");
    // The lifecycle rail is an ordered list of stages. There is none here.
    expect(container.querySelector("ol")).toBeNull();
    expect(record.textContent).not.toContain("In process");
  });

  it("offers Restore against the existing server action", () => {
    const { container } = render(
      <ArchivedApplicationsList applications={[archived()]} />,
    );

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form?.getAttribute("action")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Restore Business Analyst Intern at RBC",
      }),
    ).toHaveAttribute("type", "submit");
    expect(
      container.querySelector('input[name="applicationId"]'),
    ).toHaveValue("11111111-1111-4111-8111-111111111111");
  });

  it("keeps permanent deletion on its own confirmation route", () => {
    render(<ArchivedApplicationsList applications={[archived()]} />);

    expect(
      screen.getByRole("link", {
        name: "Permanently delete Business Analyst Intern at RBC",
      }),
    ).toHaveAttribute(
      "href",
      "/applications/11111111-1111-4111-8111-111111111111/delete",
    );
  });

  it("renders one composition per record, not a table and a card", () => {
    const { container } = render(
      <ArchivedApplicationsList applications={[archived()]} />,
    );

    expect(container.querySelector("table")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});

describe("the whole archive", () => {
  it("represents every archived application", () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      archived({
        id: `11111111-1111-4111-8111-1111111111${String(index).padStart(2, "0")}`,
        original_job_title: `Role ${index}`,
      }),
    );

    render(<ArchivedApplicationsList applications={rows} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getByText("12 archived applications")).toBeInTheDocument();
    for (const row of rows) {
      expect(
        screen.getByRole("heading", { name: row.original_job_title }),
      ).toBeInTheDocument();
    }
  });

  it("counts a single archived application in the singular", () => {
    render(<ArchivedApplicationsList applications={[archived()]} />);

    expect(screen.getByText("1 archived application")).toBeInTheDocument();
  });
});

describe("the archive page", () => {
  it("uses one page title and explains what the archive is", async () => {
    render(await renderPage({ data: [archived()] }));

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Archive");
    expect(screen.getByText(/Archiving is not deletion/)).toBeInTheDocument();
  });

  it("keeps the explanation when there is nothing archived", async () => {
    render(await renderPage({ data: [] }));

    expect(
      screen.getByRole("heading", { name: "No archived applications" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Applications you archive appear here/),
    ).toBeInTheDocument();
  });

  it("reports a failed read rather than an empty archive", async () => {
    render(await renderPage({ data: null, error: { code: "PGRST500" } }));

    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent("Archived applications could not be loaded");
    expect(
      screen.queryByRole("heading", { name: "No archived applications" }),
    ).not.toBeInTheDocument();
  });

  it("confirms a permanent deletion in the shared notice language", async () => {
    render(await renderPage({ data: [] }, { delete: "deleted" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Application permanently deleted.",
    );
  });

  it("reads only the archived side of the line", async () => {
    await renderPage({ data: [archived()] });

    expect(listApplications).toHaveBeenCalledWith(
      supabase,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      { archiveState: "archived" },
    );
  });
});

describe("the empty state on its own", () => {
  it("is a rule and an explanation rather than a card with an icon", () => {
    const { container } = render(<ArchivedApplicationsEmptyState />);

    expect(container.querySelector("svg")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "No archived applications" }),
    ).toBeInTheDocument();
  });
});
