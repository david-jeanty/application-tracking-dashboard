import type { ApplicationStatus } from "@/lib/applications/constants";
import { ACTIVE_STATUSES } from "@/lib/analytics/definitions";

/**
 * The thresholds and vocabulary the dashboard is defined from.
 *
 * Every business rule this page applies is a constant here, named once. The
 * status sets come from `lib/analytics/definitions` rather than being restated,
 * so the dashboard and the analytics page can never disagree about what
 * "submitted" or "active" means.
 */

/**
 * How far ahead "soon" reaches, for both next actions and deadlines.
 *
 * Seven days is one planning week: far enough that a student sees Friday's
 * deadline on Monday and can act on it, near enough that the list stays a
 * to-do rather than a calendar. Inclusive at both ends — a deadline exactly
 * seven days out is shown.
 */
export const UPCOMING_WINDOW_DAYS = 7;

/**
 * How long an application sits without moving before it is called stale.
 *
 * Fourteen days, not twenty-one. Employer response windows for student and
 * co-op roles run one to two weeks, so at fourteen days a follow-up is both
 * warranted and still timely; by twenty-one the useful moment to nudge has
 * usually passed, which would make the card a record of regret rather than a
 * prompt to act.
 *
 * "Moved" means a status event, never an edit. A student who fixed a typo in
 * their notes yesterday has not heard from anybody, and reading `updated_at`
 * would silently clear the flag for them — which is why staleness is measured
 * from `application_status_history`.
 */
export const STALE_AFTER_DAYS = 14;

/**
 * How many attention entries the dashboard shows at once.
 *
 * Six. The section exists to answer "what needs my attention", and a list long
 * enough to scroll answers "everything, good luck" instead. Anything beyond the
 * cap is still reachable through the applications list.
 */
export const ATTENTION_LIMIT = 6;

/** How many activity entries the dashboard shows at once. */
export const ACTIVITY_LIMIT = 6;

/**
 * The statuses an application can be stale in.
 *
 * Exactly the analytics `ACTIVE_STATUSES` — Applied, Screening, Assessment,
 * Interview. That set already excludes both ends for the right reasons:
 * Interested and Preparing were never sent anywhere, so silence from an
 * employer is not a fact about them, and Rejected, Withdrawn, and Accepted are
 * finished, so silence is the expected state rather than a problem.
 *
 * Reused rather than redeclared, so a future change to what "active" means
 * cannot leave the two pages disagreeing.
 */
export const STALE_CANDIDATE_STATUSES = ACTIVE_STATUSES;

/**
 * The statuses the pipeline snapshot walks, in order.
 *
 * The submitted progression plus its first good outcome. Interested and
 * Preparing are left out because nothing has been sent, and the terminal
 * statuses because a funnel that ends in Rejected reads as a scoreboard rather
 * than a picture of what is in flight — those are on the analytics page, where
 * the whole history is the point.
 *
 * This is a view over the existing ten-status enum, not a second vocabulary:
 * every entry is an `ApplicationStatus`, and each one links to the applications
 * list using the status filter that already exists.
 */
export const PIPELINE_SNAPSHOT_STATUSES = [
  "Applied",
  "Screening",
  "Assessment",
  "Interview",
  "Offer",
] as const satisfies readonly ApplicationStatus[];
