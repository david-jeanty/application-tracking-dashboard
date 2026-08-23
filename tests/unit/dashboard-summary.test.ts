import { describe, expect, it } from "vitest";
import { summarizeTrackedApplications } from "@/lib/applications/dashboard";

describe("summarizeTrackedApplications", () => {
  it("keeps the first-application state when nothing is tracked", () => {
    expect(summarizeTrackedApplications(0)).toEqual({
      kind: "first-application",
    });
  });

  it("switches to the returning-user state at the first application", () => {
    expect(summarizeTrackedApplications(1)).toEqual({
      kind: "tracking",
      count: 1,
      description: "1 application currently tracked",
    });
  });

  it("pluralizes beyond one application", () => {
    expect(summarizeTrackedApplications(3).kind).toBe("tracking");
    expect(summarizeTrackedApplications(3)).toMatchObject({
      description: "3 applications currently tracked",
    });
    expect(summarizeTrackedApplications(12)).toMatchObject({
      description: "12 applications currently tracked",
    });
  });

  it("never reports a count it was not given", () => {
    // The page passes 0 when the owner-scoped read fails, so a failure shows
    // the neutral card rather than asserting a number.
    expect(summarizeTrackedApplications(0).kind).toBe("first-application");
  });

  it("treats a nonsensical negative count as nothing tracked", () => {
    expect(summarizeTrackedApplications(-1)).toEqual({
      kind: "first-application",
    });
  });
});
