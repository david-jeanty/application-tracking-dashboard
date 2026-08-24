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
  toPercent,
} from "@/lib/analytics/definitions";
import { UNSPECIFIED_DATABASE_VALUE } from "@/lib/applications/constants";

/**
 * What happened to the applications a student actually sent, grouped by where
 * they found the posting.
 *
 * This answers one question and no others: "where are my submitted
 * applications coming from, and what happened to them?" It reports facts and
 * rates. It does not rank sources, score them, call one better than another, or
 * suggest what to do — the numbers are the student's to interpret.
 *
 * Every outcome comes from status history, never from current status, so an
 * application that interviewed and was later rejected still counts as an
 * interview for its source. That is the same rule the conversion funnel uses,
 * and it reuses the same status sets rather than restating them.
 */

/** The application fields source performance reads. */
export type SourceApplication = {
  id: string;
  /**
   * Free text as the student typed it. Never null and never blank in the
   * database — the column is `not null` with a length check, and a blank form
   * field is stored as the `Not specified` sentinel.
   */
  application_source: string;
};

export type SourcePerformanceRow = {
  /** The spelling shown to the student, chosen from their own data. */
  source: string;
  /** Applications from this source that were ever submitted. The denominator. */
  submitted: number;
  employerResponded: number;
  interviews: number;
  offers: number;
  /** `interviews / submitted`, rounded by the shared policy. */
  interviewRate: number;
  /** True for the bucket holding applications with no source recorded. */
  isUnspecified: boolean;
};

/**
 * The bucket an application with no recorded source falls into.
 *
 * It is the sentinel the database already stores, not a new vocabulary: a blank
 * source on the form or over MCP is written as `Not specified`, so this is what
 * "no source" already looks like in the data.
 */
export const UNSPECIFIED_SOURCE_LABEL = UNSPECIFIED_DATABASE_VALUE;

/**
 * The key two spellings must share to be counted as one source.
 *
 * Deliberately conservative: trim, then lowercase. Nothing else. `LinkedIn`,
 * `linkedin`, and `LINKEDIN ` are one source because they differ only in how
 * the same word was typed. `LinkedIn` and `LinkedIn Easy Apply` stay two,
 * because nothing in the data model says they are the same thing and deciding
 * that they are would be inventing a taxonomy this product does not have.
 *
 * A blank value cannot reach here from the database — the column is `not null`
 * with a `btrim` length check — but it is folded into the unspecified bucket
 * anyway rather than becoming an empty row.
 */
function groupingKey(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return UNSPECIFIED_SOURCE_LABEL.toLowerCase();
  return trimmed.toLowerCase();
}

/**
 * The spelling to show for a group, chosen deterministically from the data.
 *
 * The most frequently typed spelling wins, because that is the one the student
 * recognises as theirs. Ties break on the spelling itself rather than on row
 * order, so the label depends only on which values are present and not on the
 * order the database happened to return them in.
 */
function preferredSpelling(spellings: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const spelling of spellings) {
    counts.set(spelling, (counts.get(spelling) ?? 0) + 1);
  }

  return [...counts.entries()].sort(
    (first, second) =>
      second[1] - first[1] || first[0].localeCompare(second[0]),
  )[0][0];
}

type SourceGroup = {
  spellings: string[];
  submitted: number;
  employerResponded: number;
  interviews: number;
  offers: number;
};

/**
 * Source performance, one row per source, over submitted applications only.
 *
 * **The population is the point.** Only applications whose history shows they
 * were actually submitted are counted at all — a job saved as Interested and
 * never sent says nothing about how a source performs, and letting it into a
 * denominator would silently punish whichever source a student browses most.
 * So a source with 20 saved jobs and 12 submitted, 2 of which interviewed, has
 * an interview rate of 2/12, not 2/20.
 *
 * Every numerator is a subset of that same denominator, taken from history:
 *
 * - `submitted`         — ever reached a submitted status
 * - `employerResponded` — ever reached an employer-response status
 * - `interviews`        — ever reached an interview status
 * - `offers`            — ever reached an offer status
 * - `interviewRate`     — `interviews / submitted`
 *
 * Archived applications stay in. Permanently deleted ones never arrive, because
 * their history cascades away with them.
 *
 * Rows are ordered by submitted count descending, then by label, and never by
 * rate — ordering by a percentage would put a single lucky application at the
 * top of the table and read as a recommendation. The unspecified bucket sorts
 * last whatever its size: it is the residue left over after the real sources,
 * not an answer to where applications came from.
 */
export function summarizeSourcePerformance(
  applications: readonly SourceApplication[],
  history: readonly AnalyticsHistoryEvent[],
): SourcePerformanceRow[] {
  // One pass over history for the whole calculation. Each application is then
  // a set lookup, so adding a source costs nothing extra.
  const reached = reachedStatusesByApplication(history);
  const groups = new Map<string, SourceGroup>();

  for (const application of applications) {
    if (!hasEverReached(reached, application.id, SUBMITTED_STATUSES)) continue;

    const key = groupingKey(application.application_source);
    const group = groups.get(key) ?? {
      spellings: [],
      submitted: 0,
      employerResponded: 0,
      interviews: 0,
      offers: 0,
    };

    group.spellings.push(application.application_source.trim());
    group.submitted += 1;
    if (hasEverReached(reached, application.id, EMPLOYER_RESPONSE_STATUSES)) {
      group.employerResponded += 1;
    }
    if (hasEverReached(reached, application.id, INTERVIEW_STATUSES)) {
      group.interviews += 1;
    }
    if (hasEverReached(reached, application.id, OFFER_STATUSES)) {
      group.offers += 1;
    }

    groups.set(key, group);
  }

  const unspecifiedKey = UNSPECIFIED_SOURCE_LABEL.toLowerCase();

  return [...groups.entries()]
    .map(([key, group]) => {
      const isUnspecified = key === unspecifiedKey;

      return {
        source: isUnspecified
          ? UNSPECIFIED_SOURCE_LABEL
          : preferredSpelling(group.spellings),
        submitted: group.submitted,
        employerResponded: group.employerResponded,
        interviews: group.interviews,
        offers: group.offers,
        interviewRate: toPercent(group.interviews, group.submitted),
        isUnspecified,
      };
    })
    .sort((first, second) => {
      if (first.isUnspecified !== second.isUnspecified) {
        return first.isUnspecified ? 1 : -1;
      }
      return (
        second.submitted - first.submitted ||
        first.source.localeCompare(second.source)
      );
    });
}
