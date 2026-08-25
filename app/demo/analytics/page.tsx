import { AnalyticsView } from "@/components/analytics/analytics-view";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { demoToday } from "@/lib/demo/today";

export const metadata = { title: "Analytics" };

/**
 * The demo analytics page.
 *
 * `AnalyticsView` unchanged, given the fixture's rows and events. Every funnel
 * count, every narrowing sentence, every source and role-type comparison and
 * the activity chart are produced by the production calculations from the
 * sample records — there is not one hardcoded figure on this page, and there is
 * no demo-specific analytics component for one to hide in.
 */
export default function DemoAnalyticsPage() {
  const today = demoToday();
  const demo = buildDemoDataset(today);

  return (
    <AnalyticsView
      events={demo.statusEvents}
      rows={demo.analyticsRows}
      today={today}
    />
  );
}
