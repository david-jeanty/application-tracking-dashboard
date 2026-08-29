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
const { ApplicationRecords } = await import(
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

/** The application records: the list's own children, not the rails inside. */
function records(): HTMLElement[] {
  const list = screen.getByRole("list", { name: "Applications" });
  return Array.from(list.children) as HTMLElement[];
}

describe("what a record shows", () => {
  it("leads with the role, and links it to the record", async () => {
    await renderList();

    // The role leads in the list; the employer follows it.
    expect(
      screen.getByRole("link", { name: "Business Analyst Intern" }),
    ).toHaveAttribute("href", "/applications/11111111-1111-4111-8111-111111111111");
    expect(records()[0].textContent).toContain("RBC");
  });

  it("shows the lifecycle rail and the exact status together", async () => {
    await renderList({ history: [{ application_id: "11111111-1111-4111-8111-111111111111", new_status: "Applied" }] });

    expect(
      screen.getAllByRole("list", { name: /lifecycle progress/i }).length,
    ).toBeGreaterThan(0);
    // The rail summarises; the exact status is still there in words.
    expect(records()[0].textContent).toContain("Applied");
  });

  it("shows location and work term, and neither category nor applied date", async () => {
    await renderList();
    const record = records()[0];

    expect(record.textContent).toContain("Toronto");
    expect(record.textContent).toContain("Winter 2027");
    expect(record.textContent).not.toContain("Business Analysis");
    expect(record.textContent).not.toContain("Aug 22, 2026");
  });

  it("is a list of records rather than a table", async () => {
    await renderList();

    // Nothing here is compared column against column; each row is one record.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(records()).toHaveLength(1);
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

describe("the wide-screen selected-record preview", () => {
  it("defaults to the first visible record", () => {
    render(
      <ApplicationRecords
        applications={[
          application(),
          application({
            id: "22222222-2222-4222-8222-222222222222",
            company_name: "BMO",
            original_job_title: "Project Coordinator",
          }),
        ]}
        history={[]}
      />,
    );

    expect(
      screen.getByRole("complementary", {
        name: "Selected application: Business Analyst Intern",
      }),
    ).toBeInTheDocument();
  });

  it("shows the selected record and preserves active filters in preview links", () => {
    render(
      <ApplicationRecords
        applications={[
          application(),
          application({
            id: "22222222-2222-4222-8222-222222222222",
            company_name: "BMO",
            original_job_title: "Project Coordinator",
          }),
        ]}
        filters={{ search: "coordinator", status: "Applied" }}
        history={[]}
        selectedId="22222222-2222-4222-8222-222222222222"
      />,
    );

    const preview = screen.getByRole("complementary", {
      name: "Selected application: Project Coordinator",
    });
    expect(preview.textContent).toContain("BMO");
    expect(
      screen.getByRole("link", { name: "Preview Business Analyst Intern" }),
    ).toHaveAttribute(
      "href",
      "/applications?selected=11111111-1111-4111-8111-111111111111&q=coordinator&status=Applied",
    );
    expect(
      within(preview).getByRole("link", { name: "Open full record" }),
    ).toHaveAttribute(
      "href",
      "/applications/22222222-2222-4222-8222-222222222222",
    );
  });

  it("keeps full-record navigation on every row for smaller screens", () => {
    render(
      <ApplicationRecords applications={[application()]} history={[]} />,
    );

    expect(
      screen.getByRole("link", { name: "Open Business Analyst Intern" }),
    ).toHaveAttribute(
      "href",
      "/applications/11111111-1111-4111-8111-111111111111",
    );
  });
});

describe("what one record carries at any width", () => {
  it("renders one record per application", async () => {
    await renderList({
      rows: [
        application(),
        application({ id: "22222222-2222-4222-8222-222222222222" }),
      ],
    });

    expect(records()).toHaveLength(2);
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

    const record = records()[0];

    expect(
      within(record).getByRole("link", { name: "Business Analyst Intern" }),
    ).toBeInTheDocument();
    expect(record.textContent).toContain("RBC");
    expect(
      within(record).getByRole("list", { name: /lifecycle progress/i }),
    ).toBeInTheDocument();
    expect(record.textContent).toContain("Applied");
    expect(record.textContent).toContain("Toronto");
    expect(record.textContent).toContain("Winter 2027");
    expect(record.textContent).toContain("Follow up");
    expect(record.textContent).toContain("Aug 28, 2026");
  });

  it("leaves the date out entirely when there is none to show", async () => {
    await renderList({ rows: [application({ application_deadline: null })] });

    const record = records()[0];

    expect(record.textContent).not.toContain("Application deadline");
    expect(record.textContent).toContain("—");
  });

  it("names the action itself, so the record reads without a column heading", async () => {
    await renderList({
      rows: [
        application({
          next_action: "Follow up with recruiter",
          next_action_due_date: "2026-08-28",
        }),
      ],
    });

    const record = records()[0];

    expect(record.textContent).toContain("Follow up with recruiter");
    expect(record.textContent).toContain("Aug 28, 2026");
  });

  it("names a pre-submission deadline in words", async () => {
    await renderList({
      rows: [
        application({
          current_status: "Interested",
          application_deadline: "2026-09-03",
        }),
      ],
    });

    const record = records()[0];

    expect(record.textContent).toContain("Application deadline");
    expect(record.textContent).toContain("Sep 3, 2026");
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

    const record = records()[0];

    expect(record.textContent).not.toContain("Application deadline");
    expect(record.textContent).not.toContain("Sep 21, 2026");
  });
});

describe("the date a row surfaces", () => {
  function nextColumn() {
    return records()[0].textContent ?? "";
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
    expect(nextColumn()).toContain("Follow up with recruiter");
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

    expect(nextColumn()).toContain("Application deadline");
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

    expect(nextColumn()).toContain("Application deadline");
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

    expect(nextColumn()).toContain("Ask for a referral");
  });

  it("shows a dash when the record carries neither", async () => {
    await renderList({ rows: [application({ application_deadline: null })] });

    expect(nextColumn()).toContain("—");
  });
});

describe("a deadline stops being a next date once the application is out", () => {
  function nextColumn() {
    return records()[0].textContent ?? "";
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

      expect(nextColumn()).toContain("—");
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

    expect(nextColumn()).toContain("—");
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

    expect(nextColumn()).toContain("Follow up with recruiter");
  });
});

describe("when status history cannot be read", () => {
  it("still renders the list", async () => {
    await renderList({ historyFails: true });

    expect(
      screen.getByRole("link", { name: "Business Analyst Intern" }),
    ).toBeInTheDocument();
  });

  it("keeps the exact status rather than guessing at progress", async () => {
    await renderList({ historyFails: true });

    expect(records()[0].textContent).toContain("Applied");
    expect(
      screen.queryByRole("list", { name: /lifecycle progress/i }),
    ).not.toBeInTheDocument();
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
      .getAllByRole("list", { name: /lifecycle progress/i })
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
