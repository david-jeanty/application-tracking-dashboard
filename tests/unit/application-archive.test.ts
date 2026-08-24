import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  listApplications,
  setApplicationArchiveState,
} from "@/lib/applications/repository";
import { toArchiveNotice } from "@/lib/applications/archive-notice";
import { pipelineSnapshot } from "@/lib/dashboard/calculate";
import type { ApplicationRecord } from "@/lib/applications/types";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ANOTHER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const APPLICATION = "11111111-1111-4111-8111-111111111111";

type Call = { method: string; args: unknown[] };

/**
 * A stand-in PostgREST builder that records the chain instead of querying.
 *
 * This asserts the statement the repository *builds*: which columns it writes,
 * which it filters on, and which it never mentions. What those filters mean in
 * Postgres — and whether row-level security stops another student — can only
 * be answered by a real database, which is what the pgTAP suite covers.
 */
function recordingClient(result: {
  data?: unknown;
  error?: { code?: string } | null;
}) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };

  for (const method of ["select", "eq", "is", "not", "or", "ilike", "order", "limit", "update"]) {
    builder[method] = record(method);
  }
  builder.maybeSingle = () =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  builder.returns = () =>
    Promise.resolve({ data: result.data ?? [], error: result.error ?? null });

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

function record(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: APPLICATION,
    company_name: "RBC",
    company_domain: null,
    original_job_title: "Business Analyst",
    normalized_job_category: "Business Analysis",
    classification_confidence: null,
    location: "Toronto, ON",
    work_arrangement: "Hybrid",
    application_url: null,
    application_source: "LinkedIn",
    job_description: null,
    application_deadline: null,
    date_applied: "2026-08-22",
    current_status: "Interview",
    work_term_season: "Summer 2027",
    work_term_duration: "4 months",
    salary: null,
    notes: null,
    next_action: null,
    next_action_due_date: null,
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-23T10:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

describe("archiving writes only the archive timestamp", () => {
  it("sets archived_at to the supplied timestamp", async () => {
    const recorder = recordingClient({ data: record({ archived_at: "2026-08-24T09:00:00.000Z" }) });

    await setApplicationArchiveState(
      recorder.client,
      USER,
      APPLICATION,
      "2026-08-24T09:00:00.000Z",
    );

    expect(recorder.find("update")[0].args[0]).toEqual({
      archived_at: "2026-08-24T09:00:00.000Z",
    });
  });

  it("clears archived_at on restore", async () => {
    const recorder = recordingClient({ data: record() });

    await setApplicationArchiveState(recorder.client, USER, APPLICATION, null);

    expect(recorder.find("update")[0].args[0]).toEqual({ archived_at: null });
  });

  it("never writes current_status, so the status cannot change", async () => {
    for (const archivedAt of ["2026-08-24T09:00:00.000Z", null]) {
      const recorder = recordingClient({ data: record() });

      await setApplicationArchiveState(
        recorder.client,
        USER,
        APPLICATION,
        archivedAt,
      );

      const payload = recorder.find("update")[0].args[0] as Record<string, unknown>;
      expect(Object.keys(payload)).toEqual(["archived_at"]);
      expect(payload).not.toHaveProperty("current_status");
    }
  });

  it("creates no status-history event, because it never touches that table", async () => {
    const recorder = recordingClient({ data: record() });

    await setApplicationArchiveState(
      recorder.client,
      USER,
      APPLICATION,
      "2026-08-24T09:00:00.000Z",
    );

    // The history trigger is `after update of current_status ... when
    // (old.current_status is distinct from new.current_status)`. A statement
    // that writes only archived_at cannot fire it.
    const tables = recorder.find("from").map((call) => call.args[0]);
    expect(tables).toEqual(["applications"]);
    expect(tables).not.toContain("application_status_history");
  });

  it("leaves every other field alone", async () => {
    const recorder = recordingClient({ data: record() });

    await setApplicationArchiveState(recorder.client, USER, APPLICATION, null);

    const payload = recorder.find("update")[0].args[0] as Record<string, unknown>;
    for (const field of [
      "company_name",
      "original_job_title",
      "notes",
      "date_applied",
      "next_action",
      "user_id",
    ]) {
      expect(payload).not.toHaveProperty(field);
    }
  });
});

describe("archiving is owner-scoped", () => {
  it("filters the write by the authenticated user id", async () => {
    const recorder = recordingClient({ data: record() });

    await setApplicationArchiveState(recorder.client, USER, APPLICATION, null);

    expect(recorder.argsFor("eq", "user_id")).toEqual(["user_id", USER]);
    expect(recorder.argsFor("eq", "id")).toEqual(["id", APPLICATION]);
  });

  it("reports another student's application as not found, changing nothing", async () => {
    // The owner predicate matches no row, so PostgREST returns nothing.
    const recorder = recordingClient({ data: null });

    const result = await setApplicationArchiveState(
      recorder.client,
      ANOTHER_USER,
      APPLICATION,
      "2026-08-24T09:00:00.000Z",
    );

    expect(result).toEqual({ outcome: "not_found" });
    expect(recorder.argsFor("eq", "user_id")).toEqual([
      "user_id",
      ANOTHER_USER,
    ]);
  });

  it("reports a missing application exactly as it reports one owned by someone else", async () => {
    const missing = await setApplicationArchiveState(
      recordingClient({ data: null }).client,
      USER,
      APPLICATION,
      null,
    );
    const notOwned = await setApplicationArchiveState(
      recordingClient({ data: null }).client,
      ANOTHER_USER,
      APPLICATION,
      null,
    );

    expect(missing).toEqual(notOwned);
  });

  it("surfaces a database failure without succeeding", async () => {
    const recorder = recordingClient({ data: null, error: { code: "42501" } });

    const result = await setApplicationArchiveState(
      recorder.client,
      USER,
      APPLICATION,
      null,
    );

    expect(result).toEqual({ outcome: "error", code: "42501" });
  });
});

describe("archived rows move between the two lists", () => {
  it("the archive list asks only for archived rows", async () => {
    const recorder = recordingClient({ data: [] });

    await listApplications(recorder.client, USER, { archiveState: "archived" });

    expect(recorder.argsFor("not", "archived_at")).toEqual([
      "archived_at",
      "is",
      null,
    ]);
    // Never the active predicate as well.
    expect(recorder.argsFor("is", "archived_at")).toBeUndefined();
    expect(recorder.argsFor("eq", "user_id")).toEqual(["user_id", USER]);
  });

  it("the active list excludes archived rows, so a restored one returns to it", async () => {
    const recorder = recordingClient({ data: [] });

    await listApplications(recorder.client, USER, { archiveState: "active" });

    expect(recorder.argsFor("is", "archived_at")).toEqual(["archived_at", null]);
    expect(recorder.argsFor("not", "archived_at")).toBeUndefined();
  });

  it("analytics still covers both sides of the line", async () => {
    const recorder = recordingClient({ data: [] });

    await listApplications(recorder.client, USER, { archiveState: "all" });

    // Archiving must not quietly drop a role from the rates.
    expect(recorder.argsFor("is", "archived_at")).toBeUndefined();
    expect(recorder.argsFor("not", "archived_at")).toBeUndefined();
  });
});

describe("the dashboard pipeline follows the archive line", () => {
  const applied = (archivedAt: string | null) => ({
    current_status: "Applied" as const,
    archived_at: archivedAt,
  });

  it("counts only applications that are still active", () => {
    const stages = pipelineSnapshot([
      applied(null),
      applied(null),
      applied("2026-08-10T10:00:00.000Z"),
    ]);

    expect(stages.find((stage) => stage.status === "Applied")?.count).toBe(2);
  });

  it("empties once everything is archived", () => {
    // The snapshot answers "where is everything right now", and an archived
    // application is nowhere — so archiving the last one leaves honest zeros
    // rather than a stale count.
    const stages = pipelineSnapshot([applied("2026-08-10T10:00:00.000Z")]);

    expect(stages.every((stage) => stage.count === 0)).toBe(true);
  });
});

describe("the applications list reports the outcome without leaking ownership", () => {
  it("confirms an archive", () => {
    expect(toArchiveNotice("archived")).toEqual({
      tone: "success",
      message: "Application archived. You can restore it from the archive.",
    });
  });

  it("confirms a restore", () => {
    expect(toArchiveNotice("restored")).toEqual({
      tone: "success",
      message: "Application restored to your list.",
    });
  });

  it("says the same thing for every failure", () => {
    const notice = toArchiveNotice("error");

    expect(notice?.tone).toBe("error");
    expect(notice?.message).not.toMatch(/permission|owner|another|exist/i);
  });

  it("shows nothing for an absent or crafted parameter", () => {
    for (const value of [undefined, "", "deleted", ["archived"], 1]) {
      expect(toArchiveNotice(value)).toBeNull();
    }
  });
});
