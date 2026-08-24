import { describe, expect, it, vi } from "vitest";
import type { ApplicationListFilters } from "@/lib/applications/repository";
import type { ApplicationListItem } from "@/lib/applications/types";
import { toContainsPattern } from "@/lib/applications/search";
import { runListJobs, toJobSummary } from "@/lib/mcp/list-jobs";
import {
  LIST_JOBS_DEFAULT_LIMIT,
  LIST_JOBS_MAXIMUM_LIMIT,
  listJobsInputSchema,
  toApplicationListFilters,
} from "@/lib/validation/mcp";

function summaryRow(
  overrides: Partial<ApplicationListItem> = {},
): ApplicationListItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    company_name: "RBC",
    company_domain: "rbc.com",
    original_job_title: "Business Analyst",
    normalized_job_category: "Business Analysis",
    current_status: "Applied",
    location: "Toronto, ON",
    work_arrangement: "Hybrid",
    work_term_season: "Summer 2027",
    date_applied: "2026-08-22",
    application_deadline: "2026-09-04",
    next_action: "Follow up with the recruiter",
    next_action_due_date: "2026-09-11",
    created_at: "2026-08-20T10:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

/** A stand-in list read that records the filters it was asked for. */
function dependencies(options: {
  rows?: ApplicationListItem[];
  error?: { code?: string };
}) {
  const listApplications = vi.fn<
    (filters: ApplicationListFilters) => Promise<{
      data: ApplicationListItem[] | null;
      error: { code?: string } | null;
    }>
  >(async () => ({
    data: options.error ? null : (options.rows ?? []),
    error: options.error ?? null,
  }));

  return { listApplications };
}

describe("list_jobs input contract", () => {
  it("needs no arguments at all, so Claude can just look", () => {
    expect(listJobsInputSchema.safeParse({}).success).toBe(true);
  });

  it("has no user_id argument, so a caller cannot list somebody else", () => {
    const parsed = listJobsInputSchema.parse({
      user_id: "33333333-3333-4333-8333-333333333333",
      status: "Applied",
    });

    expect(parsed).not.toHaveProperty("user_id");
    expect(toApplicationListFilters(parsed)).not.toHaveProperty("user_id");
  });

  it("accepts the filters the stored schema can actually answer", () => {
    const parsed = listJobsInputSchema.safeParse({
      status: "Interview",
      company: "RBC",
      work_term: "Summer 2027",
      archive_state: "all",
      limit: 10,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a status or archive state outside the known vocabulary", () => {
    expect(listJobsInputSchema.safeParse({ status: "ghosted" }).success).toBe(
      false,
    );
    expect(
      listJobsInputSchema.safeParse({ archive_state: "deleted" }).success,
    ).toBe(false);
  });

  it("refuses a limit above the maximum rather than silently capping it", () => {
    expect(
      listJobsInputSchema.safeParse({ limit: LIST_JOBS_MAXIMUM_LIMIT }).success,
    ).toBe(true);
    expect(
      listJobsInputSchema.safeParse({ limit: LIST_JOBS_MAXIMUM_LIMIT + 1 })
        .success,
    ).toBe(false);
    expect(listJobsInputSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(listJobsInputSchema.safeParse({ limit: 2.5 }).success).toBe(false);
  });

  it("defaults to the caller's active applications", () => {
    const filters = toApplicationListFilters(listJobsInputSchema.parse({}));

    expect(filters.archiveState).toBe("active");
    expect(filters.limit).toBe(LIST_JOBS_DEFAULT_LIMIT);
    expect(filters.status).toBeUndefined();
    expect(filters.company).toBeUndefined();
  });

  it("maps every supplied filter onto the repository contract", () => {
    const filters = toApplicationListFilters(
      listJobsInputSchema.parse({
        status: "Interview",
        company: "  RBC  ",
        work_term: " Summer 2027 ",
        archive_state: "archived",
        limit: 5,
      }),
    );

    expect(filters).toEqual({
      status: "Interview",
      company: "RBC",
      workTermSeason: "Summer 2027",
      archiveState: "archived",
      limit: 5,
    });
  });
});

describe("list_jobs results", () => {
  it("passes the requested filters through to the owner-scoped read", async () => {
    const deps = dependencies({ rows: [summaryRow()] });

    await runListJobs(
      { status: "Applied", company: "RBC", archive_state: "all" },
      deps,
    );

    const [filters] = deps.listApplications.mock.calls[0];
    expect(filters.status).toBe("Applied");
    expect(filters.company).toBe("RBC");
    expect(filters.archiveState).toBe("all");
  });

  it("returns an empty list normally rather than as an error", async () => {
    const outcome = await runListJobs({}, dependencies({ rows: [] }));

    expect(outcome).toEqual({
      outcome: "listed",
      applications: [],
      hasMore: false,
    });
  });

  it("reports a read failure instead of an empty tracker", async () => {
    const outcome = await runListJobs(
      {},
      dependencies({ error: { code: "42501" } }),
    );

    expect(outcome).toEqual({ outcome: "error", code: "42501" });
  });

  it("returns no more than the requested limit", async () => {
    const rows = Array.from({ length: 10 }, (_item, index) =>
      summaryRow({ id: `1111111${index}-1111-4111-8111-111111111111` }),
    );
    const outcome = await runListJobs({ limit: 3 }, dependencies({ rows }));

    expect(outcome.outcome).toBe("listed");
    expect(outcome.outcome === "listed" && outcome.applications).toHaveLength(3);
  });

  it("asks for one row past the limit so more results can be reported", async () => {
    const deps = dependencies({ rows: [] });

    await runListJobs({ limit: 3 }, deps);

    const [filters] = deps.listApplications.mock.calls[0];
    expect(filters.limit).toBe(4);
  });

  it("flags that more applications matched than were returned", async () => {
    const rows = Array.from({ length: 4 }, (_item, index) =>
      summaryRow({ id: `1111111${index}-1111-4111-8111-111111111111` }),
    );
    const outcome = await runListJobs({ limit: 3 }, dependencies({ rows }));

    expect(outcome.outcome === "listed" && outcome.hasMore).toBe(true);
  });

  it("does not flag more results when the tracker is exhausted", async () => {
    const rows = [summaryRow(), summaryRow({ id: "22222222-2222-4222-8222-222222222222" })];
    const outcome = await runListJobs({ limit: 3 }, dependencies({ rows }));

    expect(outcome.outcome === "listed" && outcome.hasMore).toBe(false);
  });

  it("caps an unspecified limit at the default", async () => {
    const deps = dependencies({ rows: [] });

    await runListJobs({}, deps);

    const [filters] = deps.listApplications.mock.calls[0];
    expect(filters.limit).toBe(LIST_JOBS_DEFAULT_LIMIT + 1);
  });
});

describe("list_jobs records stay concise", () => {
  it("carries only the fields needed to choose between applications", () => {
    expect(Object.keys(toJobSummary(summaryRow())).sort()).toEqual(
      [
        "application_id",
        "archived",
        "company",
        "date_applied",
        "deadline",
        "job_title",
        "location",
        "status",
        "work_term",
      ].sort(),
    );
  });

  it("never carries the job description or notes, however long they are", async () => {
    const outcome = await runListJobs(
      {},
      dependencies({ rows: [summaryRow(), summaryRow()] }),
    );

    expect(outcome.outcome).toBe("listed");
    const serialized = JSON.stringify(
      outcome.outcome === "listed" ? outcome.applications : [],
    );
    expect(serialized).not.toContain("job_description");
    expect(serialized).not.toContain("notes");
    // A summary of a fully populated application stays small enough that
    // listing the maximum page is still cheap for Claude to read.
    expect(serialized.length / 2).toBeLessThan(400);
  });

  it("hides the unspecified sentinel behind a plain empty value", () => {
    const summary = toJobSummary(
      summaryRow({ location: "Not specified", work_term_season: "Not specified" }),
    );

    expect(summary.location).toBeNull();
    expect(summary.work_term).toBeNull();
  });

  it("reports the application id Claude needs for get_job and update_job", () => {
    const summary = toJobSummary(summaryRow());

    expect(summary.application_id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("marks an archived application as archived", () => {
    expect(toJobSummary(summaryRow()).archived).toBe(false);
    expect(
      toJobSummary(summaryRow({ archived_at: "2026-08-21T10:00:00.000Z" }))
        .archived,
    ).toBe(true);
  });
});

describe("company and work-term filters match literal text", () => {
  it("looks for the term anywhere in the stored value", () => {
    expect(toContainsPattern("RBC")).toBe("%RBC%");
  });

  it("escapes the wildcards a student's own text may contain", () => {
    // Without escaping, `100%` would match nearly every stored company.
    expect(toContainsPattern("100%_Inc")).toBe("%100\\%\\_Inc%");
    expect(toContainsPattern("a\\b")).toBe("%a\\\\b%");
  });
});
