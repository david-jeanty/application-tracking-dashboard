import { describe, expect, it } from "vitest";
import { UNSPECIFIED_DATABASE_VALUE } from "@/lib/applications/constants";
import { classifyMissingConditionalUpdate } from "@/lib/applications/concurrency";
import {
  displayOptionalText,
  safeExternalUrl,
  toApplicationFormValues,
  toApplicationInsert,
  toApplicationUpdate,
} from "@/lib/applications/mapper";
import type { ApplicationRecord } from "@/lib/applications/types";
import {
  applicationCreationSchema,
  applicationUpdateSchema,
} from "@/lib/validation/application";

const requiredInput = {
  companyName: "Example Company",
  originalJobTitle: "Business Analyst Intern",
  normalizedJobCategory: "Business Analysis",
  currentStatus: "Applied",
  workTermSeason: "Summer 2027",
};

describe("application creation validation", () => {
  it("accepts and trims the required application fields", () => {
    const result = applicationCreationSchema.parse({
      ...requiredInput,
      companyName: "  Example Company  ",
      originalJobTitle: "  Business Analyst Intern  ",
    });

    expect(result.companyName).toBe("Example Company");
    expect(result.originalJobTitle).toBe("Business Analyst Intern");
  });

  it("normalizes blank optional fields to undefined", () => {
    const result = applicationCreationSchema.parse({
      ...requiredInput,
      location: "   ",
      notes: "",
      dateApplied: "",
      workArrangement: "",
    });

    expect(result.location).toBeUndefined();
    expect(result.notes).toBeUndefined();
    expect(result.dateApplied).toBeUndefined();
    expect(result.workArrangement).toBeUndefined();
  });

  it.each([
    ["2028-02-29", true],
    ["2027-02-29", false],
    ["2027-13-01", false],
    ["07/24/2027", false],
  ])("validates application date-only value %s", (value, expected) => {
    const result = applicationCreationSchema.safeParse({
      ...requiredInput,
      applicationDeadline: value,
    });

    expect(result.success).toBe(expected);
  });

  it("rejects unknown status, category, and work-arrangement values", () => {
    expect(
      applicationCreationSchema.safeParse({
        ...requiredInput,
        normalizedJobCategory: "Growth",
      }).success,
    ).toBe(false);
    expect(
      applicationCreationSchema.safeParse({
        ...requiredInput,
        currentStatus: "Maybe",
      }).success,
    ).toBe(false);
    expect(
      applicationCreationSchema.safeParse({
        ...requiredInput,
        workArrangement: "Flexible",
      }).success,
    ).toBe(false);
  });

  it("maps optional schema blanks without accepting an ownership field", () => {
    const parsed = applicationCreationSchema.parse(requiredInput);
    const insert = toApplicationInsert(parsed);

    expect(insert.location).toBe(UNSPECIFIED_DATABASE_VALUE);
    expect(insert.application_source).toBe(UNSPECIFIED_DATABASE_VALUE);
    expect(insert.work_arrangement).toBe("Unknown");
    expect(insert).not.toHaveProperty("user_id");
  });
});

describe("application update validation and mapping", () => {
  it("reuses creation rules and requires an expected update timestamp", () => {
    const result = applicationUpdateSchema.parse({
      ...requiredInput,
      expectedUpdatedAt: "2027-01-15T17:30:00.000Z",
      location: "  Toronto, ON ",
      notes: " ",
    });

    expect(result.location).toBe("Toronto, ON");
    expect(result.notes).toBeUndefined();
    expect(result.expectedUpdatedAt).toBe("2027-01-15T17:30:00.000Z");
    expect(
      applicationUpdateSchema.safeParse(requiredInput).success,
    ).toBe(false);
  });

  it("maps blank optional values to storage sentinels without ownership", () => {
    const parsed = applicationUpdateSchema.parse({
      ...requiredInput,
      expectedUpdatedAt: "2027-01-15T17:30:00.000Z",
      location: "",
      applicationSource: " ",
      user_id: "forged-owner",
    });
    const update = toApplicationUpdate(parsed);

    expect(update.location).toBe(UNSPECIFIED_DATABASE_VALUE);
    expect(update.application_source).toBe(UNSPECIFIED_DATABASE_VALUE);
    expect(update).not.toHaveProperty("user_id");
    expect(update).not.toHaveProperty("expectedUpdatedAt");
    expect(parsed).not.toHaveProperty("user_id");
  });

  it("centralizes sentinel-to-display and display-to-form mapping", () => {
    const application: ApplicationRecord = {
      id: "df9cacdb-95b7-4687-bfd2-9bce6d8cbf40",
      company_name: "Example Company",
      original_job_title: "Business Analyst Intern",
      normalized_job_category: "Business Analysis",
      classification_confidence: null,
      location: UNSPECIFIED_DATABASE_VALUE,
      work_arrangement: "Unknown",
      application_url: null,
      application_source: UNSPECIFIED_DATABASE_VALUE,
      job_description: null,
      application_deadline: "2027-02-28",
      date_applied: "2027-01-15",
      current_status: "Applied",
      work_term_season: "Summer 2027",
      work_term_duration: null,
      salary: null,
      notes: null,
      next_action: null,
      next_action_due_date: null,
      created_at: "2027-01-15T17:30:00.000Z",
      updated_at: "2027-01-15T17:30:00.000Z",
      archived_at: null,
    };

    expect(displayOptionalText(UNSPECIFIED_DATABASE_VALUE)).toBeNull();
    expect(displayOptionalText(" Toronto ")).toBe("Toronto");
    expect(toApplicationFormValues(application)).toMatchObject({
      location: "",
      applicationSource: "",
      applicationDeadline: "2027-02-28",
      dateApplied: "2027-01-15",
    });
  });

  it("allows only http and https application links", () => {
    expect(safeExternalUrl("https://example.com/jobs/1")).toBe(
      "https://example.com/jobs/1",
    );
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("not a URL")).toBeNull();
    expect(
      applicationUpdateSchema.safeParse({
        ...requiredInput,
        expectedUpdatedAt: "2027-01-15T17:30:00.000Z",
        applicationUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("classifies a failed conditional update without leaking ownership", () => {
    expect(classifyMissingConditionalUpdate(true)).toBe("conflict");
    expect(classifyMissingConditionalUpdate(false)).toBe("not_found");
  });
});
