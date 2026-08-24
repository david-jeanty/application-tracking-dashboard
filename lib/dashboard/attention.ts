import type { ApplicationStatus } from "@/lib/applications/constants";
import {
  ATTENTION_LIMIT,
  STALE_AFTER_DAYS,
  STALE_CANDIDATE_STATUSES,
  UPCOMING_WINDOW_DAYS,
} from "@/lib/dashboard/definitions";
import { differenceInCalendarDays } from "@/lib/dates/date-only";

/** The application fields attention rules read. A subset of the list projection. */
export type AttentionApplication = {
  id: string;
  company_name: string;
  original_job_title: string;
  current_status: ApplicationStatus;
  next_action: string | null;
  next_action_due_date: string | null;
  application_deadline: string | null;
  archived_at: string | null;
};

/**
 * When each application last actually moved, as a calendar day.
 *
 * Keyed by application id. An application missing from the map has no recorded
 * movement at all and is left alone rather than assumed stale.
 */
export type LastMovementByApplication = ReadonlyMap<string, string>;

/**
 * Why an entry is on the list, in the order the list is sorted.
 *
 * The order of this array is the priority order, so ranking is a property of
 * the vocabulary rather than a comparator somewhere else that could drift from
 * it. A missed commitment outranks an approaching one; a hard external deadline
 * outranks a self-set follow-up, because the deadline cannot be moved; silence
 * comes last, because nothing about it is due today.
 */
export const ATTENTION_REASONS = [
  "overdue-action",
  "deadline-soon",
  "action-soon",
  "stale",
] as const;

export type AttentionReason = (typeof ATTENTION_REASONS)[number];

export type AttentionItem = {
  applicationId: string;
  companyName: string;
  jobTitle: string;
  status: ApplicationStatus;
  reason: AttentionReason;
  /** What the student committed to, when the entry is about a next action. */
  detail: string;
  /** The urgency, in words. Never conveyed by colour alone. */
  timing: string;
  /**
   * Days from today. Negative is overdue, so ascending sort puts the most
   * overdue first and, among future dates, the soonest first.
   */
  daysFromToday: number;
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "Overdue by 2 days", "Due today", "Due tomorrow", "Due in 5 days". */
function describeDue(days: number, label: string): string {
  if (days < 0) return `Overdue by ${plural(Math.abs(days), "day")}`;
  if (days === 0) return `${label} today`;
  if (days === 1) return `${label} tomorrow`;
  return `${label} in ${plural(days, "day")}`;
}

/**
 * The one entry, if any, that an application earns.
 *
 * Deliberately one. An application can be overdue on a follow-up *and* have a
 * deadline this week *and* have gone quiet, and listing it three times would
 * push three other companies off a six-entry card while telling the student
 * about one company. The highest-priority reason wins and the rest are
 * implied — opening the application shows them all.
 *
 * Archived applications are never returned. The dashboard's working set is
 * what a student is still pursuing; an application they filed away is not
 * something they need to act on today.
 */
function classify(
  application: AttentionApplication,
  today: string,
  lastMovement: LastMovementByApplication,
): AttentionItem | null {
  if (application.archived_at) return null;

  const base = {
    applicationId: application.id,
    companyName: application.company_name,
    jobTitle: application.original_job_title,
    status: application.current_status,
  };

  // A due date without an action describes nothing a student can do, so the
  // action is what makes either next-action rule apply.
  const action = application.next_action?.trim();
  const actionDue = action ? application.next_action_due_date : null;
  const actionDays = actionDue
    ? differenceInCalendarDays(today, actionDue)
    : null;

  if (actionDays !== null && actionDays < 0) {
    return {
      ...base,
      reason: "overdue-action",
      detail: action ?? "",
      timing: describeDue(actionDays, "Due"),
      daysFromToday: actionDays,
    };
  }

  const deadline = application.application_deadline;
  const deadlineDays = deadline
    ? differenceInCalendarDays(today, deadline)
    : null;

  // A deadline already past is not upcoming, and nothing can be done about it
  // now — flagging it would be a reminder of a closed door.
  if (
    deadlineDays !== null &&
    deadlineDays >= 0 &&
    deadlineDays <= UPCOMING_WINDOW_DAYS
  ) {
    return {
      ...base,
      reason: "deadline-soon",
      detail: "Application deadline",
      timing: describeDue(deadlineDays, "Deadline"),
      daysFromToday: deadlineDays,
    };
  }

  if (
    actionDays !== null &&
    actionDays >= 0 &&
    actionDays <= UPCOMING_WINDOW_DAYS
  ) {
    return {
      ...base,
      reason: "action-soon",
      detail: action ?? "",
      timing: describeDue(actionDays, "Due"),
      daysFromToday: actionDays,
    };
  }

  const isStaleCandidate = STALE_CANDIDATE_STATUSES.some(
    (status) => status === application.current_status,
  );
  const movedOn = lastMovement.get(application.id);

  if (isStaleCandidate && movedOn) {
    const quietDays = differenceInCalendarDays(movedOn, today);
    if (quietDays >= STALE_AFTER_DAYS) {
      return {
        ...base,
        reason: "stale",
        detail: "No status movement",
        timing: `No status movement for ${plural(quietDays, "day")}`,
        // Older silence is more urgent, so it sorts the same direction as an
        // overdue date: further from today, further up the list.
        daysFromToday: -quietDays,
      };
    }
  }

  return null;
}

/**
 * The latest real movement per application, as a calendar day.
 *
 * Every event counts, the creation event included: an application saved
 * eighteen days ago as `Applied` and untouched since has been silent for
 * eighteen days, and ignoring its only event would hide exactly the case this
 * rule exists to catch.
 *
 * Timestamps become calendar days here, once, in the caller's zone — the only
 * point where the timestamp and date-only worlds meet.
 */
export function lastMovementByApplication(
  events: readonly { application_id: string; changedOn: string }[],
): LastMovementByApplication {
  const latest = new Map<string, string>();

  for (const event of events) {
    const current = latest.get(event.application_id);
    if (!current || event.changedOn > current) {
      latest.set(event.application_id, event.changedOn);
    }
  }

  return latest;
}

/**
 * What needs the student's attention today, most urgent first.
 *
 * Pure, and given everything it needs: the applications, when each last moved,
 * and what day it is. No clock, no database, no request — the same inputs
 * always produce the same list, which is what makes these rules testable at
 * all.
 *
 * Sorted by reason first, then by date within a reason, then by company so the
 * order never wobbles between two renders of identical data. Capped, because a
 * list that scrolls has stopped answering the question it was asked.
 */
export function needsAttention(
  applications: readonly AttentionApplication[],
  lastMovement: LastMovementByApplication,
  today: string,
  limit: number = ATTENTION_LIMIT,
): AttentionItem[] {
  const items = applications
    .map((application) => classify(application, today, lastMovement))
    .filter((item): item is AttentionItem => item !== null);

  items.sort((first, second) => {
    const byReason =
      ATTENTION_REASONS.indexOf(first.reason) -
      ATTENTION_REASONS.indexOf(second.reason);
    if (byReason !== 0) return byReason;

    const byUrgency = first.daysFromToday - second.daysFromToday;
    if (byUrgency !== 0) return byUrgency;

    return first.companyName.localeCompare(second.companyName);
  });

  return items.slice(0, limit);
}
