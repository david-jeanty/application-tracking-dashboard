import { describe, expect, it } from "vitest";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";
import type { ApplicationStatus } from "@/lib/applications/constants";
import {
  assessStatusTransition,
  describeStatusTransition,
} from "@/lib/applications/status-transitions";

describe("the examples the feature was specified against", () => {
  it("prompts for Applied to Interested", () => {
    expect(assessStatusTransition("Applied", "Interested")).toEqual({
      isUnusual: true,
      reason: "backward",
    });
  });

  it("prompts for backward movement through active stages", () => {
    expect(assessStatusTransition("Interview", "Applied")).toEqual({
      isUnusual: true,
      reason: "backward",
    });
  });

  it("prompts for reopening a rejected outcome", () => {
    expect(assessStatusTransition("Rejected", "Interview")).toEqual({
      isUnusual: true,
      reason: "reopened-outcome",
    });
  });

  it("prompts for reopening an accepted outcome", () => {
    expect(assessStatusTransition("Accepted", "Offer")).toEqual({
      isUnusual: true,
      reason: "reopened-outcome",
    });
  });

  it("does not prompt for normal forward progress", () => {
    expect(assessStatusTransition("Interested", "Applied")).toEqual({
      isUnusual: false,
      reason: null,
    });
  });

  it("does not prompt for moving to Rejected from an active status", () => {
    expect(assessStatusTransition("Interview", "Rejected")).toEqual({
      isUnusual: false,
      reason: null,
    });
  });

  it("does not prompt for moving to Withdrawn from an active status", () => {
    expect(assessStatusTransition("Applied", "Withdrawn")).toEqual({
      isUnusual: false,
      reason: null,
    });
  });

  it("does not prompt for a valid skip forward", () => {
    expect(assessStatusTransition("Applied", "Offer")).toEqual({
      isUnusual: false,
      reason: null,
    });
  });

  it("does not prompt between Screening and Assessment, either direction", () => {
    expect(assessStatusTransition("Screening", "Assessment")).toEqual({
      isUnusual: false,
      reason: null,
    });
    expect(assessStatusTransition("Assessment", "Screening")).toEqual({
      isUnusual: false,
      reason: null,
    });
  });
});

describe("statuses outside the specified examples", () => {
  it("never flags choosing the status already held", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(assessStatusTransition(status, status)).toEqual({
        isUnusual: false,
        reason: null,
      });
    }
  });

  it("treats reaching Accepted from any active status as ordinary progress", () => {
    const activeStatuses: ApplicationStatus[] = [
      "Interested",
      "Preparing",
      "Applied",
      "Screening",
      "Assessment",
      "Interview",
      "Offer",
    ];

    for (const from of activeStatuses) {
      expect(assessStatusTransition(from, "Accepted")).toEqual({
        isUnusual: false,
        reason: null,
      });
    }
  });

  it("flags leaving any terminal status for another terminal status", () => {
    expect(assessStatusTransition("Accepted", "Rejected")).toEqual({
      isUnusual: true,
      reason: "reopened-outcome",
    });
    expect(assessStatusTransition("Rejected", "Withdrawn")).toEqual({
      isUnusual: true,
      reason: "reopened-outcome",
    });
  });

  it("flags a full skip back to the very first stage", () => {
    expect(assessStatusTransition("Offer", "Interested")).toEqual({
      isUnusual: true,
      reason: "backward",
    });
  });

  it("does not flag a large forward skip", () => {
    expect(assessStatusTransition("Interested", "Interview")).toEqual({
      isUnusual: false,
      reason: null,
    });
  });

  it("classifies every ordered pair as exactly one of the two reasons or none", () => {
    for (const from of APPLICATION_STATUSES) {
      for (const to of APPLICATION_STATUSES) {
        const assessment = assessStatusTransition(from, to);
        expect(["backward", "reopened-outcome", null]).toContain(
          assessment.reason,
        );
        expect(assessment.isUnusual).toBe(assessment.reason !== null);
      }
    }
  });
});

describe("the sentence shown for an unusual transition", () => {
  it("names the backward move by its exact statuses", () => {
    expect(describeStatusTransition("Applied", "Interested", "backward")).toBe(
      "This moves the application backward, from Applied to Interested.",
    );
  });

  it("names a reopened outcome by its exact statuses", () => {
    expect(
      describeStatusTransition("Rejected", "Interview", "reopened-outcome"),
    ).toBe("This reopens the application, moving it from Rejected back to Interview.");
  });
});
