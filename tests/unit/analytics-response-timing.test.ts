import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
 * These are source-level assertions on purpose. A future refactor that helpfully
 * reintroduces the metric will fail here, and the failure will point at the
 * reasoning above rather than at a broken number nobody can see is wrong.
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

describe("analytics never turns an audit timestamp into a response time", () => {
  it("reads no status-history timestamp in any analytics module", () => {
    for (const file of [
      ...sourceFiles(ANALYTICS_DIRECTORY),
      ...sourceFiles(ANALYTICS_COMPONENTS),
    ]) {
      expect(
        withoutComments(file.source),
        `${file.name} refers to changed_at — see the comment in lib/analytics/activity.ts before adding a response-timing metric`,
      ).not.toMatch(/changed_at|changedAt/);
    }
  });

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
