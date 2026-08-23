import { describe, expect, it } from "vitest";
import {
  summarizeApplications,
  type AnalyticsApplication,
  type AnalyticsHistoryEvent,
} from "@/lib/analytics/calculate";
import { toPercent } from "@/lib/analytics/definitions";
import type { ApplicationStatus } from "@/lib/applications/constants";
import type { JobCategory } from "@/lib/applications/constants";

/**
 * Builds one application plus the history a database trigger would have
 * written for the status path it travelled.
 *
 * The first status in `path` is the creation event, which the trigger records
 * with a null previous status; the rest are transitions.
 */
function application(
  id: string,
  path: ApplicationStatus[],
  overrides: Partial<AnalyticsApplication> = {},
): { application: AnalyticsApplication; history: AnalyticsHistoryEvent[] } {
  return {
    application: {
      id,
      current_status: path[path.length - 1],
      normalized_job_category: "Business Analysis",
      archived_at: null,
      ...overrides,
    },
    history: path.map((status) => ({
      application_id: id,
      new_status: status,
    })),
  };
}

function summarize(
  entries: ReturnType<typeof application>[],
): ReturnType<typeof summarizeApplications> {
  return summarizeApplications(
    entries.map((entry) => entry.application),
    entries.flatMap((entry) => entry.history),
  );
}

function rate(
  summary: ReturnType<typeof summarizeApplications>,
  label: string,
): number {
  return summary.conversions.find((metric) => metric.label === label)!.percent;
}

describe("an empty tracker", () => {
  it("reports zeros rather than nothing", () => {
    const summary = summarizeApplications([], []);

    expect(summary.totalSaved).toBe(0);
    expect(summary.everSubmitted).toBe(0);
    expect(summary.activeNow).toBe(0);
    for (const metric of summary.conversions) {
      expect(metric.percent).toBe(0);
      expect(metric.reached).toBe(0);
    }
  });

  it("divides by zero as zero, not NaN or Infinity", () => {
    expect(toPercent(0, 0)).toBe(0);
    expect(toPercent(5, 0)).toBe(0);
    expect(Number.isFinite(toPercent(1, 0))).toBe(true);
  });
});

describe("submitted is counted from history, not current status", () => {
  it("does not count an application that was only ever saved", () => {
    const summary = summarize([application("1", ["Interested"])]);

    expect(summary.totalSaved).toBe(1);
    expect(summary.everSubmitted).toBe(0);
    expect(summary.notYetSubmitted).toBe(1);
  });

  it("does not count one still being prepared", () => {
    const summary = summarize([application("1", ["Interested", "Preparing"])]);

    expect(summary.everSubmitted).toBe(0);
  });

  it("counts an application created directly as Applied", () => {
    // What save_job does when a student says "I already applied to this".
    const summary = summarize([application("1", ["Applied"])]);

    expect(summary.everSubmitted).toBe(1);
  });

  it("still counts one that was moved back to Interested afterwards", () => {
    // The case that would otherwise let a rate exceed 100%: the rejection
    // stays in the numerator, so the submission must stay in the denominator.
    const summary = summarize([
      application("1", ["Applied", "Rejected", "Interested"]),
    ]);

    expect(summary.everSubmitted).toBe(1);
    expect(rate(summary, "Employer responded")).toBe(100);
    for (const metric of summary.conversions) {
      expect(metric.percent).toBeLessThanOrEqual(100);
    }
  });
});

describe("conversion metrics read the whole history", () => {
  it("counts an interview that later became a rejection", () => {
    const summary = summarize([
      application("1", ["Applied", "Interview", "Rejected"]),
    ]);

    expect(rate(summary, "Reached an interview")).toBe(100);
    expect(rate(summary, "Received an offer")).toBe(0);
    // Current status is Rejected, so the current-state count says so too.
    expect(
      summary.statusCounts.find((entry) => entry.label === "Rejected")?.count,
    ).toBe(1);
  });

  it("counts a stage that was skipped over on the way past it", () => {
    // Interested straight to Offer: no Interview event was ever written, but
    // an offer plainly means the application got at least that far.
    const summary = summarize([application("1", ["Interested", "Offer"])]);

    expect(rate(summary, "Reached an interview")).toBe(100);
    expect(rate(summary, "Received an offer")).toBe(100);
  });

  it("separates a rejection from being moved forward", () => {
    const summary = summarize([
      application("1", ["Applied", "Rejected"]),
      application("2", ["Applied", "Interview"]),
    ]);

    expect(rate(summary, "Employer responded")).toBe(100);
    expect(rate(summary, "Moved forward")).toBe(50);
  });

  it("never reports a rate above 100 percent", () => {
    const summary = summarize([
      application("1", ["Applied", "Screening", "Interview", "Offer", "Accepted"]),
    ]);

    for (const metric of summary.conversions) {
      expect(metric.percent).toBeLessThanOrEqual(100);
      expect(metric.reached).toBeLessThanOrEqual(metric.submitted);
    }
  });

  it("shares one denominator across every conversion metric", () => {
    const summary = summarize([
      application("1", ["Applied"]),
      application("2", ["Applied", "Interview"]),
      application("3", ["Interested"]),
    ]);

    for (const metric of summary.conversions) {
      expect(metric.submitted).toBe(2);
    }
  });

  it("rounds a repeating share with the shared policy", () => {
    const summary = summarize([
      application("1", ["Applied", "Interview"]),
      application("2", ["Applied"]),
      application("3", ["Applied"]),
    ]);

    // 1 of 3 → 33%, not 33.333…
    expect(rate(summary, "Reached an interview")).toBe(33);
  });
});

describe("current-state counts stay separate from history", () => {
  it("counts active applications from current status only", () => {
    const summary = summarize([
      application("1", ["Applied", "Interview"]),
      application("2", ["Applied", "Rejected"]),
      application("3", ["Interested"]),
    ]);

    expect(summary.activeNow).toBe(1);
    // History still remembers that both were submitted.
    expect(summary.everSubmitted).toBe(2);
  });

  it("lists every status in pipeline order, including empty ones", () => {
    const summary = summarize([application("1", ["Applied"])]);

    expect(summary.statusCounts).toHaveLength(10);
    expect(summary.statusCounts[0].label).toBe("Interested");
    expect(summary.statusCounts.at(-1)?.label).toBe("Accepted");
    expect(
      summary.statusCounts.find((entry) => entry.label === "Offer")?.count,
    ).toBe(0);
  });
});

describe("archived applications are included", () => {
  it("counts an archived application in the totals and the rates", () => {
    const summary = summarize([
      application("1", ["Applied", "Rejected"], {
        archived_at: "2026-08-20T10:00:00.000Z",
      }),
      application("2", ["Applied"]),
    ]);

    expect(summary.totalSaved).toBe(2);
    expect(summary.everSubmitted).toBe(2);
    expect(summary.archived).toBe(1);
    // Excluding it would have reported a 0% response rate instead of 50%.
    expect(rate(summary, "Employer responded")).toBe(50);
  });
});

describe("category breakdown", () => {
  it("groups by category, most common first", () => {
    const summary = summarize([
      application("1", ["Applied"], {
        normalized_job_category: "Finance" as JobCategory,
      }),
      application("2", ["Applied"], {
        normalized_job_category: "Finance" as JobCategory,
      }),
      application("3", ["Applied"], {
        normalized_job_category: "Marketing" as JobCategory,
      }),
    ]);

    expect(summary.categoryCounts).toEqual([
      { label: "Finance", count: 2 },
      { label: "Marketing", count: 1 },
    ]);
  });

  it("breaks a tie by name so the order is stable", () => {
    const summary = summarize([
      application("1", ["Applied"], {
        normalized_job_category: "Marketing" as JobCategory,
      }),
      application("2", ["Applied"], {
        normalized_job_category: "Finance" as JobCategory,
      }),
    ]);

    expect(summary.categoryCounts.map((entry) => entry.label)).toEqual([
      "Finance",
      "Marketing",
    ]);
  });
});

describe("data that does not line up", () => {
  it("ignores history for an application that is not in the population", () => {
    // History cascades on delete, but a stale event must never invent a row.
    const summary = summarizeApplications(
      [application("1", ["Applied"]).application],
      [
        { application_id: "1", new_status: "Applied" },
        { application_id: "missing", new_status: "Offer" },
      ],
    );

    expect(summary.totalSaved).toBe(1);
    expect(rate(summary, "Received an offer")).toBe(0);
  });

  it("treats an application with no history as never submitted", () => {
    const summary = summarizeApplications(
      [
        {
          id: "1",
          current_status: "Applied",
          normalized_job_category: "Finance",
          archived_at: null,
        },
      ],
      [],
    );

    expect(summary.everSubmitted).toBe(0);
    expect(summary.activeNow).toBe(1);
  });
});
