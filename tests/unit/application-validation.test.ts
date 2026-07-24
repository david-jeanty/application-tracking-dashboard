import { describe, expect, it } from "vitest";
import { UNSPECIFIED_DATABASE_VALUE } from "@/lib/applications/constants";
import { toApplicationInsert } from "@/lib/applications/mapper";
import { applicationCreationSchema } from "@/lib/validation/application";

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
