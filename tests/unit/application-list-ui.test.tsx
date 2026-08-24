import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationListItem } from "@/lib/applications/types";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

const supabase = {
  auth: {
    getUser: async () => ({
      data: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
    }),
  },
};
const listActiveApplications = vi.fn();
const listStatusHistory = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/applications/repository", () => ({
  listActiveApplications: (...args: unknown[]) => listActiveApplications(...args),
  listStatusHistory: (...args: unknown[]) => listStatusHistory(...args),
}));

const { ApplicationList } = await import(
  "@/components/applications/application-list"
);

function application(
  overrides: Partial<ApplicationListItem> = {},
): ApplicationListItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    company_name: "RBC",
    company_domain: null,
    original_job_title: "Business Analyst Intern",
    normalized_job_category: "Business Analysis",
    current_status: "Applied",
    location: "Toronto",
    work_arrangement: "Hybrid",
    work_term_season: "Winter 2027",
    date_applied: "2026-08-22",
    application_deadline: null,
    next_action: null,
    next_action_due_date: null,
    created_at: "2026-08-20T10:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

async function renderList(options: {
  rows?: ApplicationListItem[];
  history?: { application_id: string; new_status: string }[];
  historyFails?: boolean;
  filters?: Record<string, string>;
} = {}) {
  listActiveApplications.mockResolvedValue({
    data: options.rows ?? [application()],
    error: null,
  });
  listStatusHistory.mockResolvedValue(
    options.historyFails
      ? { data: null, error: { code: "PGRST500" } }
      : { data: options.history ?? [], error: null },
  );

  return render(await ApplicationList({ filters: options.filters ?? {} }));
}

beforeEach(() => {
  listActiveApplications.mockReset();
  listStatusHistory.mockReset();
});

describe("what a desktop row shows", () => {
  it("leads with the employer and the role", async () => {
    await renderList();

    expect(
      screen.getAllByRole("link", { name: "RBC" })[0],
    ).toHaveAttribute("href", "/applications/11111111-1111-4111-8111-111111111111");
    expect(screen.getAllByText("Business Analyst Intern").length).toBeGreaterThan(0);
  });

  it("shows the lifecycle rail and the exact status together", async () => {
    await renderList({ history: [{ application_id: "11111111-1111-4111-8111-111111111111", new_status: "Applied" }] });

    expect(screen.getAllByRole("img", { name: /lifecycle progress/i }).length)
      .toBeGreaterThan(0);
    // The rail summarises; the exact status is still there in words.
    expect(screen.getAllByText("Applied").length).toBeGreaterThan(0);
  });

  it("shows location and work term, and no longer a column each for category and applied date", async () => {
    await renderList();

    const table = screen.getByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);

    expect(headers).toEqual([
      "Employer / role",
      "Progress",
      "Location / term",
      "Next",
    ]);
    expect(within(table).getAllByText("Toronto").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Winter 2027").length).toBeGreaterThan(0);
    expect(within(table).queryByText("Business Analysis")).not.toBeInTheDocument();
  });

  it("keeps semantic table markup", async () => {
    await renderList();

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("rowgroup").length).toBeGreaterThan(0);
  });

  it("counts what it is showing", async () => {
    await renderList({ rows: [application(), application({ id: "22222222-2222-4222-8222-222222222222" })] });

    expect(screen.getByText("2 applications")).toBeInTheDocument();
  });

  it("says one application in the singular", async () => {
    await renderList();

    expect(screen.getByText("1 application")).toBeInTheDocument();
  });
});

describe("what a mobile record shows", () => {
  /** The stacked records, as opposed to the desktop table beside them. */
  function mobileList() {
    return screen.getByRole("list");
  }

  it("stacks records instead of compressing the table", async () => {
    await renderList({
      rows: [
        application(),
        application({ id: "22222222-2222-4222-8222-222222222222" }),
      ],
    });

    expect(within(mobileList()).getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps the logo, employer, role, rail, status and context together", async () => {
    await renderList({
      rows: [
        application({
          company_domain: "rbc.com",
          next_action: "Follow up",
          next_action_due_date: "2026-08-28",
        }),
      ],
      history: [
        { application_id: "11111111-1111-4111-8111-111111111111", new_status: "Applied" },
      ],
    });

    const record = within(mobileList()).getAllByRole("listitem")[0];

    expect(within(record).getByRole("link", { name: "RBC" })).toBeInTheDocument();
    expect(within(record).getByText("Business Analyst Intern")).toBeInTheDocument();
    expect(
      within(record).getByRole("img", { name: /lifecycle progress/i }),
    ).toBeInTheDocument();
    expect(within(record).getByText("Applied")).toBeInTheDocument();
    expect(within(record).getByText(/Toronto · Winter 2027/)).toBeInTheDocument();
    expect(within(record).getByText(/Next Aug 28, 2026/)).toBeInTheDocument();
  });

  it("leaves the date out entirely when there is none to show", async () => {
    await renderList({ rows: [application({ application_deadline: null })] });

    const record = within(mobileList()).getAllByRole("listitem")[0];

    expect(within(record).queryByText(/Next /)).not.toBeInTheDocument();
  });
});

describe("the date a row surfaces", () => {
  it("prefers a recorded next-action due date", async () => {
    await renderList({
      rows: [
        application({
          next_action: "Follow up with recruiter",
          next_action_due_date: "2026-08-28",
          application_deadline: "2026-09-21",
        }),
      ],
    });

    expect(screen.getAllByText(/Aug 28, 2026/).length).toBeGreaterThan(0);
  });

  it("falls back to the deadline before anything has been submitted", async () => {
    await renderList({
      rows: [
        application({
          date_applied: null,
          current_status: "Interested",
          application_deadline: "2026-09-03",
        }),
      ],
    });

    expect(screen.getAllByText(/Sep 3, 2026/).length).toBeGreaterThan(0);
  });

  it("shows a dash when the record carries neither", async () => {
    await renderList({ rows: [application({ application_deadline: null })] });

    expect(screen.getAllByLabelText("Not set").length).toBeGreaterThan(0);
  });
});

describe("when status history cannot be read", () => {
  it("still renders the list", async () => {
    await renderList({ historyFails: true });

    expect(screen.getAllByRole("link", { name: "RBC" }).length).toBeGreaterThan(0);
  });

  it("keeps the exact status rather than guessing at progress", async () => {
    await renderList({ historyFails: true });

    expect(screen.getAllByText("Applied").length).toBeGreaterThan(0);
    expect(screen.queryByRole("img", { name: /lifecycle progress/i })).not
      .toBeInTheDocument();
  });
});

describe("reading history for the whole list", () => {
  it("asks for the student's history once, not once per row", async () => {
    await renderList({
      rows: [
        application(),
        application({ id: "22222222-2222-4222-8222-222222222222" }),
        application({ id: "33333333-3333-4333-8333-333333333333" }),
      ],
    });

    expect(listStatusHistory).toHaveBeenCalledTimes(1);
    // Owner-scoped, and never narrowed by anything the URL supplied.
    expect(listStatusHistory).toHaveBeenCalledWith(
      supabase,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("gives each row its own rail from that one read", async () => {
    await renderList({
      rows: [
        application({ current_status: "Applied" }),
        application({
          id: "22222222-2222-4222-8222-222222222222",
          company_name: "KPMG",
          current_status: "Rejected",
        }),
      ],
      history: [
        { application_id: "11111111-1111-4111-8111-111111111111", new_status: "Applied" },
        { application_id: "22222222-2222-4222-8222-222222222222", new_status: "Applied" },
        { application_id: "22222222-2222-4222-8222-222222222222", new_status: "Rejected" },
      ],
    });

    const rails = screen
      .getAllByRole("img", { name: /lifecycle progress/i })
      .map((rail) => rail.getAttribute("aria-label"));

    // The rejected one never went through In process, and does not claim to.
    expect(rails.some((label) => label?.includes("Outcome current stage"))).toBe(true);
    expect(rails.every((label) => label?.includes("In process not reached"))).toBe(true);
  });
});

describe("the empty states", () => {
  it("tells a student with nothing saved how to start", async () => {
    await renderList({ rows: [] });

    expect(screen.getByText("No applications yet")).toBeInTheDocument();
  });

  it("offers a way out when filters match nothing", async () => {
    await renderList({ rows: [], filters: { search: "nothing" } });

    expect(
      screen.getByText("No applications match these filters"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("reports a failed read without pretending the list is empty", async () => {
    listActiveApplications.mockResolvedValue({
      data: null,
      error: { code: "PGRST500" },
    });
    listStatusHistory.mockResolvedValue({ data: [], error: null });

    render(await ApplicationList({ filters: {} }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not be loaded/i,
    );
  });
});
