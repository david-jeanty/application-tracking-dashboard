import type { Metadata } from "next";
import { AlertCircle, ArrowRight, ClipboardCheck, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import {
  AnalyticsLink,
  NeedsAttention,
  PipelineSnapshot,
  RecentActivity,
  SummaryTile,
  ThisWeek,
} from "@/components/dashboard/dashboard-sections";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  listApplications,
  listStatusTimeline,
} from "@/lib/applications/repository";
import { buildDashboard } from "@/lib/dashboard/summary";
import { formatDateOnly, todayInTimeZone } from "@/lib/dates/date-only";
import { DEFAULT_TIME_ZONE } from "@/lib/dates/time-zone";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

function DashboardHeader() {
  return (
    <header>
      <p className="text-sm font-semibold text-blue-700">Your workspace</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
        Dashboard
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
        What needs your attention today, and how the search is moving.
      </p>
    </header>
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
  // the sections that answer "what do I do now" filter to active records
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
      <div className="space-y-6">
        <DashboardHeader />
        {/*
          A failed read is never reported as zeros. "Nothing needs your
          attention" is a claim about the student's data, and it is only true
          when the query actually succeeded. No database detail is shown.
        */}
        <Card className="flex gap-3 border-amber-200 bg-amber-50 p-5 text-amber-900">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <h2 className="font-semibold">
              Couldn&rsquo;t load your dashboard
            </h2>
            <p className="mt-1 text-sm leading-6">
              Your applications are still safe. Refresh the page to try again.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (dashboard.kind === "empty") {
    return (
      <div className="space-y-6">
        <DashboardHeader />
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">
            <ClipboardCheck aria-hidden="true" className="size-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-950">
            Ready for your first application
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            Save one and this page starts answering what needs your attention —
            follow-ups, deadlines, and applications that have gone quiet.
          </p>
          <div className="mt-5">
            <ButtonLink href="/applications">Add your first application</ButtonLink>
          </div>
        </Card>
        <AssistantCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardHeader />

      <section aria-labelledby="dashboard-summary">
        <h2 className="sr-only" id="dashboard-summary">
          Search summary
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryTile
            context="Sent to an employer at some point"
            label="Submitted"
            value={dashboard.search.submitted}
          />
          <SummaryTile
            context="Applied, screening, assessment, or interview"
            label="Active"
            value={dashboard.search.active}
          />
          <SummaryTile
            context="Ever reached an interview"
            label="Interviews"
            value={dashboard.search.interviews}
          />
          <SummaryTile
            context="Whether or not you took them"
            label="Offers"
            value={dashboard.search.offers}
          />
        </div>
      </section>

      <section aria-labelledby="dashboard-attention">
        <h2
          className="text-base font-semibold text-slate-950"
          id="dashboard-attention"
        >
          Needs attention
        </h2>
        <div className="mt-3">
          <NeedsAttention items={dashboard.attention} />
        </div>
      </section>

      <section aria-labelledby="dashboard-pipeline">
        <PipelineSnapshot stages={dashboard.pipeline} />
      </section>

      {/* items-start so the shorter card keeps its own height instead of
          stretching into a tall box holding three numbers. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="dashboard-week">
          <ThisWeek
            week={dashboard.week}
            weekStartLabel={formatDateOnly(dashboard.week.weekStart)}
          />
        </section>
        <section aria-labelledby="dashboard-activity">
          <RecentActivity entries={dashboard.activity} today={today} />
        </section>
      </div>

      <AnalyticsLink />
      <AssistantCard />
    </div>
  );
}

/** The optional MCP connection, kept below the working sections. */
function AssistantCard() {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-950">
            Use JobTrack with your AI assistant
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
            Already using an assistant to read job postings? Let it save and
            update applications for you instead of retyping them. Optional, and
            JobTrack never charges you for AI.
          </p>
        </div>
      </div>
      <ButtonLink className="shrink-0" href="/settings" variant="secondary">
        Set up the connection
        <ArrowRight aria-hidden="true" className="size-4" />
      </ButtonLink>
    </Card>
  );
}
