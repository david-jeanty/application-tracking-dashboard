import { PRE_SUBMISSION_STATUSES } from "@/lib/analytics/definitions";
import type { ApplicationStatus } from "@/lib/applications/constants";
import type { ApplicationListItem } from "@/lib/applications/types";

/** Which of the record's dates a surface ended up showing, so it can be named. */
export type ContextDate =
  | { kind: "next-action"; date: string; action: string }
  | { kind: "deadline"; date: string }
  | null;

/**
 * The one date a compact view of an application shows.
 *
 * A recorded next action is what the student asked to be reminded of, so it
 * wins outright. Failing that, an application deadline is shown only while the
 * application has not been submitted: once it is out, the deadline has served
 * its purpose, and repeating it would be telling a student about work they
 * have already done.
 *
 * Submission is read from the status, never from `date_applied`. That column
 * is optional — an application can be sitting at Interview with no date
 * recorded — so using it would leak deadlines onto rows long past them. The
 * status vocabulary is reused from the analytics definitions rather than
 * restated here, so this cannot drift from what the dashboard means by the
 * same word.
 *
 * Both branches are facts already on the record. Nothing here works out what
 * the student *should* do next.
 *
 * Shared by the applications list and the pipeline board rather than written
 * once each: the two surfaces show the same application side by side in a
 * student's day, and a rule about which date matters is exactly the kind that
 * drifts when it is stated twice.
 */
export function contextDate(application: ApplicationListItem): ContextDate {
  if (application.next_action && application.next_action_due_date) {
    return {
      kind: "next-action",
      date: application.next_action_due_date,
      action: application.next_action,
    };
  }

  const notYetSubmitted = (
    PRE_SUBMISSION_STATUSES as readonly ApplicationStatus[]
  ).includes(application.current_status);

  if (notYetSubmitted && application.application_deadline) {
    return { kind: "deadline", date: application.application_deadline };
  }

  return null;
}
