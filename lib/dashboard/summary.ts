import { summarizeApplications } from "@/lib/analytics/calculate";
import type { ApplicationListItem } from "@/lib/applications/types";
import type { ApplicationTimelineEvent } from "@/lib/applications/types";
import {
  lastMovementByApplication,
  needsAttention,
  type AttentionItem,
} from "@/lib/dashboard/attention";
import {
  pipelineSnapshot,
  recentActivity,
  summarizeWeek,
  type ActivityEntry,
  type DashboardEvent,
  type PipelineStage,
  type WeekSummary,
} from "@/lib/dashboard/calculate";
import { dateOnlyFromTimestamp } from "@/lib/dates/date-only";

/** The shape a repository read arrives in, narrowed to what this needs. */
export type DashboardRead<Row> = {
  data: Row[] | null;
  error: unknown;
};

export type SearchSummary = {
  /** Ever sent to an employer, from history. */
  submitted: number;
  /** Waiting on somebody right now, from current status. */
  active: number;
  /** Ever reached an interview, whatever happened next. */
  interviews: number;
  /** Ever received an offer, whether or not it was taken. */
  offers: number;
};

export type DashboardSummary =
  | { kind: "unavailable" }
  | { kind: "empty" }
  | {
      kind: "ready";
      search: SearchSummary;
      attention: AttentionItem[];
      pipeline: PipelineStage[];
      week: WeekSummary;
      activity: ActivityEntry[];
    };

/**
 * Finds a conversion metric by the label analytics gives it.
 *
 * Reading the canonical summary rather than recounting from history is the
 * point: "reached an interview" is defined once, in `lib/analytics`, and the
 * dashboard presents that number rather than deriving a second one that could
 * drift from the analytics page a click away.
 */
function reached(
  conversions: readonly { label: string; reached: number }[],
  label: string,
): number {
  return conversions.find((metric) => metric.label === label)?.reached ?? 0;
}

/**
 * Everything the dashboard renders, from the two reads that feed it.
 *
 * Takes whole reads rather than rows so a failed query can never arrive as the
 * number zero. "Nothing needs your attention" and "we could not find out" are
 * different claims, and only the first is something to reassure a student with.
 *
 * Two populations, kept apart deliberately and matching what each page already
 * means by them. The **search summary** uses the analytics definitions over
 * every application, archived included, because a rejected role a student
 * tidied away is still part of what happened to them. The **working set** —
 * attention, pipeline — is active applications only, because those sections
 * answer "what do I do now" and a filed-away application is not on that list.
 * Neither semantic is changed here; both are borrowed.
 *
 * Pure, and given "today" and a zone rather than reading a clock, so every
 * rule below is reproducible in a test.
 */
export function buildDashboard(
  applicationsRead: DashboardRead<ApplicationListItem>,
  timelineRead: DashboardRead<ApplicationTimelineEvent>,
  today: string,
  timeZone: string,
): DashboardSummary {
  if (applicationsRead.error || timelineRead.error) return { kind: "unavailable" };

  // A successful read always returns an array. A missing one is an
  // inconsistent result, not evidence the student has nothing saved.
  if (!applicationsRead.data || !timelineRead.data) return { kind: "unavailable" };

  const applications = applicationsRead.data;
  if (applications.length === 0) return { kind: "empty" };

  // The one place timestamps become calendar days. Everything downstream
  // compares YYYY-MM-DD strings, so no comparison can shift a day.
  const events: DashboardEvent[] = timelineRead.data.map((event) => ({
    application_id: event.application_id,
    previous_status: event.previous_status,
    new_status: event.new_status,
    changedAt: event.changed_at,
    changedOn: dateOnlyFromTimestamp(event.changed_at, timeZone),
  }));

  const analytics = summarizeApplications(applications, timelineRead.data);

  return {
    kind: "ready",
    search: {
      submitted: analytics.everSubmitted,
      active: analytics.activeNow,
      interviews: reached(analytics.conversions, "Reached an interview"),
      offers: reached(analytics.conversions, "Received an offer"),
    },
    attention: needsAttention(
      applications,
      lastMovementByApplication(events),
      today,
    ),
    pipeline: pipelineSnapshot(applications),
    week: summarizeWeek(events, today),
    activity: recentActivity(events, applications),
  };
}
