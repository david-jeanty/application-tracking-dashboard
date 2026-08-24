import { describe, expect, it } from "vitest";
import {
  activityDayLabel,
  groupActivityByDay,
  pipelineSnapshot,
  recentActivity,
  summarizeWeek,
  type DashboardEvent,
} from "@/lib/dashboard/calculate";
import {
  ACTIVITY_LIMIT,
  PIPELINE_SNAPSHOT_STATUSES,
} from "@/lib/dashboard/definitions";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";

/** A Monday, so week boundaries are easy to reason about in these tests. */
const MONDAY = "2026-08-24";
const WEDNESDAY = "2026-08-26";

function event(overrides: Partial<DashboardEvent> = {}): DashboardEvent {
  return {
    application_id: "app-1",
    previous_status: "Applied",
    new_status: "Interview",
    changedOn: MONDAY,
    changedAt: `${MONDAY}T12:00:00.000Z`,
    ...overrides,
  };
}

describe("the pipeline snapshot", () => {
  const active = (status: (typeof APPLICATION_STATUSES)[number]) => ({
    current_status: status,
    archived_at: null,
  });

  it("counts active applications at each stage", () => {
    const stages = pipelineSnapshot([
      active("Applied"),
      active("Applied"),
      active("Screening"),
      active("Interview"),
      active("Offer"),
    ]);

    expect(stages).toEqual([
      { status: "Applied", count: 2 },
      { status: "Screening", count: 1 },
      { status: "Assessment", count: 0 },
      { status: "Interview", count: 1 },
      { status: "Offer", count: 1 },
    ]);
  });

  it("excludes archived applications, which are not in progress anywhere", () => {
    const stages = pipelineSnapshot([
      active("Applied"),
      { current_status: "Applied", archived_at: "2026-08-01T10:00:00.000Z" },
    ]);

    expect(stages[0]).toEqual({ status: "Applied", count: 1 });
  });

  it("leaves out statuses that are not part of the submitted progression", () => {
    const stages = pipelineSnapshot([
      active("Interested"),
      active("Preparing"),
      active("Rejected"),
      active("Withdrawn"),
      active("Accepted"),
    ]);

    // Nothing sent, and nothing finished, belongs in a picture of what is in
    // flight. The whole history lives on the analytics page.
    expect(stages.every((stage) => stage.count === 0)).toBe(true);
  });

  it("shows every stage even at zero", () => {
    expect(pipelineSnapshot([])).toHaveLength(PIPELINE_SNAPSHOT_STATUSES.length);
  });

  it("uses only statuses from the existing enum", () => {
    // No parallel vocabulary: each stage links to the applications list using
    // the status filter that already exists.
    for (const stage of pipelineSnapshot([])) {
      expect(APPLICATION_STATUSES).toContain(stage.status);
    }
  });
});

describe("this week", () => {
  it("runs from Monday through today", () => {
    expect(summarizeWeek([], WEDNESDAY).weekStart).toBe("2026-08-24");
  });

  it("treats Sunday as the end of its own week, not the start of the next", () => {
    expect(summarizeWeek([], "2026-08-30").weekStart).toBe("2026-08-24");
  });

  it("counts an application submitted this week", () => {
    const week = summarizeWeek(
      [event({ previous_status: "Preparing", new_status: "Applied" })],
      WEDNESDAY,
    );

    expect(week.submitted).toBe(1);
  });

  it("excludes activity from the previous week", () => {
    const week = summarizeWeek(
      [
        event({
          previous_status: "Preparing",
          new_status: "Applied",
          changedOn: "2026-08-23",
          changedAt: "2026-08-23T12:00:00.000Z",
        }),
      ],
      WEDNESDAY,
    );

    expect(week).toMatchObject({ submitted: 0, statusChanges: 0, interviews: 0 });
  });

  it("excludes activity dated after today", () => {
    const week = summarizeWeek(
      [event({ changedOn: "2026-08-28", changedAt: "2026-08-28T12:00:00.000Z" })],
      WEDNESDAY,
    );

    expect(week.statusChanges).toBe(0);
  });

  it("counts a real status change but not the creation event", () => {
    const week = summarizeWeek(
      [
        event({ previous_status: null, new_status: "Applied" }),
        event({ previous_status: "Applied", new_status: "Screening" }),
      ],
      WEDNESDAY,
    );

    // Saving an application is one application saved, not one saved and one
    // moved.
    expect(week.statusChanges).toBe(1);
  });

  it("counts an application submitted directly, with no earlier status", () => {
    const week = summarizeWeek(
      [event({ previous_status: null, new_status: "Applied" })],
      WEDNESDAY,
    );

    expect(week.submitted).toBe(1);
  });

  it("counts one application once however many times it was submitted", () => {
    const week = summarizeWeek(
      [
        event({ new_status: "Applied", changedOn: MONDAY }),
        event({ new_status: "Screening", changedOn: WEDNESDAY }),
      ],
      WEDNESDAY,
    );

    expect(week.submitted).toBe(1);
  });

  it("counts an interview reached this week", () => {
    const week = summarizeWeek(
      [event({ previous_status: "Screening", new_status: "Interview" })],
      WEDNESDAY,
    );

    expect(week.interviews).toBe(1);
  });

  it("does not re-count an interview first reached earlier", () => {
    // The first time it was reached is what "reached this week" means; a
    // second interview round is not a second application interviewing.
    const week = summarizeWeek(
      [
        event({
          new_status: "Interview",
          changedOn: "2026-08-19",
          changedAt: "2026-08-19T12:00:00.000Z",
        }),
        event({ new_status: "Interview", changedOn: WEDNESDAY }),
      ],
      WEDNESDAY,
    );

    expect(week.interviews).toBe(0);
  });

  it("reports honest zeros for a quiet week", () => {
    expect(summarizeWeek([], WEDNESDAY)).toEqual({
      weekStart: "2026-08-24",
      submitted: 0,
      statusChanges: 0,
      interviews: 0,
    });
  });
});

describe("recent activity", () => {
  const applications = [
    {
      id: "app-1",
      company_name: "KPMG",
      company_domain: "kpmg.com",
      original_job_title: "Audit Intern",
    },
    {
      id: "app-2",
      company_name: "BMO",
      company_domain: null,
      original_job_title: "Data Analyst Intern",
    },
  ];

  it("describes a creation as saved, with the status it started at", () => {
    const [entry] = recentActivity(
      [event({ previous_status: null, new_status: "Applied" })],
      applications,
    );

    expect(entry).toMatchObject({
      companyName: "KPMG",
      description: "Saved as Applied",
    });
  });

  it("describes a status change as a move", () => {
    const [entry] = recentActivity(
      [event({ previous_status: "Applied", new_status: "Interview" })],
      applications,
    );

    expect(entry.description).toBe("Moved to Interview");
  });

  it("shows one entry for a creation, never a saved-plus-status pair", () => {
    // The database already writes exactly one event for a creation, so there
    // is nothing to deduplicate — and no synthetic entry is derived from
    // created_at that could double it.
    const entries = recentActivity(
      [event({ previous_status: null, new_status: "Interested" })],
      applications,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].description).toBe("Saved as Interested");
  });

  it("orders newest first", () => {
    const entries = recentActivity(
      [
        event({ changedAt: "2026-08-20T09:00:00.000Z", new_status: "Screening" }),
        event({ changedAt: "2026-08-26T09:00:00.000Z", new_status: "Interview" }),
        event({ changedAt: "2026-08-24T09:00:00.000Z", new_status: "Assessment" }),
      ],
      applications,
    );

    expect(entries.map((entry) => entry.status)).toEqual([
      "Interview",
      "Assessment",
      "Screening",
    ]);
  });

  it("caps at the documented limit", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      event({ changedAt: `2026-08-${String(index + 1).padStart(2, "0")}T09:00:00.000Z` }),
    );

    expect(recentActivity(many, applications)).toHaveLength(ACTIVITY_LIMIT);
    expect(ACTIVITY_LIMIT).toBeLessThanOrEqual(8);
  });

  it("keeps archived applications, because they still happened", () => {
    const entries = recentActivity([event({ application_id: "app-2" })], [
      {
        id: "app-2",
        company_name: "BMO",
        company_domain: null,
        original_job_title: "Data Analyst Intern",
      },
    ]);

    expect(entries[0].companyName).toBe("BMO");
  });

  it("skips an event whose application is not in the supplied list", () => {
    // Deleted applications cascade their history away, so they never reach
    // this function at all. An unmatched event is skipped rather than shown
    // without a name.
    expect(recentActivity([event({ application_id: "gone" })], applications)).toEqual(
      [],
    );
  });

  it("links every entry to its own application", () => {
    const entries = recentActivity(
      [event({ application_id: "app-2" }), event({ application_id: "app-1" })],
      applications,
    );

    expect(entries.map((entry) => entry.applicationId).sort()).toEqual([
      "app-1",
      "app-2",
    ]);
  });
});

describe("activity day grouping and labels", () => {
  const entry = (day: string, changedAt: string) => ({
    applicationId: "app-1",
    companyName: "KPMG",
    companyDomain: null,
    jobTitle: "Program Manager Intern",
    description: "Moved to Interview",
    status: "Interview" as const,
    day,
    changedAt,
  });

  it("groups consecutive entries from the same day", () => {
    const groups = groupActivityByDay([
      entry("2026-08-26", "2026-08-26T12:00:00.000Z"),
      entry("2026-08-26", "2026-08-26T09:00:00.000Z"),
      entry("2026-08-25", "2026-08-25T09:00:00.000Z"),
    ]);

    expect(groups.map((group) => [group.day, group.entries.length])).toEqual([
      ["2026-08-26", 2],
      ["2026-08-25", 1],
    ]);
  });

  it("returns nothing for no activity", () => {
    expect(groupActivityByDay([])).toEqual([]);
  });

  it("names today and yesterday, and dates everything else", () => {
    const format = (value: string) => `formatted:${value}`;

    expect(activityDayLabel("2026-08-26", "2026-08-26", format)).toBe("Today");
    expect(activityDayLabel("2026-08-25", "2026-08-26", format)).toBe("Yesterday");
    expect(activityDayLabel("2026-08-21", "2026-08-26", format)).toBe(
      "formatted:2026-08-21",
    );
  });

  it("crosses a month boundary without arithmetic errors", () => {
    const format = (value: string) => `formatted:${value}`;

    expect(activityDayLabel("2026-07-31", "2026-08-01", format)).toBe("Yesterday");
  });

  it("crosses a year boundary without arithmetic errors", () => {
    const format = (value: string) => `formatted:${value}`;

    expect(activityDayLabel("2026-12-31", "2027-01-01", format)).toBe("Yesterday");
  });
});
