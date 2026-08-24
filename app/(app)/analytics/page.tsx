import type { Metadata } from "next";
import { AlertCircle, BarChart3 } from "lucide-react";
import { redirect } from "next/navigation";
import {
  MetricBars,
  MetricPanel,
  NotEnoughData,
  StatTile,
  type MetricRow,
} from "@/components/analytics/metric-display";
import { SourcePerformance } from "@/components/analytics/source-performance";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { summarizeApplications } from "@/lib/analytics/calculate";
import { summarizeSourcePerformance } from "@/lib/analytics/sources";
import {
  listApplicationsForAnalytics,
  listStatusHistory,
} from "@/lib/applications/repository";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Analytics" };

/** Bars are drawn against the largest row, so the tallest one fills the width. */
function toCountRows(
  entries: readonly { label: string; count: number }[],
): MetricRow[] {
  const widest = Math.max(...entries.map((entry) => entry.count), 1);

  return entries.map((entry) => ({
    label: entry.label,
    valueLabel: String(entry.count),
    percent: (entry.count / widest) * 100,
  }));
}

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Two owner-scoped reads for the whole page, and neither grows with the
  // number of sections: every figure below is an aggregate over these same two
  // results. Analytics covers every application the student has saved,
  // archived ones included, because a role they tidied away still happened and
  // dropping it would inflate every rate.
  const [applications, history] = await Promise.all([
    listApplicationsForAnalytics(supabase, user.id),
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

  const rows = applications.data ?? [];
  const events = history.data ?? [];
  const summary = summarizeApplications(rows, events);
  const sources = summarizeSourcePerformance(rows, events);

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

  const hasSubmitted = summary.everSubmitted > 0;
  const submittedNoun =
    summary.everSubmitted === 1 ? "application" : "applications";

  /*
    The funnel, as one table with a visible denominator.

    The first row is `Submitted` at 100%, and every row below is a share of
    that same number — the same denominator the metrics module already uses.
    These are not stage-to-stage conversions: `Reached an interview` is a share
    of everything submitted, not a share of the applications that got a
    response. Making the base a row rather than a sentence is what keeps that
    readable at a glance.
  */
  const funnelRows: MetricRow[] = [
    {
      label: "Submitted",
      valueLabel: String(summary.everSubmitted),
      detailLabel: "100%",
      percent: 100,
      isBaseline: true,
    },
    ...summary.conversions.map((metric) => ({
      label: metric.label,
      valueLabel: String(metric.reached),
      detailLabel: `${metric.percent}%`,
      percent: metric.percent,
    })),
  ];

  return (
    <div className="space-y-6">
      <AnalyticsHeader />

      <section aria-labelledby="analytics-overview">
        <h2
          className="text-base font-semibold text-slate-950"
          id="analytics-overview"
        >
          Search overview
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

      <section aria-labelledby="analytics-funnel">
        <MetricPanel
          description={
            hasSubmitted
              ? `Every share below is out of the same ${summary.everSubmitted} submitted ${submittedNoun}, counted from status history — an interview that later became a rejection still counts as an interview.`
              : "Counted from status history, out of every application you have submitted."
          }
          title="How far applications got"
          titleId="analytics-funnel"
        >
          {hasSubmitted ? (
            <MetricBars
              caption="Applications that ever reached each stage, as a count and as a share of everything submitted"
              detailHeading="Share of submitted applications"
              rows={funnelRows}
              valueHeading="Applications"
            />
          ) : (
            <NotEnoughData>
              Nothing has been submitted yet, so there is nothing to measure
              here. These figures appear once an application reaches Applied.
            </NotEnoughData>
          )}
        </MetricPanel>
      </section>

      <section aria-labelledby="analytics-sources">
        <MetricPanel
          description="Only applications you actually submitted are counted, so a job saved and never sent does not affect a source's rate. Interview rate is interviews out of that source's submitted applications."
          title="Source performance"
          titleId="analytics-sources"
        >
          {sources.length ? (
            <SourcePerformance rows={sources} />
          ) : (
            <NotEnoughData>
              Nothing has been submitted yet. Sources appear here once an
              application you saved from one reaches Applied.
            </NotEnoughData>
          )}
        </MetricPanel>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="analytics-status">
          <MetricPanel
            description="Where every saved application stands today, archived ones included. These are current states, not conversion rates."
            title="Current status"
            titleId="analytics-status"
          >
            <MetricBars
              caption="Number of applications at each current status"
              rows={toCountRows(summary.statusCounts)}
              valueHeading="Applications"
            />
          </MetricPanel>
        </section>

        <section aria-labelledby="analytics-categories">
          <MetricPanel
            description="Every saved application, grouped by its normalized category. Categories you have never used are left out."
            title="Categories"
            titleId="analytics-categories"
          >
            <MetricBars
              caption="Number of applications in each category"
              rows={toCountRows(summary.categoryCounts)}
              valueHeading="Applications"
            />
          </MetricPanel>
        </section>
      </div>
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
