import { DashboardView } from "@/components/dashboard/dashboard-view";
import { buildDashboard } from "@/lib/dashboard/summary";
import { DEFAULT_TIME_ZONE } from "@/lib/dates/time-zone";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { DEMO_BASE_PATH } from "@/lib/demo/paths";
import { demoToday } from "@/lib/demo/today";

export const metadata = { title: "Dashboard" };

/**
 * The demo dashboard.
 *
 * `/demo` rather than `/demo/dashboard`: a visitor who followed "Try the demo"
 * has already arrived somewhere, and a second name for it would only be a
 * redirect to explain.
 *
 * Every figure below comes out of `buildDashboard` — the same function the
 * authenticated dashboard calls, given the same shapes. Nothing on this page
 * is a number written by hand, which is why the demo cannot quietly claim a
 * conversion rate the real product would not produce from the same records.
 */
export default function DemoDashboardPage() {
  const today = demoToday();
  const demo = buildDemoDataset(today);

  const dashboard = buildDashboard(
    { data: demo.applications, error: null },
    { data: demo.timeline, error: null },
    today,
    DEFAULT_TIME_ZONE,
  );

  // The fixture always has applications, so neither the empty nor the
  // unavailable branch can be reached. Narrowing rather than asserting keeps
  // that a fact the type system checks instead of a comment.
  if (dashboard.kind === "unavailable") return null;

  return (
    <DashboardView
      basePath={DEMO_BASE_PATH}
      dashboard={dashboard}
      today={today}
    />
  );
}
