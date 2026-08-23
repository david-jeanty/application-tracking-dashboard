/**
 * What the dashboard says about the applications a student is tracking.
 *
 * "Tracked" here counts rows that are not archived — the same population the
 * applications list shows. It deliberately does not reuse the analytics
 * `ACTIVE_STATUSES` definition, which means something different: an
 * application whose *status* is between Applied and Interview. A saved-but-not-
 * submitted application is tracked, but is not active in the analytics sense.
 *
 * This takes the whole read rather than a count so that a failed query cannot
 * reach the page as the number zero. "No applications yet" is a claim about
 * the student's data, and it is only true when the query actually succeeded
 * and came back empty.
 */
export type DashboardApplicationSummary =
  | { kind: "unavailable" }
  | { kind: "first-application" }
  | { kind: "tracking"; count: number; description: string };

/** The shape the repository returns, narrowed to what this decision needs. */
export type TrackedApplicationsRead = {
  data: readonly unknown[] | null;
  error: unknown;
};

export function summarizeTrackedApplications(
  read: TrackedApplicationsRead,
): DashboardApplicationSummary {
  // A failed read tells us nothing about how many applications exist.
  if (read.error) return { kind: "unavailable" };

  // A successful read always returns rows, so a missing array is an
  // inconsistent result rather than an empty tracker. Report it as unknown
  // instead of asserting the student has nothing saved.
  if (!read.data) return { kind: "unavailable" };

  const count = read.data.length;
  if (count < 1) return { kind: "first-application" };

  return {
    kind: "tracking",
    count,
    description: `${count} application${count === 1 ? "" : "s"} currently tracked`,
  };
}
