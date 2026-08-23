import type { Metadata } from "next";
import { AlertCircle, BarChart3 } from "lucide-react";
import { redirect } from "next/navigation";
import {
  MetricBars,
  MetricPanel,
  StatTile,
  type MetricRow,
} from "@/components/analytics/metric-display";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { summarizeApplications } from "@/lib/analytics/calculate";
import {
  listApplications,
  listStatusHistory,
} from "@/lib/applications/repository";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Both reads are owner-scoped, and analytics covers every application the
  // student has saved — archived ones included, because a role they tidied
  // away still happened and dropping it would inflate every rate.
  const [applications, history] = await Promise.all([
    listApplications(supabase, user.id, { archiveState: "all" }),
    listStatusHistory(supabase, user.id),
  ]);

  if (applications.error || history.error) {
    return (
      <div className="space-y-6">
        <AnalyticsHeader />
        <Card className="flex gap-3 border-red-200 bg-red-50 p-5 text-red-900">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <h2 className="font-semibold">Analytics could not be loaded</h2>
            <p className="mt-1 text-sm">
              Refresh the page to try again. If the problem continues, check the
              database connection.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const summary = summarizeApplications(
    applications.data ?? [],
    history.data ?? [],
  );

  if (summary.totalSaved === 0) {
    return (
      <div className="space-y-6">
        <AnalyticsHeader />
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">
            <BarChart3 aria-hidden="true" className="size-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-950">
            Nothing to measure yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            Save your first application and these numbers will describe your own
            search — never sample data.
          </p>
          <div className="mt-5">
            <ButtonLink href="/applications">Go to applications</ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  const maximumStatusCount = Math.max(
    ...summary.statusCounts.map((entry) => entry.count),
    1,
  );
  const maximumCategoryCount = Math.max(
    ...summary.categoryCounts.map((entry) => entry.count),
    1,
  );

  const statusRows: MetricRow[] = summary.statusCounts.map((entry) => ({
    label: entry.label,
    valueLabel: String(entry.count),
    percent: (entry.count / maximumStatusCount) * 100,
  }));

  const categoryRows: MetricRow[] = summary.categoryCounts.map((entry) => ({
    label: entry.label,
    valueLabel: String(entry.count),
    percent: (entry.count / maximumCategoryCount) * 100,
  }));

  const conversionRows: MetricRow[] = summary.conversions.map((metric) => ({
    label: metric.label,
    valueLabel: `${metric.percent}%`,
    percent: metric.percent,
  }));

  return (
    <div className="space-y-6">
      <AnalyticsHeader />

      <section aria-labelledby="analytics-current">
        <h2
          className="text-base font-semibold text-slate-950"
          id="analytics-current"
        >
          Where things stand
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            context="Everything you have saved"
            label="Applications saved"
            value={summary.totalSaved}
          />
          <StatTile
            context="Sent to an employer at some point"
            label="Submitted"
            value={summary.everSubmitted}
          />
          <StatTile
            context="Applied, screening, assessment, or interview"
            label="Active now"
            value={summary.activeNow}
          />
          <StatTile
            context="Saved but not sent anywhere yet"
            label="Not yet submitted"
            value={summary.notYetSubmitted}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <MetricPanel
          description={`Out of ${summary.everSubmitted} submitted ${
            summary.everSubmitted === 1 ? "application" : "applications"
          }, counted from status history — an interview that later became a rejection still counts as an interview.`}
          title="How far applications got"
        >
          <MetricBars
            caption="Share of submitted applications that ever reached each stage"
            rows={conversionRows}
            valueHeading="Share of submitted applications"
          />
        </MetricPanel>

        <MetricPanel
          description="Current status of every saved application, including archived ones."
          title="Current status"
        >
          <MetricBars
            caption="Number of applications at each current status"
            rows={statusRows}
            valueHeading="Applications"
          />
        </MetricPanel>
      </div>

      <MetricPanel
        description="Every saved application, grouped by its normalized category."
        title="Categories"
      >
        <MetricBars
          caption="Number of applications in each category"
          rows={categoryRows}
          valueHeading="Applications"
        />
      </MetricPanel>
    </div>
  );
}

function AnalyticsHeader() {
  return (
    <header>
      <p className="text-sm font-semibold text-blue-700">Analytics</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
        Your search, measured
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        Calculated from your own applications and their recorded status history.
        Current counts describe where things stand today; the conversion figures
        describe what happened across the whole search.
      </p>
    </header>
  );
}
