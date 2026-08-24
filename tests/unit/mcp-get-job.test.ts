import { describe, expect, it, vi } from "vitest";
import type { ApplicationRecord } from "@/lib/applications/types";
import { runGetJob, toJobDetail } from "@/lib/mcp/get-job";
import { getJobInputSchema } from "@/lib/validation/mcp";

const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_APPLICATION_ID = "22222222-2222-4222-8222-222222222222";

function record(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: APPLICATION_ID,
    company_name: "RBC",
    company_domain: "rbc.com",
    original_job_title: "Business Analyst",
    normalized_job_category: "Business Analysis",
    classification_confidence: null,
    location: "Toronto, ON",
    work_arrangement: "Hybrid",
    application_url: "https://jobs.rbc.com/example",
    application_source: "LinkedIn",
    job_description: "Support reporting for the retail banking team.",
    application_deadline: "2026-09-04",
    date_applied: "2026-08-22",
    current_status: "Applied",
    work_term_season: "Summer 2027",
    work_term_duration: "4 months",
    salary: "$25/hour",
    notes: "Referred by a classmate.",
    next_action: "Follow up with the recruiter",
    next_action_due_date: "2026-09-11",
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-22T10:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

/** A stand-in read owned by one user, mirroring the real call shape. */
function dependencies(options: {
  stored?: ApplicationRecord | null;
  error?: { code?: string };
}) {
  const stored = options.stored === undefined ? record() : options.stored;

  return {
    readApplication: vi.fn(async () => ({
      data: stored,
      error: options.error ?? null,
    })),
  };
}

describe("get_job input contract", () => {
  it("requires the application id and accepts nothing else", () => {
    expect(getJobInputSchema.safeParse({}).success).toBe(false);
    expect(
      getJobInputSchema.safeParse({ application_id: APPLICATION_ID }).success,
    ).toBe(true);
    expect(Object.keys(getJobInputSchema.shape)).toEqual(["application_id"]);
  });

  it("rejects an application id that is not a real identifier", () => {
    expect(
      getJobInputSchema.safeParse({ application_id: "the RBC one" }).success,
    ).toBe(false);
  });

  it("has no user_id argument, so a caller cannot name an owner", () => {
    const parsed = getJobInputSchema.parse({
      application_id: APPLICATION_ID,
      user_id: "33333333-3333-4333-8333-333333333333",
    });

    expect(parsed).not.toHaveProperty("user_id");
  });
});

describe("get_job returns the complete useful record", () => {
  it("includes everything the student stored about the application", async () => {
    const outcome = await runGetJob(
      { application_id: APPLICATION_ID },
      dependencies({}),
    );

    expect(outcome.outcome).toBe("found");
    expect(outcome.outcome === "found" && outcome.job).toEqual({
      application_id: APPLICATION_ID,
      company: "RBC",
      company_domain: "rbc.com",
      job_title: "Business Analyst",
      status: "Applied",
      category: "Business Analysis",
      work_arrangement: "Hybrid",
      location: "Toronto, ON",
      work_term: "Summer 2027",
      duration: "4 months",
      job_url: "https://jobs.rbc.com/example",
      source: "LinkedIn",
      job_description: "Support reporting for the retail banking team.",
      deadline: "2026-09-04",
      date_applied: "2026-08-22",
      salary: "$25/hour",
      notes: "Referred by a classmate.",
      next_action: "Follow up with the recruiter",
      next_action_due_date: "2026-09-11",
      archived: false,
      created_at: "2026-08-20T10:00:00.000Z",
      updated_at: "2026-08-22T10:00:00.000Z",
    });
  });

  it("returns the stored description in full rather than a preview", () => {
    const description = "A".repeat(20000);
    const detail = toJobDetail(record({ job_description: description }));

    expect(detail.job_description).toBe(description);
  });

  it("reports an unset optional field as empty, not as a placeholder", () => {
    const detail = toJobDetail(
      record({
        location: "Not specified",
        application_source: "Not specified",
        work_term_season: "Not specified",
        notes: null,
        salary: null,
      }),
    );

    expect(detail.location).toBeNull();
    expect(detail.source).toBeNull();
    expect(detail.work_term).toBeNull();
    expect(detail.notes).toBeNull();
    expect(detail.salary).toBeNull();
  });

  it("marks an archived application as archived", () => {
    expect(
      toJobDetail(record({ archived_at: "2026-08-21T10:00:00.000Z" })).archived,
    ).toBe(true);
  });

  it("exposes no ownership, versioning, or classifier columns", () => {
    const keys = Object.keys(toJobDetail(record()));

    for (const internal of [
      "user_id",
      "id",
      "classification_confidence",
      "classification_matches",
      "expectedUpdatedAt",
      "archived_at",
    ]) {
      expect(keys).not.toContain(internal);
    }
  });
});

describe("get_job ownership", () => {
  it("cannot read an application the caller does not own", async () => {
    // The owner-scoped read finds nothing for another user's application.
    const outcome = await runGetJob(
      { application_id: OTHER_APPLICATION_ID },
      dependencies({ stored: null }),
    );

    expect(outcome).toEqual({ outcome: "not_found" });
  });

  it("reports a missing and a non-owned application identically", async () => {
    const missing = await runGetJob(
      { application_id: APPLICATION_ID },
      dependencies({ stored: null }),
    );
    const notOwned = await runGetJob(
      { application_id: OTHER_APPLICATION_ID },
      dependencies({ stored: null }),
    );

    expect(missing).toEqual(notOwned);
  });

  it("surfaces a read failure instead of silently reporting not found", async () => {
    const outcome = await runGetJob(
      { application_id: APPLICATION_ID },
      dependencies({ error: { code: "42501" } }),
    );

    expect(outcome).toEqual({ outcome: "error", code: "42501" });
  });
});
