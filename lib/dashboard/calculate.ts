import type { ApplicationStatus } from "@/lib/applications/constants";
import {
  INTERVIEW_STATUSES,
  SUBMITTED_STATUSES,
} from "@/lib/analytics/definitions";
import {
  ACTIVITY_LIMIT,
  PIPELINE_SNAPSHOT_STATUSES,
} from "@/lib/dashboard/definitions";
import { startOfWeek } from "@/lib/dates/date-only";

/**
 * One status event, already reduced to the calendar day it happened on.
 *
 * The conversion from `timestamptz` to a calendar day happens once, at the
 * edge, in a named zone. Everything below compares `YYYY-MM-DD` strings, which
 * is what keeps "this week" and "today" free of timezone drift.
 */
export type DashboardEvent = {
  application_id: string;
  previous_status: ApplicationStatus | null;
  new_status: ApplicationStatus;
  changedOn: string;
  changedAt: string;
};

export type PipelineStage = {
  status: ApplicationStatus;
  count: number;
};

/** The application fields the pipeline snapshot reads. */
export type PipelineApplication = {
  current_status: ApplicationStatus;
  archived_at: string | null;
};

/**
 * How many active applications sit at each stage of the submitted progression.
 *
 * Active only. The snapshot answers "where is everything right now", and an
 * archived application is nowhere — it is not moving through anything. That is
 * the same working-set rule the applications list uses, and deliberately not
 * the analytics rule, which counts archived records because a finished search
 * still happened.
 *
 * Every stage is returned even at zero. A funnel with holes punched in it is
 * harder to read than one with honest zeros, and the row is still a working
 * link to that filter.
 */
export function pipelineSnapshot(
  applications: readonly PipelineApplication[],
): PipelineStage[] {
  const active = applications.filter(
    (application) => application.archived_at === null,
  );

  return PIPELINE_SNAPSHOT_STATUSES.map((status) => ({
    status,
    count: active.filter(
      (application) => application.current_status === status,
    ).length,
  }));
}

export type WeekSummary = {
  /** Monday of the current week, inclusive. */
  weekStart: string;
  /** Applications that reached a submitted status for the first time. */
  submitted: number;
  /** Real status changes, excluding the creation event. */
  statusChanges: number;
  /** Applications that reached an interview for the first time. */
  interviews: number;
};

/**
 * The first day each application reached any of the given statuses.
 *
 * "Reached this week" has to mean the *first* time, or an application that
 * bounced between Screening and Interview would be counted as several
 * interviews in one week. Events arrive newest-first, so the earliest is
 * whichever survives a full pass.
 */
function firstReachedOn(
  events: readonly DashboardEvent[],
  statuses: readonly ApplicationStatus[],
): Map<string, string> {
  const first = new Map<string, string>();

  for (const event of events) {
    if (!statuses.some((status) => status === event.new_status)) continue;

    const current = first.get(event.application_id);
    if (!current || event.changedOn < current) {
      first.set(event.application_id, event.changedOn);
    }
  }

  return first;
}

function countReachedInWeek(
  events: readonly DashboardEvent[],
  statuses: readonly ApplicationStatus[],
  weekStart: string,
  today: string,
): number {
  let count = 0;

  for (const day of firstReachedOn(events, statuses).values()) {
    if (day >= weekStart && day <= today) count += 1;
  }

  return count;
}

/**
 * What the student did this week, measured rather than scored.
 *
 * The week runs Monday through today, not Monday through Sunday: a Tuesday
 * reader should see two days of work, not two days out of a target. Nothing
 * here is compared to a goal, a streak, or a previous week, because a slow week
 * in a job search is usually a fact about employers rather than about the
 * student.
 *
 * Three metrics, all derivable from status history exactly. "Follow-ups
 * completed" is deliberately absent: nothing records when a next action was
 * carried out, only what it is and when it is due, and inventing a number for
 * it — or adding a column to this ticket — would be worse than leaving it out.
 */
export function summarizeWeek(
  events: readonly DashboardEvent[],
  today: string,
): WeekSummary {
  const weekStart = startOfWeek(today);
  const inWeek = (event: DashboardEvent) =>
    event.changedOn >= weekStart && event.changedOn <= today;

  return {
    weekStart,
    submitted: countReachedInWeek(events, SUBMITTED_STATUSES, weekStart, today),
    // The creation event is not a change: an application saved this week is
    // one application saved, not one saved and one moved.
    statusChanges: inWeekChanges(events, inWeek),
    interviews: countReachedInWeek(events, INTERVIEW_STATUSES, weekStart, today),
  };
}

function inWeekChanges(
  events: readonly DashboardEvent[],
  inWeek: (event: DashboardEvent) => boolean,
): number {
  return events.filter(
    (event) => event.previous_status !== null && inWeek(event),
  ).length;
}

export type ActivityEntry = {
  applicationId: string;
  companyName: string;
  /** "Saved as Applied" or "Moved to Interview". */
  description: string;
  status: ApplicationStatus;
  /** The calendar day, for grouping under Today / Yesterday / a date. */
  day: string;
  changedAt: string;
};

/** The application fields recent activity needs to name a company. */
export type ActivityApplication = {
  id: string;
  company_name: string;
};

/**
 * The last few things that actually happened, newest first.
 *
 * One entry per event, and the creation event is one of them. A new
 * application already produces exactly one history row with a null
 * `previous_status` — guaranteed unique per application by a partial index —
 * so it is rendered as "Saved as Applied" rather than being dropped in favour
 * of a synthetic "saved" entry derived from `created_at`. That is what keeps
 * a creation from appearing twice: there is only ever one record of it, and it
 * is the one the database already writes.
 *
 * Archived applications stay. Activity is a record of what happened, and the
 * analytics page takes the same view; filing something away does not unmake
 * the interview. Permanently deleted applications disappear on their own,
 * because their history cascades with them and never reaches this function.
 *
 * An event whose application is not in the supplied list is skipped rather
 * than shown without a name.
 */
export function recentActivity(
  events: readonly DashboardEvent[],
  applications: readonly ActivityApplication[],
  limit: number = ACTIVITY_LIMIT,
): ActivityEntry[] {
  const names = new Map(
    applications.map((application) => [application.id, application.company_name]),
  );

  return [...events]
    .sort((first, second) => second.changedAt.localeCompare(first.changedAt))
    .flatMap((event) => {
      const companyName = names.get(event.application_id);
      if (!companyName) return [];

      return [
        {
          applicationId: event.application_id,
          companyName,
          description:
            event.previous_status === null
              ? `Saved as ${event.new_status}`
              : `Moved to ${event.new_status}`,
          status: event.new_status,
          day: event.changedOn,
          changedAt: event.changedAt,
        },
      ];
    })
    .slice(0, limit);
}

export type ActivityDay = {
  day: string;
  entries: ActivityEntry[];
};

/**
 * Activity split into the days it happened on, newest day first.
 *
 * Grouping is a property of the data, not of the render pass: computing it here
 * means the component walks a structure instead of tracking which day it last
 * printed, and the grouping itself can be tested without rendering anything.
 */
export function groupActivityByDay(
  entries: readonly ActivityEntry[],
): ActivityDay[] {
  const days: ActivityDay[] = [];

  for (const entry of entries) {
    const current = days.at(-1);
    if (current?.day === entry.day) {
      current.entries.push(entry);
      continue;
    }
    days.push({ day: entry.day, entries: [entry] });
  }

  return days;
}

/**
 * How an activity day is introduced: Today, Yesterday, or the date itself.
 *
 * Relative labels only reach back one day. "3 days ago" makes a reader do
 * arithmetic to place an event; a date does not.
 */
export function activityDayLabel(
  day: string,
  today: string,
  formatDate: (value: string) => string,
): string {
  if (day === today) return "Today";

  const [year, month, date] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(year, month - 1, date));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  if (day === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return formatDate(day);
}
