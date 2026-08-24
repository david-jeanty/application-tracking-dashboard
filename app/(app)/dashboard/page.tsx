import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";
import { redirect } from "next/navigation";
import {
  PipelineSnapshot,
  RecentActivity,
  SearchSummaryMetrics,
  ThisWeek,
  Upcoming,
} from "@/components/dashboard/dashboard-sections";
import { ButtonLink } from "@/components/ui/button";
import {
  listApplications,
  listStatusTimeline,
} from "@/lib/applications/repository";
import { buildDashboard } from "@/lib/dashboard/summary";
import { formatDateOnly, todayInTimeZone } from "@/lib/dates/date-only";
import { DEFAULT_TIME_ZONE } from "@/lib/dates/time-zone";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The page title, with today's date sitting quietly opposite it.
 *
 * The date is there because every section below is relative to it — "this
 * week", "tomorrow", "overdue by two days" all resolve against one day, and
 * saying which one costs a line of grey text. It is text on the page, not a
 * badge.
 */
function DashboardHeader({ today }: { today: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h1 className="text-[34px] font-medium leading-tight tracking-tight text-foreground sm:text-[38px]">
        Dashboard
      </h1>
      <p className="shrink-0 text-[13px] text-foreground-muted">
        {formatDateOnly(today)}
      </p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Both reads are owner-scoped by the server-derived user id, with row-level
  // security applying again underneath. Every application is read, archived
  // ones included, because the search summary uses the analytics definitions —
  // the sections that describe what is in flight filter to active records
  // themselves rather than making a second, narrower query.
  const [applications, timeline] = await Promise.all([
    listApplications(supabase, user.id, { archiveState: "all" }),
    listStatusTimeline(supabase, user.id),
  ]);

  // "Today" is resolved once, here, and passed down. Every rule below compares
  // calendar strings, so no calculation can shift a day across a zone.
  const today = todayInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  const dashboard = buildDashboard(
    applications,
    timeline,
    today,
    DEFAULT_TIME_ZONE,
  );

  if (dashboard.kind === "unavailable") {
    return (
      <div className="space-y-8">
        <DashboardHeader today={today} />
        {/*
          A failed read is never reported as zeros. Four zeros would be a claim
          about the student's search, and it is only true when the query
          actually succeeded. No database detail is shown.
        */}
        <div
          className="flex gap-3 border border-warning/30 bg-warning-soft p-4 text-warning"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <h2 className="text-[15px] font-medium">
              Your dashboard could not be loaded
            </h2>
            <p className="mt-1 text-[13px] leading-6">
              Your applications are still safe. Refresh the page to try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (dashboard.kind === "empty") {
    return (
      <div className="space-y-8">
        <DashboardHeader today={today} />
        <section aria-labelledby="dashboard-empty">
          <div className="border-b border-border pb-2">
            <h2
              className="text-[17px] font-medium text-foreground"
              id="dashboard-empty"
            >
              Your search
            </h2>
          </div>
          <p className="pt-6 text-[16px] text-foreground">No applications yet.</p>
          <p className="mt-1.5 max-w-md text-[14px] leading-6 text-foreground-secondary">
            Save your first application and JobTrack will show your search
            overview, pipeline, recent activity, and upcoming dates here.
          </p>
          <div className="mt-5">
            <ButtonLink href="/applications">Add application</ButtonLink>
          </div>
        </section>
      </div>
    );
  }

  const { search } = dashboard;

  return (
    <div className="space-y-10">
      <DashboardHeader today={today} />

      <section aria-labelledby="dashboard-summary">
        <div className="border-b border-border pb-2">
          <h2
            className="text-[17px] font-medium text-foreground"
            id="dashboard-summary"
          >
            Your search
          </h2>
        </div>
        <SearchSummaryMetrics
          metrics={[
            { label: "Applications", value: search.applications },
            { label: "Submitted", value: search.submitted },
            { label: "Interviews", value: search.interviews },
            { label: "Offers", value: search.offers },
          ]}
        />
      </section>

      <PipelineSnapshot stages={dashboard.pipeline} />

      <RecentActivity entries={dashboard.activity} today={today} />

      <ThisWeek
        week={dashboard.week}
        weekStartLabel={formatDateOnly(dashboard.week.weekStart)}
      />

      {/*
        Conditional, and the page simply ends above it when there is nothing.
        A dashboard that congratulates somebody for having nothing due has made
        itself the point; this section is a utility, not the reason to visit.
      */}
      {dashboard.attention.length > 0 ? (
        <Upcoming items={dashboard.attention} />
      ) : null}
    </div>
  );
}
