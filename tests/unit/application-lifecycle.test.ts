import { describe, expect, it } from "vitest";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";
import type { ApplicationStatus } from "@/lib/applications/constants";
import {
  APPLICATION_INDEX_STAGES,
  LIFECYCLE_STAGES,
  buildApplicationIndexLifecycle,
  buildApplicationIndexLifecycles,
  buildLifecycle,
  buildLifecycles,
  describeLifecycle,
  reachedStatusesByApplication,
  stageForStatus,
  type LifecycleStageId,
} from "@/lib/applications/lifecycle";

/** The stages an application reached, as ids, for compact assertions. */
function reachedStages(
  currentStatus: ApplicationStatus,
  everHeld: ApplicationStatus[] = [],
): LifecycleStageId[] {
  return buildLifecycle(currentStatus, everHeld)
    .stages.filter((stage) => stage.reached)
    .map((stage) => stage.id);
}

function currentStage(
  currentStatus: ApplicationStatus,
  everHeld: ApplicationStatus[] = [],
): LifecycleStageId[] {
  return buildLifecycle(currentStatus, everHeld)
    .stages.filter((stage) => stage.current)
    .map((stage) => stage.id);
}

describe("mapping the ten exact statuses onto five stages", () => {
  it("covers every status in the enum", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(() => stageForStatus(status)).not.toThrow();
    }
  });

  it("puts each status in exactly one stage", () => {
    const seen = LIFECYCLE_STAGES.flatMap((stage) => stage.statuses);

    expect([...new Set(seen)]).toHaveLength(seen.length);
    expect(seen.slice().sort()).toEqual([...APPLICATION_STATUSES].sort());
  });

  it("groups the statuses the way Interndex describes them", () => {
    expect(stageForStatus("Interested")).toBe("saved");
    expect(stageForStatus("Preparing")).toBe("saved");
    expect(stageForStatus("Applied")).toBe("applied");
    expect(stageForStatus("Screening")).toBe("in-process");
    expect(stageForStatus("Assessment")).toBe("in-process");
    expect(stageForStatus("Interview")).toBe("interview");
    expect(stageForStatus("Offer")).toBe("outcome");
    expect(stageForStatus("Accepted")).toBe("outcome");
    expect(stageForStatus("Rejected")).toBe("outcome");
    expect(stageForStatus("Withdrawn")).toBe("outcome");
  });
});

describe("the four visible milestones used by the Applications index", () => {
  it("names exactly Saved, Applied, Interview and Outcome", () => {
    expect(APPLICATION_INDEX_STAGES.map((stage) => stage.label)).toEqual([
      "Saved",
      "Applied",
      "Interview",
      "Outcome",
    ]);
  });

  it("folds screening and assessment into Applied without changing their exact status", () => {
    for (const status of ["Screening", "Assessment"] as const) {
      const lifecycle = buildApplicationIndexLifecycle(status);
      expect(lifecycle.stages.find((stage) => stage.current)?.label).toBe(
        "Applied",
      );
    }
  });

  it("labels every terminal result Outcome rather than calling rejection an offer", () => {
    for (const status of ["Offer", "Accepted", "Rejected", "Withdrawn"] as const) {
      const lifecycle = buildApplicationIndexLifecycle(status);
      expect(lifecycle.stages.find((stage) => stage.current)?.label).toBe(
        "Outcome",
      );
    }
  });

  it("builds every index rail from the same truthful history pass", () => {
    const lifecycles = buildApplicationIndexLifecycles(
      [{ id: "a", current_status: "Rejected" }],
      [
        { application_id: "a", new_status: "Applied" },
        { application_id: "a", new_status: "Interview" },
        { application_id: "a", new_status: "Rejected" },
      ],
    );

    expect(lifecycles?.get("a")?.stages).toHaveLength(4);
    expect(lifecycles?.get("a")?.connectors).toEqual([true, true, true]);
  });
});

describe("an application sitting at each exact status", () => {
  it("counts Saved as reached because the record exists", () => {
    expect(reachedStages("Interested")).toEqual(["saved"]);
    expect(currentStage("Interested")).toEqual(["saved"]);
  });

  it("treats Preparing as still saved", () => {
    expect(reachedStages("Preparing")).toEqual(["saved"]);
    expect(currentStage("Preparing")).toEqual(["saved"]);
  });

  it("reaches Applied", () => {
    expect(reachedStages("Applied", ["Interested", "Applied"])).toEqual([
      "saved",
      "applied",
    ]);
    expect(currentStage("Applied")).toEqual(["applied"]);
  });

  it("reaches In process from Screening", () => {
    expect(
      reachedStages("Screening", ["Interested", "Applied", "Screening"]),
    ).toEqual(["saved", "applied", "in-process"]);
    expect(currentStage("Screening")).toEqual(["in-process"]);
  });

  it("reaches In process from Assessment", () => {
    expect(currentStage("Assessment")).toEqual(["in-process"]);
    expect(
      reachedStages("Assessment", ["Applied", "Assessment"]),
    ).toEqual(["saved", "applied", "in-process"]);
  });

  it("reaches Interview", () => {
    expect(
      reachedStages("Interview", ["Applied", "Screening", "Interview"]),
    ).toEqual(["saved", "applied", "in-process", "interview"]);
    expect(currentStage("Interview")).toEqual(["interview"]);
  });

  it("reaches Outcome from Offer", () => {
    expect(currentStage("Offer")).toEqual(["outcome"]);
  });

  it("reaches Outcome from Accepted", () => {
    expect(currentStage("Accepted")).toEqual(["outcome"]);
  });

  it("reaches Outcome from Rejected", () => {
    expect(currentStage("Rejected")).toEqual(["outcome"]);
  });

  it("reaches Outcome from Withdrawn", () => {
    expect(currentStage("Withdrawn")).toEqual(["outcome"]);
  });
});

describe("not claiming stages an application never went through", () => {
  it("does not mark Interview reached just because an Outcome was recorded", () => {
    // The whole point of the rule: a terminal status is not a claim about how
    // the application got there.
    expect(reachedStages("Rejected", ["Interested", "Applied", "Rejected"])).toEqual([
      "saved",
      "applied",
      "outcome",
    ]);
  });

  it("does not mark In process reached for a rejection after an interview", () => {
    expect(
      reachedStages("Rejected", ["Applied", "Interview", "Rejected"]),
    ).toEqual(["saved", "applied", "interview", "outcome"]);
  });

  it("does not mark Applied reached for a withdrawal before applying", () => {
    expect(reachedStages("Withdrawn", ["Interested", "Withdrawn"])).toEqual([
      "saved",
      "outcome",
    ]);
  });

  it("does not mark Interview reached for a withdrawal during screening", () => {
    expect(
      reachedStages("Withdrawn", ["Applied", "Screening", "Withdrawn"]),
    ).toEqual(["saved", "applied", "in-process", "outcome"]);
  });

  it("keeps a skipped middle stage empty", () => {
    expect(
      reachedStages("Interview", ["Applied", "Interview"]),
    ).toEqual(["saved", "applied", "interview"]);
  });

  it("counts an application created directly as Applied as saved and applied", () => {
    // The creation event carries the status it was created with, so an
    // application that never sat at Interested still shows Saved.
    expect(reachedStages("Applied", ["Applied"])).toEqual(["saved", "applied"]);
  });

  it("never contradicts the current status when history is missing", () => {
    // With no history there is no evidence the application was ever Applied,
    // so Applied stays empty. The current stage is still shown, because the
    // status printed beside the rail says so.
    expect(reachedStages("Interview", [])).toEqual(["saved", "interview"]);
  });
});

describe("the connectors between stages", () => {
  it("completes a connector only when both of its ends were reached", () => {
    const lifecycle = buildLifecycle("Rejected", [
      "Applied",
      "Interview",
      "Rejected",
    ]);

    // Saved-Applied joined, Applied-Process broken, Process-Interview broken,
    // Interview-Outcome joined. The gap is the skipped stage, drawn honestly.
    expect(lifecycle.connectors).toEqual([true, false, false, true]);
  });

  it("joins the whole rail for an application that went through every stage", () => {
    const lifecycle = buildLifecycle("Accepted", [
      "Interested",
      "Applied",
      "Screening",
      "Interview",
      "Accepted",
    ]);

    expect(lifecycle.connectors).toEqual([true, true, true, true]);
  });

  it("leaves every connector open for a freshly saved application", () => {
    expect(buildLifecycle("Interested").connectors).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("has one fewer connector than stages", () => {
    const lifecycle = buildLifecycle("Applied");

    expect(lifecycle.connectors).toHaveLength(lifecycle.stages.length - 1);
  });
});

describe("the exact status stays separate from the coarse lifecycle", () => {
  it("gives Offer, Rejected and Withdrawn the same stage but keeps them distinct statuses", () => {
    expect(currentStage("Offer")).toEqual(currentStage("Rejected"));
    expect(currentStage("Rejected")).toEqual(currentStage("Withdrawn"));
    // The rail summarises; it never renames or replaces the status itself.
    expect(stageForStatus("Offer")).toBe("outcome");
    expect(stageForStatus("Rejected")).toBe("outcome");
  });

  it("marks exactly one stage current", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(currentStage(status)).toHaveLength(1);
    }
  });
});

describe("building a whole list at once", () => {
  it("gives every application its own rail from one pass over history", () => {
    const lifecycles = buildLifecycles(
      [
        { id: "a", current_status: "Applied" },
        { id: "b", current_status: "Rejected" },
      ],
      [
        { application_id: "a", new_status: "Interested" },
        { application_id: "a", new_status: "Applied" },
        { application_id: "b", new_status: "Applied" },
        { application_id: "b", new_status: "Interview" },
        { application_id: "b", new_status: "Rejected" },
      ],
    );

    expect(lifecycles?.get("a")?.connectors).toEqual([true, false, false, false]);
    expect(lifecycles?.get("b")?.connectors).toEqual([true, false, false, true]);
  });

  it("still builds a rail for an application with no recorded history", () => {
    const lifecycles = buildLifecycles(
      [{ id: "a", current_status: "Interview" }],
      [],
    );

    // Saved and the current stage only. Filling in Applied would invent a step
    // nothing recorded.
    expect(
      lifecycles?.get("a")?.stages.filter((stage) => stage.reached).map((s) => s.id),
    ).toEqual(["saved", "interview"]);
  });

  it("returns nothing at all when history could not be read", () => {
    // The caller shows the exact status on its own rather than guessing.
    expect(buildLifecycles([{ id: "a", current_status: "Applied" }], null)).toBeNull();
  });

  it("ignores history belonging to other applications", () => {
    const lifecycles = buildLifecycles(
      [{ id: "a", current_status: "Applied" }],
      [{ application_id: "b", new_status: "Interview" }],
    );

    expect(
      lifecycles?.get("a")?.stages.find((stage) => stage.id === "interview")?.reached,
    ).toBe(false);
  });
});

describe("grouping history by application", () => {
  it("collects every status an application has held", () => {
    const reached = reachedStatusesByApplication([
      { application_id: "a", new_status: "Interested" },
      { application_id: "a", new_status: "Applied" },
      { application_id: "a", new_status: "Applied" },
      { application_id: "b", new_status: "Offer" },
    ]);

    expect([...(reached.get("a") ?? [])].sort()).toEqual(["Applied", "Interested"]);
    expect([...(reached.get("b") ?? [])]).toEqual(["Offer"]);
  });

  it("has nothing for an application with no events", () => {
    expect(reachedStatusesByApplication([]).get("a")).toBeUndefined();
  });
});

describe("describing the rail for assistive technology", () => {
  it("names every stage and its state", () => {
    const described = describeLifecycle(
      buildLifecycle("Rejected", ["Applied", "Interview", "Rejected"]),
    );

    expect(described).toBe(
      "Lifecycle progress: Saved reached, Applied reached, In process not reached, Interview reached, Outcome current stage.",
    );
  });

  it("says which stage is current rather than only that it was reached", () => {
    expect(describeLifecycle(buildLifecycle("Applied"))).toContain(
      "Applied current stage",
    );
  });
});
