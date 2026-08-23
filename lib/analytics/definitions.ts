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
