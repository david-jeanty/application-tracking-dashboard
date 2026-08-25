import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  DashboardHeader,
  DashboardView,
} from "@/components/dashboard/dashboard-view";
import { Notice } from "@/components/ui/notice";
import {
  listApplications,
  listStatusTimeline,
} from "@/lib/applications/repository";
import { buildDashboard } from "@/lib/dashboard/summary";
import { todayInTimeZone } from "@/lib/dates/date-only";
import { DEFAULT_TIME_ZONE } from "@/lib/dates/time-zone";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

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
        <Notice heading="Your dashboard could not be loaded" tone="warning">
          Your applications are still safe. Refresh the page to try again.
        </Notice>
      </div>
    );
  }

  return <DashboardView dashboard={dashboard} today={today} />;
}
