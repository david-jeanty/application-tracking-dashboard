import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
const listActiveApplicationSummaryStatuses = vi.fn();
const listApplicationPreviewContent = vi.fn();
const listStatusHistory = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/applications/repository", () => ({
  listActiveApplications: (...args: unknown[]) => listActiveApplications(...args),
  listActiveApplicationSummaryStatuses: (...args: unknown[]) =>
    listActiveApplicationSummaryStatuses(...args),
  listApplicationPreviewContent: (...args: unknown[]) =>
    listApplicationPreviewContent(...args),
  listStatusHistory: (...args: unknown[]) => listStatusHistory(...args),
}));

const { ApplicationList } = await import(
  "@/components/applications/application-list"
);
const { ApplicationRecords } = await import(
  "@/components/applications/application-records"
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
  const rows = options.rows ?? [application()];
  listActiveApplicationSummaryStatuses.mockResolvedValue({
    data: rows.map((row) => ({ current_status: row.current_status })),
    error: null,
  });
  listApplicationPreviewContent.mockResolvedValue({ data: [], error: null });

  return render(await ApplicationList({ filters: options.filters ?? {} }));
}

beforeEach(() => {
  listActiveApplications.mockReset();
  listActiveApplicationSummaryStatuses.mockReset();
  listApplicationPreviewContent.mockReset();
  listStatusHistory.mockReset();
  setDesktopViewport(true);
});

function setDesktopViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

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

  it("summarises only the filtered records it is showing", async () => {
    await renderList({
      rows: [
        application({ current_status: "Interested" }),
        application({
          id: "22222222-2222-4222-8222-222222222222",
          current_status: "Screening",
        }),
        application({
          id: "33333333-3333-4333-8333-333333333333",
          current_status: "Interview",
        }),
        application({
          id: "44444444-4444-4444-8444-444444444444",
          current_status: "Accepted",
        }),
        application({
          id: "55555555-5555-4555-8555-555555555555",
          current_status: "Rejected",
        }),
      ],
    });

    const summary = within(
      screen.getByRole("list", { name: "Application status summary" }),
    );
    const count = (label: string) =>
      within(summary.getByText(label).closest("li") as HTMLElement).getByText(
        /^\d+$/,
      );

    expect(count("All")).toHaveTextContent("5");
    expect(count("Saved")).toHaveTextContent("1");
    expect(count("Applied")).toHaveTextContent("1");
    expect(count("Interview")).toHaveTextContent("1");
    expect(count("Offer")).toHaveTextContent("1");
  });

  it("renders every summary segment as an accessible URL-backed filter", () => {
    render(
      <ApplicationRecords
        applications={[application()]}
        basePath="/demo"
        filters={{
          search: "analyst",
          statusSummary: "applied",
          workTermSeason: "Winter 2027",
          category: "Finance",
        }}
        history={[]}
        summaryStatuses={["Interested", "Applied", "Rejected", "Accepted"]}
      />,
    );

    const summary = screen.getByRole("list", {
      name: "Application status summary",
    });
    const linkFor = (label: string) =>
      within(summary).getByText(label).closest("a") as HTMLAnchorElement;

    expect(linkFor("Applied")).toHaveAttribute("aria-current", "page");
    expect(linkFor("All").href).toContain("q=analyst");
    expect(linkFor("All").href).toContain("work_term=Winter+2027");
    expect(linkFor("All").href).toContain("category=Finance");
    expect(linkFor("All").href).not.toContain("status=");
    expect(linkFor("Saved").href).toContain("status=summary%3Asaved");
    expect(linkFor("Applied").href).toContain("status=summary%3Aapplied");
    expect(linkFor("Interview").href).toContain("status=summary%3Ainterview");
    expect(linkFor("Offer").href).toContain("status=summary%3Aoffer");
  });
});

describe("the desktop selected-record workspace", () => {
  it("starts full-width with no selected preview", () => {
    const { container } = render(
      <ApplicationRecords
        applications={[application({ application_deadline: "2026-09-03" })]}
        history={[]}
      />,
    );

    expect(container.querySelector('[data-layout="full"]')).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", {
        name: "Selected application preview",
      }),
    ).not.toBeInTheDocument();
  });

  it("opens one useful preview and closes back to the full-width list", () => {
    const { container } = render(
      <ApplicationRecords
        applications={[application({ application_deadline: "2026-09-03" })]}
        history={[]}
        previewContent={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            job_description: "Build financial models and prepare recommendations.",
            salary: "$24/hour",
            notes: "Recruiter asked for a writing sample.",
          },
        ]}
      />,
    );

    const row = screen.getByRole("link", { name: "Business Analyst Intern" });
    expect(fireEvent.click(row)).toBe(false);

    const preview = screen.getByRole("complementary", {
      name: "Selected application preview",
    });
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
    expect(container.querySelector('[data-layout="preview"]')).toBeInTheDocument();
    expect(preview).toHaveTextContent("Business Analyst Intern");
    const jobDescription = within(preview).getByText("Job description").closest("details");
    const notes = within(preview).getByText("Notes").closest("details");
    expect(jobDescription).not.toHaveAttribute("open");
    expect(notes).not.toHaveAttribute("open");
    expect(preview).toHaveTextContent("$24/hour");
    expect(preview).not.toHaveTextContent("Not recorded");
    expect(
      within(preview).getByRole("link", { name: "Open full application" }),
    ).toHaveAttribute(
      "href",
      "/applications/11111111-1111-4111-8111-111111111111",
    );

    fireEvent.click(
      within(preview).getByRole("button", {
        name: "Close application preview",
      }),
    );
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(container.querySelector('[data-layout="full"]')).toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it("updates the one preview and resets its internal scroll position", () => {
    render(
      <ApplicationRecords
        applications={[
          application(),
          application({
            id: "22222222-2222-4222-8222-222222222222",
            original_job_title: "Strategy Intern",
          }),
        ]}
        history={[]}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "Business Analyst Intern" }));
    const firstPreview = screen.getByRole("complementary", {
      name: "Selected application preview",
    });
    expect(firstPreview).toHaveAttribute("data-sticky-preview");
    expect(firstPreview).toHaveClass("sticky", "overflow-y-auto");
    firstPreview.scrollTop = 240;

    const strategyRow = screen.getByRole("link", { name: "Strategy Intern" });
    expect(fireEvent.click(strategyRow)).toBe(false);

    const preview = screen.getByRole("complementary", {
      name: "Selected application preview",
    });
    expect(preview.scrollTop).toBe(0);
    expect(within(preview).getByRole("heading", { name: "Strategy Intern" })).toBeInTheDocument();
    expect(within(preview).queryByRole("heading", { name: "Business Analyst Intern" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
    expect(strategyRow).toHaveAttribute("aria-expanded", "true");
  });

  it("returns to the full-width list when filtering removes the selection", () => {
    const first = application();
    const second = application({
      id: "22222222-2222-4222-8222-222222222222",
      original_job_title: "Strategy Intern",
    });
    const view = render(
      <ApplicationRecords applications={[first, second]} history={[]} />,
    );

    fireEvent.click(screen.getByRole("link", { name: "Strategy Intern" }));
    view.rerender(<ApplicationRecords applications={[first]} history={[]} />);

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(view.container.querySelector('[data-layout="full"]')).toBeInTheDocument();
    expect(records()).toHaveLength(1);
  });

  it("keeps the desktop demo preview read-only without a detail-route link", () => {
    const { container } = render(
      <ApplicationRecords
        applications={[
          application(),
          application({
            id: "22222222-2222-4222-8222-222222222222",
            original_job_title: "Strategy Intern",
          }),
        ]}
        basePath="/demo"
        history={[]}
      />,
    );

    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /archive|restore|delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open full application" })).not.toBeInTheDocument();
    expect(
      container.querySelector('a[href^="/demo/applications/"]'),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Strategy Intern" }),
    );
    expect(
      within(
        screen.getByRole("complementary", {
          name: "Selected application preview",
        }),
      ).getByRole("heading", { name: "Strategy Intern" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close application preview" }),
    ).toBeInTheDocument();
  });

  it("expands demo record context in place below desktop", () => {
    setDesktopViewport(false);
    const { container } = render(
      <ApplicationRecords
        applications={[
          application({
            application_deadline: "2026-09-03",
            next_action: "Follow up",
            next_action_due_date: "2026-08-28",
          }),
        ]}
        basePath="/demo"
        history={[]}
      />,
    );

    const row = screen.getByRole("button", {
      name: "Show details for Business Analyst Intern",
    });
    expect(row).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(row);

    const context = screen.getByRole("region", {
      name: "Business Analyst Intern details",
    });
    expect(context).toHaveTextContent("Business Analysis");
    expect(context).toHaveTextContent("Hybrid");
    expect(context).toHaveTextContent("Sep 3, 2026");
    expect(context).toHaveTextContent("Follow up");
    expect(
      screen.getByRole("button", {
        name: "Hide details for Business Analyst Intern",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      container.querySelector('a[href^="/demo/applications/"]'),
    ).toBeNull();
  });

  it("uses the production detail route below desktop instead of activating the preview", () => {
    setDesktopViewport(false);
    render(<ApplicationRecords applications={[application()]} history={[]} />);

    const row = screen.getByRole("link", { name: "Business Analyst Intern" });
    expect(row).toHaveAttribute(
      "href",
      "/applications/11111111-1111-4111-8111-111111111111",
    );
    expect(fireEvent.click(row)).toBe(true);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("makes every row a labelled keyboard-focusable record control", () => {
    render(<ApplicationRecords applications={[application()]} history={[]} />);

    const row = screen.getByRole("link", { name: "Business Analyst Intern" });
    row.focus();
    expect(row).toHaveFocus();
    expect(row).toHaveAttribute("aria-controls");
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
    expect(record.querySelector("[data-next-context]")).toBeNull();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
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

  it("removes the Next column when no record carries useful context", async () => {
    await renderList({ rows: [application({ application_deadline: null })] });

    expect(records()[0].querySelector("[data-next-context]")).toBeNull();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });

  it("keeps next metadata inline without a permanent column or placeholders", async () => {
    await renderList({
      rows: [
        application({
          next_action: "Follow up with recruiter",
          next_action_due_date: "2026-08-28",
        }),
        application({
          id: "22222222-2222-4222-8222-222222222222",
          original_job_title: "Strategy Intern",
        }),
      ],
    });

    expect(screen.queryByText("Next")).not.toBeInTheDocument();
    expect(records()[0]).toHaveTextContent("Follow up with recruiter");
    expect(records()[1].querySelector("[data-next-context]")).toBeNull();
    expect(
      records()[0].querySelector("[data-next-context]"),
    ).not.toHaveTextContent(/^—$/);
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

      expect(records()[0].querySelector("[data-next-context]")).toBeNull();
      expect(screen.queryByText("Next")).not.toBeInTheDocument();
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

    expect(records()[0].querySelector("[data-next-context]")).toBeNull();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
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
  it("loads preview content once for only the filtered application ids", async () => {
    const first = application();
    const second = application({
      id: "22222222-2222-4222-8222-222222222222",
    });

    await renderList({ rows: [first, second] });

    expect(listApplicationPreviewContent).toHaveBeenCalledTimes(1);
    expect(listApplicationPreviewContent).toHaveBeenCalledWith(
      supabase,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      [first.id, second.id],
    );
  });

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

    // The index rail uses four milestones and never calls a rejection an offer.
    expect(rails.some((label) => label?.includes("Outcome current stage"))).toBe(true);
    expect(rails.every((label) => !label?.includes("In process"))).toBe(true);
    expect(rails.every((label) => !label?.includes("Offer current stage"))).toBe(true);
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
    listActiveApplicationSummaryStatuses.mockResolvedValue({
      data: [],
      error: null,
    });

    render(await ApplicationList({ filters: {} }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not be loaded/i,
    );
  });
});
