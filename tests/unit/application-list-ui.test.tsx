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
    expect(record.textContent).toContain("Next: Follow up");
    expect(record.textContent).toContain("Aug 28, 2026");
  });

  it("leaves the date out entirely when there is none to show", async () => {
    await renderList({ rows: [application({ application_deadline: null })] });

    const record = within(mobileList()).getAllByRole("listitem")[0];

    expect(record.textContent).not.toContain("Next:");
    expect(record.textContent).not.toContain("Deadline:");
  });

  it("names a next action as Next, since there is no column heading here", async () => {
    await renderList({
      rows: [
        application({
          next_action: "Follow up with recruiter",
          next_action_due_date: "2026-08-28",
        }),
      ],
    });

    const record = within(mobileList()).getAllByRole("listitem")[0];

    expect(record.textContent).toContain("Next: Follow up");
    expect(record.textContent).toContain("Aug 28, 2026");
  });

  it("names a pre-submission deadline as Deadline", async () => {
    await renderList({
      rows: [
        application({
          current_status: "Interested",
          application_deadline: "2026-09-03",
        }),
      ],
    });

    const record = within(mobileList()).getAllByRole("listitem")[0];

    expect(record.textContent).toContain("Deadline: Sep 3, 2026");
    expect(record.textContent).not.toContain("Next:");
  });

  it("shows no deadline on a submitted application", async () => {
    await renderList({
      rows: [
        application({
          current_status: "Applied",
          date_applied: null,
          application_deadline: "2026-09-21",
        }),
      ],
    });

    const record = within(mobileList()).getAllByRole("listitem")[0];

    expect(record.textContent).not.toContain("Deadline");
  });
});

describe("the date a row surfaces", () => {
  /** The date under the desktop "Next" heading, or null when there is none. */
  function nextColumn() {
    const row = within(screen.getByRole("table")).getAllByRole("row")[1];
    const cell = within(row).getAllByRole("cell")[3];
    return cell.textContent?.trim() ?? "";
  }

  it("names the action, then dates it", async () => {
    await renderList({
      rows: [
        application({
          next_action: "Follow up with recruiter",
          next_action_due_date: "2026-08-28",
          application_deadline: "2026-09-21",
        }),
      ],
    });

    // A bare date under a "Next" heading never said next what.
    expect(nextColumn()).toBe("Follow up with recruiterAug 28, 2026");
  });

  it("shows a deadline while the application is still only Interested", async () => {
    await renderList({
      rows: [
        application({
          current_status: "Interested",
          application_deadline: "2026-09-03",
        }),
      ],
    });

    expect(nextColumn()).toBe("DeadlineSep 3, 2026");
  });

  it("shows a deadline while the application is still being Prepared", async () => {
    await renderList({
      rows: [
        application({
          current_status: "Preparing",
          application_deadline: "2026-09-03",
        }),
      ],
    });

    expect(nextColumn()).toBe("DeadlineSep 3, 2026");
  });

  it("lets an explicit next action outrank a deadline before submission", async () => {
    await renderList({
      rows: [
        application({
          current_status: "Interested",
          next_action: "Ask for a referral",
          next_action_due_date: "2026-08-28",
          application_deadline: "2026-09-03",
        }),
      ],
    });

    expect(nextColumn()).toBe("Ask for a referralAug 28, 2026");
  });

  it("shows a dash when the record carries neither", async () => {
    await renderList({ rows: [application({ application_deadline: null })] });

    expect(nextColumn()).toBe("—");
  });
});

describe("a deadline stops being a next date once the application is out", () => {
  function nextColumn() {
    const row = within(screen.getByRole("table")).getAllByRole("row")[1];
    return within(row).getAllByRole("cell")[3].textContent?.trim() ?? "";
  }

  // The deadline stays on the record; it just is not something still to do.
  const submitted = [
    "Applied",
    "Screening",
    "Assessment",
    "Interview",
    "Offer",
    "Rejected",
    "Withdrawn",
    "Accepted",
  ] as const;

  for (const status of submitted) {
    it(`hides a stored deadline at ${status}`, async () => {
      cleanup();
      await renderList({
        rows: [
          application({
            current_status: status,
            application_deadline: "2026-09-21",
            next_action: null,
            next_action_due_date: null,
          }),
        ],
      });

      expect(nextColumn()).toBe("—");
    });
  }

  it("hides it even when no applied date was ever recorded", async () => {
    // `date_applied` is optional, so it can never be the test for whether an
    // application went out.
    await renderList({
      rows: [
        application({
          current_status: "Applied",
          date_applied: null,
          application_deadline: "2026-09-21",
        }),
      ],
    });

    expect(nextColumn()).toBe("—");
  });

  it("still shows a next action once submitted", async () => {
    await renderList({
      rows: [
        application({
          current_status: "Applied",
          date_applied: null,
          next_action: "Follow up with recruiter",
          next_action_due_date: "2026-08-28",
          application_deadline: "2026-09-21",
        }),
      ],
    });

    expect(nextColumn()).toBe("Follow up with recruiterAug 28, 2026");
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
