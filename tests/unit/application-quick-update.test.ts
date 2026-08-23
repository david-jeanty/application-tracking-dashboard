import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { toQuickUpdateNotice } from "@/lib/applications/quick-update-notice";
import {
  setApplicationNextAction,
  setApplicationStatus,
} from "@/lib/applications/repository";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";
import {
  quickNextActionSchema,
  quickStatusSchema,
} from "@/lib/validation/application";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ANOTHER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const APPLICATION = "11111111-1111-4111-8111-111111111111";

type Call = { method: string; args: unknown[] };

/**
 * A stand-in PostgREST builder that records the chain instead of writing.
 *
 * This asserts the statement each mutation *builds*: which columns it sets,
 * which predicates constrain it, and which columns it never mentions. What
 * those predicates mean once Postgres runs them — whether the history trigger
 * fires, whether row-level security stops another student — can only be
 * answered by a real database, which is what
 * `supabase/tests/005_application_quick_update.test.sql` covers.
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

  for (const method of ["select", "update", "eq", "is", "not"]) {
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
  const patch = () =>
    find("update")[0]?.args[0] as Record<string, unknown> | undefined;

  return { client, calls, find, argsFor, patch };
}

const ok = () => recordingClient({ data: { id: APPLICATION } });

describe("a quick status change writes only the status", () => {
  it("sets current_status to the chosen value", async () => {
    const recorder = ok();

    const result = await setApplicationStatus(
      recorder.client,
      USER,
      APPLICATION,
      "Interview",
    );

    expect(result).toEqual({ outcome: "updated" });
    expect(recorder.patch()).toEqual({ current_status: "Interview" });
  });

  it("touches no other column, so nothing is inferred or cleared", async () => {
    const recorder = ok();

    await setApplicationStatus(recorder.client, USER, APPLICATION, "Applied");

    // A student moving to Applied does not thereby state when they applied,
    // lose their follow-up, or archive anything.
    expect(Object.keys(recorder.patch() ?? {})).toEqual(["current_status"]);
    expect(recorder.patch()).not.toHaveProperty("date_applied");
    expect(recorder.patch()).not.toHaveProperty("next_action");
    expect(recorder.patch()).not.toHaveProperty("next_action_due_date");
    expect(recorder.patch()).not.toHaveProperty("archived_at");
  });

  it("accepts every status in the shared enum, forwards and backwards", async () => {
    for (const status of APPLICATION_STATUSES) {
      const recorder = ok();
      await setApplicationStatus(recorder.client, USER, APPLICATION, status);
      expect(recorder.patch()).toEqual({ current_status: status });
    }

    // Interview back to Applied is a real thing that happens to real students.
    const backwards = ok();
    await setApplicationStatus(backwards.client, USER, APPLICATION, "Applied");
    expect(backwards.patch()).toEqual({ current_status: "Applied" });
  });

  it("never writes to the status-history table itself", async () => {
    const recorder = ok();

    await setApplicationStatus(recorder.client, USER, APPLICATION, "Offer");

    // History is the database trigger's job. Authenticated clients are granted
    // `select` only on that table and could not write it in any case.
    const tables = recorder.find("from").map((call) => call.args[0]);
    expect(tables).toEqual(["applications"]);
    expect(tables).not.toContain("application_status_history");
  });
});

describe("a quick next-action change writes only the two next-action columns", () => {
  it("sets the action and its due date", async () => {
    const recorder = ok();

    const result = await setApplicationNextAction(
      recorder.client,
      USER,
      APPLICATION,
      { action: "Follow up with recruiter", dueDate: "2026-09-01" },
    );

    expect(result).toEqual({ outcome: "updated" });
    expect(recorder.patch()).toEqual({
      next_action: "Follow up with recruiter",
      next_action_due_date: "2026-09-01",
    });
  });

  it("leaves the status alone, so no history event can be produced", async () => {
    const recorder = ok();

    await setApplicationNextAction(recorder.client, USER, APPLICATION, {
      action: "Send thank-you note",
    });

    // The history trigger is declared `after update of current_status`. A
    // statement that never names that column cannot fire it.
    expect(Object.keys(recorder.patch() ?? {}).sort()).toEqual([
      "next_action",
      "next_action_due_date",
    ]);
    expect(recorder.patch()).not.toHaveProperty("current_status");
  });

  it("keeps an action that has no due date", async () => {
    const recorder = ok();

    await setApplicationNextAction(recorder.client, USER, APPLICATION, {
      action: "Prepare for interview",
    });

    expect(recorder.patch()).toEqual({
      next_action: "Prepare for interview",
      next_action_due_date: null,
    });
  });

  it("clears both columns when the action is emptied", async () => {
    const recorder = ok();

    await setApplicationNextAction(recorder.client, USER, APPLICATION, {
      action: "",
    });

    expect(recorder.patch()).toEqual({
      next_action: null,
      next_action_due_date: null,
    });
  });

  it("clears both columns when nothing at all is supplied", async () => {
    const recorder = ok();

    await setApplicationNextAction(recorder.client, USER, APPLICATION);

    expect(recorder.patch()).toEqual({
      next_action: null,
      next_action_due_date: null,
    });
  });

  it("drops a due date that arrives without an action", async () => {
    const recorder = ok();

    await setApplicationNextAction(recorder.client, USER, APPLICATION, {
      dueDate: "2026-09-01",
    });

    // The database can never hold a due date for an action that does not
    // exist, whichever path the values arrived by.
    expect(recorder.patch()).toEqual({
      next_action: null,
      next_action_due_date: null,
    });
  });

  it("drops a due date left beside whitespace, not just an empty string", async () => {
    const recorder = ok();

    await setApplicationNextAction(recorder.client, USER, APPLICATION, {
      action: "   ",
      dueDate: "2026-09-01",
    });

    expect(recorder.patch()).toEqual({
      next_action: null,
      next_action_due_date: null,
    });
  });
});

describe("quick updates are owner-scoped and active-only", () => {
  it("constrains the status write by id, owner, and archive state", async () => {
    const recorder = ok();

    await setApplicationStatus(recorder.client, USER, APPLICATION, "Screening");

    expect(recorder.argsFor("eq", "id")).toEqual(["id", APPLICATION]);
    expect(recorder.argsFor("eq", "user_id")).toEqual(["user_id", USER]);
    expect(recorder.argsFor("is", "archived_at")).toEqual([
      "archived_at",
      null,
    ]);
  });

  it("constrains the next-action write the same way", async () => {
    const recorder = ok();

    await setApplicationNextAction(recorder.client, USER, APPLICATION, {
      action: "Follow up",
    });

    expect(recorder.argsFor("eq", "id")).toEqual(["id", APPLICATION]);
    expect(recorder.argsFor("eq", "user_id")).toEqual(["user_id", USER]);
    expect(recorder.argsFor("is", "archived_at")).toEqual([
      "archived_at",
      null,
    ]);
  });

  it("cannot reach another student's application", async () => {
    // The owner predicate matches no row, so PostgREST returns nothing.
    const status = await setApplicationStatus(
      recordingClient({ data: null }).client,
      ANOTHER_USER,
      APPLICATION,
      "Rejected",
    );
    const nextAction = await setApplicationNextAction(
      recordingClient({ data: null }).client,
      ANOTHER_USER,
      APPLICATION,
      { action: "Follow up" },
    );

    expect(status).toEqual({ outcome: "not_found" });
    expect(nextAction).toEqual({ outcome: "not_found" });
  });

  it("cannot reach an archived application", async () => {
    // The archive predicate matches no row for an archived record, so a
    // crafted post against one changes nothing regardless of what rendered.
    const recorder = recordingClient({ data: null });

    const result = await setApplicationStatus(
      recorder.client,
      USER,
      APPLICATION,
      "Offer",
    );

    expect(result).toEqual({ outcome: "not_found" });
    expect(recorder.argsFor("is", "archived_at")).toEqual([
      "archived_at",
      null,
    ]);
  });

  it("reports missing, not-owned, and archived identically", async () => {
    const missing = await setApplicationStatus(
      recordingClient({ data: null }).client,
      USER,
      APPLICATION,
      "Offer",
    );
    const notOwned = await setApplicationStatus(
      recordingClient({ data: null }).client,
      ANOTHER_USER,
      APPLICATION,
      "Offer",
    );
    const archived = await setApplicationNextAction(
      recordingClient({ data: null }).client,
      USER,
      APPLICATION,
      { action: "Follow up" },
    );

    expect(missing).toEqual(notOwned);
    expect(notOwned).toEqual(archived);
  });

  it("surfaces a database failure rather than reporting success", async () => {
    const recorder = recordingClient({ data: null, error: { code: "42501" } });

    const result = await setApplicationStatus(
      recorder.client,
      USER,
      APPLICATION,
      "Offer",
    );

    expect(result).toEqual({ outcome: "error", code: "42501" });
  });
});

describe("the quick forms accept only the fields they own", () => {
  it("takes a status from the shared enum and nothing else", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(quickStatusSchema.safeParse({ currentStatus: status }).success).toBe(
        true,
      );
    }

    expect(quickStatusSchema.safeParse({ currentStatus: "Ghosted" }).success).toBe(
      false,
    );
    expect(quickStatusSchema.safeParse({ currentStatus: "" }).success).toBe(false);
  });

  it("cannot carry any other application field into a status change", () => {
    const parsed = quickStatusSchema.parse({
      currentStatus: "Offer",
      companyName: "Somebody Else Inc",
      archivedAt: null,
      userId: ANOTHER_USER,
    });

    // A crafted post can send whatever it likes; only the status survives
    // parsing, and only the status reaches the mutation.
    expect(parsed).toEqual({ currentStatus: "Offer" });
  });

  it("applies the same next-action limits the full form uses", () => {
    expect(
      quickNextActionSchema.safeParse({ nextAction: "a".repeat(500) }).success,
    ).toBe(true);
    expect(
      quickNextActionSchema.safeParse({ nextAction: "a".repeat(501) }).success,
    ).toBe(false);
  });

  it("rejects a due date that is not a real calendar date", () => {
    expect(
      quickNextActionSchema.safeParse({ nextActionDueDate: "2026-09-01" }).success,
    ).toBe(true);
    expect(
      quickNextActionSchema.safeParse({ nextActionDueDate: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      quickNextActionSchema.safeParse({ nextActionDueDate: "next Tuesday" })
        .success,
    ).toBe(false);
  });

  it("treats blank fields as absent rather than as errors", () => {
    const parsed = quickNextActionSchema.parse({
      nextAction: "",
      nextActionDueDate: "",
    });

    expect(parsed).toEqual({
      nextAction: undefined,
      nextActionDueDate: undefined,
    });
  });
});

describe("the detail page reports the outcome without leaking details", () => {
  it("names what actually changed", () => {
    expect(toQuickUpdateNotice("status")).toEqual({
      tone: "success",
      message: "Status updated.",
    });
    expect(toQuickUpdateNotice("next-action")).toEqual({
      tone: "success",
      message: "Next action updated.",
    });
    expect(toQuickUpdateNotice("next-action-cleared")).toEqual({
      tone: "success",
      message: "Next action cleared.",
    });
  });

  it("uses one fixed failure message for every rejected case", () => {
    const notice = toQuickUpdateNotice("error");

    expect(notice?.tone).toBe("error");
    expect(notice?.message).toBe("That update couldn't be completed. Try again.");
  });

  it("never names a database code, table, policy, or owner", () => {
    const notice = toQuickUpdateNotice("error");

    expect(notice?.message).not.toMatch(
      /42501|permission|policy|row-level|supabase|postgres|owner|another|archiv|trigger/i,
    );
  });

  it("shows nothing for an absent or crafted parameter", () => {
    for (const value of [undefined, "", "deleted", ["status"], 1, null]) {
      expect(toQuickUpdateNotice(value)).toBeNull();
    }
  });
});
