import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizeActivity } from "@/lib/analytics/activity";
import { summarizeFunnel } from "@/lib/analytics/funnel";
import {
  MINIMUM_COMPARABLE_GROUPS,
  summarizePerformance,
} from "@/lib/analytics/performance";
import {
  APPLICATION_STATUSES,
  JOB_CATEGORIES,
  type ApplicationStatus,
} from "@/lib/applications/constants";
import { SUBMITTED_STATUSES } from "@/lib/analytics/definitions";
import { buildDashboard } from "@/lib/dashboard/summary";
import { isDateOnly } from "@/lib/dates/date-only";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { DEMO_WORK_TERMS } from "@/lib/demo/seeds";

const TODAY = "2026-08-25";
const dataset = buildDemoDataset(TODAY);

function countBy<T extends string>(values: readonly T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

const byStatus = countBy(dataset.applications.map((a) => a.current_status));

describe("the dataset is a fixture, not a snapshot", () => {
  it("produces the same workspace for the same day, every time", () => {
    expect(buildDemoDataset(TODAY)).toEqual(buildDemoDataset(TODAY));
  });

  it("moves with the calendar rather than aging into the past", () => {
    const later = buildDemoDataset("2027-03-01");

    // Same records, different days: the search is as current in six months as
    // it is today, which is the whole reason the seeds carry offsets.
    expect(later.applications.map((a) => a.id)).toEqual(
      dataset.applications.map((a) => a.id),
    );
    expect(later.applications[0].created_at).not.toBe(
      dataset.applications[0].created_at,
    );
  });

  it("contains no randomness", () => {
    const source = readFileSync("lib/demo/dataset.ts", "utf8");
    expect(source).not.toMatch(/Math\.random|Date\.now|new Date\(\)/);
  });
});

describe("the size and shape of the search", () => {
  it("is a believable number of applications", () => {
    expect(dataset.applications.length).toBeGreaterThanOrEqual(50);
    expect(dataset.applications.length).toBeLessThanOrEqual(60);
  });

  it("gives every application its own id", () => {
    const ids = dataset.applications.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses exactly the three recruiting periods", () => {
    const terms = new Set(dataset.applications.map((a) => a.work_term_season));
    expect([...terms].sort()).toEqual([...DEMO_WORK_TERMS].sort());
  });

  it("spreads the applications across all three", () => {
    for (const term of DEMO_WORK_TERMS) {
      const count = dataset.applications.filter(
        (a) => a.work_term_season === term,
      ).length;
      expect(count).toBeGreaterThanOrEqual(15);
    }
  });

  it("uses only canonical role categories", () => {
    for (const application of dataset.applications) {
      expect(JOB_CATEGORIES).toContain(application.normalized_job_category);
    }
  });

  it("applies to several employers more than once", () => {
    const byCompany = countBy(dataset.applications.map((a) => a.company_name));
    const repeated = Object.values(byCompany).filter((count) => count > 1);

    // The case the product is designed around: the list and the board lead
    // with the role precisely because one employer runs several postings.
    expect(repeated.length).toBeGreaterThanOrEqual(8);
  });

  it("never repeats the same employer, role and term", () => {
    const keys = dataset.applications.map(
      (a) => `${a.company_name}|${a.original_job_title}|${a.work_term_season}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("the statuses the search is spread across", () => {
  it("puts at least one application at every canonical status", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(byStatus[status] ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it("is neither a fantasy nor a tragedy", () => {
    // Live offers and a decision taken, against a real quantity of rejection:
    // an analytics page built on nothing but progress would not be believable.
    expect(byStatus.Offer).toBeGreaterThanOrEqual(2);
    expect(byStatus.Accepted).toBeGreaterThanOrEqual(1);
    expect(byStatus.Rejected).toBeGreaterThanOrEqual(5);
    expect(byStatus.Withdrawn).toBeGreaterThanOrEqual(1);
  });

  it("has enough in each middle stage to fill a board column", () => {
    expect(byStatus.Interview).toBeGreaterThanOrEqual(2);
    expect(byStatus.Assessment).toBeGreaterThanOrEqual(2);
    expect(byStatus.Screening).toBeGreaterThanOrEqual(2);
    expect((byStatus.Interested ?? 0) + (byStatus.Preparing ?? 0)).toBeGreaterThanOrEqual(4);
  });
});

describe("every record is internally coherent", () => {
  const submitted = new Set<ApplicationStatus>(SUBMITTED_STATUSES);

  it("ends each history at the status the record is actually at", () => {
    for (const application of dataset.applications) {
      const events = dataset.timeline
        .filter((event) => event.application_id === application.id)
        .sort((a, b) => a.changed_at.localeCompare(b.changed_at));

      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1].new_status).toBe(
        application.current_status,
      );
    }
  });

  it("marks exactly one creation event per application", () => {
    for (const application of dataset.applications) {
      const creations = dataset.timeline.filter(
        (event) =>
          event.application_id === application.id &&
          event.previous_status === null,
      );
      expect(creations).toHaveLength(1);
    }
  });

  it("chains each move from the status before it", () => {
    for (const application of dataset.applications) {
      const events = dataset.timeline
        .filter((event) => event.application_id === application.id)
        .sort((a, b) => a.changed_at.localeCompare(b.changed_at));

      events.forEach((event, index) => {
        if (index === 0) return;
        expect(event.previous_status).toBe(events[index - 1].new_status);
      });
    }
  });

  it("never records an application as submitted before it was", () => {
    for (const application of dataset.applications) {
      const everSubmitted = dataset.statusEvents.some(
        (event) =>
          event.application_id === application.id &&
          submitted.has(event.new_status),
      );
      // A date applied is a claim that it went out. Only records whose history
      // says so carry one, so nothing at Interested pretends to have been sent.
      expect(Boolean(application.date_applied)).toBe(everSubmitted);
    }
  });

  it("never dates anything in the future", () => {
    for (const application of dataset.applications) {
      if (application.date_applied) {
        expect(application.date_applied <= TODAY).toBe(true);
      }
      expect(application.created_at.slice(0, 10) <= TODAY).toBe(true);
    }
    for (const event of dataset.timeline) {
      expect(event.changed_at.slice(0, 10) <= TODAY).toBe(true);
    }
  });

  it("writes valid calendar days wherever it writes a date", () => {
    for (const application of dataset.applications) {
      for (const value of [
        application.date_applied,
        application.application_deadline,
        application.next_action_due_date,
      ]) {
        if (value) expect(isDateOnly(value)).toBe(true);
      }
    }
  });

  it("never leaves a due date without the action it is due for", () => {
    for (const application of dataset.applications) {
      if (application.next_action_due_date) {
        expect(application.next_action).toBeTruthy();
      }
    }
  });

  it("leaves some records deliberately sparse", () => {
    // A tracker where every optional field is filled in is a tracker nobody
    // kept. These are the cases the interface has to stay graceful for.
    expect(
      dataset.records.values().filter((r) => r.company_domain === null).toArray()
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      dataset.applications.filter((a) => a.location === "Not specified").length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      dataset.records
        .values()
        .filter((r) => r.notes === null && r.job_description === null)
        .toArray().length,
    ).toBeGreaterThanOrEqual(10);
  });

  it("makes several records genuinely rich", () => {
    const rich = [...dataset.records.values()].filter(
      (record) =>
        record.notes && record.job_description && record.salary && record.location,
    );
    expect(rich.length).toBeGreaterThanOrEqual(2);
  });

});

describe("a few finished applications are filed away", () => {
  const archived = dataset.applications.filter((a) => a.archived_at !== null);

  it("archives a handful, and leaves the search intact", () => {
    expect(dataset.applications).toHaveLength(56);
    expect(archived.length).toBeGreaterThanOrEqual(1);
    expect(archived).toHaveLength(4);
    expect(dataset.activeApplications.length).toBeGreaterThanOrEqual(50);
    expect(dataset.activeApplications).toHaveLength(52);
  });

  it("archives only finished applications", () => {
    // Filing away something still in play would be a claim about the student's
    // search that the rest of the fixture contradicts.
    for (const application of archived) {
      expect(["Rejected", "Withdrawn"]).toContain(application.current_status);
    }
  });

  it("empties no status by archiving it", () => {
    for (const status of ["Rejected", "Withdrawn"] as const) {
      const remaining = dataset.activeApplications.filter(
        (a) => a.current_status === status,
      );
      expect(remaining.length).toBeGreaterThan(0);
    }
  });

  it("leaves every live outcome in play", () => {
    for (const application of archived) {
      expect(["Offer", "Accepted"]).not.toContain(application.current_status);
    }
  });

  it("dates each archive deterministically, relative to today", () => {
    for (const application of archived) {
      const day = application.archived_at?.slice(0, 10) ?? "";
      expect(isDateOnly(day)).toBe(true);
      expect(day <= TODAY).toBe(true);
      // Filed away after it was saved, never before.
      expect(day >= application.created_at.slice(0, 10)).toBe(true);
    }
  });

  it("produces the same archive values for the same day", () => {
    const again = buildDemoDataset(TODAY);
    expect(again.applications.map((a) => a.archived_at)).toEqual(
      dataset.applications.map((a) => a.archived_at),
    );
  });

  it("moves the archive dates with the calendar too", () => {
    const later = buildDemoDataset("2027-03-01");
    const archivedLater = later.applications.filter(
      (a) => a.archived_at !== null,
    );

    expect(archivedLater).toHaveLength(archived.length);
    expect(archivedLater[0].archived_at).not.toBe(archived[0].archived_at);
  });

  it("keeps every archived record's history", () => {
    for (const application of archived) {
      const events = dataset.statusEvents.filter(
        (event) => event.application_id === application.id,
      );
      // Archiving is not deletion. The events that got it to its outcome are
      // exactly what analytics still needs from it.
      expect(events.length).toBeGreaterThan(1);
      expect(events.map((event) => event.new_status)).toContain(
        application.current_status,
      );
    }
  });

  it("leaves the archived rows in the analytics population", () => {
    for (const application of archived) {
      expect(
        dataset.analyticsRows.some((row) => row.id === application.id),
      ).toBe(true);
    }
  });

  it("keeps the active population out of the archive and vice versa", () => {
    for (const application of dataset.activeApplications) {
      expect(application.archived_at).toBeNull();
    }
    const activeIds = new Set(dataset.activeApplications.map((a) => a.id));
    for (const application of archived) {
      expect(activeIds.has(application.id)).toBe(false);
    }
  });
});

describe("the active workspace", () => {
  const active = dataset.activeApplications;
  const activeByStatus = countBy(active.map((a) => a.current_status));

  it("still has every canonical status in the board", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(activeByStatus[status] ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps all three live offers and the accepted term", () => {
    expect(activeByStatus.Offer).toBe(3);
    expect(activeByStatus.Accepted).toBeGreaterThanOrEqual(1);
  });

  it("keeps the middle of the board dense", () => {
    expect(activeByStatus.Interview).toBeGreaterThanOrEqual(2);
    expect(activeByStatus.Assessment).toBeGreaterThanOrEqual(2);
    expect(activeByStatus.Screening).toBeGreaterThanOrEqual(2);
    expect(activeByStatus.Rejected).toBeGreaterThanOrEqual(3);
  });

  it("still spans all three recruiting periods", () => {
    const terms = new Set(active.map((a) => a.work_term_season));
    expect([...terms].sort()).toEqual([...DEMO_WORK_TERMS].sort());
  });
});

describe("the search reads as one student's year", () => {
  const records = [...dataset.records.values()];

  it("has settled exactly one term", () => {
    const accepted = records.filter((r) => r.current_status === "Accepted");

    expect(accepted).toHaveLength(1);
    expect(accepted[0].company_name).toBe("IBM");
    expect(accepted[0].original_job_title).toBe(
      "Business Technology Analyst Intern",
    );
    expect(accepted[0].work_term_season).toBe("Fall 2026");
    // A four-month term, so taking it does not swallow the winter search the
    // rest of this tracker is clearly still running.
    expect(accepted[0].work_term_duration).toBe("4 months");
  });

  it("is deciding between exactly three live offers", () => {
    const offers = records.filter((r) => r.current_status === "Offer");

    expect(offers).toHaveLength(3);
    // Three different employers: a decision, not one employer's process.
    expect(new Set(offers.map((offer) => offer.company_name)).size).toBe(3);
  });

  it("never lets a record's notes claim an outcome its status denies", () => {
    for (const record of records) {
      if (record.current_status === "Accepted") continue;
      expect(record.notes ?? "", record.id).not.toMatch(/\baccepted\b/i);
    }
  });
});

describe("what the production calculations make of it", () => {
  it("produces a funnel with something at every stage", () => {
    const funnel = summarizeFunnel(dataset.analyticsRows, dataset.statusEvents);

    expect(funnel.submitted).toBeGreaterThanOrEqual(20);
    for (const milestone of funnel.milestones) {
      expect(milestone.count).toBeGreaterThan(0);
    }
    // Each stage is narrower than the one before it, as a real search is.
    const counts = funnel.milestones.map((m) => m.count);
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]).toBeLessThanOrEqual(counts[index - 1]);
    }
  });

  it("reaches the offer stage from the sample data alone", () => {
    const funnel = summarizeFunnel(dataset.analyticsRows, dataset.statusEvents);
    const offer = funnel.milestones.find((m) => m.key === "offer");

    expect(offer?.count).toBeGreaterThanOrEqual(3);
  });

  it("gives both analytics lenses something to compare", () => {
    for (const lens of ["source", "role"] as const) {
      const summary = summarizePerformance(
        dataset.analyticsRows,
        dataset.statusEvents,
        lens,
      );
      expect(summary.comparableGroups).toBeGreaterThanOrEqual(
        MINIMUM_COMPARABLE_GROUPS,
      );
    }
  });

  it("spans enough weeks for the activity chart to be a history", () => {
    const activity = summarizeActivity(
      dataset.analyticsRows,
      dataset.statusEvents,
      TODAY,
    );

    expect(activity.hasEnoughHistory).toBe(true);
    expect(activity.activeWeeks).toBeGreaterThanOrEqual(6);
  });

  it("gives the dashboard a search that looks lived in", () => {
    const dashboard = buildDashboard(
      { data: dataset.applications, error: null },
      { data: dataset.timeline, error: null },
      TODAY,
      "America/Toronto",
    );

    expect(dashboard.kind).toBe("ready");
    if (dashboard.kind !== "ready") return;

    expect(dashboard.activity.length).toBeGreaterThanOrEqual(3);
    expect(dashboard.attention.length).toBeGreaterThanOrEqual(3);
    // Both kinds of entry, so Upcoming shows the two things it can know about.
    expect(
      dashboard.attention.some((item) => item.reason.includes("action")),
    ).toBe(true);
    expect(
      dashboard.attention.some((item) => item.reason.includes("deadline")),
    ).toBe(true);
    // Several live stages, so the snapshot is a distribution rather than a spike.
    expect(dashboard.pipeline.filter((stage) => stage.count > 0).length)
      .toBeGreaterThanOrEqual(4);
  });

  it("invents no attention entry the production rules would not produce", () => {
    const dashboard = buildDashboard(
      { data: dataset.applications, error: null },
      { data: dataset.timeline, error: null },
      TODAY,
      "America/Toronto",
    );
    if (dashboard.kind !== "ready") throw new Error("expected a ready dashboard");

    for (const item of dashboard.attention) {
      const record = dataset.records.get(item.applicationId);
      expect(record).toBeDefined();
      // "overdue-action", "action-due-now" and "action-due-soon" are all the
      // student's own recorded commitment; the deadline tiers are the posting's.
      if (item.reason.includes("action")) {
        expect(record?.next_action).toBeTruthy();
      } else {
        // A deadline entry only ever comes from a real, pre-submission one.
        expect(record?.application_deadline).toBeTruthy();
        expect(["Interested", "Preparing"]).toContain(record?.current_status);
      }
    }
  });
});
