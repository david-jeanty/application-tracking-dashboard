import type { ApplicationStatus } from "@/lib/applications/constants";
import { PRE_SUBMISSION_STATUSES } from "@/lib/analytics/definitions";

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
 * Today or tomorrow: near enough that nothing else is allowed to qualify it.
 *
 * A deadline inside this window is shown whatever else is true of the
 * application, including one saved minutes ago. Outside it, an approaching
 * deadline has to earn its place.
 */
export const IMMEDIATE_WINDOW_DAYS = 1;

/**
 * How long an unsubmitted application must have been saved before an
 * approaching deadline is worth mentioning.
 *
 * Two days. A student who saved a posting this morning knows it is there and
 * knows when it closes; telling them again the same day is noise, and noise is
 * what makes a student stop reading the card. Once a couple of days have
 * passed, a posting they meant to finish and did not is genuinely worth
 * surfacing. Deadlines today or tomorrow ignore this entirely — those are
 * urgent whenever the application was saved.
 */
export const DEADLINE_MINIMUM_SAVED_DAYS = 2;

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
 * The statuses in which an application deadline is still an action.
 *
 * Exactly the analytics `PRE_SUBMISSION_STATUSES` — Interested and Preparing.
 *
 * The action a deadline represents is "finish and submit this application".
 * Once the application has been sent, the deadline has served its purpose:
 * nothing about it is actionable, and repeating it would be telling a student
 * about work they have already done. Everything from Applied onward is
 * therefore excluded, terminal statuses included.
 *
 * Reused rather than redeclared, so a future change to what "not yet
 * submitted" means cannot leave the dashboard and the analytics page
 * disagreeing.
 */
export const UNSUBMITTED_STATUSES = PRE_SUBMISSION_STATUSES;

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
