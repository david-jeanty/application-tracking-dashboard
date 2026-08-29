import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  RecentActivity,
  SavedOpportunities,
  SearchSummaryMetrics,
  ThisWeek,
  Upcoming,
} from "@/components/dashboard/dashboard-sections";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import type { AttentionItem } from "@/lib/dashboard/attention";
import type { ActivityEntry } from "@/lib/dashboard/calculate";
import type { SavedOpportunity } from "@/lib/dashboard/saved-opportunities";
import type { DashboardSummary } from "@/lib/dashboard/summary";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

function attentionItem(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    applicationId: "11111111-1111-4111-8111-111111111111",
    companyName: "KPMG Canada",
    companyDomain: "kpmg.ca",
    jobTitle: "Management Consulting Intern",
    status: "Applied",
    reason: "overdue-action",
    detail: "Follow up with recruiter",
    date: "2026-08-22",
    timing: "Overdue by 2 days",
    daysFromToday: -2,
    ...overrides,
  };
}

function activityEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    applicationId: "app-1",
    companyName: "RBC",
    companyDomain: "rbc.com",
    jobTitle: "Procurement, Business Analyst Intern",
    description: "Moved to Assessment",
    status: "Assessment",
    day: "2026-08-26",
    changedAt: "2026-08-26T12:00:00.000Z",
    ...overrides,
  };
}

function savedOpportunity(
  overrides: Partial<SavedOpportunity> = {},
): SavedOpportunity {
  return {
    applicationId: "saved-1",
    companyName: "Shopify",
    companyDomain: "shopify.com",
    jobTitle: "Business Operations Intern",
    location: "Toronto, ON",
    workTerm: "Winter 2027",
    deadline: "2026-09-03",
    savedOn: "2026-08-20",
    ...overrides,
  };
}

function readyDashboard(
  attention: AttentionItem[] = [attentionItem()],
): Extract<DashboardSummary, { kind: "ready" }> {
  return {
    kind: "ready",
    search: {
      applications: 142,
      submitted: 118,
      active: 30,
      interviews: 9,
      offers: 2,
    },
    attention,
    savedOpportunities: [savedOpportunity()],
    activity: [activityEntry()],
    week: {
      weekStart: "2026-08-24",
      submitted: 6,
      statusChanges: 3,
      interviews: 1,
    },
  };
}

describe("dashboard composition", () => {
  it("places meaningful Upcoming above the working grid and This week", () => {
    const { container } = render(
      <DashboardView dashboard={readyDashboard()} today="2026-08-26" />,
    );

    const headings = [...container.querySelectorAll("h2")].map((heading) =>
      heading.textContent?.trim(),
    );
    expect(headings).toEqual([
      "Your search",
      "Upcoming",
      "Saved opportunities",
      "Recent activity",
      "This week",
    ]);
  });

  it("removes Upcoming and lets the working grid follow the summary", () => {
    const { container } = render(
      <DashboardView dashboard={readyDashboard([])} today="2026-08-26" />,
    );

    expect(
      screen.queryByRole("heading", { level: 2, name: "Upcoming" }),
    ).toBeNull();
    expect(
      container.querySelector(
        'section[aria-labelledby="dashboard-summary"] + [data-dashboard-secondary-grid]',
      ),
    ).toBeInTheDocument();
  });

  it("lets adjacent dashboard modules keep their natural heights", () => {
    const { container } = render(
      <DashboardView dashboard={readyDashboard()} today="2026-08-26" />,
    );

    expect(
      container.querySelector("[data-dashboard-secondary-grid]"),
    ).toHaveClass("items-start");
  });

  it("removes an empty Saved opportunities module and lets activity reflow", () => {
    const dashboard = {
      ...readyDashboard(),
      savedOpportunities: [],
    };
    const { container } = render(
      <DashboardView dashboard={dashboard} today="2026-08-26" />,
    );

    expect(
      screen.queryByRole("heading", { name: "Saved opportunities" }),
    ).toBeNull();
    expect(
      container.querySelector("[data-dashboard-secondary-grid]"),
    ).toHaveClass("grid-cols-1");
    expect(
      screen.getByRole("heading", { name: "Recent activity" }),
    ).toBeInTheDocument();
  });

  it("renders the four calculated values without substituting active", () => {
    render(<DashboardView dashboard={readyDashboard()} today="2026-08-26" />);

    const summary = within(
      screen.getByRole("heading", { level: 2, name: "Your search" })
        .closest("section") as HTMLElement,
    );
    expect(summary.getByText("142")).toBeInTheDocument();
    expect(summary.getByText("118")).toBeInTheDocument();
    expect(summary.getByText("9")).toBeInTheDocument();
    expect(summary.getByText("2")).toBeInTheDocument();
    expect(summary.queryByText("30")).toBeNull();
  });

  it("keeps every working action as a keyboard-reachable link", () => {
    render(<DashboardView dashboard={readyDashboard()} today="2026-08-26" />);

    expect(screen.getByRole("link", { name: "KPMG Canada" })).toHaveAttribute(
      "href",
      "/applications/11111111-1111-4111-8111-111111111111",
    );
    expect(
      screen.getByRole("link", {
        name: "Business Operations Intern at Shopify",
      }),
    ).toHaveAttribute("href", "/applications/saved-1");
    expect(
      screen.getByRole("link", { name: /View saved applications/ }),
    ).toHaveAttribute(
      "href",
      "/applications?status=summary%3Asaved",
    );
    expect(screen.getByRole("link", { name: /View analytics/ })).toHaveAttribute(
      "href",
      "/analytics",
    );
  });
});

describe("your search", () => {
  const metrics = [
    { label: "Applications", value: 142 },
    { label: "Submitted", value: 118 },
    { label: "Interviews", value: 9 },
    { label: "Offers", value: 2 },
  ];

  it("names the four headline metrics", () => {
    render(<SearchSummaryMetrics metrics={metrics} />);

    for (const metric of metrics) {
      expect(screen.getByText(metric.label)).toBeInTheDocument();
      expect(screen.getByText(String(metric.value))).toBeInTheDocument();
    }
  });

  it("pairs each number with its label in a description list", () => {
    const { container } = render(<SearchSummaryMetrics metrics={metrics} />);

    // A `dl` rather than four headings, so the relationship between a number
    // and what it counts is in the markup and not only in the layout.
    expect(container.querySelector("dl")).toBeInTheDocument();
    expect(container.querySelectorAll("dt")).toHaveLength(4);
    expect(container.querySelectorAll("dd")).toHaveLength(4);
  });

  it("puts the term before its description in the DOM", () => {
    const { container } = render(<SearchSummaryMetrics metrics={metrics} />);

    // The visual order is number-then-label, produced by reversing the column.
    // The reading order a screen reader follows is the markup order, and a
    // description has to follow the term it describes.
    for (const pair of container.querySelectorAll("dl > div")) {
      const tags = [...pair.children].map((child) => child.tagName);
      expect(tags).toEqual(["DT", "DD"]);
    }
  });

  it("keeps each term next to its own number", () => {
    const { container } = render(<SearchSummaryMetrics metrics={metrics} />);

    const pairs = [...container.querySelectorAll("dl > div")].map((pair) => [
      pair.querySelector("dt")?.textContent,
      pair.querySelector("dd")?.textContent,
    ]);

    expect(pairs).toEqual([
      ["Applications", "142"],
      ["Submitted", "118"],
      ["Interviews", "9"],
      ["Offers", "2"],
    ]);
  });

  it("holds its shape from one digit to three", () => {
    render(
      <SearchSummaryMetrics
        metrics={[
          { label: "Applications", value: 7 },
          { label: "Submitted", value: 142 },
          { label: "Interviews", value: 0 },
          { label: "Offers", value: 12 },
        ]}
      />,
    );

    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("saved opportunities", () => {
  it("shows the role, company, placement, and deadline", () => {
    render(<SavedOpportunities opportunities={[savedOpportunity()]} />);

    expect(
      screen.getByRole("link", {
        name: "Business Operations Intern at Shopify",
      }),
    ).toHaveAttribute("href", "/applications/saved-1");
    expect(screen.getByText("Shopify")).toBeInTheDocument();
    expect(screen.getByText("Winter 2027 · Toronto, ON")).toBeInTheDocument();
    expect(screen.getByText("Apply by Sep 3, 2026")).toBeInTheDocument();
  });

  it("uses the truthful saved date when there is no deadline", () => {
    render(
      <SavedOpportunities
        opportunities={[savedOpportunity({ deadline: null })]}
      />,
    );

    expect(screen.getByText("Saved Aug 20, 2026")).toBeInTheDocument();
  });

  it("uses the existing saved-summary Applications URL", () => {
    render(<SavedOpportunities opportunities={[savedOpportunity()]} />);

    expect(
      screen.getByRole("link", { name: /View saved applications/ }),
    ).toHaveAttribute("href", "/applications?status=summary%3Asaved");
  });

  it("keeps demo links inside the read-only demo", () => {
    render(
      <SavedOpportunities
        basePath="/demo"
        opportunities={[savedOpportunity()]}
      />,
    );

    expect(
      screen.getByRole("link", {
        name: "Business Operations Intern at Shopify",
      }),
    ).toHaveAttribute("href", "/demo/applications/saved-1");
    expect(
      screen.getByRole("link", { name: /View saved applications/ }),
    ).toHaveAttribute("href", "/demo/applications?status=summary%3Asaved");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("recent activity", () => {
  it("groups entries under a day heading", () => {
    render(
      <RecentActivity
        entries={[
          activityEntry(),
          activityEntry({
            applicationId: "app-2",
            companyName: "Deloitte",
            jobTitle: "Consulting Analyst",
            description: "Saved as Interested",
            day: "2026-08-25",
            changedAt: "2026-08-25T12:00:00.000Z",
          }),
        ]}
        today="2026-08-26"
      />,
    );

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
  });

  it("names the company, the role, and what changed", () => {
    render(<RecentActivity entries={[activityEntry()]} today="2026-08-26" />);

    expect(screen.getByRole("link", { name: "RBC" })).toBeInTheDocument();
    expect(
      screen.getByText("Procurement, Business Analyst Intern"),
    ).toBeInTheDocument();
    expect(screen.getByText("Moved to Assessment")).toBeInTheDocument();
  });

  it("tells two applications at one employer apart", () => {
    const { container } = render(
      <RecentActivity
        entries={[
          activityEntry({ applicationId: "a", jobTitle: "Audit Intern" }),
          activityEntry({
            applicationId: "b",
            jobTitle: "Tax Intern",
            changedAt: "2026-08-26T09:00:00.000Z",
          }),
        ]}
        today="2026-08-26"
      />,
    );

    const rows = container.querySelectorAll("li");
    expect(within(rows[0] as HTMLElement).getByText("Audit Intern")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("Tax Intern")).toBeInTheDocument();
  });

  it("describes a creation once, as a save", () => {
    render(
      <RecentActivity
        entries={[activityEntry({ description: "Saved as Interested" })]}
        today="2026-08-26"
      />,
    );

    expect(screen.getByText("Saved as Interested")).toBeInTheDocument();
    expect(screen.queryByText(/Moved to/)).toBeNull();
  });

  it("invents no actor for an event", () => {
    render(<RecentActivity entries={[activityEntry()]} today="2026-08-26" />);

    // Provenance is not stored, so nothing here may claim who did it.
    expect(screen.queryByText(/Claude|ChatGPT|You /i)).toBeNull();
  });

  it("links each entry to its application", () => {
    render(<RecentActivity entries={[activityEntry()]} today="2026-08-26" />);

    expect(screen.getByRole("link", { name: "RBC" }).getAttribute("href")).toBe(
      "/applications/app-1",
    );
  });

  it("explains an empty history instead of showing a blank section", () => {
    render(<RecentActivity entries={[]} today="2026-08-26" />);

    expect(screen.getByText(/nothing has changed yet/i)).toBeInTheDocument();
  });
});

describe("this week", () => {
  const week = {
    weekStart: "2026-08-24",
    submitted: 6,
    statusChanges: 3,
    interviews: 1,
  };

  it("reports the three metrics the data supports honestly", () => {
    render(<ThisWeek week={week} weekStartLabel="Aug 24, 2026" />);

    expect(screen.getByText("submitted")).toBeInTheDocument();
    expect(screen.getByText("status changes")).toBeInTheDocument();
    expect(screen.getByText("interview reached")).toBeInTheDocument();
    expect(screen.getByText("Since Aug 24, 2026")).toBeInTheDocument();
  });

  it("agrees its nouns with its numbers", () => {
    render(
      <ThisWeek
        week={{ ...week, statusChanges: 1, interviews: 1 }}
        weekStartLabel="Aug 24, 2026"
      />,
    );

    expect(screen.getByText("status change")).toBeInTheDocument();
    expect(screen.getByText("interview reached")).toBeInTheDocument();
    expect(screen.queryByText("interviews reached")).toBeNull();
  });

  it("uses plural nouns beyond one", () => {
    render(
      <ThisWeek
        week={{ ...week, statusChanges: 3, interviews: 4 }}
        weekStartLabel="Aug 24, 2026"
      />,
    );

    expect(screen.getByText("status changes")).toBeInTheDocument();
    expect(screen.getByText("interviews reached")).toBeInTheDocument();
  });

  it("offers the quiet analytics link", () => {
    render(<ThisWeek week={week} weekStartLabel="Aug 24, 2026" />);

    expect(
      screen.getByRole("link", { name: /view analytics/i }).getAttribute("href"),
    ).toBe("/analytics");
  });

  it("shows honest zeros for a quiet week, with nothing to beat", () => {
    render(
      <ThisWeek
        week={{ ...week, submitted: 0, statusChanges: 0, interviews: 0 }}
        weekStartLabel="Aug 24, 2026"
      />,
    );

    expect(screen.getAllByText("0")).toHaveLength(3);
    expect(screen.queryByText(/streak|goal|target|last week|score/i)).toBeNull();
  });
});

describe("upcoming", () => {
  it("shows the employer, the role, what the date means, and the date", () => {
    render(
      <Upcoming
        items={[
          attentionItem({
            reason: "deadline-important",
            detail: "Application deadline",
            date: "2026-09-03",
            timing: "Deadline in 3 days",
            note: "Saved 2 days ago · Still Interested",
          }),
        ]}
      />,
    );

    expect(screen.getByText("KPMG Canada")).toBeInTheDocument();
    expect(screen.getByText("Management Consulting Intern")).toBeInTheDocument();
    expect(screen.getByText("Application deadline")).toBeInTheDocument();
    expect(screen.getByText("Sep 3, 2026")).toBeInTheDocument();
    expect(
      screen.getByText("Saved 2 days ago · Still Interested"),
    ).toBeInTheDocument();
  });

  it("shows a recorded action as the student wrote it", () => {
    render(<Upcoming items={[attentionItem()]} />);

    expect(screen.getByText("Follow up with recruiter")).toBeInTheDocument();
  });

  it("states urgency in words, not only in colour", () => {
    render(<Upcoming items={[attentionItem()]} />);

    expect(screen.getByText("Overdue by 2 days")).toBeInTheDocument();
  });

  it("names each row's kind without a pill for every entry", () => {
    const { container } = render(
      <Upcoming
        items={[
          attentionItem({ applicationId: "a" }),
          attentionItem({
            applicationId: "b",
            reason: "deadline-important",
            detail: "Application deadline",
            timing: "Deadline in 3 days",
          }),
        ]}
      />,
    );

    // Words and alignment carry the row; no badge vocabulary is layered on top.
    expect(screen.queryByText("Next action")).toBeNull();
    expect(screen.queryByText("Deadline")).toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("links each row to its application", () => {
    render(<Upcoming items={[attentionItem()]} />);

    expect(
      screen.getByRole("link", { name: "KPMG Canada" }).getAttribute("href"),
    ).toBe("/applications/11111111-1111-4111-8111-111111111111");
  });

  it("keeps the order it was given, so ranking stays the logic's job", () => {
    const { container } = render(
      <Upcoming
        items={[
          attentionItem({ applicationId: "a", companyName: "First" }),
          attentionItem({ applicationId: "b", companyName: "Second" }),
        ]}
      />,
    );

    const rows = container.querySelectorAll("li");
    expect(within(rows[0] as HTMLElement).getByText("First")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("Second")).toBeInTheDocument();
  });
});

describe("what the dashboard no longer says", () => {
  it("has no caught-up celebration anywhere in the section", () => {
    const { container } = render(<Upcoming items={[]} />);

    // The page omits the section entirely at zero items. Nothing renders a
    // congratulation, here or anywhere else.
    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(screen.queryByText(/caught up/i)).toBeNull();
  });

  it("never speaks about employer silence or movement", () => {
    render(<Upcoming items={[attentionItem()]} />);

    expect(
      screen.queryByText(/no status movement|stale|no movement|no response/i),
    ).toBeNull();
  });
});
