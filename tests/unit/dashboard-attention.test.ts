import { describe, expect, it } from "vitest";
import {
  needsAttention,
  type AttentionApplication,
} from "@/lib/dashboard/attention";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";
import {
  ATTENTION_LIMIT,
  DEADLINE_MINIMUM_SAVED_DAYS,
  UPCOMING_WINDOW_DAYS,
} from "@/lib/dashboard/definitions";

const TODAY = "2026-08-24";

/** Old enough that a deadline is never suppressed for being freshly saved. */
const SAVED_LONG_AGO = "2026-07-01";

/** Every status from Applied onward — a deadline is spent for all of them. */
const SUBMITTED_STATUSES = [
  "Applied",
  "Screening",
  "Assessment",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
  "Accepted",
] as const;

function application(
  overrides: Partial<AttentionApplication> = {},
): AttentionApplication {
  return {
    id: "app-1",
    company_name: "RBC",
    company_domain: null,
    original_job_title: "Business Analyst Intern",
    current_status: "Applied",
    next_action: null,
    next_action_due_date: null,
    application_deadline: null,
    archived_at: null,
    createdOn: SAVED_LONG_AGO,
    ...overrides,
  };
}

function classify(overrides: Partial<AttentionApplication>) {
  return needsAttention([application(overrides)], TODAY);
}

describe("employer silence is never an action item", () => {
  it("says nothing about an application sitting at Applied for weeks", () => {
    // Silence after submitting is not a task. It may simply mean the student
    // is not moving forward, and there is nothing for them to do about it.
    expect(
      classify({ current_status: "Applied", createdOn: "2026-06-01" }),
    ).toEqual([]);
  });

  it("says nothing however long any submitted application has been quiet", () => {
    for (const status of SUBMITTED_STATUSES) {
      expect(
        classify({ current_status: status, createdOn: "2026-01-01" }),
      ).toEqual([]);
    }
  });

  it("says nothing about a quiet unsubmitted application either", () => {
    // Without a deadline or a recorded action there is nothing to act on,
    // whatever the status.
    for (const status of ["Interested", "Preparing"] as const) {
      expect(
        classify({ current_status: status, createdOn: "2026-01-01" }),
      ).toEqual([]);
    }
  });

  it("never invents a follow-up the student did not record", () => {
    const items = needsAttention(
      APPLICATION_STATUSES.map((status, index) =>
        application({
          id: `app-${index}`,
          current_status: status,
          createdOn: "2026-01-01",
        }),
      ),
      TODAY,
    );

    expect(items).toEqual([]);
  });
});

describe("overdue next actions", () => {
  it("flags an action whose due date has passed", () => {
    const [item] = classify({
      company_name: "KPMG",
      next_action: "Follow up with recruiter",
      next_action_due_date: "2026-08-22",
    });

    expect(item).toMatchObject({
      reason: "overdue-action",
      detail: "Follow up with recruiter",
      date: "2026-08-22",
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

  it("applies at any status, because the student recorded it themselves", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(
        classify({
          current_status: status,
          next_action: "Follow up",
          next_action_due_date: "2026-08-20",
        }),
      ).toHaveLength(1);
    }
  });

  it("ignores a due date with no action attached", () => {
    // A date on its own describes nothing a student can act on.
    expect(classify({ next_action_due_date: "2026-08-01" })).toEqual([]);
    expect(
      classify({ next_action: "   ", next_action_due_date: "2026-08-01" }),
    ).toEqual([]);
  });

  it("ignores an action with no due date", () => {
    expect(classify({ next_action: "Follow up" })).toEqual([]);
  });
});

describe("next actions due soon", () => {
  it("flags one due today", () => {
    const [item] = classify({
      next_action: "Send recruiter follow-up",
      next_action_due_date: TODAY,
    });

    expect(item).toMatchObject({ reason: "action-due-now", timing: "Due today" });
  });

  it("flags one due tomorrow", () => {
    const [item] = classify({
      next_action: "Prepare for interview",
      next_action_due_date: "2026-08-25",
    });

    expect(item).toMatchObject({
      reason: "action-due-now",
      timing: "Due tomorrow",
    });
  });

  it("flags one later in the window at the lower tier", () => {
    const [item] = classify({
      next_action: "Send thank-you email",
      next_action_due_date: "2026-08-29",
    });

    expect(item).toMatchObject({
      reason: "action-due-soon",
      timing: "Due in 5 days",
    });
  });

  it("includes the boundary exactly at the threshold", () => {
    expect(
      classify({ next_action: "Follow up", next_action_due_date: "2026-08-31" }),
    ).toHaveLength(1);
    expect(UPCOMING_WINDOW_DAYS).toBe(7);
  });

  it("excludes one past the threshold", () => {
    expect(
      classify({ next_action: "Follow up", next_action_due_date: "2026-09-01" }),
    ).toEqual([]);
  });

  it("applies at any status, as long as the application is active", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(
        classify({
          current_status: status,
          next_action: "Follow up",
          next_action_due_date: "2026-08-25",
        }),
      ).toHaveLength(1);
    }
  });
});

describe("a deadline is only an action before the application is submitted", () => {
  it("flags a deadline tomorrow while the student is still Interested", () => {
    const [item] = classify({
      company_name: "Shopify",
      original_job_title: "Marketing Intern",
      current_status: "Interested",
      application_deadline: "2026-08-25",
    });

    expect(item).toMatchObject({
      reason: "deadline-critical",
      // The role is carried separately as `jobTitle`; `detail` names what the
      // row is about, in the slot a recorded action occupies on an action row.
      jobTitle: "Marketing Intern",
      detail: "Application deadline",
      date: "2026-08-25",
      timing: "Deadline tomorrow",
      note: "Still Interested",
    });
  });

  it("flags a deadline today while the student is still Preparing", () => {
    const [item] = classify({
      current_status: "Preparing",
      application_deadline: TODAY,
    });

    expect(item).toMatchObject({
      reason: "deadline-critical",
      timing: "Deadline today",
      note: "Still Preparing",
    });
  });

  it("shows a deadline tomorrow even for an application saved today", () => {
    // Closing tomorrow is urgent whenever it was saved.
    const [item] = classify({
      current_status: "Interested",
      application_deadline: "2026-08-25",
      createdOn: TODAY,
    });

    expect(item.reason).toBe("deadline-critical");
  });

  it("says nothing about an Applied application closing tomorrow", () => {
    // The action a deadline represents is "finish and submit this". Once it is
    // sent, the deadline has served its purpose.
    expect(
      classify({ current_status: "Applied", application_deadline: "2026-08-25" }),
    ).toEqual([]);
  });

  it("says nothing about a Screening application closing tomorrow", () => {
    expect(
      classify({
        current_status: "Screening",
        application_deadline: "2026-08-25",
      }),
    ).toEqual([]);
  });

  it("says nothing about an Interview application closing tomorrow", () => {
    expect(
      classify({
        current_status: "Interview",
        application_deadline: "2026-08-25",
      }),
    ).toEqual([]);
  });

  it("says nothing about a deadline at any submitted status", () => {
    for (const status of SUBMITTED_STATUSES) {
      expect(
        classify({ current_status: status, application_deadline: "2026-08-25" }),
      ).toEqual([]);
      expect(
        classify({ current_status: status, application_deadline: "2026-08-28" }),
      ).toEqual([]);
    }
  });

  it("excludes a deadline that has already passed", () => {
    expect(
      classify({
        current_status: "Interested",
        application_deadline: "2026-08-23",
      }),
    ).toEqual([]);
  });
});

describe("an approaching deadline has to have sat a while", () => {
  it("flags one 3 days out for an application saved 2 days ago", () => {
    const [item] = classify({
      company_name: "KPMG",
      current_status: "Interested",
      application_deadline: "2026-08-27",
      createdOn: "2026-08-22",
    });

    expect(item).toMatchObject({
      reason: "deadline-important",
      timing: "Deadline in 3 days",
      note: "Saved 2 days ago · Still Interested",
    });
  });

  it("says nothing about one 3 days out saved today", () => {
    // A student who saved a posting this morning knows it is there and knows
    // when it closes. Telling them again the same day is noise.
    expect(
      classify({
        current_status: "Interested",
        application_deadline: "2026-08-27",
        createdOn: TODAY,
      }),
    ).toEqual([]);
  });

  it("says nothing about one 3 days out saved yesterday", () => {
    expect(
      classify({
        current_status: "Interested",
        application_deadline: "2026-08-27",
        createdOn: "2026-08-23",
      }),
    ).toEqual([]);
  });

  it("treats exactly two days saved as old enough", () => {
    // The boundary is inclusive, and it is a calendar-day comparison rather
    // than a timestamp one.
    expect(DEADLINE_MINIMUM_SAVED_DAYS).toBe(2);
    expect(
      classify({
        current_status: "Interested",
        application_deadline: "2026-08-27",
        createdOn: "2026-08-22",
      }),
    ).toHaveLength(1);
  });

  it("flags one 7 days out for an application saved 2 days ago", () => {
    const [item] = classify({
      current_status: "Preparing",
      application_deadline: "2026-08-31",
      createdOn: "2026-08-22",
    });

    expect(item).toMatchObject({
      reason: "deadline-important",
      timing: "Deadline in 7 days",
    });
  });

  it("says nothing about one 8 days out", () => {
    expect(
      classify({
        current_status: "Interested",
        application_deadline: "2026-09-01",
        createdOn: SAVED_LONG_AGO,
      }),
    ).toEqual([]);
  });

  it("describes a long-saved application without arithmetic errors", () => {
    const [item] = classify({
      current_status: "Interested",
      application_deadline: "2026-08-27",
      createdOn: "2026-07-31",
    });

    expect(item.note).toBe("Saved 24 days ago · Still Interested");
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

  it("excludes an unsubmitted one whose deadline is tomorrow", () => {
    expect(
      classify({
        archived_at: "2026-08-20T10:00:00.000Z",
        current_status: "Interested",
        application_deadline: "2026-08-25",
      }),
    ).toEqual([]);
  });
});

describe("one entry per application", () => {
  it("reports only the most urgent reason when several apply", () => {
    const items = needsAttention(
      [
        application({
          current_status: "Interested",
          next_action: "Finish the cover letter",
          next_action_due_date: "2026-08-20",
          application_deadline: "2026-08-25",
        }),
      ],
      TODAY,
    );

    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe("overdue-action");
  });

  it("falls through to the deadline when nothing is overdue", () => {
    const items = needsAttention(
      [
        application({
          current_status: "Interested",
          next_action: "Finish the cover letter",
          next_action_due_date: "2026-08-29",
          application_deadline: "2026-08-25",
        }),
      ],
      TODAY,
    );

    expect(items[0].reason).toBe("deadline-critical");
  });
});

describe("urgency ordering", () => {
  it("puts the five tiers in the documented order", () => {
    const items = needsAttention(
      [
        application({
          id: "action-soon",
          company_name: "Action Soon Co",
          next_action: "Follow up",
          next_action_due_date: "2026-08-29",
        }),
        application({
          id: "deadline-important",
          company_name: "Deadline Important Co",
          current_status: "Interested",
          application_deadline: "2026-08-28",
          createdOn: "2026-08-20",
        }),
        application({
          id: "action-now",
          company_name: "Action Now Co",
          next_action: "Follow up",
          next_action_due_date: "2026-08-25",
        }),
        application({
          id: "deadline-critical",
          company_name: "Deadline Critical Co",
          current_status: "Preparing",
          application_deadline: "2026-08-25",
        }),
        application({
          id: "overdue",
          company_name: "Overdue Co",
          next_action: "Follow up",
          next_action_due_date: "2026-08-20",
        }),
      ],
      TODAY,
    );

    expect(items.map((item) => item.reason)).toEqual([
      "overdue-action",
      "deadline-critical",
      "action-due-now",
      "deadline-important",
      "action-due-soon",
    ]);
  });

  it("puts an unsubmitted deadline tomorrow above a follow-up due next week", () => {
    // Urgency outranks category: a posting about to close matters more than a
    // commitment that is still days away.
    const items = needsAttention(
      [
        application({
          id: "a",
          company_name: "Action Co",
          next_action: "Follow up",
          next_action_due_date: "2026-08-29",
        }),
        application({
          id: "b",
          company_name: "Deadline Co",
          current_status: "Interested",
          application_deadline: "2026-08-25",
        }),
      ],
      TODAY,
    );

    expect(items.map((item) => item.companyName)).toEqual([
      "Deadline Co",
      "Action Co",
    ]);
  });

  it("orders all non-overdue records by date across attention kinds", () => {
    const items = needsAttention(
      [
        application({
          id: "deadline-tomorrow",
          company_name: "Tomorrow Co",
          current_status: "Interested",
          application_deadline: "2026-08-25",
        }),
        application({
          id: "action-today",
          company_name: "Today Co",
          next_action: "Prepare for interview",
          next_action_due_date: TODAY,
        }),
        application({
          id: "overdue",
          company_name: "Overdue Co",
          next_action: "Send follow-up",
          next_action_due_date: "2026-08-23",
        }),
      ],
      TODAY,
    );

    expect(items.map((item) => item.companyName)).toEqual([
      "Overdue Co",
      "Today Co",
      "Tomorrow Co",
    ]);
  });

  it("puts the most overdue first within a tier", () => {
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
      TODAY,
    );

    expect(items.map((item) => item.companyName)).toEqual(["Ancient", "Recent"]);
  });

  it("puts the soonest first among upcoming dates", () => {
    const items = needsAttention(
      [
        application({
          id: "a",
          company_name: "Later",
          current_status: "Interested",
          application_deadline: "2026-08-30",
          createdOn: "2026-08-20",
        }),
        application({
          id: "b",
          company_name: "Sooner",
          current_status: "Interested",
          application_deadline: "2026-08-27",
          createdOn: "2026-08-20",
        }),
      ],
      TODAY,
    );

    expect(items.map((item) => item.companyName)).toEqual(["Sooner", "Later"]);
  });

  it("breaks a tie by company so the order never wobbles", () => {
    const items = needsAttention(
      [
        application({
          id: "a",
          company_name: "Zellers",
          current_status: "Interested",
          application_deadline: "2026-08-25",
        }),
        application({
          id: "b",
          company_name: "Aritzia",
          current_status: "Interested",
          application_deadline: "2026-08-25",
        }),
      ],
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

    expect(needsAttention(many, TODAY)).toHaveLength(ATTENTION_LIMIT);
    expect(ATTENTION_LIMIT).toBe(6);
  });

  it("keeps the most urgent entries when it caps", () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      application({
        id: `app-${index}`,
        company_name: `Company ${index}`,
        next_action: "Follow up",
        next_action_due_date: "2026-08-29",
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

    const items = needsAttention(many, TODAY);
    expect(items[0].companyName).toBe("Urgent Co");
    expect(items).toHaveLength(ATTENTION_LIMIT);
  });

  it("caps deterministically, keeping the same entries every time", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      application({
        id: `app-${index}`,
        company_name: `Company ${String(index).padStart(2, "0")}`,
        next_action: "Follow up",
        next_action_due_date: "2026-08-25",
      }),
    );

    expect(needsAttention(many, TODAY)).toEqual(needsAttention(many, TODAY));
    expect(needsAttention(many, TODAY).map((item) => item.companyName)).toEqual([
      "Company 00",
      "Company 01",
      "Company 02",
      "Company 03",
      "Company 04",
      "Company 05",
    ]);
  });

  it("returns nothing when nothing needs attention", () => {
    expect(
      needsAttention(
        [
          application({ current_status: "Rejected" }),
          application({ id: "b", current_status: "Interested" }),
        ],
        TODAY,
      ),
    ).toEqual([]);
  });
});
