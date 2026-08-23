import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type JobCategory,
} from "@/lib/applications/constants";
import {
  ACTIVE_STATUSES,
  EMPLOYER_RESPONSE_STATUSES,
  INTERVIEW_STATUSES,
  OFFER_STATUSES,
  POSITIVE_RESPONSE_STATUSES,
  SUBMITTED_STATUSES,
  toPercent,
} from "@/lib/analytics/definitions";

/** The application fields the metrics read. A subset of the list projection. */
export type AnalyticsApplication = {
  id: string;
  current_status: ApplicationStatus;
  normalized_job_category: JobCategory;
  archived_at: string | null;
};

/** One status-history event, reduced to what "ever reached" needs. */
export type AnalyticsHistoryEvent = {
  application_id: string;
  new_status: ApplicationStatus;
};

export type CountedGroup = { label: string; count: number };

export type ConversionMetric = {
  label: string;
  /** Applications that ever reached this stage. */
  reached: number;
  /** Applications ever submitted — the shared denominator. */
  submitted: number;
  percent: number;
};

export type AnalyticsSummary = {
  /** Everything saved, whatever its state. */
  totalSaved: number;
  /** Saved but never sent anywhere. */
  notYetSubmitted: number;
  /** Ever submitted, from history rather than current status. */
  everSubmitted: number;
  /** Currently waiting on somebody, from current status. */
  activeNow: number;
  archived: number;
  /** Current status of every application, in pipeline order. */
  statusCounts: CountedGroup[];
  categoryCounts: CountedGroup[];
  conversions: ConversionMetric[];
};

/** The set of statuses each application has ever held. */
function reachedByApplication(
  history: AnalyticsHistoryEvent[],
): Map<string, Set<ApplicationStatus>> {
  const reached = new Map<string, Set<ApplicationStatus>>();

  for (const event of history) {
    const statuses = reached.get(event.application_id) ?? new Set();
    statuses.add(event.new_status);
    reached.set(event.application_id, statuses);
  }

  return reached;
}

function countReaching(
  applications: AnalyticsApplication[],
  reached: Map<string, Set<ApplicationStatus>>,
  statuses: readonly ApplicationStatus[],
): number {
  return applications.filter((application) => {
    const held = reached.get(application.id);
    return held ? statuses.some((status) => held.has(status)) : false;
  }).length;
}

function countGroups(values: string[]): CountedGroup[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (first, second) =>
        second.count - first.count || first.label.localeCompare(second.label),
    );
}

/**
 * Turns one student's applications and status history into the page's numbers.
 *
 * Two populations, kept deliberately apart. **Current-state** counts read
 * `current_status` and answer "where do things stand right now". **Conversion**
 * rates read status history and answer "what happened over the whole search" —
 * an application that was interviewed and then rejected counts as an interview
 * either way, which is the entire reason the history table exists.
 *
 * Archived applications are included. A rejected role a student tidied away is
 * still part of what happened to them, and excluding it would quietly inflate
 * every rate. The applications list deliberately does the opposite, because
 * that page is a worklist rather than a record.
 *
 * Pure, and given everything it needs: no clock, no database, no request. The
 * same inputs always produce the same summary, which is what makes the metric
 * tests meaningful.
 */
export function summarizeApplications(
  applications: AnalyticsApplication[],
  history: AnalyticsHistoryEvent[],
): AnalyticsSummary {
  const reached = reachedByApplication(history);

  const everSubmitted = countReaching(applications, reached, SUBMITTED_STATUSES);

  const conversion = (
    label: string,
    statuses: readonly ApplicationStatus[],
  ): ConversionMetric => {
    const count = countReaching(applications, reached, statuses);
    return {
      label,
      reached: count,
      submitted: everSubmitted,
      percent: toPercent(count, everSubmitted),
    };
  };

  const statusCounts = APPLICATION_STATUSES.map((status) => ({
    label: status,
    count: applications.filter(
      (application) => application.current_status === status,
    ).length,
  }));

  return {
    totalSaved: applications.length,
    notYetSubmitted: applications.length - everSubmitted,
    everSubmitted,
    activeNow: applications.filter((application) =>
      ACTIVE_STATUSES.some((status) => status === application.current_status),
    ).length,
    archived: applications.filter(
      (application) => application.archived_at !== null,
    ).length,
    // Pipeline order, not frequency order: a student reads this as a funnel.
    statusCounts,
    categoryCounts: countGroups(
      applications.map((application) => application.normalized_job_category),
    ),
    conversions: [
      conversion("Employer responded", EMPLOYER_RESPONSE_STATUSES),
      conversion("Moved forward", POSITIVE_RESPONSE_STATUSES),
      conversion("Reached an interview", INTERVIEW_STATUSES),
      conversion("Received an offer", OFFER_STATUSES),
    ],
  };
}
