import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PipelineSnapshot,
  RecentActivity,
  SearchSummaryMetrics,
  ThisWeek,
  Upcoming,
} from "@/components/dashboard/dashboard-sections";
import type { AttentionItem } from "@/lib/dashboard/attention";
import type { ActivityEntry, PipelineStage } from "@/lib/dashboard/calculate";

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

describe("pipeline", () => {
  const stages: PipelineStage[] = [
    { status: "Applied", count: 23 },
    { status: "Screening", count: 4 },
    { status: "Assessment", count: 0 },
    { status: "Interview", count: 2 },
    { status: "Offer", count: 1 },
  ];

  it("shows every stage with its count, zeros included", () => {
    render(<PipelineSnapshot stages={stages} />);

    for (const stage of stages) {
      expect(
        screen.getByRole("link", {
          name: new RegExp(`${stage.status}\\s*${stage.count}`),
        }),
      ).toBeInTheDocument();
    }
  });

  it("links each stage through the existing status filter", () => {
    render(<PipelineSnapshot stages={stages} />);

    expect(
      screen.getByRole("link", { name: /Applied/ }).getAttribute("href"),
    ).toBe("/applications?status=Applied");
    expect(
      screen.getByRole("link", { name: /Interview/ }).getAttribute("href"),
    ).toBe("/applications?status=Interview");
  });

  it("makes each count understandable to a screen reader", () => {
    render(<PipelineSnapshot stages={[{ status: "Offer", count: 1 }]} />);

    expect(
      screen.getByRole("link", { name: /Offer\s*1\s*application/ }),
    ).toBeInTheDocument();
  });

  it("totals the active applications", () => {
    render(<PipelineSnapshot stages={stages} />);

    expect(screen.getByText("30 active applications")).toBeInTheDocument();
  });

  it("adds no tab stop for the distribution bar", () => {
    const { container } = render(<PipelineSnapshot stages={stages} />);

    // Five stage links and nothing else focusable: the bar restates counts
    // that are already text, so it is hidden and not interactive.
    expect(container.querySelectorAll("a")).toHaveLength(5);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  });

  it("survives a search with nothing active", () => {
    const empty = stages.map((stage) => ({ ...stage, count: 0 }));

    expect(() => render(<PipelineSnapshot stages={empty} />)).not.toThrow();
    expect(screen.getByText("0 active applications")).toBeInTheDocument();
  });

  it("draws no connectors between stages", () => {
    render(<PipelineSnapshot stages={stages} />);

    // An aggregate distribution, not one application's journey. Nothing here
    // should read as a path from Applied to Offer.
    expect(screen.queryByText("→")).toBeNull();
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
