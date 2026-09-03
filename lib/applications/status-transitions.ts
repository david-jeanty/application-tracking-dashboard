import type { ApplicationStatus } from "@/lib/applications/constants";

/**
 * The three statuses that close a search out, one way or another.
 *
 * Nothing enforces an order on the other seven — a student may move backward
 * or skip ahead, because real searches do — but a terminal status is
 * different in kind: it says the search at this employer is over. Leaving one
 * again is always a deliberate reversal, never routine progress, whichever
 * status comes next.
 */
const TERMINAL_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "Rejected",
  "Withdrawn",
  "Accepted",
]);

/**
 * A rank for each non-terminal status, used only to tell forward from
 * backward. Screening and Assessment share a rank on purpose: both are
 * in-process stages a student moves between in either direction as a search
 * unfolds, and neither reads as "behind" the other.
 *
 * This is deliberately narrower than `lib/applications/lifecycle.ts`'s five
 * display stages — that mapping groups Offer, Accepted, Rejected and
 * Withdrawn into one "Outcome" stage for the rail, which would erase the
 * distinction this module exists to draw between reaching an outcome and
 * reopening one.
 */
const ACTIVE_STAGE_RANK: ReadonlyMap<ApplicationStatus, number> = new Map([
  ["Interested", 1],
  ["Preparing", 2],
  ["Applied", 3],
  ["Screening", 4],
  ["Assessment", 4],
  ["Interview", 5],
  ["Offer", 6],
]);

export type StatusTransitionReason = "backward" | "reopened-outcome";

export type StatusTransitionAssessment =
  | { isUnusual: false; reason: null }
  | { isUnusual: true; reason: StatusTransitionReason };

/**
 * Decides whether moving from one status to another is logically unusual
 * enough to ask a student to confirm before it saves.
 *
 * This is a warning, never a restriction: every transition remains reachable,
 * and this function is consulted only by the confirmation step, never by a
 * mutation itself. Nothing here infers a status change on its own — it only
 * classifies a change a student already chose.
 *
 * Three rules, applied in order:
 *
 * 1. No change at all is never unusual.
 * 2. Leaving a terminal status (Rejected, Withdrawn, Accepted) for any other
 *    status reopens a search that was marked closed, whatever the
 *    destination — that is always worth a pause.
 * 3. Between two non-terminal statuses, only an actual step backward in the
 *    active-stage ranking above is unusual. Reaching a terminal status from
 *    an active one is ordinary progress (closing out is not a regression),
 *    and so is moving forward, including a skip past stages that were never
 *    visited — a student may go straight from Applied to Offer, and that is
 *    not asked about either.
 */
export function assessStatusTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): StatusTransitionAssessment {
  if (from === to) return { isUnusual: false, reason: null };

  if (TERMINAL_STATUSES.has(from)) {
    return { isUnusual: true, reason: "reopened-outcome" };
  }

  if (TERMINAL_STATUSES.has(to)) {
    return { isUnusual: false, reason: null };
  }

  const fromRank = ACTIVE_STAGE_RANK.get(from);
  const toRank = ACTIVE_STAGE_RANK.get(to);

  // Unreachable while every non-terminal status is ranked, which the type
  // above enforces.
  if (fromRank === undefined || toRank === undefined) {
    return { isUnusual: false, reason: null };
  }

  if (toRank < fromRank) return { isUnusual: true, reason: "backward" };

  return { isUnusual: false, reason: null };
}

/**
 * The sentence the confirmation dialog shows for one unusual transition.
 *
 * Names the exact statuses involved rather than speaking generically, so the
 * student confirms the specific change in front of them rather than a
 * boilerplate warning.
 */
export function describeStatusTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  reason: StatusTransitionReason,
): string {
  if (reason === "reopened-outcome") {
    return `This reopens the application, moving it from ${from} back to ${to}.`;
  }

  return `This moves the application backward, from ${from} to ${to}.`;
}
