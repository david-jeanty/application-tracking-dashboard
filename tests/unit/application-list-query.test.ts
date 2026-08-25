import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  findApplicationByExactUrl,
  getApplicationById,
  listActiveApplications,
  listApplicationsForAnalytics,
  listActiveWorkTermSeasons,
  listApplications,
  listApplicationStatusHistory,
  listStatusHistory,
  listStatusTimeline,
} from "@/lib/applications/repository";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APPLICATION = "11111111-1111-4111-8111-111111111111";

type Call = { method: string; args: unknown[] };

/**
 * A stand-in PostgREST query builder that records the chain instead of talking
 * to a database.
 *
 * This asserts the query the repository *builds* — which columns are filtered,
 * on what, and in which shape. What those filters then mean in Postgres is
 * covered by `supabase/tests/002_application_search.test.sql`, since only a
 * real database can answer that.
 */
function recordingClient(rows: unknown[] = []) {
  const calls: Call[] = [];

  const builder: Record<string, unknown> = {};
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };

  for (const method of ["select", "eq", "is", "not", "or", "ilike", "order", "limit"]) {
    builder[method] = record(method);
  }
  builder.returns = () => Promise.resolve({ data: rows, error: null });
  builder.maybeSingle = () =>
    Promise.resolve({ data: rows[0] ?? null, error: null });

  const client = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return builder;
    },
  } as unknown as SupabaseClient;

  const find = (method: string) => calls.filter((call) => call.method === method);
  const argsFor = (method: string, column: string) =>
    find(method).find((call) => call.args[0] === column)?.args;

  return { client, calls, find, argsFor };
}

describe("every list read is owner-scoped and excludes archived rows", () => {
  it("filters by the authenticated user id", async () => {
    const recorder = recordingClient();

    await listActiveApplications(recorder.client, USER);

    expect(recorder.argsFor("eq", "user_id")).toEqual(["user_id", USER]);
  });

  it("excludes archived applications on the active list", async () => {
    const recorder = recordingClient();

    await listActiveApplications(recorder.client, USER);

    expect(recorder.argsFor("is", "archived_at")).toEqual([
      "archived_at",
      null,
    ]);
  });

  it("still excludes archived rows when filters are applied", async () => {
    const recorder = recordingClient();

    await listActiveApplications(recorder.client, USER, {
      search: "rbc",
      status: "Applied",
      category: "Finance",
      workTermSeason: "Winter 2027",
    });

    expect(recorder.argsFor("is", "archived_at")).toEqual([
      "archived_at",
      null,
    ]);
  });

  it("ignores an archive state a caller tries to smuggle in", async () => {
    const recorder = recordingClient();

    // The parameter type excludes `archiveState`; this proves the runtime
    // behavior matches, so the active list cannot be widened by a caller.
    await listActiveApplications(recorder.client, USER, {
      archiveState: "all",
    } as Parameters<typeof listActiveApplications>[2]);

    expect(recorder.argsFor("is", "archived_at")).toEqual([
      "archived_at",
      null,
    ]);
    expect(recorder.find("not")).toHaveLength(0);
  });

  it("never selects the long free-text columns for a list", async () => {
    const recorder = recordingClient();

    await listActiveApplications(recorder.client, USER);

    const columns = String(recorder.find("select")[0].args[0]);
    expect(columns).not.toContain("job_description");
    expect(columns).not.toContain("notes");
  });

  it("carries the company domain in the list projection", async () => {
    // Every list surface renders the employer's mark — the applications list,
    // the archive, needs attention, and recent activity — so the domain has to
    // arrive with the row rather than through a second read per application.
    const recorder = recordingClient();

    await listActiveApplications(recorder.client, USER);

    expect(String(recorder.find("select")[0].args[0]).split(",")).toContain(
      "company_domain",
    );
  });

  it("gives analytics its own narrower projection, with the source", async () => {
    // Analytics is the only surface that reads `application_source`, and it
    // reads none of the dates, titles, or branding a list needs. Its own
    // projection keeps that widening out of the shared list contract.
    const recorder = recordingClient();

    await listApplicationsForAnalytics(recorder.client, USER);

    const columns = String(recorder.find("select")[0].args[0]).split(",");
    expect(columns).toContain("application_source");
    // The student's own record of when they applied, which search activity is
    // drawn from. A short existing column, not a schema change.
    expect(columns).toContain("date_applied");
    expect(columns).not.toContain("job_description");
    expect(columns).not.toContain("notes");
    expect(columns).not.toContain("company_name");
    expect(columns.length).toBeLessThan(
      String(recorder.find("select")[0].args[0]).length,
    );
  });

  it("scopes the analytics read to the owner and covers archived rows", async () => {
    // Every application the student saved, archived ones included: a role they
    // tidied away still happened, and dropping it would inflate every rate.
    const recorder = recordingClient();

    await listApplicationsForAnalytics(recorder.client, USER);

    expect(recorder.argsFor("eq", "user_id")).toEqual(["user_id", USER]);
    expect(recorder.find("is")).toHaveLength(0);
    expect(recorder.find("not")).toHaveLength(0);
  });

  it("carries the company domain in the detail projection", async () => {
    const recorder = recordingClient();

    await getApplicationById(recorder.client, USER, APPLICATION);

    expect(String(recorder.find("select")[0].args[0]).split(",")).toContain(
      "company_domain",
    );
  });
});

describe("exact application URL lookup", () => {
  it("uses the authenticated owner and exact stored URL without fuzzy matching", async () => {
    const recorder = recordingClient();
    const url = "https://jobs.example.com/postings/123?source=board";

    await findApplicationByExactUrl(recorder.client, USER, url);

    expect(recorder.argsFor("eq", "user_id")).toEqual(["user_id", USER]);
    expect(recorder.argsFor("eq", "application_url")).toEqual([
      "application_url",
      url,
    ]);
    expect(recorder.find("ilike")).toHaveLength(0);
    expect(recorder.find("or")).toHaveLength(0);
    expect(recorder.find("limit")[0].args).toEqual([1]);
  });
});

describe("filters reach the query", () => {
  it("filters by status", async () => {
    const recorder = recordingClient();

    await listActiveApplications(recorder.client, USER, { status: "Applied" });

    expect(recorder.argsFor("eq", "current_status")).toEqual([
      "current_status",
      "Applied",
    ]);
  });

  it("filters by category", async () => {
    const recorder = recordingClient();

    await listActiveApplications(recorder.client, USER, {
      category: "Business Analysis",
    });

    expect(recorder.argsFor("eq", "normalized_job_category")).toEqual([
      "normalized_job_category",
      "Business Analysis",
    ]);
  });

  it("filters by work term as a case-insensitive substring", async () => {
    const recorder = recordingClient();

    await listActiveApplications(recorder.client, USER, {
      workTermSeason: "Winter 2027",
    });

    expect(recorder.argsFor("ilike", "work_term_season")).toEqual([
      "work_term_season",
      "%Winter 2027%",
    ]);
  });

  it("searches company, title, and location in one expression", async () => {
    const recorder = recordingClient();

    await listActiveApplications(recorder.client, USER, { search: "rbc" });

    const expression = String(recorder.find("or")[0].args[0]);
    expect(expression).toContain("company_name.ilike.");
    expect(expression).toContain("original_job_title.ilike.");
    expect(expression).toContain("location.ilike.");
  });

  it("combines a search with every filter at once", async () => {
    const recorder = recordingClient();

    await listActiveApplications(recorder.client, USER, {
      search: "analyst",
      status: "Interview",
      category: "Finance",
      workTermSeason: "Winter 2027",
    });

    expect(recorder.find("or")).toHaveLength(1);
    expect(recorder.argsFor("eq", "current_status")?.[1]).toBe("Interview");
    expect(recorder.argsFor("eq", "normalized_job_category")?.[1]).toBe(
      "Finance",
    );
    expect(recorder.argsFor("ilike", "work_term_season")?.[1]).toBe(
      "%Winter 2027%",
    );
    // Owner scoping survives every combination.
    expect(recorder.argsFor("eq", "user_id")?.[1]).toBe(USER);
  });

  it("adds no search or filter predicates for an unfiltered list", async () => {
    const recorder = recordingClient();

    await listActiveApplications(recorder.client, USER);

    expect(recorder.find("or")).toHaveLength(0);
    expect(recorder.find("ilike")).toHaveLength(0);
    expect(recorder.argsFor("eq", "current_status")).toBeUndefined();
    expect(recorder.argsFor("eq", "normalized_job_category")).toBeUndefined();
    // Clearing filters returns the ordinary owner-scoped active list.
    expect(recorder.argsFor("eq", "user_id")?.[1]).toBe(USER);
    expect(recorder.argsFor("is", "archived_at")?.[1]).toBeNull();
  });

  it("leaves the MCP list path's single-column company filter alone", async () => {
    const recorder = recordingClient();

    await listApplications(recorder.client, USER, { company: "RBC" });

    expect(recorder.argsFor("ilike", "company_name")).toEqual([
      "company_name",
      "%RBC%",
    ]);
    expect(recorder.find("or")).toHaveLength(0);
  });
});

describe("work-term options", () => {
  it("reads only the caller's own active applications", async () => {
    const recorder = recordingClient([]);

    await listActiveWorkTermSeasons(recorder.client, USER);

    expect(recorder.argsFor("eq", "user_id")).toEqual(["user_id", USER]);
    expect(recorder.argsFor("is", "archived_at")).toEqual([
      "archived_at",
      null,
    ]);
    expect(String(recorder.find("select")[0].args[0])).toBe(
      "work_term_season",
    );
  });

  it("returns each term once, sorted, without the internal sentinel", async () => {
    const recorder = recordingClient([
      { work_term_season: "Winter 2027" },
      { work_term_season: "Summer 2027" },
      { work_term_season: "Winter 2027" },
      { work_term_season: "Not specified" },
      { work_term_season: "Fall 2026" },
    ]);

    const { data } = await listActiveWorkTermSeasons(recorder.client, USER);

    expect(data).toEqual(["Fall 2026", "Summer 2027", "Winter 2027"]);
  });

  it("returns an empty list rather than failing when nothing is saved", async () => {
    const recorder = recordingClient([]);

    expect(await listActiveWorkTermSeasons(recorder.client, USER)).toEqual({
      data: [],
      error: null,
    });
  });
});

describe("status history read", () => {
  it("is scoped to the authenticated user", async () => {
    const recorder = recordingClient();

    await listStatusHistory(recorder.client, USER);

    expect(recorder.find("from")[0].args[0]).toBe("application_status_history");
    expect(recorder.argsFor("eq", "user_id")).toEqual(["user_id", USER]);
  });

  it("projects only what the conversion metrics need", async () => {
    const recorder = recordingClient();

    await listStatusHistory(recorder.client, USER);

    // No changed_at: a duration metric would mix a timestamptz with the
    // date-only date_applied, which this ticket deliberately defers.
    expect(String(recorder.find("select")[0].args[0])).toBe(
      "application_id,new_status",
    );
  });

  it("includes archived applications' history by not filtering it out", async () => {
    const recorder = recordingClient();

    await listStatusHistory(recorder.client, USER);

    expect(recorder.argsFor("is", "archived_at")).toBeUndefined();
  });
});

describe("the single-application history read", () => {
  it("is scoped to the authenticated owner as well as the application", async () => {
    const recorder = recordingClient();

    await listApplicationStatusHistory(recorder.client, USER, APPLICATION);

    expect(recorder.argsFor("eq", "user_id")).toEqual(["user_id", USER]);
    expect(recorder.argsFor("eq", "application_id")).toEqual([
      "application_id",
      APPLICATION,
    ]);
  });

  it("reads only the history table, and only the columns the rail needs", async () => {
    const recorder = recordingClient();

    await listApplicationStatusHistory(recorder.client, USER, APPLICATION);

    expect(recorder.find("from").map((call) => call.args[0])).toEqual([
      "application_status_history",
    ]);
    expect(recorder.find("select").map((call) => call.args[0])).toEqual([
      "application_id,new_status",
    ]);
  });

  it("never writes", async () => {
    const recorder = recordingClient();

    await listApplicationStatusHistory(recorder.client, USER, APPLICATION);

    for (const method of ["insert", "update", "delete", "upsert"]) {
      expect(recorder.find(method)).toHaveLength(0);
    }
  });
});

describe("the status timeline read", () => {
  it("is scoped to the authenticated owner", async () => {
    const recorder = recordingClient();

    await listStatusTimeline(recorder.client, USER);

    expect(recorder.argsFor("eq", "user_id")).toEqual(["user_id", USER]);
  });

  it("reads only the history table, and only the columns it needs", async () => {
    const recorder = recordingClient();

    await listStatusTimeline(recorder.client, USER);

    expect(recorder.find("from").map((call) => call.args[0])).toEqual([
      "application_status_history",
    ]);
    expect(recorder.find("select")[0]?.args[0]).toBe(
      "application_id,previous_status,new_status,changed_at",
    );
  });

  it("returns the newest event first", async () => {
    const recorder = recordingClient();

    await listStatusTimeline(recorder.client, USER);

    expect(recorder.find("order")[0]?.args).toEqual([
      "changed_at",
      { ascending: false },
    ]);
  });

  it("never writes to the history table", async () => {
    // Authenticated clients hold `select` only; every mutation policy denies.
    const recorder = recordingClient();

    await listStatusTimeline(recorder.client, USER);

    expect(recorder.find("update")).toHaveLength(0);
    expect(recorder.find("delete")).toHaveLength(0);
  });
});
