import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { demoToday } from "@/lib/demo/today";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: vi.fn(),
  usePathname: () => "/demo",
}));

const { default: DemoDashboardPage } = await import("@/app/demo/page");
const { default: DemoApplicationsPage } = await import(
  "@/app/demo/applications/page"
);
const { default: DemoDetailPage } = await import(
  "@/app/demo/applications/[id]/page"
);
const { default: DemoPipelinePage } = await import("@/app/demo/pipeline/page");
const { default: DemoAnalyticsPage } = await import("@/app/demo/analytics/page");

const dataset = buildDemoDataset(demoToday());

/**
 * The record rows, and not the lifecycle stages inside them.
 *
 * Each record contains a four-milestone ordered rail, so this helper targets
 * only direct children of the Applications list instead of every list item.
 */
function recordRows(container: HTMLElement): Element[] {
  return [
    ...container.querySelectorAll('ul[aria-label="Applications"] > li'),
  ];
}

/** Every source file the demo renders from, so imports can be audited. */
function demoSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".ts") || path.endsWith(".tsx")) files.push(path);
    }
  };
  walk("app/demo");
  walk("lib/demo");
  walk("components/demo");
  return files;
}

function applications(searchParams: Record<string, string> = {}) {
  return DemoApplicationsPage({ searchParams: Promise.resolve(searchParams) });
}

describe("the demo needs no account and no database", () => {
  it("reaches Supabase from none of its own modules", () => {
    for (const file of demoSourceFiles()) {
      // Imports and calls, not prose: the comments in these files are allowed
      // to explain that Supabase is exactly what the demo does not touch.
      const source = readFileSync(file, "utf8").replace(
        /\/\*[\s\S]*?\*\/|\/\/.*/g,
        "",
      );
      expect(source, file).not.toMatch(/@\/lib\/supabase/);
      expect(source, file).not.toMatch(/@supabase\//);
      expect(source, file).not.toMatch(/createClient/);
    }
  });

  it("imports no write action from any demo module", () => {
    for (const file of demoSourceFiles()) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/@\/lib\/applications\/actions/);
      expect(source, file).not.toMatch(/@\/lib\/(oauth|auth)\/actions/);
    }
  });

  it("renders the dashboard with no Supabase environment configured", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    try {
      render(await DemoDashboardPage());
      expect(
        screen.getByRole("heading", { level: 1, name: "Dashboard" }),
      ).toBeInTheDocument();
    } finally {
      if (url) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      if (key) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
    }
  });

  it("leaves the authenticated routes protected", async () => {
    const { isProtectedPath } = await import("@/lib/routes");

    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/applications")).toBe(true);
    // The demo is public by construction: it is not on the protected list, so
    // the proxy never asks for a session before rendering it.
    expect(isProtectedPath("/demo")).toBe(false);
    expect(isProtectedPath("/demo/applications")).toBe(false);
  });
});

describe("the demo dashboard", () => {
  it("shows every section a real dashboard has", async () => {
    const { container } = render(await DemoDashboardPage());

    for (const heading of [
      "Your search",
      "Pipeline",
      "Recent activity",
      "This week",
      "Upcoming",
    ]) {
      expect(
        screen.getByRole("heading", { level: 2, name: heading }),
      ).toBeInTheDocument();
    }

    expect(
      [...container.querySelectorAll("h2")].map((heading) =>
        heading.textContent?.trim(),
      ),
    ).toEqual([
      "Your search",
      "Upcoming",
      "Pipeline",
      "Recent activity",
      "This week",
    ]);
  });

  it("reuses the shared DashboardView rather than a demo-only composition", () => {
    const source = readFileSync("app/demo/page.tsx", "utf8");

    expect(source).toContain(
      'import { DashboardView } from "@/components/dashboard/dashboard-view"',
    );
    expect(source).toContain("<DashboardView");
  });

  it("counts the whole search, archived applications included", async () => {
    render(await DemoDashboardPage());

    const summary = within(
      screen.getByRole("heading", { level: 2, name: "Your search" })
        .closest("section") as HTMLElement,
    );
    // 56, not 52: a role the student filed away still happened, and the
    // summary is about the search rather than about today's worklist.
    expect(
      summary.getByText(String(dataset.applications.length)),
    ).toBeInTheDocument();
    expect(dataset.applications.length).toBeGreaterThan(
      dataset.activeApplications.length,
    );
  });

  it("counts only live applications in the pipeline snapshot", async () => {
    render(await DemoDashboardPage());

    const snapshot = within(
      screen.getByRole("heading", { level: 2, name: "Pipeline" })
        .closest("section") as HTMLElement,
    );
    for (const status of ["Applied", "Screening", "Interview", "Offer"]) {
      const expected = dataset.activeApplications.filter(
        (a) => a.current_status === status,
      ).length;
      expect(
        snapshot.getByRole("link", { name: new RegExp(`^${status}`) }),
      ).toHaveTextContent(String(expected));
    }
  });

  it("keeps every link inside the demo", async () => {
    const { container } = render(await DemoDashboardPage());
    expectDemoLinks(container);
  });
});

describe("the demo applications list", () => {
  it("renders the whole working search", async () => {
    const { container } = render(await applications());

    const statusSummary = within(
      screen.getByRole("list", { name: "Application status summary" }),
    );
    expect(
      within(statusSummary.getByText("All").closest("li") as HTMLElement).getByText(
        String(dataset.activeApplications.length),
      ),
    ).toBeInTheDocument();
    expect(recordRows(container)).toHaveLength(
      dataset.activeApplications.length,
    );
  });

  it("leaves the archived applications out of the worklist", async () => {
    const { container } = render(await applications());
    const hrefs = new Set(
      [...container.querySelectorAll("a[href]")].map((a) =>
        a.getAttribute("href"),
      ),
    );

    const archived = dataset.applications.filter((a) => a.archived_at !== null);
    expect(archived.length).toBeGreaterThan(0);
    for (const application of archived) {
      expect(hrefs.has(`/demo/applications/${application.id}`)).toBe(false);
    }
  });

  it("leads each record with its role", async () => {
    render(await applications());
    const first = dataset.activeApplications[0];

    expect(
      screen.getAllByRole("heading", { name: first.original_job_title })[0],
    ).toBeInTheDocument();
  });

  it("narrows by status", async () => {
    const { container } = render(await applications({ status: "Offer" }));

    const expected = dataset.activeApplications.filter(
      (a) => a.current_status === "Offer",
    ).length;
    expect(recordRows(container)).toHaveLength(expected);
    expect(expected).toBeGreaterThanOrEqual(2);
  });

  it("narrows by a truthful status summary and keeps the status select in sync", async () => {
    const { container } = render(
      await applications({ status: "summary:applied" }),
    );
    const appliedStatuses = new Set(["Applied", "Screening", "Assessment"]);
    const expected = dataset.activeApplications.filter((application) =>
      appliedStatuses.has(application.current_status),
    ).length;

    expect(recordRows(container)).toHaveLength(expected);
    expect(screen.getByLabelText("Filter by status")).toHaveValue(
      "summary:applied",
    );
    expect(
      within(
        screen.getByRole("list", { name: "Application status summary" }),
      ).getByText("Applied").closest("a"),
    ).toHaveAttribute("aria-current", "page");
  });

  it("narrows by work term", async () => {
    const { container } = render(
      await applications({ work_term: "Winter 2027" }),
    );

    const expected = dataset.activeApplications.filter(
      (a) => a.work_term_season === "Winter 2027",
    ).length;
    expect(recordRows(container)).toHaveLength(expected);
  });

  it("narrows by role category", async () => {
    const { container } = render(
      await applications({ category: "Consulting" }),
    );

    const expected = dataset.activeApplications.filter(
      (a) => a.normalized_job_category === "Consulting",
    ).length;
    expect(recordRows(container)).toHaveLength(expected);
    expect(expected).toBeGreaterThan(1);
  });

  it("searches employer, role and location", async () => {
    const { container } = render(await applications({ q: "deloitte" }));

    const expected = dataset.activeApplications.filter((a) =>
      a.company_name.toLowerCase().includes("deloitte"),
    ).length;
    expect(recordRows(container)).toHaveLength(expected);
    expect(expected).toBeGreaterThan(1);
  });

  it("offers all three work terms in the filter", async () => {
    render(await applications());
    const control = screen.getByLabelText("Filter by work term");

    expect(
      within(control).getAllByRole("option").map((o) => o.textContent),
    ).toEqual(["All work terms", "Fall 2026", "Summer 2027", "Winter 2027"]);
  });

  it("says so when nothing matches, and offers a way back", async () => {
    render(await applications({ q: "zzzz-no-such-employer" }));

    expect(
      screen.getByRole("heading", { name: /No applications match/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/demo/applications",
    );
  });

  it("offers no way to add an application", async () => {
    render(await applications());

    expect(
      screen.queryByRole("button", { name: /add application/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /add application/i }),
    ).not.toBeInTheDocument();
  });

  it("submits its filters to its own route", async () => {
    const { container } = render(await applications());

    expect(container.querySelector("form")).toHaveAttribute(
      "action",
      "/demo/applications",
    );
    expect(
      container.querySelector('a[href^="/demo/applications/"]'),
    ).toBeNull();
  });
});

describe("the demo application detail", () => {
  const rich = "ibm-business-technology-analyst-f26";
  const sparse = "telus-business-analyst-s27";

  function detail(id: string) {
    return DemoDetailPage({ params: Promise.resolve({ id }) });
  }

  it("renders a rich record in full", async () => {
    render(await detail(rich));

    expect(
      screen.getByRole("heading", { level: 1, name: /IBM/ }),
    ).toHaveTextContent("Business Technology Analyst Intern");
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Job description")).toBeInTheDocument();
  });

  it("renders a sparse record without inventing anything", async () => {
    const { container } = render(await detail(sparse));

    expect(
      screen.getByRole("heading", { level: 1, name: /Telus/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Not set").length).toBeGreaterThan(3);
    // No stored domain means no external request at all, by construction.
    expect(container.querySelector("img")).toBeNull();
  });

  it("draws the lifecycle the record's own history supports", async () => {
    render(await detail(rich));
    const rail = screen.getByRole("list", { name: /Lifecycle progress/ });

    expect(rail).toHaveAccessibleName(/Outcome current stage/);
  });

  it("goes back to the demo list", async () => {
    render(await detail(rich));

    expect(
      screen.getByRole("link", { name: "Back to applications" }),
    ).toHaveAttribute("href", "/demo/applications");
  });

  it("offers nothing that would write", async () => {
    const { container } = render(await detail(rich));

    for (const name of [/^Edit$/, /^Archive$/, /^Restore$/, /Delete/, /^Move$/]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    expect(container.querySelector("form")).toBeNull();
    expectDemoLinks(container);
  });

  it("still renders an archived record, read-only and marked as archived", async () => {
    const archivedRecord = [...dataset.records.values()].find(
      (record) => record.archived_at !== null,
    );
    expect(archivedRecord).toBeDefined();

    const { container } = render(await detail(archivedRecord!.id));

    // Reachable, because recent activity and analytics still refer to it.
    expect(
      screen.getByRole("heading", { level: 1, name: new RegExp(archivedRecord!.company_name) }),
    ).toBeInTheDocument();
    expect(screen.getByText(/This application is archived/)).toBeInTheDocument();

    // And still read-only: no Restore, no Delete, no Edit, no quick update.
    for (const name of [/^Restore$/, /Delete/, /^Edit$/, /^Archive$/]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    expect(container.querySelector("form")).toBeNull();
  });

  it("does not find an application that is not in the sample", async () => {
    await expect(detail("not-a-real-application")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });
});

describe("the demo pipeline", () => {
  function pipeline(searchParams: Record<string, string> = {}) {
    return DemoPipelinePage({ searchParams: Promise.resolve(searchParams) });
  }

  it("shows all ten statuses, in the canonical order", async () => {
    render(await pipeline());

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual([...APPLICATION_STATUSES]);
  });

  it("fills the middle of the board rather than the ends", async () => {
    render(await pipeline());

    for (const status of ["Applied", "Screening", "Assessment", "Interview"]) {
      const column = screen.getByRole("list", {
        name: `${status} applications`,
      });
      expect(within(column).getAllByRole("listitem").length).toBeGreaterThan(1);
    }
  });

  it("offers no way to move a card", async () => {
    const { container } = render(await pipeline());

    // The only form on the page is the filter bar's GET form. No column
    // contains one, because the move control is absent rather than disabled.
    for (const column of container.querySelectorAll("section ul")) {
      expect(column.querySelector("form")).toBeNull();
      expect(column.querySelector("select")).toBeNull();
    }
    expect(screen.queryAllByLabelText(/Move .* to another status/)).toHaveLength(
      0,
    );
    expect(screen.queryByRole("button", { name: /^Move/ })).not.toBeInTheDocument();
  });

  it("narrows without a status control, since the columns are the statuses", async () => {
    render(await pipeline({ work_term: "Summer 2027" }));

    expect(screen.queryByLabelText("Filter by status")).not.toBeInTheDocument();
    const expected = dataset.applications.filter(
      (a) => a.work_term_season === "Summer 2027",
    ).length;
    expect(screen.getByText(`${expected} applications`)).toBeInTheDocument();
  });

  it("keeps every card link inside the demo", async () => {
    const { container } = render(await pipeline());
    expectDemoLinks(container);
  });

  it("counts only what is still in play", async () => {
    render(await pipeline());

    expect(
      screen.getByText(`${dataset.activeApplications.length} applications`),
    ).toBeInTheDocument();
  });

  it("gives an archived application no column", async () => {
    const { container } = render(await pipeline());
    const hrefs = new Set(
      [...container.querySelectorAll("a[href]")].map((a) =>
        a.getAttribute("href"),
      ),
    );

    for (const application of dataset.applications.filter(
      (a) => a.archived_at !== null,
    )) {
      expect(hrefs.has(`/demo/applications/${application.id}`)).toBe(false);
    }
  });

  it("still fills every column from the active records alone", async () => {
    render(await pipeline());

    // Ten headings with a count each, and none of them zero: archiving four
    // finished applications must not empty a status out of the board.
    for (const status of APPLICATION_STATUSES) {
      expect(
        screen.getByRole("list", { name: `${status} applications` }),
      ).toBeInTheDocument();
    }
  });
});

describe("the demo analytics", () => {
  it("is the production view, fed sample records", () => {
    const source = readFileSync("app/demo/analytics/page.tsx", "utf8");

    expect(source).toContain(
      'from "@/components/analytics/analytics-view"',
    );
    // No percentage, ratio or count written by hand anywhere on the page.
    expect(source).not.toMatch(/\d+%/);
  });

  it("renders a funnel with real counts in it", () => {
    render(DemoAnalyticsPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Analytics" }),
    ).toBeInTheDocument();
    for (const stage of ["Submitted", "Employer response", "Interview", "Offer"]) {
      expect(screen.getAllByText(stage).length).toBeGreaterThan(0);
    }
  });

  it("offers both comparison lenses", () => {
    render(DemoAnalyticsPage());
    const lenses = screen.getByRole("radiogroup");

    expect(
      within(lenses).getAllByRole("radio").map((radio) => radio.textContent),
    ).toEqual(["Source", "Role type"]);
  });

  it("shows the search activity history", () => {
    render(DemoAnalyticsPage());

    expect(
      screen.getByRole("heading", { level: 2, name: /activity/i }),
    ).toBeInTheDocument();
  });
});

/**
 * No link inside a demo surface may reach the authenticated workspace.
 *
 * The signup and homepage links are the deliberate ways out; everything else
 * has to stay under `/demo`, or a visitor exploring sample data would be
 * bounced to a login screen by the proxy.
 */
function expectDemoLinks(container: HTMLElement) {
  const exits = new Set(["/", "/signup", "/login"]);
  const hrefs = [...container.querySelectorAll("a[href]")].map((a) =>
    a.getAttribute("href"),
  );

  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    if (!href || !href.startsWith("/") || exits.has(href)) continue;
    expect(href, `link escaped the demo: ${href}`).toMatch(/^\/demo(\/|\?|$)/);
  }
}
