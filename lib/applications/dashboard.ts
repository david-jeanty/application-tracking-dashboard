/**
 * What the dashboard says about the applications a student is tracking.
 *
 * "Tracked" here counts rows that are not archived — the same population the
 * applications list shows. It deliberately does not reuse the analytics
 * `ACTIVE_STATUSES` definition, which means something different: an
 * application whose *status* is between Applied and Interview. A saved-but-not-
 * submitted application is tracked, but is not active in the analytics sense.
 */
export type DashboardApplicationSummary =
  | { kind: "first-application" }
  | { kind: "tracking"; count: number; description: string };

export function summarizeTrackedApplications(
  count: number,
): DashboardApplicationSummary {
  if (count < 1) return { kind: "first-application" };

  return {
    kind: "tracking",
    count,
    description: `${count} application${count === 1 ? "" : "s"} currently tracked`,
  };
}
