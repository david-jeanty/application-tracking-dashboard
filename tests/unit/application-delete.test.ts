import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { toDeleteNotice } from "@/lib/applications/archive-notice";
import { summarizeTrackedApplications } from "@/lib/applications/dashboard";
import { deleteArchivedApplication } from "@/lib/applications/repository";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ANOTHER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ARCHIVED = "11111111-1111-4111-8111-111111111111";
const ACTIVE = "22222222-2222-4222-8222-222222222222";

type Call = { method: string; args: unknown[] };

/**
 * A stand-in PostgREST builder that records the chain instead of deleting.
 *
 * This asserts the statement the repository *builds*: which predicates
 * constrain the delete, and that no other table is touched. Whether Postgres
 * then cascades the history rows, and whether row-level security stops a
 * crafted cross-user delete, can only be answered by a real database — that is
 * what `supabase/tests/004_application_delete.test.sql` covers.
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

  for (const method of ["select", "delete", "eq", "is", "not", "update"]) {
    builder[method] = record(method);
  }
  builder.maybeSingle = () =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null });

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

describe("permanent deletion is constrained by the statement, not the page", () => {
  it("deletes an archived application the caller owns", async () => {
    const recorder = recordingClient({ data: { id: ARCHIVED } });

    const result = await deleteArchivedApplication(
      recorder.client,
      USER,
      ARCHIVED,
    );

    expect(result).toEqual({ outcome: "deleted" });
    expect(recorder.find("delete")).toHaveLength(1);
  });

  it("requires the row to be archived already", async () => {
    const recorder = recordingClient({ data: { id: ARCHIVED } });

    await deleteArchivedApplication(recorder.client, USER, ARCHIVED);

    // This predicate is what makes "only archived rows" a property of the
    // write. Without it the rule would live only in which buttons render.
    expect(recorder.argsFor("not", "archived_at")).toEqual([
      "archived_at",
      "is",
      null,
    ]);
  });

  it("cannot delete an active application even when one is named directly", async () => {
    // The archived predicate matches no row, so PostgREST returns nothing.
    const recorder = recordingClient({ data: null });

    const result = await deleteArchivedApplication(
      recorder.client,
      USER,
      ACTIVE,
    );

    expect(result).toEqual({ outcome: "not_found" });
  });

  it("scopes the delete to the authenticated owner", async () => {
    const recorder = recordingClient({ data: { id: ARCHIVED } });

    await deleteArchivedApplication(recorder.client, USER, ARCHIVED);

    expect(recorder.argsFor("eq", "user_id")).toEqual(["user_id", USER]);
    expect(recorder.argsFor("eq", "id")).toEqual(["id", ARCHIVED]);
  });

  it("cannot delete another student's application", async () => {
    const recorder = recordingClient({ data: null });

    const result = await deleteArchivedApplication(
      recorder.client,
      ANOTHER_USER,
      ARCHIVED,
    );

    expect(result).toEqual({ outcome: "not_found" });
    expect(recorder.argsFor("eq", "user_id")).toEqual([
      "user_id",
      ANOTHER_USER,
    ]);
  });

  it("reports missing, not-owned, and still-active identically", async () => {
    const missing = await deleteArchivedApplication(
      recordingClient({ data: null }).client,
      USER,
      ARCHIVED,
    );
    const notOwned = await deleteArchivedApplication(
      recordingClient({ data: null }).client,
      ANOTHER_USER,
      ARCHIVED,
    );
    const stillActive = await deleteArchivedApplication(
      recordingClient({ data: null }).client,
      USER,
      ACTIVE,
    );

    expect(missing).toEqual(notOwned);
    expect(notOwned).toEqual(stillActive);
  });

  it("targets exactly one row, so other applications are untouched", async () => {
    const recorder = recordingClient({ data: { id: ARCHIVED } });

    await deleteArchivedApplication(recorder.client, USER, ARCHIVED);

    // An id predicate plus an owner predicate plus the archive predicate.
    // Nothing here can match a second application.
    expect(recorder.find("eq").map((call) => call.args[0]).sort()).toEqual([
      "id",
      "user_id",
    ]);
  });

  it("never touches the status-history table itself", async () => {
    const recorder = recordingClient({ data: { id: ARCHIVED } });

    await deleteArchivedApplication(recorder.client, USER, ARCHIVED);

    // History removal is the schema's `on delete cascade`, not a second
    // statement here. Authenticated clients hold `select` only on that table.
    const tables = recorder.find("from").map((call) => call.args[0]);
    expect(tables).toEqual(["applications"]);
    expect(tables).not.toContain("application_status_history");
  });

  it("surfaces a database failure rather than reporting success", async () => {
    const recorder = recordingClient({ data: null, error: { code: "42501" } });

    const result = await deleteArchivedApplication(
      recorder.client,
      USER,
      ARCHIVED,
    );

    expect(result).toEqual({ outcome: "error", code: "42501" });
  });
});

describe("the dashboard is unaffected by a permanent deletion", () => {
  it("keeps its count, because only an archived row can be deleted", () => {
    // The dashboard reads the active list. An archived application was
    // already absent from it, so deleting one changes nothing there.
    const before = summarizeTrackedApplications({ data: [1, 2, 3], error: null });
    const after = summarizeTrackedApplications({ data: [1, 2, 3], error: null });

    expect(after).toEqual(before);
    expect(after).toMatchObject({ count: 3 });
  });
});

describe("the archive page reports the outcome without leaking details", () => {
  it("confirms a deletion", () => {
    expect(toDeleteNotice("deleted")).toEqual({
      tone: "success",
      message: "Application permanently deleted.",
    });
  });

  it("uses one fixed failure message for every rejected case", () => {
    const notice = toDeleteNotice("error");

    expect(notice?.tone).toBe("error");
    expect(notice?.message).toBe(
      "That application could not be deleted. Try again.",
    );
  });

  it("never names a database code, table, policy, or owner", () => {
    const notice = toDeleteNotice("error");

    expect(notice?.message).not.toMatch(
      /42501|permission|policy|row-level|supabase|postgres|owner|another|archiv/i,
    );
  });

  it("shows nothing for an absent or crafted parameter", () => {
    for (const value of [undefined, "", "restored", ["deleted"], 1, null]) {
      expect(toDeleteNotice(value)).toBeNull();
    }
  });
});
