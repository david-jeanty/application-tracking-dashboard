import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeActivity } from "@/lib/analytics/activity";
import type { AnalyticsHistoryEvent } from "@/lib/analytics/calculate";
import { summarizeFunnel } from "@/lib/analytics/funnel";
import {
  summarizePerformance,
  type PerformanceApplication,
} from "@/lib/analytics/performance";
import { listStatusHistory } from "@/lib/applications/repository";

/**
 * Response timing is deliberately not implemented, and this is where that
 * decision is enforced rather than merely written down.
 *
 * `application_status_history.changed_at` is declared `timestamptz not null
 * default now()` and written by the `record_application_status_change()`
 * trigger. It records when **JobTrack** was told about a transition, not when an
 * **employer** acted. A student who backfills last term's search, saves an
 * application directly at `Interview`, or updates a rejection a fortnight after
 * reading the email produces a `changed_at` gap with no relationship to how fast
 * anybody replied.
 *
 * So "median employer response time", "time to interview", "usually responds
 * within X days" and a response-time histogram are all deferred until JobTrack
 * records trustworthy event-occurrence dates. Mixing `changed_at` with the
 * date-only `date_applied` is worse still: a timestamp the database generated
 * and a calendar day a student typed are not two ends of one interval.
 *
 * What follows guards that rule and only that rule. The invariant is not "the
 * string `changed_at` may never appear in this directory" — an audit timestamp
 * is legitimate for auditing, and a future "last updated" line or a
 * history-ordering fix has no quarrel with anything above. The invariant is
 * that no analytics number is a duration derived from one. So the tests below
 * pin the projection that would have to widen first, the arithmetic that would
 * have to appear, the copy that would have to make the claim, and — the part
 * that cannot be worked around by renaming a variable — the fact that feeding
 * timestamps in changes no output.
 */

const ANALYTICS_DIRECTORY = join(process.cwd(), "lib/analytics");
const ANALYTICS_COMPONENTS = join(process.cwd(), "components/analytics");

function sourceFiles(directory: string): { name: string; source: string }[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
    .map((name) => ({
      name,
      source: readFileSync(join(directory, name), "utf8"),
    }));
}

/** Comments are where the decision is explained, so they are not evidence of it. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const APPLICATIONS = [
  { id: "a", application_source: "LinkedIn", normalized_job_category: "Finance" },
  { id: "b", application_source: "LinkedIn", normalized_job_category: "Finance" },
  { id: "c", application_source: "Referral", normalized_job_category: "Marketing" },
] satisfies PerformanceApplication[];

const HISTORY: AnalyticsHistoryEvent[] = [
  { application_id: "a", new_status: "Applied" },
  { application_id: "a", new_status: "Interview" },
  { application_id: "b", new_status: "Applied" },
  { application_id: "b", new_status: "Rejected" },
  { application_id: "c", new_status: "Applied" },
];

const DATED = [
  { id: "a", date_applied: "2026-08-03" },
  { id: "b", date_applied: "2026-08-04" },
  { id: "c", date_applied: "2026-08-11" },
];

const TODAY = "2026-08-14";

describe("analytics never turns an audit timestamp into a response time", () => {
  it("keeps the history projection to the two columns set membership needs", () => {
    const calls: unknown[][] = [];
    const client = {
      from: () => client,
      select: (...args: unknown[]) => {
        calls.push(args);
        return client;
      },
      eq: () => client,
      returns: () => ({ data: [], error: null }),
    } as never;

    listStatusHistory(client, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    // Widening this projection is how a duration metric becomes possible in the
    // first place. `listStatusTimeline` exists separately, for the dashboard,
    // precisely so analytics never receives a timestamp it did not ask for.
    expect(calls[0][0]).toBe("application_id,new_status");
  });

  it("produces identical results when history events carry timestamps anyway", () => {
    // The projection above is a promise about a query, and a promise about a
    // query is one refactor from being kept in the letter only. This is the
    // same assertion made where it cannot be renamed around: hand every
    // calculation a `changed_at` — spread weeks apart, deliberately unordered,
    // shaped exactly like an interval someone might be tempted to measure —
    // and every number has to come back unchanged.
    const timestamped = HISTORY.map((event, index) => ({
      ...event,
      changed_at: `2026-0${index % 2 === 0 ? 3 : 9}-1${index}T0${index}:00:00Z`,
    }));

    expect(summarizeFunnel(APPLICATIONS, timestamped)).toEqual(
      summarizeFunnel(APPLICATIONS, HISTORY),
    );
    expect(summarizePerformance(APPLICATIONS, timestamped, "source")).toEqual(
      summarizePerformance(APPLICATIONS, HISTORY, "source"),
    );
    expect(summarizePerformance(APPLICATIONS, timestamped, "role")).toEqual(
      summarizePerformance(APPLICATIONS, HISTORY, "role"),
    );
    expect(summarizeActivity(DATED, timestamped, TODAY)).toEqual(
      summarizeActivity(DATED, HISTORY, TODAY),
    );
  });

  it("buckets search activity by the date the student recorded, not by any timestamp", () => {
    // `b` is submitted in the week of the 3rd. A `changed_at` in a different
    // week is exactly the input that would move the point if the chart had
    // quietly changed which date it trusts.
    const misleading = HISTORY.map((event) => ({
      ...event,
      changed_at: "2026-07-06T12:00:00Z",
    }));

    const summary = summarizeActivity(DATED, misleading, TODAY);
    const counts = new Map(
      summary.weeks.map((week) => [week.weekStart, week.count]),
    );

    expect(counts.get("2026-08-03")).toBe(2);
    expect(counts.get("2026-08-10")).toBe(1);
    expect(counts.get("2026-07-06")).toBe(0);
  });

  it("derives no duration from a status-history timestamp", () => {
    // Narrow on purpose: referring to an audit timestamp is allowed, doing
    // arithmetic on one is not. A module may name `changed_at` — to order
    // history, to show when a record was last touched — but the moment it
    // parses one into a Date, subtracts, or reaches for the vocabulary of
    // elapsed time, it is building the metric this file exists to defer.
    const duration =
      /new Date|Date\.parse|getTime|valueOf\(\)|differenceIn|daysBetween|duration|elapsed|since/i;

    for (const file of [
      ...sourceFiles(ANALYTICS_DIRECTORY),
      ...sourceFiles(ANALYTICS_COMPONENTS),
    ]) {
      const source = withoutComments(file.source);
      if (!/changed_at|changedAt/.test(source)) continue;

      expect(
        source,
        `${file.name} does date arithmetic near a status-history timestamp — see the comment in lib/analytics/activity.ts before adding a response-timing metric`,
      ).not.toMatch(duration);
    }
  });

  it("states no duration, wait, or response-speed claim in the analytics copy", () => {
    const forbidden =
      /responds? (?:in|within)|response time|time to (?:interview|respond|hear)|days to|average wait|typically hears?/i;

    for (const file of sourceFiles(ANALYTICS_COMPONENTS)) {
      expect(file.source, `${file.name} makes a response-timing claim`).not.toMatch(
        forbidden,
      );
    }
  });

  it("documents why, so the decision survives the next refactor", () => {
    const activity = readFileSync(
      join(ANALYTICS_DIRECTORY, "activity.ts"),
      "utf8",
    );

    expect(activity).toMatch(/changed_at/);
    expect(activity).toMatch(/audit|recorded/i);
    expect(activity).toMatch(/date_applied/);
  });
});
