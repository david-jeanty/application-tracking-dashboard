import { describe, expect, it } from "vitest";
import {
  lastMovementByApplication,
  needsAttention,
  type AttentionApplication,
} from "@/lib/dashboard/attention";
import {
  ATTENTION_LIMIT,
  STALE_AFTER_DAYS,
  UPCOMING_WINDOW_DAYS,
} from "@/lib/dashboard/definitions";

const TODAY = "2026-08-24";

function application(
  overrides: Partial<AttentionApplication> = {},
): AttentionApplication {
  return {
    id: "app-1",
    company_name: "RBC",
    original_job_title: "Business Analyst Intern",
    current_status: "Applied",
    next_action: null,
    next_action_due_date: null,
    application_deadline: null,
    archived_at: null,
    ...overrides,
  };
}

/** No recorded movement unless a test says otherwise. */
const noMovement = lastMovementByApplication([]);

/** One application that last moved on the given day. */
const movedOn = (day: string, id = "app-1") =>
  lastMovementByApplication([{ application_id: id, changedOn: day }]);

function classify(
  overrides: Partial<AttentionApplication>,
  movement = noMovement,
) {
  return needsAttention([application(overrides)], movement, TODAY);
}

describe("overdue next actions", () => {
  it("flags an action whose due date has passed", () => {
    const [item] = classify({
      next_action: "Follow up with recruiter",
      next_action_due_date: "2026-08-22",
    });

    expect(item).toMatchObject({
      reason: "overdue-action",
      detail: "Follow up with recruiter",
      timing: "Overdue by 2 days",
    });
  });

  it("says one day in the singular", () => {
    const [item] = classify({
      next_action: "Follow up",
      next_action_due_date: "2026-08-23",
    });

    expect(item.timing).toBe("Overdue by 1 day");
  });

  it("ignores a due date with no action attached", () => {
    // A date on its own describes nothing a student can act on.
    expect(classify({ next_action_due_date: "2026-08-01" })).toEqual([]);
    expect(classify({ next_action: "   ", next_action_due_date: "2026-08-01" })).toEqual(
      [],
    );
  });

  it("ignores an action with no due date", () => {
    expect(classify({ next_action: "Follow up" })).toEqual([]);
  });
});

describe("next actions due today or soon", () => {
  it("flags one due today", () => {
    const [item] = classify({
      next_action: "Send recruiter follow-up",
      next_action_due_date: TODAY,
    });

    expect(item).toMatchObject({ reason: "action-soon", timing: "Due today" });
  });

  it("flags one due tomorrow", () => {
    const [item] = classify({
      next_action: "Send recruiter follow-up",
      next_action_due_date: "2026-08-25",
    });

    expect(item.timing).toBe("Due tomorrow");
  });

  it("flags one inside the window", () => {
    const [item] = classify({
      next_action: "Prepare for interview",
      next_action_due_date: "2026-08-29",
    });

    expect(item.timing).toBe("Due in 5 days");
  });

  it("includes the boundary exactly at the threshold", () => {
    // Seven days out is inside a seven-day window.
    expect(
      classify({
        next_action: "Follow up",
        next_action_due_date: "2026-08-31",
      }),
    ).toHaveLength(1);
    expect(UPCOMING_WINDOW_DAYS).toBe(7);
  });

  it("excludes one past the threshold", () => {
    expect(
      classify({
        next_action: "Follow up",
        next_action_due_date: "2026-09-01",
      }),
    ).toEqual([]);
  });
});

describe("upcoming application deadlines", () => {
  it("flags a deadline today", () => {
    const [item] = classify({ application_deadline: TODAY });

    expect(item).toMatchObject({
      reason: "deadline-soon",
      detail: "Application deadline",
      timing: "Deadline today",
    });
  });

  it("flags a deadline tomorrow", () => {
    const [item] = classify({ application_deadline: "2026-08-25" });

    expect(item.timing).toBe("Deadline tomorrow");
  });

  it("includes the boundary exactly at the threshold", () => {
    expect(classify({ application_deadline: "2026-08-31" })).toHaveLength(1);
  });

  it("excludes one past the threshold", () => {
    expect(classify({ application_deadline: "2026-09-01" })).toEqual([]);
  });

  it("excludes a deadline that has already passed", () => {
    // Nothing can be done about it now; showing it is a reminder of a closed
    // door rather than a prompt to act.
    expect(classify({ application_deadline: "2026-08-23" })).toEqual([]);
  });
});

describe("stale applications", () => {
  it("flags one that has not moved for the threshold", () => {
    const [item] = classify(
      { company_name: "BMO", current_status: "Applied" },
      movedOn("2026-08-07"),
    );

    expect(item).toMatchObject({
      reason: "stale",
      companyName: "BMO",
      timing: "No status movement for 17 days",
    });
  });

  it("does not flag one just inside the threshold", () => {
    expect(classify({}, movedOn("2026-08-11"))).toEqual([]);
  });

  it("flags one exactly at the threshold", () => {
    const [item] = classify({}, movedOn("2026-08-10"));

    expect(item.timing).toBe(`No status movement for ${STALE_AFTER_DAYS} days`);
  });

  it("counts every status the pipeline is waiting in", () => {
    for (const status of ["Applied", "Screening", "Assessment", "Interview"] as const) {
      expect(classify({ current_status: status }, movedOn("2026-08-01"))).toHaveLength(
        1,
      );
    }
  });

  it("excludes terminal statuses, where silence is expected", () => {
    for (const status of ["Rejected", "Withdrawn", "Accepted"] as const) {
      expect(classify({ current_status: status }, movedOn("2026-08-01"))).toEqual(
        [],
      );
    }
  });

  it("excludes applications never sent anywhere", () => {
    // Silence from an employer is not a fact about an application nobody sent.
    for (const status of ["Interested", "Preparing"] as const) {
      expect(classify({ current_status: status }, movedOn("2026-08-01"))).toEqual(
        [],
      );
    }
  });

  it("leaves an application with no recorded movement alone", () => {
    expect(classify({ current_status: "Applied" }, noMovement)).toEqual([]);
  });

  it("measures from status movement, not from an unrelated edit", () => {
    // The map is built from status history only, so editing notes yesterday
    // cannot clear the flag.
    const [item] = classify({}, movedOn("2026-08-01"));

    expect(item.reason).toBe("stale");
  });
});

describe("archived applications are never surfaced", () => {
  it("excludes one that would otherwise be overdue", () => {
    expect(
      classify({
        archived_at: "2026-08-20T10:00:00.000Z",
        next_action: "Follow up",
        next_action_due_date: "2026-08-01",
      }),
    ).toEqual([]);
  });

  it("excludes one that would otherwise be stale", () => {
    expect(
      classify({ archived_at: "2026-08-20T10:00:00.000Z" }, movedOn("2026-08-01")),
    ).toEqual([]);
  });

  it("excludes one whose deadline is tomorrow", () => {
    expect(
      classify({
        archived_at: "2026-08-20T10:00:00.000Z",
        application_deadline: "2026-08-25",
      }),
    ).toEqual([]);
  });
});

describe("one entry per application", () => {
  it("reports only the most urgent reason when several apply", () => {
    // Overdue, a deadline this week, and silent for weeks — one company, one
    // row, so it cannot push three others off the card.
    const items = needsAttention(
      [
        application({
          next_action: "Follow up",
          next_action_due_date: "2026-08-20",
          application_deadline: "2026-08-26",
        }),
      ],
      movedOn("2026-08-01"),
      TODAY,
    );

    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe("overdue-action");
  });

  it("falls through to the deadline when nothing is overdue", () => {
    const items = needsAttention(
      [
        application({
          next_action: "Follow up",
          next_action_due_date: "2026-08-27",
          application_deadline: "2026-08-26",
        }),
      ],
      noMovement,
      TODAY,
    );

    expect(items[0].reason).toBe("deadline-soon");
  });
});

describe("urgency ordering", () => {
  it("puts the categories in priority order", () => {
    const items = needsAttention(
      [
        application({ id: "stale", company_name: "Stale Co" }),
        application({
          id: "soon",
          company_name: "Soon Co",
          next_action: "Follow up",
          next_action_due_date: "2026-08-26",
        }),
        application({
          id: "deadline",
          company_name: "Deadline Co",
          application_deadline: "2026-08-27",
        }),
        application({
          id: "overdue",
          company_name: "Overdue Co",
          next_action: "Follow up",
          next_action_due_date: "2026-08-20",
        }),
      ],
      lastMovementByApplication([
        { application_id: "stale", changedOn: "2026-08-01" },
      ]),
      TODAY,
    );

    expect(items.map((item) => item.reason)).toEqual([
      "overdue-action",
      "deadline-soon",
      "action-soon",
      "stale",
    ]);
  });

  it("puts the most overdue first within a category", () => {
    const items = needsAttention(
      [
        application({
          id: "a",
          company_name: "Recent",
          next_action: "Follow up",
          next_action_due_date: "2026-08-23",
        }),
        application({
          id: "b",
          company_name: "Ancient",
          next_action: "Follow up",
          next_action_due_date: "2026-08-01",
        }),
      ],
      noMovement,
      TODAY,
    );

    expect(items.map((item) => item.companyName)).toEqual(["Ancient", "Recent"]);
  });

  it("puts the soonest first among upcoming dates", () => {
    const items = needsAttention(
      [
        application({ id: "a", company_name: "Later", application_deadline: "2026-08-30" }),
        application({ id: "b", company_name: "Sooner", application_deadline: "2026-08-25" }),
      ],
      noMovement,
      TODAY,
    );

    expect(items.map((item) => item.companyName)).toEqual(["Sooner", "Later"]);
  });

  it("puts the longest silence first among stale entries", () => {
    const items = needsAttention(
      [
        application({ id: "a", company_name: "Quieter" }),
        application({ id: "b", company_name: "Quietest" }),
      ],
      lastMovementByApplication([
        { application_id: "a", changedOn: "2026-08-05" },
        { application_id: "b", changedOn: "2026-07-20" },
      ]),
      TODAY,
    );

    expect(items.map((item) => item.companyName)).toEqual(["Quietest", "Quieter"]);
  });

  it("breaks a tie by company so the order never wobbles", () => {
    const items = needsAttention(
      [
        application({ id: "a", company_name: "Zellers", application_deadline: "2026-08-25" }),
        application({ id: "b", company_name: "Aritzia", application_deadline: "2026-08-25" }),
      ],
      noMovement,
      TODAY,
    );

    expect(items.map((item) => item.companyName)).toEqual(["Aritzia", "Zellers"]);
  });
});

describe("the list stays short enough to answer the question", () => {
  it("caps at the documented limit", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      application({
        id: `app-${index}`,
        company_name: `Company ${index}`,
        next_action: "Follow up",
        next_action_due_date: "2026-08-01",
      }),
    );

    expect(needsAttention(many, noMovement, TODAY)).toHaveLength(ATTENTION_LIMIT);
    expect(ATTENTION_LIMIT).toBeLessThanOrEqual(8);
  });

  it("keeps the most urgent entries when it caps", () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      application({
        id: `app-${index}`,
        company_name: `Company ${index}`,
        application_deadline: "2026-08-24",
      }),
    );
    many.push(
      application({
        id: "urgent",
        company_name: "Urgent Co",
        next_action: "Follow up",
        next_action_due_date: "2026-08-01",
      }),
    );

    expect(needsAttention(many, noMovement, TODAY)[0].companyName).toBe("Urgent Co");
  });

  it("returns nothing when nothing needs attention", () => {
    const items = needsAttention(
      [
        application({ current_status: "Rejected" }),
        application({ id: "b", current_status: "Interested" }),
      ],
      noMovement,
      TODAY,
    );

    expect(items).toEqual([]);
  });
});

describe("last movement is the latest recorded event", () => {
  it("keeps the most recent day per application", () => {
    const movement = lastMovementByApplication([
      { application_id: "a", changedOn: "2026-08-01" },
      { application_id: "a", changedOn: "2026-08-20" },
      { application_id: "a", changedOn: "2026-08-10" },
      { application_id: "b", changedOn: "2026-07-01" },
    ]);

    expect(movement.get("a")).toBe("2026-08-20");
    expect(movement.get("b")).toBe("2026-07-01");
  });

  it("counts the creation event, so a never-touched application can go stale", () => {
    // An application saved eighteen days ago and untouched since has been
    // silent for eighteen days. Its only event is the creation event.
    const [item] = classify({}, movedOn("2026-08-06"));

    expect(item.reason).toBe("stale");
  });
});
