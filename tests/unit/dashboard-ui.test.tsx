import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AnalyticsLink,
  NeedsAttention,
  PipelineSnapshot,
  RecentActivity,
  ThisWeek,
} from "@/components/dashboard/dashboard-sections";
import type { AttentionItem } from "@/lib/dashboard/attention";
import type { ActivityEntry, PipelineStage } from "@/lib/dashboard/calculate";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

function attentionItem(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    applicationId: "11111111-1111-4111-8111-111111111111",
    companyName: "KPMG",
    jobTitle: "Audit Intern",
    status: "Applied",
    reason: "overdue-action",
    detail: "Follow up with recruiter",
    timing: "Overdue by 2 days",
    daysFromToday: -2,
    ...overrides,
  };
}

describe("needs attention", () => {
  it("shows the company, the commitment, and the timing in words", () => {
    render(<NeedsAttention items={[attentionItem()]} />);

    expect(screen.getByText("KPMG")).toBeInTheDocument();
    expect(screen.getByText("Follow up with recruiter")).toBeInTheDocument();
    expect(screen.getByText("Overdue by 2 days")).toBeInTheDocument();
  });

  it("names the urgency in text, not only in colour", () => {
    render(
      <NeedsAttention
        items={[
          attentionItem({ reason: "overdue-action" }),
          attentionItem({
            applicationId: "b",
            reason: "deadline-critical",
            timing: "Deadline tomorrow",
          }),
          attentionItem({
            applicationId: "c",
            reason: "action-due-soon",
            timing: "Due in 5 days",
          }),
        ]}
      />,
    );

    // Each row carries a readable reason label as well as its timing, so
    // nothing about an entry is knowable only from a swatch.
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Deadline")).toBeInTheDocument();
    expect(screen.getByText("Next action")).toBeInTheDocument();
  });

  it("collapses the five priority tiers to three readable labels", () => {
    render(
      <NeedsAttention
        items={[
          attentionItem({ applicationId: "a", reason: "deadline-critical" }),
          attentionItem({ applicationId: "b", reason: "deadline-important" }),
          attentionItem({ applicationId: "c", reason: "action-due-now" }),
          attentionItem({ applicationId: "d", reason: "action-due-soon" }),
        ]}
      />,
    );

    // Tiers exist to rank the list; labels exist to say what kind of thing an
    // entry is. A student does not need to read the ranking.
    expect(screen.getAllByText("Deadline")).toHaveLength(2);
    expect(screen.getAllByText("Next action")).toHaveLength(2);
  });

  it("shows why a deadline still applies, without advising what to do", () => {
    render(
      <NeedsAttention
        items={[
          attentionItem({
            reason: "deadline-important",
            detail: "Business Analyst Intern",
            timing: "Deadline in 3 days",
            note: "Saved 2 days ago · Still Interested",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Business Analyst Intern")).toBeInTheDocument();
    expect(screen.getByText("Deadline in 3 days")).toBeInTheDocument();
    expect(
      screen.getByText("Saved 2 days ago · Still Interested"),
    ).toBeInTheDocument();
  });

  it("carries no note on a next-action entry", () => {
    render(<NeedsAttention items={[attentionItem()]} />);

    expect(screen.queryByText(/Still |Saved /)).toBeNull();
  });

  it("never speaks about employer silence or movement", () => {
    render(
      <NeedsAttention
        items={[
          attentionItem({ applicationId: "a", reason: "overdue-action" }),
          attentionItem({ applicationId: "b", reason: "deadline-critical" }),
        ]}
      />,
    );

    expect(screen.queryByText(/no status movement|stale|no movement/i)).toBeNull();
  });

  it("links each entry to its own application", () => {
    render(
      <NeedsAttention
        items={[
          attentionItem({ applicationId: "app-a", companyName: "KPMG" }),
          attentionItem({ applicationId: "app-b", companyName: "BMO" }),
        ]}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/applications/app-a",
      "/applications/app-b",
    ]);
  });

  it("keeps the order it was given, so ranking stays the logic's job", () => {
    render(
      <NeedsAttention
        items={[
          attentionItem({ applicationId: "a", companyName: "First" }),
          attentionItem({ applicationId: "b", companyName: "Second" }),
        ]}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("First")).toBeInTheDocument();
    expect(within(items[1]).getByText("Second")).toBeInTheDocument();
  });

  it("says the student is caught up rather than showing an empty box", () => {
    render(<NeedsAttention items={[]} />);

    expect(screen.getByText(/you\u2019re caught up/i)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("explains the empty state without mentioning silence or movement", () => {
    render(<NeedsAttention items={[]} />);

    expect(screen.queryByText(/movement|quiet|stale|days/i)).toBeNull();
  });

  it("manufactures no work in the empty state", () => {
    render(<NeedsAttention items={[]} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("pipeline snapshot", () => {
  const stages: PipelineStage[] = [
    { status: "Applied", count: 8 },
    { status: "Screening", count: 2 },
    { status: "Assessment", count: 0 },
    { status: "Interview", count: 3 },
    { status: "Offer", count: 1 },
  ];

  it("shows every stage with its count, zeros included", () => {
    render(<PipelineSnapshot stages={stages} />);

    for (const stage of stages) {
      const link = screen.getByRole("link", {
        name: new RegExp(`${stage.status}\\s*${stage.count}`),
      });
      expect(link).toBeInTheDocument();
    }
  });

  it("links each stage through the existing status filter", () => {
    render(<PipelineSnapshot stages={stages} />);

    // The applications list already reads ?status=; this introduces no second
    // filtering vocabulary.
    expect(
      screen.getByRole("link", { name: /Applied/ }).getAttribute("href"),
    ).toBe("/applications?status=Applied");
    expect(
      screen.getByRole("link", { name: /Interview/ }).getAttribute("href"),
    ).toBe("/applications?status=Interview");
  });

  it("totals the active applications in progress", () => {
    render(<PipelineSnapshot stages={stages} />);

    expect(screen.getByText(/14 active applications in progress/)).toBeInTheDocument();
  });

  it("makes each count understandable to a screen reader", () => {
    render(<PipelineSnapshot stages={[{ status: "Offer", count: 1 }]} />);

    // "Offer 1" alone is ambiguous read aloud; the unit is supplied.
    expect(
      screen.getByRole("link", { name: /Offer\s*1\s*application/ }),
    ).toBeInTheDocument();
  });
});

describe("this week", () => {
  it("reports the three metrics the data supports honestly", () => {
    render(
      <ThisWeek
        week={{
          weekStart: "2026-08-24",
          submitted: 4,
          statusChanges: 6,
          interviews: 2,
        }}
        weekStartLabel="Aug 24, 2026"
      />,
    );

    expect(screen.getByText("Applications submitted")).toBeInTheDocument();
    expect(screen.getByText("Status changes")).toBeInTheDocument();
    expect(screen.getByText("Interviews reached")).toBeInTheDocument();
    expect(screen.getByText("Since Aug 24, 2026")).toBeInTheDocument();
  });

  it("shows honest zeros for a quiet week, with nothing to beat", () => {
    render(
      <ThisWeek
        week={{
          weekStart: "2026-08-24",
          submitted: 0,
          statusChanges: 0,
          interviews: 0,
        }}
        weekStartLabel="Aug 24, 2026"
      />,
    );

    expect(screen.getAllByText("0")).toHaveLength(3);
    // No streak, target, badge, or comparison with last week.
    expect(screen.queryByText(/streak|goal|target|last week/i)).toBeNull();
  });
});

describe("recent activity", () => {
  const entry = (overrides: Partial<ActivityEntry> = {}): ActivityEntry => ({
    applicationId: "app-1",
    companyName: "KPMG",
    description: "Moved to Applied",
    status: "Applied",
    day: "2026-08-26",
    changedAt: "2026-08-26T12:00:00.000Z",
    ...overrides,
  });

  it("groups entries under a day heading", () => {
    render(
      <RecentActivity
        entries={[
          entry(),
          entry({
            applicationId: "app-2",
            companyName: "BMO",
            description: "Moved to Interview",
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

  it("names the company and what changed", () => {
    render(<RecentActivity entries={[entry()]} today="2026-08-26" />);

    expect(screen.getByRole("link", { name: "KPMG" })).toBeInTheDocument();
    expect(screen.getByText("Moved to Applied")).toBeInTheDocument();
  });

  it("describes a creation once, as a save", () => {
    render(
      <RecentActivity
        entries={[entry({ description: "Saved as Interested" })]}
        today="2026-08-26"
      />,
    );

    expect(screen.getByText("Saved as Interested")).toBeInTheDocument();
    expect(screen.queryByText(/Moved to/)).toBeNull();
  });

  it("links each entry to its application", () => {
    render(<RecentActivity entries={[entry()]} today="2026-08-26" />);

    expect(screen.getByRole("link", { name: "KPMG" }).getAttribute("href")).toBe(
      "/applications/app-1",
    );
  });

  it("explains an empty history instead of showing a blank card", () => {
    render(<RecentActivity entries={[]} today="2026-08-26" />);

    expect(screen.getByText(/nothing has changed yet/i)).toBeInTheDocument();
  });
});

describe("the analytics handoff", () => {
  it("offers a link to the full analytics page", () => {
    render(<AnalyticsLink />);

    expect(
      screen.getByRole("link", { name: /view full analytics/i }).getAttribute("href"),
    ).toBe("/analytics");
  });

  it("says what each page is for, so the division is legible", () => {
    render(<AnalyticsLink />);

    expect(screen.getByText(/this page is about today/i)).toBeInTheDocument();
  });
});
