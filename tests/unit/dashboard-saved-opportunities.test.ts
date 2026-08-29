import { describe, expect, it } from "vitest";
import type { ApplicationListItem } from "@/lib/applications/types";
import {
  savedOpportunities,
  type SavedOpportunityApplication,
} from "@/lib/dashboard/saved-opportunities";

const TODAY = "2026-08-29";

function application(
  overrides: Partial<SavedOpportunityApplication> = {},
): SavedOpportunityApplication {
  const base: ApplicationListItem = {
    id: "saved-1",
    company_name: "RBC",
    company_domain: "rbc.com",
    original_job_title: "Business Analyst Intern",
    normalized_job_category: "Business Analysis",
    current_status: "Interested",
    location: "Toronto, ON",
    work_arrangement: "Hybrid",
    work_term_season: "Winter 2027",
    date_applied: null,
    application_deadline: null,
    next_action: null,
    next_action_due_date: null,
    created_at: "2026-08-20T16:00:00.000Z",
    archived_at: null,
  };

  return { ...base, savedOn: "2026-08-20", ...overrides };
}

describe("saved opportunities eligibility", () => {
  it("includes only active applications in the existing saved statuses", () => {
    const opportunities = savedOpportunities(
      [
        application({ id: "interested", current_status: "Interested" }),
        application({ id: "preparing", current_status: "Preparing" }),
        application({ id: "submitted", current_status: "Applied" }),
        application({
          id: "archived",
          current_status: "Interested",
          archived_at: "2026-08-28T12:00:00.000Z",
        }),
      ],
      TODAY,
    );

    expect(opportunities.map((opportunity) => opportunity.applicationId)).toEqual([
      "interested",
      "preparing",
    ]);
  });

  it("excludes a recorded deadline that has passed", () => {
    expect(
      savedOpportunities(
        [application({ application_deadline: "2026-08-28" })],
        TODAY,
      ),
    ).toEqual([]);
  });

  it("keeps a deadline due today", () => {
    expect(
      savedOpportunities(
        [application({ application_deadline: TODAY })],
        TODAY,
      )[0]?.deadline,
    ).toBe(TODAY);
  });
});

describe("saved opportunities ordering", () => {
  it("places deadlines first, nearest deadline first", () => {
    const opportunities = savedOpportunities(
      [
        application({ id: "undated", savedOn: "2026-07-01" }),
        application({
          id: "later",
          application_deadline: "2026-09-04",
          savedOn: "2026-07-02",
        }),
        application({
          id: "sooner",
          application_deadline: "2026-08-30",
          savedOn: "2026-08-28",
        }),
      ],
      TODAY,
    );

    expect(opportunities.map((opportunity) => opportunity.applicationId)).toEqual([
      "sooner",
      "later",
      "undated",
    ]);
  });

  it("orders undated records by the oldest truthful saved day", () => {
    const opportunities = savedOpportunities(
      [
        application({ id: "newest", savedOn: "2026-08-28" }),
        application({ id: "oldest", savedOn: "2026-07-10" }),
        application({ id: "middle", savedOn: "2026-08-01" }),
      ],
      TODAY,
    );

    expect(opportunities.map((opportunity) => opportunity.applicationId)).toEqual([
      "oldest",
      "middle",
      "newest",
    ]);
  });
});
