import type { ApplicationStatus } from "@/lib/applications/constants";

/**
 * The status sets every metric is defined from.
 *
 * Defined once, here, so a page, a component, or a future export can never
 * quietly disagree about what "submitted" or "a response" means. Each set is a
 * subset of the existing `application_status` enum; none of them introduces a
 * parallel vocabulary.
 */

/** Saved but not sent: these are not applications to anybody yet. */
export const PRE_SUBMISSION_STATUSES = [
  "Interested",
  "Preparing",
] as const satisfies readonly ApplicationStatus[];

/**
 * Reaching any of these means the application was actually submitted.
 *
 * This is the denominator for every rate below, taken from status history
 * rather than current status. An application that was rejected and later moved
 * back to Interested was still submitted, and dropping it from the denominator
 * while its rejection stayed in a numerator is what would let a rate exceed
 * 100%.
 */
export const SUBMITTED_STATUSES = [
  "Applied",
  "Screening",
  "Assessment",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
  "Accepted",
] as const satisfies readonly ApplicationStatus[];

/** Live right now: waiting on somebody, or actively in process. */
export const ACTIVE_STATUSES = [
  "Applied",
  "Screening",
  "Assessment",
  "Interview",
] as const satisfies readonly ApplicationStatus[];

/** The employer did something — including saying no. */
export const EMPLOYER_RESPONSE_STATUSES = [
  "Screening",
  "Assessment",
  "Interview",
  "Offer",
  "Rejected",
  "Accepted",
] as const satisfies readonly ApplicationStatus[];

/** The employer moved the student forward rather than out. */
export const POSITIVE_RESPONSE_STATUSES = [
  "Screening",
  "Assessment",
  "Interview",
  "Offer",
  "Accepted",
] as const satisfies readonly ApplicationStatus[];

/** Reached a real interview, whatever happened afterwards. */
export const INTERVIEW_STATUSES = [
  "Interview",
  "Offer",
  "Accepted",
] as const satisfies readonly ApplicationStatus[];

/** Received an offer, whether or not it was taken. */
export const OFFER_STATUSES = [
  "Offer",
  "Accepted",
] as const satisfies readonly ApplicationStatus[];

/**
 * One rounding policy for every percentage on the page.
 *
 * A zero denominator is zero, not "NaN%" and not a hidden tile: a student with
 * nothing submitted yet should see a real zero rather than an empty space they
 * have to interpret.
 */
export function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

/**
 * The same rounding, for a ratio that has no answer when nothing was measured.
 *
 * `toPercent` above deliberately reports a zero denominator as `0`, and that is
 * right for a *share of the whole search*: a student with nothing submitted has
 * genuinely had 0% of their applications reach an interview, and an empty space
 * would only be something to interpret.
 *
 * A **stage-to-stage** conversion is a different claim. "Of the applications
 * that got a response, how many interviewed" has no answer at all when nothing
 * got a response — `0%` there would assert that responses were received and
 * none of them progressed, which is a statement about employers that the data
 * does not support. So the absence is returned as an absence, and the interface
 * renders an em dash rather than inventing a floor.
 *
 * The rounding itself is delegated, never restated, so the two policies cannot
 * drift apart.
 */
export function toPercentOrUndefined(
  numerator: number,
  denominator: number,
): number | undefined {
  if (denominator <= 0) return undefined;
  return toPercent(numerator, denominator);
}

/**
 * A ratio of one count to another, at the precision small samples deserve.
 *
 * `54 / 4` is `13.5`, and `54 / 2` is `27` rather than `27.0`. One decimal is
 * the most this is ever worth: a student comparing 13.5 applications per
 * interview with 13.48 is reading noise, and printing the second one would make
 * the whole page look more certain than a few dozen applications can support.
 *
 * Undefined at a zero denominator, for the same reason as above — "applications
 * per interview" with no interviews is not `0` and not `∞`, it is a question
 * that has not been answered yet.
 */
export function toRatio(
  numerator: number,
  denominator: number,
): number | undefined {
  if (denominator <= 0) return undefined;
  return Math.round((numerator / denominator) * 10) / 10;
}

/**
 * What an undefined figure looks like.
 *
 * A real em dash rather than `N/A`, `-`, or a blank cell: it reads as
 * "deliberately nothing here" in running text and in a screen reader alike,
 * and it is the character the rest of the interface already uses for a value a
 * student has not recorded.
 */
export const EM_DASH = "—";

/** `13.5`, `27`, or `—` when the ratio is undefined. */
export function formatRatio(ratio: number | undefined): string {
  if (ratio === undefined) return EM_DASH;
  return Number.isInteger(ratio) ? String(ratio) : ratio.toFixed(1);
}

/** `17%`, or `—` when the conversion has no denominator to be a share of. */
export function formatPercent(percent: number | undefined): string {
  return percent === undefined ? EM_DASH : `${percent}%`;
}
