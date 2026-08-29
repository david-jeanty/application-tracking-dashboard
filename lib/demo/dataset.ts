import { SUBMITTED_STATUSES } from "@/lib/analytics/definitions";
import {
  UNSPECIFIED_DATABASE_VALUE,
  type ApplicationStatus,
} from "@/lib/applications/constants";
import type {
  ApplicationAnalyticsRow,
  ApplicationListItem,
  ApplicationRecord,
  ApplicationStatusEvent,
  ApplicationTimelineEvent,
} from "@/lib/applications/types";
import { DEMO_SEEDS, type DemoSeed } from "@/lib/demo/seeds";

/**
 * The demo workspace's data, in exactly the shapes the production surfaces read.
 *
 * One dataset, four projections of it — the same relationship the database has
 * to the four reads it serves. The applications list, the pipeline board, the
 * dashboard and analytics are all looking at the same 56 records, so a count on
 * one page cannot disagree with a count on another.
 */
export type DemoDataset = {
  /**
   * Every application, newest first, archived ones included.
   *
   * The population the dashboard and analytics reason about, matching what
   * production reads with `archiveState: "all"`. A role the student filed away
   * still happened, and dropping it here would quietly inflate every rate.
   */
  applications: ApplicationListItem[];
  /**
   * Everything still in play, in the same order.
   *
   * What the applications list and the pipeline board show, matching
   * `listActiveApplications`. Derived from the same records rather than from a
   * second fixture, so the two populations cannot disagree about a record.
   */
  activeApplications: ApplicationListItem[];
  /** The full records, by id, for the detail page. */
  records: Map<string, ApplicationRecord>;
  /** The analytics projection. */
  analyticsRows: ApplicationAnalyticsRow[];
  /** Status events without timestamps, as the lifecycle rail and analytics read them. */
  statusEvents: ApplicationStatusEvent[];
  /** The same events with their moments, as the dashboard reads them. */
  timeline: ApplicationTimelineEvent[];
};

/**
 * Late afternoon UTC, which is midday in every North American zone.
 *
 * Every generated timestamp uses it, so converting one back to a calendar day
 * in the product's zone returns the day it was generated for. A midnight
 * timestamp would land on the previous day in Toronto and quietly shift half
 * the dataset's activity by one day.
 */
const EVENT_TIME = "T16:00:00.000Z";

const SUBMITTED = new Set<ApplicationStatus>(SUBMITTED_STATUSES);

/** The calendar day `daysAgo` before `today`, as `YYYY-MM-DD`. */
function dayBefore(today: string, daysAgo: number): string {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

/** The calendar day `daysAhead` after `today`. */
function dayAfter(today: string, daysAhead: number): string {
  return dayBefore(today, -daysAhead);
}

/**
 * When each status in a seed's path was reached, oldest first.
 *
 * The first event is `firstEventDaysAgo` back and each one after it is
 * `stepDays` closer to today. Nothing is allowed to land in the future: an
 * event that would is pinned to today, which keeps a long path on a recently
 * started application coherent rather than predicting one.
 */
function eventDays(seed: DemoSeed, today: string): string[] {
  const step = seed.stepDays ?? 5;

  return seed.path.map((_, index) => {
    const daysAgo = Math.max(0, seed.firstEventDaysAgo - index * step);
    return dayBefore(today, daysAgo);
  });
}

/**
 * One seed, expanded into the record the database would hold.
 *
 * The current status is the end of the path and `date_applied` is the day of
 * the first submitted status in it, so neither can drift from the history:
 * both are read out of the same array the events are generated from.
 *
 * `location` and `application_source` carry the legacy `Not specified`
 * sentinel when the seed omits them, exactly as a real row does, so the demo
 * exercises the same `displayOptionalText` path production does rather than a
 * tidier one.
 */
function toRecord(seed: DemoSeed, today: string): ApplicationRecord {
  const days = eventDays(seed, today);
  const currentStatus = seed.path[seed.path.length - 1];
  const submittedIndex = seed.path.findIndex((status) => SUBMITTED.has(status));

  return {
    id: seed.id,
    company_name: seed.company,
    company_domain: seed.domain ?? null,
    original_job_title: seed.title,
    normalized_job_category: seed.category,
    classification_confidence: "High",
    location: seed.location ?? UNSPECIFIED_DATABASE_VALUE,
    work_arrangement: seed.arrangement ?? "Unknown",
    application_url: seed.url ?? null,
    application_source: seed.source ?? UNSPECIFIED_DATABASE_VALUE,
    job_description: seed.jobDescription ?? null,
    application_deadline:
      seed.deadlineInDays === undefined
        ? null
        : dayAfter(today, seed.deadlineInDays),
    date_applied: submittedIndex === -1 ? null : days[submittedIndex],
    current_status: currentStatus,
    work_term_season: seed.term,
    work_term_duration: seed.duration ?? null,
    salary: seed.salary ?? null,
    notes: seed.notes ?? null,
    // A due date is meaningless on its own, so the two are written together or
    // not at all — the invariant every production write already keeps.
    next_action: seed.nextAction?.text ?? null,
    next_action_due_date: seed.nextAction
      ? dayAfter(today, seed.nextAction.inDays)
      : null,
    created_at: `${days[0]}${EVENT_TIME}`,
    updated_at: `${days[days.length - 1]}${EVENT_TIME}`,
    // A handful of finished applications are filed away, as a real tracker's
    // are. They keep their history and stay in the analytics; they simply stop
    // appearing on the surfaces about what is still in play.
    archived_at:
      seed.archivedDaysAgo === undefined
        ? null
        : `${dayBefore(today, seed.archivedDaysAgo)}${EVENT_TIME}`,
  };
}

/** The summary projection, taken from the record rather than rebuilt. */
function toListItem(record: ApplicationRecord): ApplicationListItem {
  return {
    id: record.id,
    company_name: record.company_name,
    company_domain: record.company_domain,
    original_job_title: record.original_job_title,
    normalized_job_category: record.normalized_job_category,
    current_status: record.current_status,
    location: record.location,
    work_arrangement: record.work_arrangement,
    work_term_season: record.work_term_season,
    date_applied: record.date_applied,
    application_deadline: record.application_deadline,
    next_action: record.next_action,
    next_action_due_date: record.next_action_due_date,
    created_at: record.created_at,
    archived_at: record.archived_at,
  };
}

/**
 * The demo workspace's sample search, resolved against one day.
 *
 * Deterministic: the same `today` always produces the same dataset, byte for
 * byte, so a test can pass a fixed day and assert on exact records while the
 * running demo stays as current as the visitor's own calendar. There is no
 * randomness anywhere in this module, and nothing here reads a clock — the
 * caller resolves "today" through the product's own timezone helper and passes
 * it in, like every other date-aware calculation in Interndex.
 *
 * Ordering matches what the repository returns: newest first by `created_at`,
 * so the demo list is in the same order a real one would be.
 */
export function buildDemoDataset(today: string): DemoDataset {
  const records = DEMO_SEEDS.map((seed) => toRecord(seed, today));

  const ordered = [...records].sort((first, second) =>
    second.created_at.localeCompare(first.created_at),
  );

  const statusEvents: ApplicationStatusEvent[] = [];
  const timeline: ApplicationTimelineEvent[] = [];

  for (const seed of DEMO_SEEDS) {
    const days = eventDays(seed, today);

    seed.path.forEach((status, index) => {
      statusEvents.push({ application_id: seed.id, new_status: status });
      timeline.push({
        application_id: seed.id,
        // Null on the first event only — the marker a creation carries in the
        // real table, which is what lets recent activity say "saved" rather
        // than inventing a move that never happened.
        previous_status: index === 0 ? null : seed.path[index - 1],
        new_status: status,
        changed_at: `${days[index]}${EVENT_TIME}`,
      });
    });
  }

  const applications = ordered.map(toListItem);

  return {
    applications,
    activeApplications: applications.filter(
      (application) => application.archived_at === null,
    ),
    records: new Map(records.map((record) => [record.id, record])),
    analyticsRows: ordered.map((record) => ({
      id: record.id,
      current_status: record.current_status,
      normalized_job_category: record.normalized_job_category,
      application_source: record.application_source,
      date_applied: record.date_applied,
      archived_at: record.archived_at,
    })),
    statusEvents,
    timeline,
  };
}
