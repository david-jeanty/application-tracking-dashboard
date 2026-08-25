import { describe, expect, it } from "vitest";
import { applicationCreationSchema } from "@/lib/validation/application";
import { toApplicationInsert } from "@/lib/applications/mapper";
import {
  newJobRecordSchema,
  saveJobInputSchema,
  toApplicationCreationValues,
} from "@/lib/validation/mcp";

const minimal = { company: "Nokia", job_title: "Marketing Student" };

/** Mirrors the route: tool arguments are always re-validated by the shared schema. */
function saveJobToInsertValues(args: unknown) {
  const parsedArgs = saveJobInputSchema.parse(args);
  return applicationCreationSchema.safeParse(
    toApplicationCreationValues(parsedArgs),
  );
}

describe("save_job input contract", () => {
  it("requires a company and job title", () => {
    expect(saveJobInputSchema.safeParse({}).success).toBe(false);
    expect(saveJobInputSchema.safeParse({ company: "Nokia" }).success).toBe(
      false,
    );
    expect(saveJobInputSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects a blank company rather than storing an empty employer", () => {
    expect(
      saveJobInputSchema.safeParse({ ...minimal, company: "" }).success,
    ).toBe(false);
  });

  it("has no user_id argument, so ownership cannot be requested by a caller", () => {
    const parsed = saveJobInputSchema.parse({
      ...minimal,
      user_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(parsed).not.toHaveProperty("user_id");
    expect(toApplicationCreationValues(parsed)).not.toHaveProperty("user_id");
  });

  it("defaults an unsaved job to Interested and an unclear role to Other", () => {
    const values = toApplicationCreationValues(saveJobInputSchema.parse(minimal));

    expect(values.currentStatus).toBe("Interested");
    expect(values.normalizedJobCategory).toBe("Other");
  });

  it("supplies the required work-term season when a posting does not state one", () => {
    const result = saveJobToInsertValues(minimal);

    expect(result.success).toBe(true);
    // Required non-null column, so it must never arrive empty.
    expect(result.success && result.data.workTermSeason.length).toBeGreaterThan(
      0,
    );
  });

  it("keeps student work-term details when Claude provides them", () => {
    const result = saveJobToInsertValues({
      ...minimal,
      work_term: "Summer 2027",
      duration: "4 months",
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.workTermSeason).toBe("Summer 2027");
    expect(result.success && result.data.workTermDuration).toBe("4 months");
  });

  it("rejects a status outside the tracker's vocabulary", () => {
    expect(
      saveJobInputSchema.safeParse({ ...minimal, status: "ghosted" }).success,
    ).toBe(false);
  });

  it("accepts a valid status regardless of how Claude capitalized it", () => {
    const values = toApplicationCreationValues({
      ...minimal,
      status: "Applied",
    });

    expect(values.currentStatus).toBe("Applied");
  });

  it("rejects a date that is not a calendar date", () => {
    expect(
      saveJobInputSchema.safeParse({ ...minimal, date_applied: "Aug 21 2026" })
        .success,
    ).toBe(false);

    // Shaped like a date, but not a real one: the shared schema is the backstop.
    expect(saveJobToInsertValues({ ...minimal, deadline: "2026-02-31" }).success).toBe(
      false,
    );
  });

  it("preserves an exact calendar date without timezone drift", () => {
    const result = saveJobToInsertValues({
      ...minimal,
      date_applied: "2026-08-21",
    });

    expect(result.success && result.data.dateApplied).toBe("2026-08-21");
  });

  it("rejects a job URL that is not http or https", () => {
    expect(
      saveJobToInsertValues({
        ...minimal,
        job_url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("stores a pasted job description verbatim", () => {
    const description = "About the role\n\nYou will run digital campaigns.";
    const result = saveJobToInsertValues({
      ...minimal,
      job_description: description,
    });

    expect(result.success && result.data.jobDescription).toBe(description);
  });

  it("rejects a job description beyond the column limit", () => {
    expect(
      saveJobInputSchema.safeParse({
        ...minimal,
        job_description: "x".repeat(50_001),
      }).success,
    ).toBe(false);
  });
});

describe("save_job and import_jobs share one record contract", () => {
  it("is literally the same schema, so the two cannot drift", () => {
    // Not "the same fields, kept in step by hand" — the same object.
    expect(saveJobInputSchema).toBe(newJobRecordSchema);
  });

  it("still accepts every payload an older caller could send", () => {
    // The fields save_job carried before the import work, exactly as they
    // were. Everything added since is optional, so an existing caller's
    // arguments are still valid.
    const legacy = {
      company: "RBC",
      job_title: "Business Analyst Intern",
      company_domain: "rbc.com",
      location: "Toronto, ON",
      status: "Applied",
      category: "Business Analysis",
      job_description: "Support reporting for the retail banking team.",
      job_url: "https://jobs.rbc.com/example",
      source: "LinkedIn",
      deadline: "2026-09-04",
      date_applied: "2026-08-22",
      work_term: "Winter 2027",
      duration: "4 months",
      notes: "Referred by a classmate.",
    };

    const parsed = saveJobToInsertValues(legacy);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.companyName).toBe("RBC");
    expect(parsed.success && parsed.data.applicationDeadline).toBe("2026-09-04");
  });

  it("carries the four fields creation previously could not express", () => {
    const parsed = saveJobToInsertValues({
      ...minimal,
      work_arrangement: "Hybrid",
      salary: "$22/hour",
      next_action: "Follow up with the recruiter",
      next_action_due_date: "2026-09-04",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.workArrangement).toBe("Hybrid");
    expect(parsed.data.salary).toBe("$22/hour");
    expect(parsed.data.nextAction).toBe("Follow up with the recruiter");
    expect(parsed.data.nextActionDueDate).toBe("2026-09-04");

    // And they reach the database columns, rather than stopping at the schema.
    const insert = toApplicationInsert(parsed.data);
    expect(insert.work_arrangement).toBe("Hybrid");
    expect(insert.salary).toBe("$22/hour");
    expect(insert.next_action).toBe("Follow up with the recruiter");
    expect(insert.next_action_due_date).toBe("2026-09-04");
  });

  it("keeps the same safe defaults when those fields are omitted", () => {
    const parsed = saveJobToInsertValues(minimal);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const insert = toApplicationInsert(parsed.data);
    expect(insert.work_arrangement).toBe("Unknown");
    expect(insert.salary).toBeNull();
    expect(insert.next_action).toBeNull();
    expect(insert.next_action_due_date).toBeNull();
  });

  it("rejects a work arrangement outside the tracker's vocabulary", () => {
    expect(
      saveJobInputSchema.safeParse({ ...minimal, work_arrangement: "WFH" })
        .success,
    ).toBe(false);
  });

  it("refuses a due date with no action, through the shared validation", () => {
    const parsed = saveJobToInsertValues({
      ...minimal,
      next_action_due_date: "2026-09-04",
    });

    expect(parsed.success).toBe(false);
    expect(
      !parsed.success &&
        parsed.error.issues.some(
          (issue) =>
            issue.message === "Next action due date requires a next action.",
        ),
    ).toBe(true);
  });

  it("rejects a next-action due date that is not ISO", () => {
    expect(
      saveJobInputSchema.safeParse({
        ...minimal,
        next_action: "Follow up",
        next_action_due_date: "09/04/2026",
      }).success,
    ).toBe(false);
  });
});
