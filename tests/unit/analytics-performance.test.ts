import { describe, expect, it } from "vitest";
import type { AnalyticsHistoryEvent } from "@/lib/analytics/calculate";
import {
  MAXIMUM_NAMED_GROUPS,
  MILESTONE_BUCKETS,
  SMALL_SAMPLE_THRESHOLD,
  summarizePerformance,
  toBucketPercents,
  type MilestoneBucket,
  type PerformanceApplication,
  type PerformanceLens,
  type PerformanceRow,
} from "@/lib/analytics/performance";
import type {
  ApplicationStatus,
  JobCategory,
} from "@/lib/applications/constants";
import { UNSPECIFIED_DATABASE_VALUE } from "@/lib/applications/constants";

type Seed = {
  id: string;
  source?: string;
  category?: JobCategory;
  path: ApplicationStatus[];
};

/**
 * Builds applications plus the history a database trigger would have written
 * for the status path each one travelled.
 *
 * The first status in `path` is the creation event; the rest are transitions.
 */
function summarize(seeds: Seed[], lens: PerformanceLens = "source") {
  const applications: PerformanceApplication[] = seeds.map((seed) => ({
    id: seed.id,
    application_source: seed.source ?? "LinkedIn",
    normalized_job_category: seed.category ?? "Business Analysis",
  }));
  const history: AnalyticsHistoryEvent[] = seeds.flatMap((seed) =>
    seed.path.map((status) => ({
      application_id: seed.id,
      new_status: status,
    })),
  );

  return summarizePerformance(applications, history, lens);
}

function rowFor(
  summary: ReturnType<typeof summarizePerformance>,
  label: string,
): PerformanceRow {
  return summary.rows.find((row) => row.label === label)!;
}

/** The single bucket an application lands in, asserted by exclusion. */
function soleBucket(row: PerformanceRow): MilestoneBucket {
  const occupied = MILESTONE_BUCKETS.filter(
    (bucket) => row.buckets[bucket] > 0,
  );
  expect(occupied).toHaveLength(1);
  return occupied[0];
}

function many(
  prefix: string,
  count: number,
  seed: Omit<Seed, "id">,
): Seed[] {
  return Array.from({ length: count }, (_, index) => ({
    ...seed,
    id: `${prefix}${index}`,
  }));
}

describe("which applications enter the comparison", () => {
  it("leaves out a job that was only ever Interested", () => {
    expect(summarize([{ id: "a", path: ["Interested"] }]).rows).toEqual([]);
  });

  it("leaves out a job that was only ever Preparing", () => {
    expect(
      summarize([{ id: "a", path: ["Interested", "Preparing"] }]).rows,
    ).toEqual([]);
  });

  it("counts a job once it has been Applied", () => {
    const summary = summarize([{ id: "a", path: ["Interested", "Applied"] }]);

    expect(rowFor(summary, "LinkedIn").submitted).toBe(1);
  });

  it("counts a job created straight into a submitted status", () => {
    // What save_job does when a student says "I already applied to this".
    const summary = summarize([{ id: "a", path: ["Applied"] }]);

    expect(rowFor(summary, "LinkedIn").submitted).toBe(1);
  });

  it("does not let unsubmitted jobs dilute a group", () => {
    const summary = summarize([
      { id: "a", path: ["Applied", "Interview"] },
      { id: "b", path: ["Applied"] },
      // Saved from LinkedIn and never sent: outside the denominator entirely.
      { id: "c", path: ["Interested"] },
      { id: "d", path: ["Interested", "Preparing"] },
    ]);

    expect(rowFor(summary, "LinkedIn").submitted).toBe(2);
  });

  it("keeps archived applications, because they still happened", () => {
    // The projection reads no archive field: the page passes every
    // application, so nothing here can drop one.
    const summary = summarize([
      { id: "a", path: ["Applied", "Interview", "Rejected"] },
    ]);

    expect(rowFor(summary, "LinkedIn").buckets.interview).toBe(1);
  });

  it("omits an application whose history never arrived", () => {
    const summary = summarizePerformance(
      [
        {
          id: "a",
          application_source: "LinkedIn",
          normalized_job_category: "Finance",
        },
      ],
      [],
      "source",
    );

    expect(summary.rows).toEqual([]);
    expect(summary.submitted).toBe(0);
  });
});

describe("every submitted application lands in exactly one bucket", () => {
  it("puts a direct rejection in Response, never in No recorded response", () => {
    // The canonical employer-response set includes Rejected: a rejection is an
    // employer responding, and reinterpreting "response" as "positive response"
    // is the mistake this asserts against.
    const summary = summarize([{ id: "a", path: ["Applied", "Rejected"] }]);

    expect(soleBucket(rowFor(summary, "LinkedIn"))).toBe("response");
  });

  it("puts a screening-only application in Response", () => {
    const summary = summarize([{ id: "a", path: ["Applied", "Screening"] }]);

    expect(soleBucket(rowFor(summary, "LinkedIn"))).toBe("response");
  });

  it("puts an assessment-only application in Response", () => {
    const summary = summarize([{ id: "a", path: ["Applied", "Assessment"] }]);

    expect(soleBucket(rowFor(summary, "LinkedIn"))).toBe("response");
  });

  it("keeps an interview that was later rejected in Interview", () => {
    const summary = summarize([
      { id: "a", path: ["Applied", "Interview", "Rejected"] },
    ]);

    expect(soleBucket(rowFor(summary, "LinkedIn"))).toBe("interview");
  });

  it("keeps an offer that was later accepted in Offer", () => {
    const summary = summarize([
      { id: "a", path: ["Applied", "Interview", "Offer", "Accepted"] },
    ]);

    expect(soleBucket(rowFor(summary, "LinkedIn"))).toBe("offer");
  });

  it("treats Accepted on its own as Offer", () => {
    const summary = summarize([{ id: "a", path: ["Accepted"] }]);

    expect(soleBucket(rowFor(summary, "LinkedIn"))).toBe("offer");
  });

  it("keeps an offer the student withdrew from in Offer", () => {
    const summary = summarize([
      { id: "a", path: ["Applied", "Offer", "Withdrawn"] },
    ]);

    expect(soleBucket(rowFor(summary, "LinkedIn"))).toBe("offer");
  });

  it("leaves a submission with no employer response in No recorded response", () => {
    const summary = summarize([{ id: "a", path: ["Applied"] }]);

    expect(soleBucket(rowFor(summary, "LinkedIn"))).toBe("noResponse");
  });

  it("sums the four buckets to exactly the submitted count", () => {
    const summary = summarize([
      ...many("n", 7, { path: ["Applied"] }),
      ...many("r", 3, { path: ["Applied", "Rejected"] }),
      ...many("s", 2, { path: ["Applied", "Screening"] }),
      ...many("i", 2, { path: ["Applied", "Interview", "Rejected"] }),
      { id: "o", path: ["Applied", "Interview", "Offer", "Accepted"] },
      // Never submitted, so it belongs to no bucket at all.
      { id: "x", path: ["Interested"] },
    ]);
    const row = rowFor(summary, "LinkedIn");

    expect(row.submitted).toBe(15);
    expect(row.buckets).toEqual({
      noResponse: 7,
      response: 5,
      interview: 2,
      offer: 1,
    });
    const total = MILESTONE_BUCKETS.reduce(
      (sum, bucket) => sum + row.buckets[bucket],
      0,
    );
    expect(total).toBe(row.submitted);
  });
});

describe("percentages", () => {
  it("sum to exactly 100 on every row", () => {
    const summary = summarize([
      // Three thirds: rounding each independently would give 33+33+33 = 99.
      ...many("n", 1, { path: ["Applied"] }),
      ...many("r", 1, { path: ["Applied", "Rejected"] }),
      ...many("i", 1, { path: ["Applied", "Interview"] }),
    ]);
    const row = rowFor(summary, "LinkedIn");

    const total = MILESTONE_BUCKETS.reduce(
      (sum, bucket) => sum + row.percents[bucket],
      0,
    );
    expect(total).toBe(100);
  });

  it("sums to 100 for every shape of split", () => {
    const shapes: Record<MilestoneBucket, number>[] = [
      { noResponse: 1, response: 1, interview: 1, offer: 0 },
      { noResponse: 1, response: 1, interview: 1, offer: 1 },
      { noResponse: 5, response: 3, interview: 3, offer: 1 },
      { noResponse: 7, response: 0, interview: 0, offer: 0 },
      { noResponse: 2, response: 2, interview: 1, offer: 1 },
      { noResponse: 19, response: 8, interview: 3, offer: 1 },
    ];

    for (const buckets of shapes) {
      const submitted = MILESTONE_BUCKETS.reduce(
        (sum, bucket) => sum + buckets[bucket],
        0,
      );
      const percents = toBucketPercents(buckets, submitted);
      const total = MILESTONE_BUCKETS.reduce(
        (sum, bucket) => sum + percents[bucket],
        0,
      );

      expect(total).toBe(100);
      // An empty bucket is never rounded up into existence.
      for (const bucket of MILESTONE_BUCKETS) {
        if (buckets[bucket] === 0) expect(percents[bucket]).toBe(0);
      }
    }
  });

  it("returns zeros rather than dividing by nothing", () => {
    expect(
      toBucketPercents(
        { noResponse: 0, response: 0, interview: 0, offer: 0 },
        0,
      ),
    ).toEqual({ noResponse: 0, response: 0, interview: 0, offer: 0 });
  });
});

describe("how sources are grouped", () => {
  it("groups spellings that differ only by case", () => {
    const summary = summarize([
      { id: "a", source: "LinkedIn", path: ["Applied"] },
      { id: "b", source: "linkedin", path: ["Applied"] },
      { id: "c", source: "LINKEDIN", path: ["Applied"] },
    ]);

    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].submitted).toBe(3);
  });

  it("ignores surrounding whitespace", () => {
    const summary = summarize([
      { id: "a", source: "LinkedIn", path: ["Applied"] },
      { id: "b", source: "  LinkedIn ", path: ["Applied"] },
    ]);

    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].label).toBe("LinkedIn");
  });

  it("keeps LinkedIn Easy Apply distinct from LinkedIn", () => {
    // Nothing in the data model says these are the same thing, and deciding
    // that they are would be inventing a taxonomy this product does not have.
    const summary = summarize([
      { id: "a", source: "LinkedIn", path: ["Applied"] },
      { id: "b", source: "LinkedIn Easy Apply", path: ["Applied"] },
    ]);

    expect(summary.rows.map((row) => row.label).sort()).toEqual([
      "LinkedIn",
      "LinkedIn Easy Apply",
    ]);
  });

  it("shows the spelling the student uses most often", () => {
    const summary = summarize([
      { id: "a", source: "linkedin", path: ["Applied"] },
      { id: "b", source: "linkedin", path: ["Applied"] },
      { id: "c", source: "LinkedIn", path: ["Applied"] },
    ]);

    expect(summary.rows[0].label).toBe("linkedin");
  });

  it("breaks a spelling tie on the value, not on the row order", () => {
    const forwards = summarize([
      { id: "a", source: "LinkedIn", path: ["Applied"] },
      { id: "b", source: "linkedin", path: ["Applied"] },
    ]);
    const backwards = summarize([
      { id: "b", source: "linkedin", path: ["Applied"] },
      { id: "a", source: "LinkedIn", path: ["Applied"] },
    ]);

    expect(forwards.rows[0].label).toBe(backwards.rows[0].label);
  });

  it("groups applications with no recorded source under the stored sentinel", () => {
    const summary = summarize([
      { id: "a", source: UNSPECIFIED_DATABASE_VALUE, path: ["Applied"] },
      { id: "b", source: "not specified", path: ["Applied"] },
    ]);

    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].label).toBe(UNSPECIFIED_DATABASE_VALUE);
    expect(summary.rows[0].isUnspecified).toBe(true);
  });

  it("marks only that bucket as unspecified", () => {
    const summary = summarize([
      { id: "a", source: "LinkedIn", path: ["Applied"] },
      { id: "b", source: UNSPECIFIED_DATABASE_VALUE, path: ["Applied"] },
    ]);

    expect(rowFor(summary, "LinkedIn").isUnspecified).toBe(false);
    expect(rowFor(summary, UNSPECIFIED_DATABASE_VALUE).isUnspecified).toBe(true);
  });
});

describe("role type grouping", () => {
  it("uses the canonical normalized category, not a second taxonomy", () => {
    const summary = summarize(
      [
        { id: "a", category: "Finance", path: ["Applied"] },
        { id: "b", category: "Finance", path: ["Applied", "Interview"] },
        { id: "c", category: "Marketing", path: ["Applied"] },
      ],
      "role",
    );

    expect(summary.rows.map((row) => row.label)).toEqual([
      "Finance",
      "Marketing",
    ]);
    expect(rowFor(summary, "Finance").buckets.interview).toBe(1);
  });

  it("never marks a category as unspecified", () => {
    // A category is always one of the enum's values, so there is nothing
    // missing to set aside — unlike a source, which a student may leave blank.
    const summary = summarize(
      [{ id: "a", category: "Other", path: ["Applied"] }],
      "role",
    );

    expect(summary.rows[0].isUnspecified).toBe(false);
  });

  it("counts only submitted applications, like the source lens", () => {
    const summary = summarize(
      [
        { id: "a", category: "Finance", path: ["Applied"] },
        { id: "b", category: "Finance", path: ["Interested"] },
      ],
      "role",
    );

    expect(rowFor(summary, "Finance").submitted).toBe(1);
  });
});

describe("ordering", () => {
  it("orders by submitted volume, highest first", () => {
    const summary = summarize([
      ...many("l", 10, { source: "LinkedIn", path: ["Applied"] }),
      ...many("c", 3, { source: "Company website", path: ["Applied"] }),
    ]);

    expect(summary.rows.map((row) => row.label)).toEqual([
      "LinkedIn",
      "Company website",
    ]);
  });

  it("never lets one lucky application float above a large sample", () => {
    const summary = summarize([
      { id: "r", source: "Referral", path: ["Applied", "Interview", "Offer"] },
      ...many("l", 10, { source: "LinkedIn", path: ["Applied"] }),
    ]);

    // Referral is 100% offers and LinkedIn is 0% anything. Ordering by rate
    // would put a single application at the top and read as a recommendation.
    expect(summary.rows[0].label).toBe("LinkedIn");
    expect(summary.rows[1].label).toBe("Referral");
  });

  it("breaks equal counts on the label, so the order is deterministic", () => {
    const summary = summarize([
      { id: "a", source: "Referral", path: ["Applied"] },
      { id: "b", source: "Company website", path: ["Applied"] },
    ]);

    expect(summary.rows.map((row) => row.label)).toEqual([
      "Company website",
      "Referral",
    ]);
  });

  it("puts the unspecified bucket last however large it is", () => {
    const summary = summarize([
      ...many("u", 20, {
        source: UNSPECIFIED_DATABASE_VALUE,
        path: ["Applied"],
      }),
      { id: "l", source: "LinkedIn", path: ["Applied"] },
    ]);

    expect(summary.rows.at(-1)?.label).toBe(UNSPECIFIED_DATABASE_VALUE);
    expect(summary.rows[0].label).toBe("LinkedIn");
  });

  it("produces the same chart whatever order the rows arrive in", () => {
    const seeds: Seed[] = [
      { id: "a", source: "LinkedIn", path: ["Applied", "Interview"] },
      { id: "b", source: "Referral", path: ["Applied"] },
      { id: "c", source: "LinkedIn", path: ["Applied", "Rejected"] },
    ];

    expect(summarize(seeds)).toEqual(summarize([...seeds].reverse()));
  });
});

describe("keeping the chart compact", () => {
  it("shows at most the highest-volume named groups", () => {
    // Eight sources with strictly descending volume, so which five survive is
    // unambiguous: Source 0 has 8 submitted, Source 7 has 1.
    const summary = summarize(
      Array.from({ length: 8 }).flatMap((_, index) =>
        many(`s${index}-`, 8 - index, {
          source: `Source ${index}`,
          path: ["Applied"],
        }),
      ),
    );

    expect(summary.rows).toHaveLength(MAXIMUM_NAMED_GROUPS);
    expect(summary.rows.map((row) => row.label)).toEqual([
      "Source 0",
      "Source 1",
      "Source 2",
      "Source 3",
      "Source 4",
    ]);
  });

  it("states the remainder exactly rather than folding it into a fake group", () => {
    const summary = summarize([
      ...many("a", 10, { source: "A", path: ["Applied"] }),
      ...many("b", 9, { source: "B", path: ["Applied"] }),
      ...many("c", 8, { source: "C", path: ["Applied"] }),
      ...many("d", 7, { source: "D", path: ["Applied"] }),
      ...many("e", 6, { source: "E", path: ["Applied"] }),
      ...many("f", 4, { source: "F", path: ["Applied"] }),
      ...many("g", 3, { source: "G", path: ["Applied"] }),
    ]);

    expect(summary.remainder).toEqual({ groups: 2, submitted: 7 });
    // No invented composite row ever appears in the chart.
    expect(summary.rows.map((row) => row.label)).not.toContain("Other");
  });

  it("preserves the total across shown and hidden groups", () => {
    const summary = summarize([
      ...many("a", 10, { source: "A", path: ["Applied"] }),
      ...many("b", 9, { source: "B", path: ["Applied"] }),
      ...many("c", 8, { source: "C", path: ["Applied"] }),
      ...many("d", 7, { source: "D", path: ["Applied"] }),
      ...many("e", 6, { source: "E", path: ["Applied"] }),
      ...many("f", 4, { source: "F", path: ["Applied"] }),
      ...many("u", 5, {
        source: UNSPECIFIED_DATABASE_VALUE,
        path: ["Applied"],
      }),
    ]);

    const shown = summary.rows.reduce((sum, row) => sum + row.submitted, 0);
    expect(shown + summary.remainder.submitted).toBe(summary.submitted);
    expect(summary.submitted).toBe(49);
  });

  it("does not let the unspecified bucket crowd out a named source", () => {
    const summary = summarize([
      ...many("u", 50, {
        source: UNSPECIFIED_DATABASE_VALUE,
        path: ["Applied"],
      }),
      ...many("a", 5, { source: "A", path: ["Applied"] }),
      ...many("b", 4, { source: "B", path: ["Applied"] }),
      ...many("c", 3, { source: "C", path: ["Applied"] }),
      ...many("d", 2, { source: "D", path: ["Applied"] }),
      ...many("e", 1, { source: "E", path: ["Applied"] }),
    ]);

    // Five named sources plus the residue: it is not a source, so it takes
    // none of the five slots.
    expect(summary.rows).toHaveLength(6);
    expect(summary.rows.at(-1)?.label).toBe(UNSPECIFIED_DATABASE_VALUE);
    expect(summary.remainder.groups).toBe(0);
  });
});

describe("small samples", () => {
  it("marks a row below the threshold without changing its numbers", () => {
    const summary = summarize([
      ...many("l", 10, { source: "LinkedIn", path: ["Applied"] }),
      ...many("r", 2, { source: "Referral", path: ["Applied", "Interview"] }),
    ]);
    const referral = rowFor(summary, "Referral");

    expect(referral.isSmallSample).toBe(true);
    // The flag is presentation only: the counts and shares are exact.
    expect(referral.submitted).toBe(2);
    expect(referral.buckets.interview).toBe(2);
    expect(referral.percents.interview).toBe(100);
    expect(rowFor(summary, "LinkedIn").isSmallSample).toBe(false);
  });

  it("keeps the row rather than hiding the student's own data", () => {
    const summary = summarize([
      ...many("l", 10, { source: "LinkedIn", path: ["Applied"] }),
      { id: "r", source: "Referral", path: ["Applied", "Offer"] },
    ]);

    expect(summary.rows.map((row) => row.label)).toContain("Referral");
  });

  it("marks exactly below the threshold and not at it", () => {
    const summary = summarize([
      ...many("a", SMALL_SAMPLE_THRESHOLD, { source: "A", path: ["Applied"] }),
      ...many("b", SMALL_SAMPLE_THRESHOLD - 1, {
        source: "B",
        path: ["Applied"],
      }),
    ]);

    expect(rowFor(summary, "A").isSmallSample).toBe(false);
    expect(rowFor(summary, "B").isSmallSample).toBe(true);
  });
});

describe("nothing to compare", () => {
  it("returns no rows with no applications at all", () => {
    expect(summarizePerformance([], [], "source").rows).toEqual([]);
  });

  it("returns no rows when nothing was submitted", () => {
    expect(summarize([{ id: "a", path: ["Interested"] }]).rows).toEqual([]);
  });
});
