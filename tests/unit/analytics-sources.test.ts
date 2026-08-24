import { describe, expect, it } from "vitest";
import type { AnalyticsHistoryEvent } from "@/lib/analytics/calculate";
import {
  summarizeSourcePerformance,
  UNSPECIFIED_SOURCE_LABEL,
  type SourceApplication,
} from "@/lib/analytics/sources";
import { UNSPECIFIED_DATABASE_VALUE } from "@/lib/applications/constants";
import type { ApplicationStatus } from "@/lib/applications/constants";

/**
 * One application plus the history a database trigger would have written for
 * the status path it travelled: the first status is the creation event, the
 * rest are transitions.
 */
function saved(
  id: string,
  source: string,
  path: ApplicationStatus[],
): { application: SourceApplication; history: AnalyticsHistoryEvent[] } {
  return {
    application: { id, application_source: source },
    history: path.map((status) => ({ application_id: id, new_status: status })),
  };
}

function summarize(entries: ReturnType<typeof saved>[]) {
  return summarizeSourcePerformance(
    entries.map((entry) => entry.application),
    entries.flatMap((entry) => entry.history),
  );
}

function bySource(entries: ReturnType<typeof saved>[], source: string) {
  return summarize(entries).find((row) => row.source === source);
}

describe("which applications enter source performance", () => {
  it("leaves out a job that was only ever Interested", () => {
    expect(summarize([saved("a", "LinkedIn", ["Interested"])])).toEqual([]);
  });

  it("leaves out a job that was only ever Preparing", () => {
    expect(
      summarize([saved("a", "LinkedIn", ["Interested", "Preparing"])]),
    ).toEqual([]);
  });

  it("counts a job once it has been Applied", () => {
    expect(
      summarize([saved("a", "LinkedIn", ["Interested", "Applied"])]),
    ).toMatchObject([{ source: "LinkedIn", submitted: 1 }]);
  });

  it("counts a job created straight into a submitted status", () => {
    // The creation event carries whatever status the application was saved
    // with, so a job saved directly as Applied is submitted with no transition.
    expect(summarize([saved("a", "Referral", ["Applied"])])).toMatchObject([
      { source: "Referral", submitted: 1 },
    ]);
  });

  it("does not let unsubmitted jobs dilute a source's rate", () => {
    // 20 saved from LinkedIn, 12 submitted, 2 interviewed: the rate is 2/12.
    const submittedWithInterview = ["a1", "a2"].map((id) =>
      saved(id, "LinkedIn", ["Interested", "Applied", "Interview"]),
    );
    const submittedWithout = Array.from({ length: 10 }, (_, index) =>
      saved(`b${index}`, "LinkedIn", ["Interested", "Applied"]),
    );
    const neverSent = Array.from({ length: 8 }, (_, index) =>
      saved(`c${index}`, "LinkedIn", ["Interested"]),
    );

    expect(
      summarize([...submittedWithInterview, ...submittedWithout, ...neverSent]),
    ).toMatchObject([
      { source: "LinkedIn", submitted: 12, interviews: 2, interviewRate: 17 },
    ]);
  });
});

describe("outcomes come from history, never from current status", () => {
  it("counts an application that interviewed and was then rejected", () => {
    const row = bySource(
      [saved("a", "LinkedIn", ["Applied", "Interview", "Rejected"])],
      "LinkedIn",
    );

    expect(row).toMatchObject({
      submitted: 1,
      employerResponded: 1,
      interviews: 1,
      offers: 0,
      interviewRate: 100,
    });
  });

  it("counts an offer the student later withdrew from", () => {
    const row = bySource(
      [saved("a", "Referral", ["Applied", "Interview", "Offer", "Withdrawn"])],
      "Referral",
    );

    expect(row).toMatchObject({ interviews: 1, offers: 1 });
  });

  it("counts an offer that was later rejected", () => {
    const row = bySource(
      [saved("a", "Referral", ["Applied", "Offer", "Rejected"])],
      "Referral",
    );

    expect(row).toMatchObject({ offers: 1 });
  });

  it("does not count an interview that never happened", () => {
    const row = bySource(
      [saved("a", "Indeed", ["Applied", "Screening", "Rejected"])],
      "Indeed",
    );

    expect(row).toMatchObject({
      employerResponded: 1,
      interviews: 0,
      offers: 0,
      interviewRate: 0,
    });
  });

  it("uses the shared employer-response definition, so a rejection responds", () => {
    // Rejected is an employer response: the employer did something, including
    // saying no. Withdrawn is the student acting, and is not.
    const rejected = bySource(
      [saved("a", "Indeed", ["Applied", "Rejected"])],
      "Indeed",
    );
    const withdrawn = bySource(
      [saved("b", "Indeed", ["Applied", "Withdrawn"])],
      "Indeed",
    );

    expect(rejected?.employerResponded).toBe(1);
    expect(withdrawn?.employerResponded).toBe(0);
  });

  it("counts an application that is still waiting as submitted with no response", () => {
    expect(bySource([saved("a", "Indeed", ["Applied"])], "Indeed")).toMatchObject(
      {
        submitted: 1,
        employerResponded: 0,
        interviews: 0,
        interviewRate: 0,
      },
    );
  });
});

describe("source rates and their samples", () => {
  it("reports a zero numerator as 0%, not as missing", () => {
    expect(
      bySource([saved("a", "Indeed", ["Applied"])], "Indeed")?.interviewRate,
    ).toBe(0);
  });

  it("reports one of one as a mathematically correct 100%", () => {
    const row = bySource(
      [saved("a", "Referral", ["Applied", "Interview"])],
      "Referral",
    );

    // The rate is shown, not hidden or graded — and the sample it came from is
    // on the row beside it, which is what stops 100% reading as a result.
    expect(row).toMatchObject({
      interviewRate: 100,
      interviews: 1,
      submitted: 1,
    });
  });

  it("keeps the sample size on every row, however small", () => {
    const rows = summarize([
      saved("a", "Referral", ["Applied", "Interview"]),
      ...Array.from({ length: 9 }, (_, index) =>
        saved(`b${index}`, "LinkedIn", ["Applied"]),
      ),
    ]);

    for (const row of rows) {
      expect(row.submitted).toBeGreaterThan(0);
      expect(row.interviews).toBeLessThanOrEqual(row.submitted);
    }
  });

  it("rounds by the shared policy rather than its own", () => {
    // 1 of 3 is 33.33…%, which the shared rounding takes to 33.
    const rows = summarize([
      saved("a", "LinkedIn", ["Applied", "Interview"]),
      saved("b", "LinkedIn", ["Applied"]),
      saved("c", "LinkedIn", ["Applied"]),
    ]);

    expect(rows[0].interviewRate).toBe(33);
  });
});

describe("how sources are grouped", () => {
  it("groups spellings that differ only by case", () => {
    const rows = summarize([
      saved("a", "LinkedIn", ["Applied"]),
      saved("b", "linkedin", ["Applied"]),
      saved("c", "LINKEDIN", ["Applied"]),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].submitted).toBe(3);
  });

  it("ignores surrounding whitespace", () => {
    const rows = summarize([
      saved("a", "LinkedIn", ["Applied"]),
      saved("b", "  LinkedIn  ", ["Applied"]),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("LinkedIn");
  });

  it("keeps distinct wordings apart rather than inventing a taxonomy", () => {
    // Nothing in the data model says these are the same source, so nothing
    // here decides that they are.
    const rows = summarize([
      saved("a", "LinkedIn", ["Applied"]),
      saved("b", "LinkedIn Easy Apply", ["Applied"]),
      saved("c", "LinkedIn recruiter", ["Applied"]),
    ]);

    expect(rows.map((row) => row.source).sort()).toEqual([
      "LinkedIn",
      "LinkedIn Easy Apply",
      "LinkedIn recruiter",
    ]);
  });

  it("shows the spelling the student uses most often", () => {
    const rows = summarize([
      saved("a", "LinkedIn", ["Applied"]),
      saved("b", "LinkedIn", ["Applied"]),
      saved("c", "linkedin", ["Applied"]),
    ]);

    expect(rows[0].source).toBe("LinkedIn");
  });

  it("breaks a spelling tie on the value, not on the row order", () => {
    const forwards = summarize([
      saved("a", "LinkedIn", ["Applied"]),
      saved("b", "linkedin", ["Applied"]),
    ]);
    const backwards = summarize([
      saved("b", "linkedin", ["Applied"]),
      saved("a", "LinkedIn", ["Applied"]),
    ]);

    expect(forwards[0].source).toBe(backwards[0].source);
  });

  it("groups applications with no recorded source under the stored sentinel", () => {
    // A blank source on the form is written to the database as `Not specified`,
    // so that is what "no source" already looks like in the data.
    const rows = summarize([
      saved("a", UNSPECIFIED_DATABASE_VALUE, ["Applied"]),
      saved("b", "not specified", ["Applied"]),
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        source: UNSPECIFIED_SOURCE_LABEL,
        submitted: 2,
        isUnspecified: true,
      }),
    ]);
  });

  it("marks only that bucket as unspecified", () => {
    const rows = summarize([
      saved("a", "LinkedIn", ["Applied"]),
      saved("b", UNSPECIFIED_DATABASE_VALUE, ["Applied"]),
    ]);

    expect(rows.map((row) => row.isUnspecified)).toEqual([false, true]);
  });
});

describe("row ordering", () => {
  it("orders by submitted count, highest first", () => {
    const rows = summarize([
      saved("a", "Referral", ["Applied"]),
      saved("b", "LinkedIn", ["Applied"]),
      saved("c", "LinkedIn", ["Applied"]),
      saved("d", "LinkedIn", ["Applied"]),
      saved("e", "Company website", ["Applied"]),
      saved("f", "Company website", ["Applied"]),
    ]);

    expect(rows.map((row) => [row.source, row.submitted])).toEqual([
      ["LinkedIn", 3],
      ["Company website", 2],
      ["Referral", 1],
    ]);
  });

  it("never lets a tiny sample's rate float to the top", () => {
    // Referral is 1 of 1 at 100%; LinkedIn is 1 of 10 at 10%. Volume orders
    // the table, so the perfect rate does not read as a recommendation.
    const rows = summarize([
      saved("a", "Referral", ["Applied", "Interview"]),
      ...Array.from({ length: 10 }, (_, index) =>
        saved(`b${index}`, "LinkedIn", ["Applied"]),
      ),
    ]);

    expect(rows[0].source).toBe("LinkedIn");
    expect(rows[1]).toMatchObject({ source: "Referral", interviewRate: 100 });
  });

  it("breaks equal counts on the label, so the order is deterministic", () => {
    const rows = summarize([
      saved("a", "Referral", ["Applied"]),
      saved("b", "Indeed", ["Applied"]),
      saved("c", "Company website", ["Applied"]),
    ]);

    expect(rows.map((row) => row.source)).toEqual([
      "Company website",
      "Indeed",
      "Referral",
    ]);
  });

  it("puts the unspecified bucket last however large it is", () => {
    const rows = summarize([
      saved("a", "LinkedIn", ["Applied"]),
      ...Array.from({ length: 20 }, (_, index) =>
        saved(`b${index}`, UNSPECIFIED_DATABASE_VALUE, ["Applied"]),
      ),
    ]);

    expect(rows.map((row) => row.source)).toEqual([
      "LinkedIn",
      UNSPECIFIED_SOURCE_LABEL,
    ]);
  });

  it("produces the same table whatever order the rows arrive in", () => {
    const entries = [
      saved("a", "LinkedIn", ["Applied", "Interview"]),
      saved("b", "Referral", ["Applied"]),
      saved("c", "LinkedIn", ["Applied"]),
      saved("d", UNSPECIFIED_DATABASE_VALUE, ["Applied"]),
    ];

    expect(summarize([...entries].reverse())).toEqual(summarize(entries));
  });
});

describe("what the table includes", () => {
  it("keeps archived applications, because they still happened", () => {
    // Archive state is not part of this input at all: an application a student
    // tidied away is history, and dropping it would inflate every rate.
    const row = bySource(
      [saved("a", "LinkedIn", ["Applied", "Interview", "Rejected"])],
      "LinkedIn",
    );

    expect(row).toMatchObject({ submitted: 1, interviews: 1 });
  });

  it("has nothing to say when nothing was submitted", () => {
    expect(
      summarize([
        saved("a", "LinkedIn", ["Interested"]),
        saved("b", "Referral", ["Interested", "Preparing"]),
      ]),
    ).toEqual([]);
  });

  it("has nothing to say with no applications at all", () => {
    expect(summarizeSourcePerformance([], [])).toEqual([]);
  });

  it("omits an application whose history never arrived", () => {
    // A permanently deleted application takes its history with it, so it can
    // only reach here as an id with no events — and an application with no
    // history was never submitted.
    expect(
      summarizeSourcePerformance(
        [{ id: "gone", application_source: "LinkedIn" }],
        [],
      ),
    ).toEqual([]);
  });
});
