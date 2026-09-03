import type { Metadata } from "next";
import { headers } from "next/headers";
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
import { withTransientReadRetry } from "@/lib/dashboard/reads";
import { buildDashboard } from "@/lib/dashboard/summary";
import { todayInTimeZone } from "@/lib/dates/date-only";
import { DEFAULT_TIME_ZONE } from "@/lib/dates/time-zone";
import { publicAuthRoutes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const DASHBOARD_PATH = "/dashboard";

/**
 * Best-effort signal that this request is the first dashboard load right
 * after signing in — the `Referer` header naming the login or signup page.
 * Never more than that: a missing or unparsable header, or any other
 * referrer, is reported as "unknown" or "no" rather than guessed at, and
 * nothing here reads a cookie, a token, or anything about the visitor.
 */
async function likelyFirstLoadAfterSignIn(): Promise<boolean | null> {
  const referer = (await headers()).get("referer");
  if (!referer) return null;

  try {
    const path = new URL(referer).pathname;
    return (publicAuthRoutes as readonly string[]).includes(path);
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const firstLoad = await likelyFirstLoadAfterSignIn();
  // Temporary incident instrumentation: ties the two reads' failure log
  // lines (see `lib/dashboard/reads`) back to the same page load, and gives
  // whoever is reading Vercel's runtime logs an exact string to search for.
  // Carries no relationship to the session or the user — safe to delete once
  // the incident this was added for is closed.
  const requestId = crypto.randomUUID();

  // Both reads are owner-scoped by the server-derived user id, with row-level
  // security applying again underneath. Every application is read, archived
  // ones included, because the search summary uses the analytics definitions —
  // the sections that describe what is in flight filter to active records
  // themselves rather than making a second, narrower query.
  //
  // Each read carries its own small bounded retry (see `lib/dashboard/reads`)
  // for the one class of failure a moment actually fixes: the database or its
  // API not yet ready to answer. A permission or session failure is never
  // retried, and comes back exactly as issued.
  const [applications, timeline] = await Promise.all([
    withTransientReadRetry("applications", DASHBOARD_PATH, firstLoad, requestId, () =>
      listApplications(supabase, user.id, { archiveState: "all" }),
    ),
    withTransientReadRetry("statusTimeline", DASHBOARD_PATH, firstLoad, requestId, () =>
      listStatusTimeline(supabase, user.id),
    ),
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
