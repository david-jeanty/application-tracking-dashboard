import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDashboard } from "@/lib/dashboard/summary";
import type { ApplicationListItem, ApplicationTimelineEvent } from "@/lib/applications/types";

const TODAY = "2026-08-26";
const ZONE = "America/Toronto";

function application(
  overrides: Partial<ApplicationListItem> = {},
): ApplicationListItem {
  return {
    id: "app-1",
    company_name: "RBC",
    company_domain: null,
    original_job_title: "Business Analyst Intern",
    normalized_job_category: "Business Analysis",
    current_status: "Applied",
    location: "Toronto, ON",
    work_arrangement: "Hybrid",
    work_term_season: "Winter 2027",
    date_applied: "2026-08-24",
    application_deadline: null,
    next_action: null,
    next_action_due_date: null,
    created_at: "2026-08-24T12:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

function timelineEvent(
  overrides: Partial<ApplicationTimelineEvent> = {},
): ApplicationTimelineEvent {
  return {
    application_id: "app-1",
    previous_status: null,
    new_status: "Applied",
    changed_at: "2026-08-24T16:00:00.000Z",
    ...overrides,
  };
}

const ok = <Row,>(data: Row[]) => ({ data, error: null });

describe("a failed read is never reported as zeros", () => {
  it("reports unavailable when the applications read errors", () => {
    expect(
      buildDashboard(
        { data: null, error: { code: "42501" } },
        ok([]),
        TODAY,
        ZONE,
      ),
    ).toEqual({ kind: "unavailable" });
  });

  it("reports unavailable when the timeline read errors", () => {
    expect(
      buildDashboard(
        ok([application()]),
        { data: null, error: { code: "57014" } },
        TODAY,
        ZONE,
      ),
    ).toEqual({ kind: "unavailable" });
  });

  it("reports unavailable even when an error arrives alongside rows", () => {
    // Never let a partial result be presented as a complete picture.
    expect(
      buildDashboard(
        { data: [application()], error: { code: "57014" } },
        ok([]),
        TODAY,
        ZONE,
      ),
    ).toEqual({ kind: "unavailable" });
  });

  it("reports unavailable when rows are missing without an error", () => {
    expect(
      buildDashboard({ data: null, error: null }, ok([]), TODAY, ZONE),
    ).toEqual({ kind: "unavailable" });
  });

  it("never says the student is caught up when the read failed", () => {
    // "Nothing needs your attention" is a claim about their data. It is only
    // true when the query actually succeeded.
    const result = buildDashboard(
      { data: null, error: { code: "42501" } },
      ok([]),
      TODAY,
      ZONE,
    );

    expect(result.kind).not.toBe("ready");
  });
});

describe("an empty tracker", () => {
  it("is reported as empty rather than as a dashboard full of zeros", () => {
    expect(buildDashboard(ok([]), ok([]), TODAY, ZONE)).toEqual({ kind: "empty" });
  });
});

describe("the search summary uses the shared analytics definitions", () => {
  const applications = [
    application({ id: "a", current_status: "Interview" }),
    application({ id: "b", current_status: "Rejected" }),
    application({ id: "c", current_status: "Interested" }),
    application({
      id: "d",
      current_status: "Offer",
      archived_at: "2026-08-20T10:00:00.000Z",
    }),
  ];
  const timeline = [
    timelineEvent({ application_id: "a", new_status: "Applied" }),
    timelineEvent({
      application_id: "a",
      previous_status: "Applied",
      new_status: "Interview",
    }),
    timelineEvent({ application_id: "b", new_status: "Applied" }),
    timelineEvent({
      application_id: "b",
      previous_status: "Applied",
      new_status: "Interview",
    }),
    timelineEvent({
      application_id: "b",
      previous_status: "Interview",
      new_status: "Rejected",
    }),
    timelineEvent({ application_id: "c", new_status: "Interested" }),
    timelineEvent({ application_id: "d", new_status: "Applied" }),
    timelineEvent({
      application_id: "d",
      previous_status: "Applied",
      new_status: "Offer",
    }),
  ];

  const built = buildDashboard(ok(applications), ok(timeline), TODAY, ZONE);
  const summary = built.kind === "ready" ? built.search : null;

  it("takes the total from the canonical analytics count, archived included", () => {
    // Read rather than recounted, so the dashboard and the analytics page can
    // never disagree about how many applications the student has saved.
    expect(summary?.applications).toBe(4);
  });

  it("counts submitted from history, so a saved-only application is excluded", () => {
    expect(summary?.submitted).toBe(3);
  });

  it("counts active from current status", () => {
    expect(summary?.active).toBe(1);
  });

  it("counts an interview that later became a rejection", () => {
    // This is the whole reason the history table exists, and the definition
    // is the analytics one rather than a second copy. Three, not two: the
    // shared INTERVIEW_STATUSES set treats reaching Offer as having reached
    // an interview, so the archived offer counts here too.
    expect(summary?.interviews).toBe(3);
  });

  it("counts an offer on an archived application", () => {
    // Historical metrics include archived records, matching analytics. A role
    // a student tidied away still happened.
    expect(summary?.offers).toBe(1);
  });
});

describe("the working sections use the active population", () => {
  it("keeps an archived application out of attention and the pipeline", () => {
    const built = buildDashboard(
      ok([
        application({
          id: "archived",
          current_status: "Applied",
          archived_at: "2026-08-01T10:00:00.000Z",
          next_action: "Follow up",
          next_action_due_date: "2026-08-01",
        }),
      ]),
      ok([timelineEvent({ application_id: "archived" })]),
      TODAY,
      ZONE,
    );

    expect(built.kind).toBe("ready");
    if (built.kind !== "ready") return;

    expect(built.attention).toEqual([]);
    expect(built.pipeline.every((stage) => stage.count === 0)).toBe(true);
  });

  it("keeps that same archived application in the historical sections", () => {
    const built = buildDashboard(
      ok([
        application({
          id: "archived",
          current_status: "Applied",
          archived_at: "2026-08-01T10:00:00.000Z",
        }),
      ]),
      ok([timelineEvent({ application_id: "archived" })]),
      TODAY,
      ZONE,
    );

    if (built.kind !== "ready") throw new Error("expected a ready dashboard");

    expect(built.search.submitted).toBe(1);
    expect(built.activity).toHaveLength(1);
  });
});

describe("timestamps are converted to calendar days once, in the given zone", () => {
  it("places a late-evening event on the local day, not the UTC one", () => {
    // 02:30 UTC is the previous evening in Toronto. Getting this wrong would
    // put an event a day into the future and skew "this week".
    const built = buildDashboard(
      ok([application()]),
      ok([timelineEvent({ changed_at: "2026-08-25T02:30:00.000Z" })]),
      TODAY,
      ZONE,
    );

    if (built.kind !== "ready") throw new Error("expected a ready dashboard");
    expect(built.activity[0].day).toBe("2026-08-24");
  });
});

describe("the whole dashboard comes together", () => {
  const built = buildDashboard(
    ok([
      application({
        id: "overdue",
        company_name: "KPMG",
        next_action: "Follow up with recruiter",
        next_action_due_date: "2026-08-24",
      }),
      application({ id: "quiet", company_name: "BMO", current_status: "Screening" }),
      application({
        id: "closing",
        company_name: "Shopify",
        current_status: "Interested",
        application_deadline: "2026-08-29",
        created_at: "2026-08-20T12:00:00.000Z",
      }),
    ]),
    ok([
      timelineEvent({ application_id: "overdue", changed_at: "2026-08-25T16:00:00.000Z" }),
      timelineEvent({ application_id: "quiet", changed_at: "2026-07-20T16:00:00.000Z" }),
      timelineEvent({
        application_id: "closing",
        new_status: "Interested",
        changed_at: "2026-08-20T16:00:00.000Z",
      }),
    ]),
    TODAY,
    ZONE,
  );

  it("surfaces the overdue follow-up, then the unsubmitted deadline", () => {
    if (built.kind !== "ready") throw new Error("expected a ready dashboard");

    // BMO has been at Screening since July and is deliberately absent: an
    // employer not replying is not a task the student can act on.
    expect(built.attention.map((item) => [item.companyName, item.reason])).toEqual([
      ["KPMG", "overdue-action"],
      ["Shopify", "deadline-important"],
    ]);
  });

  it("reads saved age from created_at, through the same zone as everything else", () => {
    if (built.kind !== "ready") throw new Error("expected a ready dashboard");

    const deadline = built.attention.find(
      (item) => item.reason === "deadline-important",
    );
    expect(deadline?.note).toBe("Saved 6 days ago · Still Interested");
  });

  it("reports the pipeline, the week, and recent activity together", () => {
    if (built.kind !== "ready") throw new Error("expected a ready dashboard");

    expect(built.pipeline.find((stage) => stage.status === "Applied")?.count).toBe(1);
    expect(built.week.weekStart).toBe("2026-08-24");
    expect(built.week.submitted).toBe(1);
    expect(built.activity).toHaveLength(3);
  });
});


describe("the dashboard page contract", () => {
  // The page authenticates and reads; `DashboardView` renders what came back.
  // The contract below is about the dashboard as a whole, so it reads both.
  const page = [
    readFileSync("app/(app)/dashboard/page.tsx", "utf8"),
    readFileSync("components/dashboard/dashboard-view.tsx", "utf8"),
  ].join("\n");
  const sections = readFileSync(
    "components/dashboard/dashboard-sections.tsx",
    "utf8",
  );

  it("renders Upcoming only when there is something in it", () => {
    // The section is a utility, not the page's purpose. At zero items the
    // dashboard simply ends after This week.
    expect(page).toContain("dashboard.attention.length > 0");
  });

  it("keeps no caught-up empty state", () => {
    expect(page).not.toMatch(/caught up/i);
    expect(sections).not.toMatch(/caught up/i);
  });

  it("carries no AI assistant promotion", () => {
    // MCP onboarding belongs in Settings. The dashboard is a workspace, not a
    // marketing surface.
    expect(page).not.toMatch(/AI assistant|Set up the connection|Sparkles/i);
    expect(sections).not.toMatch(/AI assistant|Set up the connection/i);
  });

  it("carries no large analytics call to action", () => {
    expect(page).not.toMatch(/How is the search going overall|View full analytics/);
    expect(sections).not.toMatch(/How is the search going overall/);
  });

  it("links to analytics from This week instead", () => {
    // The href is built from the workspace's base path so the demo's copy of
    // this section stays inside the demo; in the signed-in workspace the base
    // is empty and it resolves to `/analytics` exactly as before.
    expect(sections).toContain("analyticsPath(basePath)");
    expect(sections).toContain("View analytics");
  });

  it("does not send the student to the unfinished pipeline page", () => {
    // `/pipeline` is still a Phase 4 placeholder, so nothing here offers it.
    expect(page).not.toContain('href="/pipeline"');
    expect(sections).not.toContain('href="/pipeline"');
  });

  it("says nothing about applications going quiet in the empty state", () => {
    expect(page).not.toMatch(/gone quiet|no response|stale/i);
  });

  it("wraps no section in a card", () => {
    // Sections are separated by a heading and a rule, which is the language
    // the applications list already uses.
    expect(page).not.toMatch(/from "@\/components\/ui\/card"/);
    expect(sections).not.toMatch(/from "@\/components\/ui\/card"/);
  });
});
