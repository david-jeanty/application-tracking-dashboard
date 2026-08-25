import { describe, expect, it, vi } from "vitest";
import type { ApplicationRecord } from "@/lib/applications/types";
import type { ApplicationUpdateResult } from "@/lib/applications/repository";
import {
  diffApplications,
  runUpdateJob,
  type UpdateJobDependencies,
} from "@/lib/mcp/update-job";
import {
  UPDATE_FIELD_MAP,
  updateJobInputSchema,
} from "@/lib/validation/mcp";

const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_APPLICATION_ID = "22222222-2222-4222-8222-222222222222";

function record(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: APPLICATION_ID,
    company_name: "RBC",
    company_domain: null,
    original_job_title: "Business Analyst",
    normalized_job_category: "Business Analysis",
    classification_confidence: null,
    location: "Toronto, ON",
    work_arrangement: "Hybrid",
    application_url: "https://jobs.rbc.com/example",
    application_source: "LinkedIn",
    job_description: "Original description.",
    application_deadline: null,
    date_applied: null,
    current_status: "Preparing",
    work_term_season: "Summer 2027",
    work_term_duration: "4 months",
    salary: null,
    notes: null,
    next_action: null,
    next_action_due_date: null,
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-21T10:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

/** A stand-in repository owned by one user, mirroring the real call shapes. */
function dependencies(options: {
  stored?: ApplicationRecord | null;
  readError?: { code?: string };
  results?: ApplicationUpdateResult[];
}) {
  const stored = options.stored === undefined ? record() : options.stored;
  const results = options.results ?? [];
  let call = 0;

  const readApplication = vi.fn(async () => ({
    data: stored,
    error: options.readError ?? null,
  }));

  const writeApplication = vi.fn(
    async (_id: string, input: { currentStatus: string }) => {
      const result =
        results[call] ??
        ({
          outcome: "updated",
          application: record({
            current_status: input.currentStatus as ApplicationRecord["current_status"],
            updated_at: "2026-08-22T10:00:00.000Z",
          }),
        } as ApplicationUpdateResult);
      call += 1;
      return result;
    },
  );

  return {
    readApplication,
    writeApplication,
  } as unknown as UpdateJobDependencies & {
    readApplication: ReturnType<typeof vi.fn>;
    writeApplication: ReturnType<typeof vi.fn>;
  };
}

describe("update_job input contract", () => {
  it("requires an application id", () => {
    expect(updateJobInputSchema.safeParse({ status: "Applied" }).success).toBe(
      false,
    );
    expect(
      updateJobInputSchema.safeParse({
        application_id: APPLICATION_ID,
        status: "Applied",
      }).success,
    ).toBe(true);
  });

  it("rejects an application id that is not a real identifier", () => {
    expect(
      updateJobInputSchema.safeParse({ application_id: "the RBC one" }).success,
    ).toBe(false);
  });

  it("has no user_id argument, so a caller cannot name an owner", () => {
    const parsed = updateJobInputSchema.parse({
      application_id: APPLICATION_ID,
      user_id: "33333333-3333-4333-8333-333333333333",
      status: "Applied",
    });

    expect(parsed).not.toHaveProperty("user_id");
    expect(Object.keys(UPDATE_FIELD_MAP)).not.toContain("user_id");
  });

  it("cannot reach ownership, timestamp, archive, or classification columns", () => {
    const writable = Object.values(UPDATE_FIELD_MAP) as string[];

    for (const forbidden of [
      "userId",
      "id",
      "createdAt",
      "updatedAt",
      "archivedAt",
      "classificationConfidence",
    ]) {
      expect(writable).not.toContain(forbidden);
    }
  });

  it("rejects a status outside the existing enum", () => {
    expect(
      updateJobInputSchema.safeParse({
        application_id: APPLICATION_ID,
        status: "ghosted",
      }).success,
    ).toBe(false);
  });

  it("accepts every status in the existing enum", () => {
    for (const status of ["Interested", "Applied", "Interview", "Offer", "Accepted"]) {
      expect(
        updateJobInputSchema.safeParse({
          application_id: APPLICATION_ID,
          status,
        }).success,
      ).toBe(true);
    }
  });

  it.each([
    ["date_applied", "September 4"],
    ["deadline", "2026-9-4"],
    ["next_action_due_date", "04/09/2026"],
    ["date_applied", "22-08-2026"],
  ])("rejects a malformed %s of %s", (field, value) => {
    expect(
      updateJobInputSchema.safeParse({
        application_id: APPLICATION_ID,
        [field]: value,
      }).success,
    ).toBe(false);
  });
});

describe("update_job applies partial changes", () => {
  it("updates a single field and leaves the rest of the record alone", async () => {
    const deps = dependencies({});

    const outcome = await runUpdateJob(
      { application_id: APPLICATION_ID, status: "Applied" },
      deps,
    );

    expect(outcome.outcome).toBe("updated");

    const [, written] = deps.writeApplication.mock.calls[0];
    expect(written.currentStatus).toBe("Applied");
    // Everything unmentioned survives rather than being nulled out.
    expect(written.companyName).toBe("RBC");
    expect(written.originalJobTitle).toBe("Business Analyst");
    expect(written.workTermSeason).toBe("Summer 2027");
    expect(written.workTermDuration).toBe("4 months");
    expect(written.jobDescription).toBe("Original description.");
    expect(written.applicationUrl).toBe("https://jobs.rbc.com/example");
  });

  it("records the applied date and status together", async () => {
    const deps = dependencies({});

    await runUpdateJob(
      {
        application_id: APPLICATION_ID,
        status: "Applied",
        date_applied: "2026-08-22",
      },
      deps,
    );

    const [, written] = deps.writeApplication.mock.calls[0];
    expect(written.currentStatus).toBe("Applied");
    expect(written.dateApplied).toBe("2026-08-22");
  });

  it("sets a next action and its due date", async () => {
    const deps = dependencies({});

    await runUpdateJob(
      {
        application_id: APPLICATION_ID,
        next_action: "Follow up with the recruiter",
        next_action_due_date: "2026-09-04",
      },
      deps,
    );

    const [, written] = deps.writeApplication.mock.calls[0];
    expect(written.nextAction).toBe("Follow up with the recruiter");
    expect(written.nextActionDueDate).toBe("2026-09-04");
    // An unrelated field is untouched by a next-action update.
    expect(written.currentStatus).toBe("Preparing");
  });

  it("clears a clearable field when given an empty value", async () => {
    const deps = dependencies({
      stored: record({ notes: "Old note", next_action: "Old action" }),
    });

    await runUpdateJob(
      { application_id: APPLICATION_ID, notes: "", next_action: "" },
      deps,
    );

    const [, written] = deps.writeApplication.mock.calls[0];
    expect(written.notes).toBeUndefined();
    expect(written.nextAction).toBeUndefined();
  });

  it("passes the stored version so the write stays conditional", async () => {
    const deps = dependencies({});

    await runUpdateJob(
      { application_id: APPLICATION_ID, status: "Applied" },
      deps,
    );

    const [, written] = deps.writeApplication.mock.calls[0];
    expect(written.expectedUpdatedAt).toBe("2026-08-21T10:00:00.000Z");
  });

  it("rejects an update that would empty a required field", async () => {
    const deps = dependencies({});

    const outcome = await runUpdateJob(
      { application_id: APPLICATION_ID, company: "   " },
      deps,
    );

    expect(outcome.outcome).toBe("invalid");
    expect(deps.writeApplication).not.toHaveBeenCalled();
  });

  it.each(["2026-08-32", "2026-02-30", "2027-02-29"])(
    "rejects %s, which is correctly shaped but not a real date",
    async (value) => {
      // The wire schema only checks shape; the shared creation schema is the
      // backstop that rejects a day the calendar does not have.
      const deps = dependencies({});

      const outcome = await runUpdateJob(
        { application_id: APPLICATION_ID, date_applied: value },
        deps,
      );

      expect(outcome.outcome).toBe("invalid");
      expect(deps.writeApplication).not.toHaveBeenCalled();
    },
  );

  it("rejects a job URL that is not http or https", async () => {
    const deps = dependencies({});

    const outcome = await runUpdateJob(
      { application_id: APPLICATION_ID, job_url: "javascript:alert(1)" },
      deps,
    );

    expect(outcome.outcome).toBe("invalid");
    expect(deps.writeApplication).not.toHaveBeenCalled();
  });
});

describe("update_job ownership", () => {
  it("cannot update an application the caller does not own", async () => {
    // The owner-scoped read finds nothing for another user's application.
    const deps = dependencies({ stored: null });

    const outcome = await runUpdateJob(
      { application_id: OTHER_APPLICATION_ID, status: "Interview" },
      deps,
    );

    expect(outcome).toEqual({ outcome: "not_found" });
    // Nothing is attempted against a record the caller cannot read.
    expect(deps.writeApplication).not.toHaveBeenCalled();
  });

  it("reports a missing and a non-owned application identically", async () => {
    const missing = await runUpdateJob(
      { application_id: APPLICATION_ID, status: "Offer" },
      dependencies({ stored: null }),
    );
    const notOwned = await runUpdateJob(
      { application_id: OTHER_APPLICATION_ID, status: "Offer" },
      dependencies({ stored: null }),
    );

    expect(missing).toEqual(notOwned);
  });

  it("treats a row that disappears mid-write as not found", async () => {
    const deps = dependencies({ results: [{ outcome: "not_found" }] });

    const outcome = await runUpdateJob(
      { application_id: APPLICATION_ID, status: "Offer" },
      deps,
    );

    expect(outcome).toEqual({ outcome: "not_found" });
  });

  it("surfaces a read failure instead of silently reporting not found", async () => {
    const deps = dependencies({ readError: { code: "42501" } });

    const outcome = await runUpdateJob(
      { application_id: APPLICATION_ID, status: "Offer" },
      deps,
    );

    expect(outcome).toEqual({ outcome: "error", code: "42501" });
    expect(deps.writeApplication).not.toHaveBeenCalled();
  });
});

describe("update_job optimistic concurrency", () => {
  it("retries once against the newer record after a conflict", async () => {
    const deps = dependencies({
      results: [
        { outcome: "conflict" },
        {
          outcome: "updated",
          application: record({
            current_status: "Interview",
            updated_at: "2026-08-22T11:00:00.000Z",
          }),
        },
      ],
    });

    const outcome = await runUpdateJob(
      { application_id: APPLICATION_ID, status: "Interview" },
      deps,
    );

    expect(outcome.outcome).toBe("updated");
    expect(deps.writeApplication).toHaveBeenCalledTimes(2);
    // The retry re-reads, so the patch is rebuilt on the newer stored state.
    expect(deps.readApplication).toHaveBeenCalledTimes(2);
  });

  it("reports a conflict rather than looping when contention persists", async () => {
    const deps = dependencies({
      results: [{ outcome: "conflict" }, { outcome: "conflict" }],
    });

    const outcome = await runUpdateJob(
      { application_id: APPLICATION_ID, status: "Interview" },
      deps,
    );

    expect(outcome).toEqual({ outcome: "conflict" });
    expect(deps.writeApplication).toHaveBeenCalledTimes(2);
  });
});

describe("update_job status history", () => {
  it("never writes history itself, only the application row", async () => {
    const deps = dependencies({});

    await runUpdateJob(
      { application_id: APPLICATION_ID, status: "Interview" },
      deps,
    );

    // The only write the tool performs is the application update; the
    // database trigger owns the audit trail.
    expect(deps.writeApplication).toHaveBeenCalledTimes(1);
    const [, written] = deps.writeApplication.mock.calls[0];
    expect(Object.keys(written)).not.toContain("previousStatus");
    expect(Object.keys(written)).not.toContain("newStatus");
  });

  it("flags a real status transition, which fires the history trigger", async () => {
    const deps = dependencies({
      stored: record({ current_status: "Applied" }),
      results: [
        {
          outcome: "updated",
          application: record({ current_status: "Interview" }),
        },
      ],
    });

    const outcome = await runUpdateJob(
      { application_id: APPLICATION_ID, status: "Interview" },
      deps,
    );

    expect(outcome).toMatchObject({ statusChanged: true });
  });

  it("does not flag history when the status is resent unchanged", async () => {
    const deps = dependencies({
      stored: record({ current_status: "Applied" }),
      results: [
        {
          outcome: "updated",
          application: record({ current_status: "Applied" }),
        },
      ],
    });

    const outcome = await runUpdateJob(
      { application_id: APPLICATION_ID, status: "Applied" },
      deps,
    );

    // The trigger's WHEN clause suppresses a no-op transition; we report the
    // same thing rather than implying an event was recorded.
    expect(outcome).toMatchObject({ statusChanged: false });
  });

  it("does not flag history for a non-status edit", async () => {
    const deps = dependencies({
      stored: record({ current_status: "Applied" }),
      results: [
        {
          outcome: "updated",
          application: record({
            current_status: "Applied",
            notes: "Recruiter screen booked",
          }),
        },
      ],
    });

    const outcome = await runUpdateJob(
      { application_id: APPLICATION_ID, notes: "Recruiter screen booked" },
      deps,
    );

    expect(outcome).toMatchObject({ statusChanged: false });
  });
});

describe("update_job result", () => {
  it("reports only the fields that actually changed", () => {
    const before = record({ current_status: "Preparing", date_applied: null });
    const after = record({
      current_status: "Applied",
      date_applied: "2026-08-22",
    });

    expect(diffApplications(before, after)).toEqual([
      { field: "status", from: "Preparing", to: "Applied" },
      { field: "date_applied", from: null, to: "2026-08-22" },
    ]);
  });

  it("reports nothing when a resent value matches what is stored", () => {
    expect(diffApplications(record(), record())).toEqual([]);
  });

  it("reports a cleared field as null rather than an empty string", () => {
    const changes = diffApplications(
      record({ notes: "Old note" }),
      record({ notes: null }),
    );

    expect(changes).toEqual([{ field: "notes", from: "Old note", to: null }]);
  });

  it("hides the internal sentinel from the reported values", () => {
    const changes = diffApplications(
      record({ location: "Not specified" }),
      record({ location: "Ottawa, ON" }),
    );

    expect(changes).toEqual([
      { field: "location", from: null, to: "Ottawa, ON" },
    ]);
  });

  it("truncates a long value instead of echoing an entire description", () => {
    const changes = diffApplications(
      record({ job_description: "old" }),
      record({ job_description: "x".repeat(500) }),
    );

    expect(changes[0].to).toHaveLength(81);
    expect(changes[0].to?.endsWith("…")).toBe(true);
  });
});

describe("clearing a follow-up clears the date that described it", () => {
  const withFollowUp = () =>
    record({
      next_action: "Follow up with the recruiter",
      next_action_due_date: "2026-09-04",
    });

  it("clears both when the action alone is emptied", async () => {
    const deps = dependencies({ stored: withFollowUp() });

    const result = await runUpdateJob(
      { application_id: APPLICATION_ID, next_action: "" },
      deps,
    );

    // The same semantics the detail page's Clear button has: emptying the
    // action is how a student is rid of the follow-up, and the date it
    // described goes with it. Nobody has to remember to send two empty fields.
    expect(result.outcome).toBe("updated");
    const [, written] = deps.writeApplication.mock.calls[0];
    expect(written.nextAction).toBeUndefined();
    expect(written.nextActionDueDate).toBeUndefined();
  });

  it("clears both when the action is emptied with only whitespace", async () => {
    const deps = dependencies({ stored: withFollowUp() });

    await runUpdateJob(
      { application_id: APPLICATION_ID, next_action: "   " },
      deps,
    );

    const [, written] = deps.writeApplication.mock.calls[0];
    expect(written.nextAction).toBeUndefined();
    expect(written.nextActionDueDate).toBeUndefined();
  });

  it("drops a due date sent alongside an emptied action, rather than failing", async () => {
    const deps = dependencies({ stored: withFollowUp() });

    const result = await runUpdateJob(
      {
        application_id: APPLICATION_ID,
        next_action: "",
        next_action_due_date: "2026-10-01",
      },
      deps,
    );

    // Contradictory, and resolved the way `setApplicationNextAction` resolves
    // it: no action means no date, whichever date came with the clear.
    expect(result.outcome).toBe("updated");
    const [, written] = deps.writeApplication.mock.calls[0];
    expect(written.nextAction).toBeUndefined();
    expect(written.nextActionDueDate).toBeUndefined();
  });

  it("leaves a stored follow-up untouched when the patch is about something else", async () => {
    const deps = dependencies({ stored: withFollowUp() });

    await runUpdateJob(
      { application_id: APPLICATION_ID, status: "Interview" },
      deps,
    );

    const [, written] = deps.writeApplication.mock.calls[0];
    expect(written.currentStatus).toBe("Interview");
    expect(written.nextAction).toBe("Follow up with the recruiter");
    expect(written.nextActionDueDate).toBe("2026-09-04");
  });

  it("keeps the stored due date when a new action replaces the old one", async () => {
    const deps = dependencies({ stored: withFollowUp() });

    await runUpdateJob(
      { application_id: APPLICATION_ID, next_action: "Prepare for the panel" },
      deps,
    );

    // Decided, not incidental: an omitted field keeps its stored value, which
    // is this tool's whole contract, and the pair stays valid because the date
    // still describes an action. A student who also wants the date moved says
    // so; a student who renames the follow-up has not moved the deadline.
    const [, written] = deps.writeApplication.mock.calls[0];
    expect(written.nextAction).toBe("Prepare for the panel");
    expect(written.nextActionDueDate).toBe("2026-09-04");
  });

  it("still refuses a due date when nothing describes it", async () => {
    const deps = dependencies({ stored: record() });

    const result = await runUpdateJob(
      { application_id: APPLICATION_ID, next_action_due_date: "2026-09-04" },
      deps,
    );

    // The shared rule is untouched: this record has no next action, so a date
    // on its own is still rejected, and nothing is written.
    expect(result.outcome).toBe("invalid");
    expect(result.outcome === "invalid" && result.message).toContain(
      "Next action due date requires a next action.",
    );
    expect(deps.writeApplication).not.toHaveBeenCalled();
  });
});
