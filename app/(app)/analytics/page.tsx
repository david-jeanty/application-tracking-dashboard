import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";
import { redirect } from "next/navigation";
import {
  AnalyticsHeader,
  AnalyticsView,
} from "@/components/analytics/analytics-view";
import {
  listApplicationsForAnalytics,
  listStatusHistory,
} from "@/lib/applications/repository";
import { todayInTimeZone } from "@/lib/dates/date-only";
import { DEFAULT_TIME_ZONE } from "@/lib/dates/time-zone";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Analytics" };

/**
 * Analytics answers one question, and it is not the dashboard's.
 *
 * The dashboard says where a search stands right now — what is in flight, what
 * is due, what moved this week. This page says what *converted*: how far
 * applications got, where the funnel narrowed, which sources and role types the
 * submitted applications came from, and what the rhythm of the search has
 * looked like. Nothing here is a second copy of a current-state count, which is
 * why the old search-overview tiles, the current-status chart and the raw
 * category counts are gone from this page. Their calculations are untouched:
 * `summarizeApplications()` still produces every one of them and the dashboard
 * still reads it.
 *
 * The page itself does only what a page can do — authenticate, read, and report
 * a failed read. Everything below that lives in `AnalyticsView`, which is pure
 * given its rows, events and `today`.
 */
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
      <div className="space-y-8">
        <AnalyticsHeader />
        {/*
          A failed read is never reported as zeros. An empty funnel is a claim
          about the student's search, and it is only true when the query
          actually succeeded. No database detail reaches the page: what went
          wrong underneath is not something a student can act on, and "check the
          database connection" is implementation language wearing a user
          interface.
        */}
        <div
          className="flex gap-3 border border-warning/30 bg-warning-soft p-4 text-warning"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <h2 className="text-[15px] font-medium">
              Analytics could not be loaded
            </h2>
            <p className="mt-1 text-[13px] leading-6">
              Your applications are still safe. Refresh the page to try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AnalyticsView
      events={history.data ?? []}
      rows={applications.data ?? []}
      // Resolved once, here, so every week boundary below is a comparison
      // between calendar strings and no calculation can shift a day across a
      // zone.
      today={todayInTimeZone(new Date(), DEFAULT_TIME_ZONE)}
    />
  );
}
