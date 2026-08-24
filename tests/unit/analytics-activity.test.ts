import { describe, expect, it } from "vitest";
import {
  ACTIVITY_MINIMUM_APPLICATIONS,
  ACTIVITY_MINIMUM_WEEKS,
  ACTIVITY_WEEKS,
  activityWeekStarts,
  summarizeActivity,
  type ActivityApplication,
} from "@/lib/analytics/activity";
import type { AnalyticsHistoryEvent } from "@/lib/analytics/calculate";
import type { ApplicationStatus } from "@/lib/applications/constants";
import { startOfWeek } from "@/lib/dates/date-only";

type Seed = {
  id: string;
  path: ApplicationStatus[];
  dateApplied?: string | null;
};

/** A Thursday, so week boundaries are visible in both directions from it. */
const TODAY = "2026-08-20";

function summarize(seeds: Seed[], today = TODAY) {
  const applications: ActivityApplication[] = seeds.map((seed) => ({
    id: seed.id,
    date_applied: seed.dateApplied ?? null,
  }));
  const history: AnalyticsHistoryEvent[] = seeds.flatMap((seed) =>
    seed.path.map((status) => ({
      application_id: seed.id,
      new_status: status,
    })),
  );

  return summarizeActivity(applications, history, today);
}

function countFor(
  summary: ReturnType<typeof summarizeActivity>,
  weekStart: string,
): number | undefined {
  return summary.weeks.find((week) => week.weekStart === weekStart)?.count;
}

describe("which applications the line counts", () => {
  it("counts an application that was ever submitted and has a date", () => {
    const summary = summarize([
      { id: "a", path: ["Applied"], dateApplied: "2026-08-18" },
    ]);

    expect(countFor(summary, "2026-08-17")).toBe(1);
    expect(summary.inRange).toBe(1);
  });

  it("excludes a pre-submission application even when it carries a date", () => {
    // A saved Interested role with an application date entered by accident must
    // never appear as a submission.
    const summary = summarize([
      { id: "a", path: ["Interested"], dateApplied: "2026-08-18" },
      { id: "b", path: ["Interested", "Preparing"], dateApplied: "2026-08-18" },
    ]);

    expect(summary.submitted).toBe(0);
    expect(summary.dated).toBe(0);
    expect(countFor(summary, "2026-08-17")).toBe(0);
  });

  it("excludes a submitted application with no recorded date", () => {
    const summary = summarize([
      { id: "a", path: ["Applied"], dateApplied: null },
    ]);

    expect(summary.submitted).toBe(1);
    expect(summary.dated).toBe(0);
    expect(summary.weeks.every((week) => week.count === 0)).toBe(true);
  });

  it("counts an application created straight into a submitted status", () => {
    const summary = summarize([
      { id: "a", path: ["Accepted"], dateApplied: "2026-08-18" },
    ]);

    expect(summary.inRange).toBe(1);
  });

  it("keeps an archived submitted application, because it still happened", () => {
    // Nothing here reads an archive field: the page passes every application,
    // so historical analytics includes the ones a student tidied away.
    const summary = summarize([
      {
        id: "a",
        path: ["Applied", "Interview", "Rejected"],
        dateApplied: "2026-08-18",
      },
    ]);

    expect(countFor(summary, "2026-08-17")).toBe(1);
  });

  it("treats a malformed date as no date rather than throwing", () => {
    const summary = summarize([
      { id: "a", path: ["Applied"], dateApplied: "not-a-date" },
      { id: "b", path: ["Applied"], dateApplied: "2026-02-30" },
    ]);

    expect(summary.submitted).toBe(2);
    expect(summary.dated).toBe(0);
  });
});

describe("date_applied drives the week, never status history", () => {
  it("uses the recorded application date even when history says otherwise", () => {
    /*
      The status events carry no timestamp at all — `listStatusHistory` projects
      only `application_id` and `new_status` — so there is nothing here for a
      week to be derived from except `date_applied`. This asserts the shape of
      that contract: an application submitted long ago and updated recently
      lands in the week it was applied to.
    */
    const summary = summarize([
      {
        id: "a",
        path: ["Applied", "Screening", "Interview", "Rejected"],
        dateApplied: "2026-07-06",
      },
    ]);

    expect(countFor(summary, "2026-07-06")).toBe(1);
    expect(countFor(summary, startOfWeek(TODAY))).toBe(0);
  });

  it("never infers a missing date from anything else", () => {
    const summary = summarize([
      { id: "a", path: ["Applied", "Interview"], dateApplied: null },
    ]);

    // Missing means missing. No created_at, no updated_at, no changed_at.
    expect(summary.weeks.reduce((sum, week) => sum + week.count, 0)).toBe(0);
  });
});

describe("week boundaries", () => {
  it("groups same-week applications together", () => {
    const summary = summarize([
      // Monday, Tuesday and Thursday of the same week.
      { id: "a", path: ["Applied"], dateApplied: "2026-08-17" },
      { id: "b", path: ["Applied"], dateApplied: "2026-08-18" },
      { id: "c", path: ["Applied"], dateApplied: "2026-08-20" },
    ]);

    expect(countFor(summary, "2026-08-17")).toBe(3);
  });

  it("puts Sunday in the week that began the Monday before it", () => {
    const summary = summarize([
      { id: "a", path: ["Applied"], dateApplied: "2026-08-16" },
    ]);

    // 16 August 2026 is a Sunday: its week started on the 10th.
    expect(countFor(summary, "2026-08-10")).toBe(1);
    expect(countFor(summary, "2026-08-17")).toBe(0);
  });

  it("starts a new week on Monday", () => {
    const summary = summarize([
      { id: "a", path: ["Applied"], dateApplied: "2026-08-16" },
      { id: "b", path: ["Applied"], dateApplied: "2026-08-17" },
    ]);

    expect(countFor(summary, "2026-08-10")).toBe(1);
    expect(countFor(summary, "2026-08-17")).toBe(1);
  });

  it("holds one week together across a month boundary", () => {
    const summary = summarize([
      { id: "a", path: ["Applied"], dateApplied: "2026-07-31" },
      { id: "b", path: ["Applied"], dateApplied: "2026-08-01" },
    ]);

    // 31 July 2026 is a Friday; 1 August is the Saturday after it. One week,
    // beginning Monday 27 July.
    expect(countFor(summary, "2026-07-27")).toBe(2);
  });

  it("holds one week together across a year boundary", () => {
    const summary = summarize(
      [
        { id: "a", path: ["Applied"], dateApplied: "2025-12-31" },
        { id: "b", path: ["Applied"], dateApplied: "2026-01-01" },
      ],
      "2026-01-08",
    );

    // 31 December 2025 is a Wednesday, 1 January 2026 the Thursday after it.
    expect(countFor(summary, "2025-12-29")).toBe(2);
  });
});

describe("the range", () => {
  it("covers the configured number of weeks, ending with the current one", () => {
    const starts = activityWeekStarts(TODAY);

    expect(starts).toHaveLength(ACTIVITY_WEEKS);
    expect(starts.at(-1)).toBe(startOfWeek(TODAY));
  });

  it("runs chronologically, one week apart", () => {
    const starts = activityWeekStarts(TODAY);

    for (let index = 1; index < starts.length; index += 1) {
      expect(starts[index] > starts[index - 1]).toBe(true);
      const previous = new Date(`${starts[index - 1]}T00:00:00Z`);
      previous.setUTCDate(previous.getUTCDate() + 7);
      expect(previous.toISOString().slice(0, 10)).toBe(starts[index]);
    }
  });

  it("includes honest zero weeks between activity", () => {
    const summary = summarize([
      { id: "a", path: ["Applied"], dateApplied: "2026-08-17" },
      { id: "b", path: ["Applied"], dateApplied: "2026-07-06" },
    ]);

    expect(summary.weeks).toHaveLength(ACTIVITY_WEEKS);
    // The quiet fortnight between them is drawn as zero, not skipped.
    expect(countFor(summary, "2026-07-13")).toBe(0);
    expect(countFor(summary, "2026-07-20")).toBe(0);
    expect(summary.activeWeeks).toBe(2);
  });

  it("keeps an application older than the range out of the weekly counts", () => {
    const summary = summarize([
      { id: "a", path: ["Applied"], dateApplied: "2025-01-06" },
    ]);

    expect(summary.inRange).toBe(0);
    // Still counted as dated: coverage describes the whole search, not the
    // window the chart happens to draw.
    expect(summary.dated).toBe(1);
    expect(summary.submitted).toBe(1);
  });

  it("keeps a future date out of the current historical range", () => {
    const summary = summarize([
      // Later this same week, but still ahead of today.
      { id: "a", path: ["Applied"], dateApplied: "2026-08-22" },
      { id: "b", path: ["Applied"], dateApplied: "2027-01-04" },
    ]);

    expect(countFor(summary, startOfWeek(TODAY))).toBe(0);
    expect(summary.inRange).toBe(0);
    expect(summary.dated).toBe(2);
  });

  it("counts today itself", () => {
    const summary = summarize([
      { id: "a", path: ["Applied"], dateApplied: TODAY },
    ]);

    expect(countFor(summary, startOfWeek(TODAY))).toBe(1);
  });
});

describe("coverage", () => {
  it("reports dated against total submitted", () => {
    const summary = summarize([
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `d${index}`,
        path: ["Applied"] as ApplicationStatus[],
        dateApplied: "2026-08-17",
      })),
      { id: "u1", path: ["Applied"], dateApplied: null },
      { id: "u2", path: ["Applied"], dateApplied: null },
      // Never submitted: outside both figures.
      { id: "x", path: ["Interested"], dateApplied: "2026-08-17" },
    ]);

    expect(summary.dated).toBe(3);
    expect(summary.submitted).toBe(5);
  });

  it("reports complete coverage when every submission has a date", () => {
    const summary = summarize([
      { id: "a", path: ["Applied"], dateApplied: "2026-08-17" },
      { id: "b", path: ["Applied"], dateApplied: "2026-08-10" },
    ]);

    expect(summary.dated).toBe(summary.submitted);
  });
});

describe("the low-data rule", () => {
  it("refuses a line from a single week of activity", () => {
    const summary = summarize(
      Array.from({ length: 9 }, (_, index) => ({
        id: `a${index}`,
        path: ["Applied"] as ApplicationStatus[],
        dateApplied: "2026-08-17",
      })),
    );

    expect(summary.inRange).toBe(9);
    expect(summary.activeWeeks).toBe(1);
    expect(summary.hasEnoughHistory).toBe(false);
  });

  it("refuses a line from too few applications", () => {
    const summary = summarize([
      { id: "a", path: ["Applied"], dateApplied: "2026-08-17" },
      { id: "b", path: ["Applied"], dateApplied: "2026-08-10" },
    ]);

    expect(summary.activeWeeks).toBe(ACTIVITY_MINIMUM_WEEKS);
    expect(summary.inRange).toBeLessThan(ACTIVITY_MINIMUM_APPLICATIONS);
    expect(summary.hasEnoughHistory).toBe(false);
  });

  it("draws the line once both thresholds are met", () => {
    const summary = summarize([
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `a${index}`,
        path: ["Applied"] as ApplicationStatus[],
        dateApplied: "2026-08-17",
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        id: `b${index}`,
        path: ["Applied"] as ApplicationStatus[],
        dateApplied: "2026-08-10",
      })),
    ]);

    expect(summary.inRange).toBe(ACTIVITY_MINIMUM_APPLICATIONS);
    expect(summary.activeWeeks).toBe(ACTIVITY_MINIMUM_WEEKS);
    expect(summary.hasEnoughHistory).toBe(true);
  });

  it("does not count out-of-range history towards the threshold", () => {
    // Plenty of dated submissions, all of them older than the window: drawing
    // twelve zero weeks would be a chart of nothing.
    const summary = summarize(
      Array.from({ length: 20 }, (_, index) => ({
        id: `a${index}`,
        path: ["Applied"] as ApplicationStatus[],
        dateApplied: index % 2 === 0 ? "2024-03-04" : "2024-03-11",
      })),
    );

    expect(summary.dated).toBe(20);
    expect(summary.hasEnoughHistory).toBe(false);
  });
});
