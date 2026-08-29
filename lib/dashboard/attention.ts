import type { ApplicationStatus } from "@/lib/applications/constants";
import {
  ATTENTION_LIMIT,
  DEADLINE_MINIMUM_SAVED_DAYS,
  IMMEDIATE_WINDOW_DAYS,
  UNSUBMITTED_STATUSES,
  UPCOMING_WINDOW_DAYS,
} from "@/lib/dashboard/definitions";
import { differenceInCalendarDays } from "@/lib/dates/date-only";

/**
 * The application fields attention rules read.
 *
 * `createdOn` is a calendar day rather than the raw `created_at` timestamp:
 * the conversion happens once, at the edge, in a named zone, so nothing here
 * compares an instant to a date-only deadline.
 */
export type AttentionApplication = {
  id: string;
  company_name: string;
  company_domain: string | null;
  original_job_title: string;
  current_status: ApplicationStatus;
  next_action: string | null;
  next_action_due_date: string | null;
  application_deadline: string | null;
  archived_at: string | null;
  createdOn: string;
};

/**
 * Why an entry is on the list, in the order the list is sorted.
 *
 * Three concepts, split into five priority tiers so that urgency can outrank
 * category: a posting closing tomorrow matters more than a follow-up due next
 * Friday, even though a recorded commitment generally outranks a deadline.
 *
 * The order of this array *is* the priority order, so ranking is a property of
 * the vocabulary rather than a comparator elsewhere that could drift from it.
 *
 * Everything here is something the student can act on. An explicit next action
 * is a commitment they recorded; an approaching deadline on an unsubmitted
 * application is an opportunity they may lose. Employer silence is neither —
 * an application sitting at Applied is not a task, and treating it as one told
 * students to "follow up" when the honest reading was simply that nothing had
 * happened yet.
 */
export const ATTENTION_REASONS = [
  "overdue-action",
  "deadline-critical",
  "action-due-now",
  "deadline-important",
  "action-due-soon",
] as const;

export type AttentionReason = (typeof ATTENTION_REASONS)[number];

export type AttentionItem = {
  applicationId: string;
  companyName: string;
  /**
   * Carried through so each row can show the employer's mark. It reaches here
   * on the application record the rules already read, so branding costs no
   * extra query and changes nothing about which entries qualify.
   */
  companyDomain: string | null;
  jobTitle: string;
  status: ApplicationStatus;
  reason: AttentionReason;
  /** What this row is about: the recorded action, or the deadline itself. */
  detail: string;
  /** The date this row turns on, for display beside the row. */
  date: string;
  /** The urgency, in words. Never conveyed by colour alone. */
  timing: string;
  /** Why a deadline still applies — how long it has sat, and at what status. */
  note?: string;
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

/** "Saved today", "Saved yesterday", "Saved 3 days ago". */
function describeSavedAge(days: number): string {
  if (days <= 0) return "Saved today";
  if (days === 1) return "Saved yesterday";
  return `Saved ${plural(days, "day")} ago`;
}

/**
 * The one entry, if any, that an application earns.
 *
 * Deliberately one. An application can be overdue on a follow-up *and* have a
 * deadline this week, and listing it twice would push another company off a
 * six-entry card while telling the student about one. The highest-priority
 * reason wins and the rest are implied — opening the application shows them
 * all.
 *
 * The branches are written in priority order, because the first match is the
 * one returned. Every branch describes something the student can actually do.
 *
 * Archived applications are never returned. The dashboard's working set is
 * what a student is still pursuing; an application they filed away is not
 * something they need to act on today.
 */
function classify(
  application: AttentionApplication,
  today: string,
): AttentionItem | null {
  if (application.archived_at) return null;

  const base = {
    applicationId: application.id,
    companyName: application.company_name,
    companyDomain: application.company_domain,
    jobTitle: application.original_job_title,
    status: application.current_status,
  };

  // A due date without an action describes nothing a student can do, so the
  // action is what makes either next-action rule apply. Nothing is inferred:
  // if the student did not write an action down, there is no action.
  const action = application.next_action?.trim();
  const actionDue = action ? application.next_action_due_date : null;
  const actionDays = actionDue
    ? differenceInCalendarDays(today, actionDue)
    : null;

  const actionItem = (reason: AttentionReason, days: number): AttentionItem => ({
    ...base,
    reason,
    detail: action ?? "",
    date: actionDue ?? "",
    timing: describeDue(days, "Due"),
    daysFromToday: days,
  });

  if (actionDays !== null && actionDays < 0) {
    return actionItem("overdue-action", actionDays);
  }

  // A deadline is only an action while the application is unsubmitted, and
  // only while it has not passed. Once it is sent, the deadline has done its
  // job; once it is past, nothing can be done about it.
  const isUnsubmitted = UNSUBMITTED_STATUSES.some(
    (status) => status === application.current_status,
  );
  const deadline = isUnsubmitted ? application.application_deadline : null;
  const deadlineDays = deadline
    ? differenceInCalendarDays(today, deadline)
    : null;
  const savedAgeDays = differenceInCalendarDays(application.createdOn, today);

  const deadlineItem = (
    reason: AttentionReason,
    days: number,
    note: string,
  ): AttentionItem => ({
    ...base,
    reason,
    // What the row is about, in the same slot the recorded action occupies on
    // an action row. The role is carried separately as `jobTitle`, so naming
    // the deadline here identifies the row rather than repeating the title.
    detail: "Application deadline",
    date: deadline ?? "",
    timing: describeDue(days, "Deadline"),
    note,
    daysFromToday: days,
  });

  if (
    deadlineDays !== null &&
    deadlineDays >= 0 &&
    deadlineDays <= IMMEDIATE_WINDOW_DAYS
  ) {
    // Closing today or tomorrow. Shown however recently it was saved.
    return deadlineItem(
      "deadline-critical",
      deadlineDays,
      `Still ${application.current_status}`,
    );
  }

  if (
    actionDays !== null &&
    actionDays >= 0 &&
    actionDays <= IMMEDIATE_WINDOW_DAYS
  ) {
    return actionItem("action-due-now", actionDays);
  }

  if (
    deadlineDays !== null &&
    deadlineDays > IMMEDIATE_WINDOW_DAYS &&
    deadlineDays <= UPCOMING_WINDOW_DAYS &&
    savedAgeDays >= DEADLINE_MINIMUM_SAVED_DAYS
  ) {
    // Saved a couple of days ago and still not finished. A posting saved this
    // morning is deliberately left alone: the student already knows.
    return deadlineItem(
      "deadline-important",
      deadlineDays,
      `${describeSavedAge(savedAgeDays)} · Still ${application.current_status}`,
    );
  }

  if (
    actionDays !== null &&
    actionDays > IMMEDIATE_WINDOW_DAYS &&
    actionDays <= UPCOMING_WINDOW_DAYS
  ) {
    return actionItem("action-due-soon", actionDays);
  }

  return null;
}

/**
 * What needs the student's attention today, most urgent first.
 *
 * Pure, and given everything it needs: the applications and what day it is. No
 * clock, no database, no request — the same inputs always produce the same
 * list, which is what makes these rules testable at all.
 *
 * The list contains only things a student can act on: commitments they wrote
 * down, and unsubmitted applications whose deadlines are approaching. It never
 * reports that an employer has not replied, because that is not a task and
 * there is nothing to do about it.
 *
 * Overdue work comes first. Everything else is chronological, whatever kind of
 * record it is, so today's interview preparation cannot sit below tomorrow's
 * deadline merely because the two dates came from different fields. Reason and
 * company provide stable tie-breakers. Capped, because a list that scrolls has
 * stopped answering the question it was asked.
 */
export function needsAttention(
  applications: readonly AttentionApplication[],
  today: string,
  limit: number = ATTENTION_LIMIT,
): AttentionItem[] {
  const items = applications
    .map((application) => classify(application, today))
    .filter((item): item is AttentionItem => item !== null);

  items.sort((first, second) => {
    const firstOverdue = first.daysFromToday < 0;
    const secondOverdue = second.daysFromToday < 0;
    if (firstOverdue !== secondOverdue) return firstOverdue ? -1 : 1;

    const byUrgency = first.daysFromToday - second.daysFromToday;
    if (byUrgency !== 0) return byUrgency;

    const byReason =
      ATTENTION_REASONS.indexOf(first.reason) -
      ATTENTION_REASONS.indexOf(second.reason);
    if (byReason !== 0) return byReason;

    return first.companyName.localeCompare(second.companyName);
  });

  return items.slice(0, limit);
}
