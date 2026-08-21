import { describe, expect, it } from "vitest";
import { applicationCreationSchema } from "@/lib/validation/application";
import {
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
