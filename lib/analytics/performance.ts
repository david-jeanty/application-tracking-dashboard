import {
  hasEverReached,
  reachedStatusesByApplication,
  type AnalyticsHistoryEvent,
} from "@/lib/analytics/calculate";
import {
  EMPLOYER_RESPONSE_STATUSES,
  INTERVIEW_STATUSES,
  OFFER_STATUSES,
  SUBMITTED_STATUSES,
} from "@/lib/analytics/definitions";
import {
  preferredSourceSpelling,
  sourceGroupingKey,
  UNSPECIFIED_SOURCE_LABEL,
  unspecifiedSourceKey,
} from "@/lib/analytics/sources";
import type {
  ApplicationStatus,
  JobCategory,
} from "@/lib/applications/constants";

/**
 * What happened to submitted applications, grouped two ways.
 *
 * One projection, asked twice — once about where the posting was found, once
 * about what kind of role it was. Both lenses share every definition below,
 * which is the point: "reached an interview" cannot mean one thing for a source
 * and another for a category, and the composition arithmetic is written once.
 *
 * **The population is the point.** Only applications whose history shows they
 * were actually submitted are counted at all — a job saved as Interested and
 * never sent says nothing about how a source performed, and letting it into a
 * denominator would silently punish whichever source a student browses most.
 * Archived applications stay in, because they still happened.
 *
 * Every outcome comes from status history rather than current status, so an
 * application that interviewed and was later rejected still carries that
 * interview for its group.
 *
 * Nothing here ranks. Groups are ordered by how many applications they hold and
 * never by a rate, because ordering by a percentage would put a single lucky
 * application at the top and read as a recommendation. There is no best source,
 * no worst source, and no advice.
 */

/** The application fields the performance lenses read. */
export type PerformanceApplication = {
  id: string;
  /**
   * Free text as the student typed it. Never null and never blank in the
   * database — the column is `not null` with a length check, and a blank form
   * field is stored as the `Not specified` sentinel.
   */
  application_source: string;
  /** The canonical category. Not a second role taxonomy — the enum's own value. */
  normalized_job_category: JobCategory;
};

/**
 * Which lens the chart is showing.
 *
 * Two, and only two. Each is a dimension the data already has; neither invents
 * a grouping the application model does not store.
 */
export type PerformanceLens = "source" | "role";

/**
 * The highest milestone one submitted application reached.
 *
 * Mutually exclusive and exhaustive over submitted applications, which is what
 * lets a row sum to exactly 100%. An application is classified once, at the
 * furthest point it ever got:
 *
 * - `offer`        — ever reached an offer status
 * - `interview`    — ever reached an interview, but never an offer
 * - `response`     — the employer recorded *some* response, but no interview
 * - `noResponse`   — submitted, and nothing came back
 *
 * `response` uses `EMPLOYER_RESPONSE_STATUSES`, which **includes rejection**.
 * That is deliberate and must not be quietly reinterpreted: a rejection is an
 * employer responding. This bucket means "the employer did something and the
 * application never reached an interview", not "the employer said something
 * encouraging".
 */
export type MilestoneBucket = "noResponse" | "response" | "interview" | "offer";

/** The buckets in the order they are stacked, least advanced first. */
export const MILESTONE_BUCKETS = [
  "noResponse",
  "response",
  "interview",
  "offer",
] as const satisfies readonly MilestoneBucket[];

/**
 * What each segment is called.
 *
 * Plain descriptions of a recorded state. `No recorded response` says the
 * record is empty, not that the employer ignored the student — Interndex knows
 * what was entered into Interndex and nothing more.
 */
export const MILESTONE_BUCKET_LABELS: Record<MilestoneBucket, string> = {
  noResponse: "No recorded response",
  response: "Response",
  interview: "Interview",
  offer: "Offer",
};

export type PerformanceRow = {
  /** The spelling or category shown to the student, chosen from their own data. */
  label: string;
  /** Submitted applications in this group. The denominator, and the sample size. */
  submitted: number;
  /** Exactly one bucket per submitted application. Sums to `submitted`. */
  buckets: Record<MilestoneBucket, number>;
  /** Bucket shares of `submitted`, summing to exactly 100. */
  percents: Record<MilestoneBucket, number>;
  /** True for the bucket holding applications with no source recorded. */
  isUnspecified: boolean;
  /** True below `SMALL_SAMPLE_THRESHOLD`. Styling only; no number changes. */
  isSmallSample: boolean;
};

export type PerformanceSummary = {
  lens: PerformanceLens;
  rows: PerformanceRow[];
  /**
   * Groups left out of `rows` because the chart shows only the highest-volume
   * few, stated exactly rather than folded into an invented composite group.
   */
  remainder: { groups: number; submitted: number };
  /**
   * How many groups this lens can actually compare — shown and hidden alike,
   * and excluding the unspecified bucket.
   *
   * `rows.length` is the wrong number to ask this of. `Not specified` is a row
   * on the chart but it is not a source: it is the residue left after the real
   * ones, and a student who recorded `LinkedIn` on half their applications and
   * nothing on the other half has one source, not two. Counting the bucket
   * would let that search render as a comparison and invite a reader to read a
   * difference between "LinkedIn" and "no record kept".
   *
   * Role categories are always one of the enum's values, so nothing is ever
   * excluded there and this equals the group count.
   */
  comparableGroups: number;
  /** Submitted applications across every group, shown and hidden alike. */
  submitted: number;
};

/**
 * Below how many submitted applications a row is marked a small sample.
 *
 * Five, matching the funnel's own threshold. The row is still drawn and its
 * numbers are still exact — hiding a student's own data would be worse than
 * showing it — but it is muted and labelled, so `n=2` cannot be mistaken for a
 * finding sitting next to `n=31`.
 */
export const SMALL_SAMPLE_THRESHOLD = 5;

/**
 * How many named groups the chart draws.
 *
 * Five. Analytics is a page a student reads, not a report they audit, and
 * fifteen source rows turn one comparison into a spreadsheet. What falls
 * outside is not hidden: `remainder` states how many groups and how many
 * applications were left out, so the totals stay recoverable.
 *
 * There is deliberately no `Other` bar. An aggregate of several real sources is
 * a composition nobody can act on, and drawn next to `Not specified` — which is
 * a different kind of nothing, an absent record rather than a mixture — the two
 * would read as comparable rows when they are not.
 */
export const MAXIMUM_NAMED_GROUPS = 5;

/**
 * How many comparable groups a lens needs before it is worth drawing.
 *
 * Two. A comparison of one thing with nothing is not a comparison, and a single
 * full-width bar labelled `LinkedIn` tells a student only what they already
 * knew from the funnel above it.
 *
 * Measured against `comparableGroups`, never against `rows.length` — see that
 * field for why the unspecified bucket does not count towards it.
 */
export const MINIMUM_COMPARABLE_GROUPS = 2;

type Group = {
  /** Every spelling seen, for the source lens. One value only, for roles. */
  spellings: string[];
  submitted: number;
  buckets: Record<MilestoneBucket, number>;
};

function emptyBuckets(): Record<MilestoneBucket, number> {
  return { noResponse: 0, response: 0, interview: 0, offer: 0 };
}

/**
 * Turns bucket counts into whole percentages that still sum to exactly 100.
 *
 * Rounding four shares independently is how a row comes to read 33/33/17/17 =
 * 100 on one group and 99 on the next. The largest-remainder method distributes
 * the rounding error instead: every share is floored, and the leftover points
 * go to whichever buckets lost the most to the floor. Ties break on bucket
 * order, so the same counts always produce the same row.
 *
 * A group with nothing submitted cannot occur — a group exists because an
 * application landed in it — but zero is handled rather than divided by.
 */
export function toBucketPercents(
  buckets: Record<MilestoneBucket, number>,
  submitted: number,
): Record<MilestoneBucket, number> {
  const percents = emptyBuckets();
  if (submitted <= 0) return percents;

  const exact = MILESTONE_BUCKETS.map((bucket) => ({
    bucket,
    value: (buckets[bucket] / submitted) * 100,
  }));

  let assigned = 0;
  for (const entry of exact) {
    percents[entry.bucket] = Math.floor(entry.value);
    assigned += percents[entry.bucket];
  }

  const remainders = exact
    .map((entry, index) => ({
      bucket: entry.bucket,
      remainder: entry.value - Math.floor(entry.value),
      index,
    }))
    .sort(
      (first, second) =>
        second.remainder - first.remainder || first.index - second.index,
    );

  for (let point = 0; point < 100 - assigned; point += 1) {
    percents[remainders[point % remainders.length].bucket] += 1;
  }

  return percents;
}

/**
 * The highest milestone one application reached, as a single bucket.
 *
 * Priority runs downward from Offer, so each application is classified exactly
 * once however many statuses its history holds. An application that went
 * Applied → Interview → Offer → Accepted is an `offer` and appears in no other
 * segment.
 */
function bucketFor(
  reached: Map<string, Set<ApplicationStatus>>,
  applicationId: string,
): MilestoneBucket {
  if (hasEverReached(reached, applicationId, OFFER_STATUSES)) return "offer";
  if (hasEverReached(reached, applicationId, INTERVIEW_STATUSES)) {
    return "interview";
  }
  if (hasEverReached(reached, applicationId, EMPLOYER_RESPONSE_STATUSES)) {
    return "response";
  }
  return "noResponse";
}

/**
 * One lens over submitted applications: their groups and what happened in each.
 *
 * Ordered by submitted count descending, then by label, and never by rate. The
 * unspecified source bucket sorts last whatever its size — it is the residue
 * left over after the real sources, not an answer to where applications came
 * from — and it is excluded from the five named groups for the same reason.
 */
export function summarizePerformance(
  applications: readonly PerformanceApplication[],
  history: readonly AnalyticsHistoryEvent[],
  lens: PerformanceLens,
): PerformanceSummary {
  // One pass over history for the whole lens. Each application is then a set
  // lookup, so a second lens costs a second pass over applications and nothing
  // more.
  const reached = reachedStatusesByApplication(history);
  const groups = new Map<string, Group>();
  let submitted = 0;

  for (const application of applications) {
    if (!hasEverReached(reached, application.id, SUBMITTED_STATUSES)) continue;

    const spelling =
      lens === "source"
        ? application.application_source.trim()
        : application.normalized_job_category;
    const key =
      lens === "source"
        ? sourceGroupingKey(application.application_source)
        : application.normalized_job_category;

    const group = groups.get(key) ?? {
      spellings: [],
      submitted: 0,
      buckets: emptyBuckets(),
    };

    group.spellings.push(spelling);
    group.submitted += 1;
    group.buckets[bucketFor(reached, application.id)] += 1;
    groups.set(key, group);
    submitted += 1;
  }

  const ordered = [...groups.entries()]
    .map(([key, group]) => {
      // Only the source lens has an unspecified bucket. A category is always
      // one of the enum's values, so there is nothing missing to set aside.
      const isUnspecified = lens === "source" && key === unspecifiedSourceKey;

      return {
        label: isUnspecified
          ? UNSPECIFIED_SOURCE_LABEL
          : lens === "source"
            ? preferredSourceSpelling(group.spellings)
            : group.spellings[0],
        submitted: group.submitted,
        buckets: group.buckets,
        percents: toBucketPercents(group.buckets, group.submitted),
        isUnspecified,
        isSmallSample: group.submitted < SMALL_SAMPLE_THRESHOLD,
      };
    })
    .sort((first, second) => {
      if (first.isUnspecified !== second.isUnspecified) {
        return first.isUnspecified ? 1 : -1;
      }
      return (
        second.submitted - first.submitted ||
        first.label.localeCompare(second.label)
      );
    });

  const named = ordered.filter((row) => !row.isUnspecified);
  const unspecified = ordered.filter((row) => row.isUnspecified);
  const shownNamed = named.slice(0, MAXIMUM_NAMED_GROUPS);
  const hidden = named.slice(MAXIMUM_NAMED_GROUPS);

  return {
    lens,
    // `Not specified` keeps its place at the end rather than competing for one
    // of the five named slots: it is not a source, so it cannot crowd one out.
    rows: [...shownNamed, ...unspecified],
    remainder: {
      groups: hidden.length,
      submitted: hidden.reduce((total, row) => total + row.submitted, 0),
    },
    // Every named group, including the ones volume pushed off the chart: a
    // sixth source being hidden does not make the comparison less real.
    comparableGroups: named.length,
    submitted,
  };
}
