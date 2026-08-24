import {
  hasEverReached,
  reachedStatusesByApplication,
  type AnalyticsHistoryEvent,
} from "@/lib/analytics/calculate";
import { SUBMITTED_STATUSES } from "@/lib/analytics/definitions";
import {
  compareDateOnly,
  isDateOnly,
  startOfWeek,
} from "@/lib/dates/date-only";

/**
 * The rhythm of a search: submitted applications, by week.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS NO RESPONSE-TIME METRIC HERE, AND WHY THAT IS NOT AN OVERSIGHT
 * ---------------------------------------------------------------------------
 *
 * The obvious next chart is "how long employers take to reply", and the data
 * appears to be right there: `application_status_history` carries a
 * `changed_at` for every transition, so the gap between the first submitted
 * event and the first employer-response event looks like a response time.
 *
 * It is not one. That column is declared `timestamptz not null default now()`
 * and is written by the `record_application_status_change()` trigger — it is
 * the moment **JobTrack recorded** a transition, not the moment an **employer
 * acted**. A student who backfills a search they ran last term, saves an
 * application directly at `Interview`, or updates a rejection a fortnight after
 * reading the email produces a `changed_at` gap that has no relationship to how
 * fast anybody replied.
 *
 * Publishing that gap as "employers usually respond within 6 days" would take
 * an audit timestamp and present it as a real-world event time. Mixing it with
 * the date-only `date_applied` would be worse: a `timestamptz` the database
 * generated and a calendar day a student typed are not two ends of one
 * interval.
 *
 * So response timing is deferred until JobTrack records trustworthy
 * event-occurrence dates — a `responded_on` a student enters, not an audit
 * trail reinterpreted. This module therefore reads `date_applied` and nothing
 * else with a time in it, and `listStatusHistory` deliberately projects only
 * `application_id` and `new_status` so no timestamp is even in scope here.
 *
 * `tests/unit/analytics-response-timing.test.ts` asserts this at the source
 * level. If a future change makes an analytics module read `changed_at`, that
 * test fails on purpose. Please read this comment before deleting it.
 * ---------------------------------------------------------------------------
 *
 * Everything below is pure and takes `today` as a resolved date-only string, so
 * no calculation reads a clock or a timezone and every week boundary is a
 * comparison between `YYYY-MM-DD` strings.
 */

/** The application fields search activity reads. */
export type ActivityApplication = {
  id: string;
  /** The student's own record of the day they applied, or null. */
  date_applied: string | null;
};

export type ActivityWeek = {
  /** The Monday the week starts on, as `YYYY-MM-DD`. */
  weekStart: string;
  /** Submitted applications whose recorded application date falls in this week. */
  count: number;
};

export type ActivitySummary = {
  /** Every week in the range, chronological, including honest zero weeks. */
  weeks: ActivityWeek[];
  /** Submitted applications with a usable `date_applied`, across all time. */
  dated: number;
  /** Submitted applications altogether. The denominator for coverage. */
  submitted: number;
  /** Submitted applications counted in `weeks` — the population drawn. */
  inRange: number;
  /** How many weeks in the range hold at least one application. */
  activeWeeks: number;
  /** Whether there is enough dated history for a line to mean anything. */
  hasEnoughHistory: boolean;
};

/**
 * How many weeks the chart covers, ending with the current one.
 *
 * Twelve. Long enough that a term's rhythm is visible, short enough that the
 * x-axis stays readable at 390px and that a search from last year does not
 * flatten this month into nothing.
 */
export const ACTIVITY_WEEKS = 12;

/**
 * How much dated history the range needs before a line is drawn.
 *
 * Two applications, in at least two distinct weeks.
 *
 * The bar is low on purpose, because this chart is not making a claim. It
 * reports which weeks a student recorded applications in — a history, not a
 * trend, and certainly not a rate. Two points a fortnight apart are a true
 * picture of a fortnight; withholding them would hide the student's own record
 * from them in the name of a statistical standard the chart never invokes.
 *
 * What the two rules do rule out is a drawing that would read as history and
 * is not. A single point cannot be joined to anything, and everything in one
 * week is one point however many applications sit under it: eleven zeroes and
 * a spike is a shape that implies a fortnight of nothing, when what actually
 * happened is that the search started on Tuesday. So the second rule is the
 * load-bearing one, and it is about distinct weeks rather than volume.
 */
export const ACTIVITY_MINIMUM_APPLICATIONS = 2;
export const ACTIVITY_MINIMUM_WEEKS = 2;

/**
 * The `ACTIVITY_WEEKS` week-starts ending with the week containing `today`.
 *
 * Built by walking back seven days at a time from the current week's Monday, in
 * UTC via the shared `startOfWeek`, so no step can drift across a
 * daylight-saving boundary. Returned oldest first.
 */
export function activityWeekStarts(
  today: string,
  weeks = ACTIVITY_WEEKS,
): string[] {
  const current = startOfWeek(today);
  const starts: string[] = [current];

  for (let index = 1; index < weeks; index += 1) {
    const [year, month, day] = starts[0].split("-").map(Number);
    const previous = new Date(Date.UTC(year, month - 1, day));
    previous.setUTCDate(previous.getUTCDate() - 7);
    starts.unshift(previous.toISOString().slice(0, 10));
  }

  return starts;
}

/**
 * Submitted applications per week, over the recent range.
 *
 * An application is counted only when **both** hold:
 *
 * 1. its status history shows it was ever submitted, by the canonical
 *    `SUBMITTED_STATUSES`; and
 * 2. it has a `date_applied` the student actually recorded.
 *
 * The first rule is what stops a saved `Interested` role with a stray date from
 * appearing as a submission. The second is absolute: a missing application date
 * is never inferred from `created_at`, `updated_at`, or a status-history
 * timestamp. Missing means missing, and `dated` against `submitted` reports how
 * often that happens so the line never pretends to be the whole search.
 *
 * Dates after `today` are left out of the weekly counts. A date in the future
 * cannot describe activity that has already happened, and letting a typo three
 * days ahead inflate the current week would make the most recent point — the
 * one a student looks at first — the least trustworthy.
 *
 * Archived applications stay, because historical analytics includes them.
 */
export function summarizeActivity(
  applications: readonly ActivityApplication[],
  history: readonly AnalyticsHistoryEvent[],
  today: string,
): ActivitySummary {
  const reached = reachedStatusesByApplication(history);
  const weekStarts = activityWeekStarts(today);
  const counts = new Map<string, number>(
    weekStarts.map((weekStart) => [weekStart, 0]),
  );

  let submitted = 0;
  let dated = 0;
  let inRange = 0;

  for (const application of applications) {
    if (!hasEverReached(reached, application.id, SUBMITTED_STATUSES)) continue;
    submitted += 1;

    const date = application.date_applied;
    // A malformed date is treated as no date rather than thrown on: analytics
    // reads whatever the database holds, and one bad row must not take the page
    // down.
    if (!date || !isDateOnly(date)) continue;
    dated += 1;

    if (compareDateOnly(date, today) > 0) continue;

    const weekStart = startOfWeek(date);
    const current = counts.get(weekStart);
    // Older than the range: still counted as dated, simply outside the window
    // the chart draws.
    if (current === undefined) continue;

    counts.set(weekStart, current + 1);
    inRange += 1;
  }

  const weeks = weekStarts.map((weekStart) => ({
    weekStart,
    count: counts.get(weekStart) ?? 0,
  }));
  const activeWeeks = weeks.filter((week) => week.count > 0).length;

  return {
    weeks,
    dated,
    submitted,
    inRange,
    activeWeeks,
    hasEnoughHistory:
      inRange >= ACTIVITY_MINIMUM_APPLICATIONS &&
      activeWeeks >= ACTIVITY_MINIMUM_WEEKS,
  };
}
