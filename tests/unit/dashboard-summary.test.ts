import { describe, expect, it } from "vitest";
import { summarizeTrackedApplications } from "@/lib/applications/dashboard";

/** A successful read of `count` rows, matching the repository's shape. */
function succeeded(count: number) {
  return { data: Array.from({ length: count }, (_, index) => index), error: null };
}

describe("summarizeTrackedApplications", () => {
  it("keeps the first-application state when the read succeeds with no rows", () => {
    expect(summarizeTrackedApplications(succeeded(0))).toEqual({
      kind: "first-application",
    });
  });

  it("switches to the returning-user state at the first application", () => {
    expect(summarizeTrackedApplications(succeeded(1))).toEqual({
      kind: "tracking",
      count: 1,
      description: "1 application currently tracked",
    });
  });

  it("pluralizes beyond one application", () => {
    expect(summarizeTrackedApplications(succeeded(3))).toMatchObject({
      kind: "tracking",
      description: "3 applications currently tracked",
    });
    expect(summarizeTrackedApplications(succeeded(12))).toMatchObject({
      description: "12 applications currently tracked",
    });
  });

  describe("a failed read is never reported as an empty tracker", () => {
    it("reports unavailable when the query returns an error", () => {
      expect(
        summarizeTrackedApplications({
          data: null,
          error: { code: "42501", message: "permission denied" },
        }),
      ).toEqual({ kind: "unavailable" });
    });

    it("reports unavailable even when an error arrives alongside rows", () => {
      // Never let a partial result be counted as the whole tracker.
      expect(
        summarizeTrackedApplications({
          data: [1, 2, 3],
          error: { code: "57014" },
        }),
      ).toEqual({ kind: "unavailable" });
    });

    it("reports unavailable when rows are missing without an error", () => {
      // A successful read always returns an array, so a null one is an
      // inconsistent result — not evidence that the student has nothing saved.
      expect(
        summarizeTrackedApplications({ data: null, error: null }),
      ).toEqual({ kind: "unavailable" });
    });

    it("never carries a count or description on the unavailable state", () => {
      const summary = summarizeTrackedApplications({
        data: null,
        error: new Error("connection reset"),
      });

      expect(summary).not.toHaveProperty("count");
      expect(summary).not.toHaveProperty("description");
    });

    it("exposes nothing from the underlying error object", () => {
      const summary = summarizeTrackedApplications({
        data: null,
        error: {
          code: "42501",
          message: 'permission denied for table "applications"',
          hint: "check RLS policy",
        },
      });

      // The student-facing copy is chosen by the page, not derived from this.
      expect(JSON.stringify(summary)).not.toMatch(/permission denied|42501|RLS/);
    });
  });
});
