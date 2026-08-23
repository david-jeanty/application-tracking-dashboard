import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowRight, ClipboardCheck, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  summarizeTrackedApplications,
  type DashboardApplicationSummary,
} from "@/lib/applications/dashboard";
import { listActiveApplications } from "@/lib/applications/repository";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The headline card's content for each state.
 *
 * The unavailable case says only that the read failed and that nothing was
 * lost — no database code, message, or query detail reaches the student.
 */
function headlineCard(summary: DashboardApplicationSummary) {
  switch (summary.kind) {
    case "tracking":
      return {
        Icon: ClipboardCheck,
        tone: "bg-blue-50 text-blue-700",
        heading: "Your applications",
        body: summary.description,
      };
    case "unavailable":
      return {
        Icon: AlertCircle,
        tone: "bg-amber-50 text-amber-700",
        heading: "Couldn't load your applications",
        body: "Your applications are still safe. Try refreshing the page.",
      };
    case "first-application":
      return {
        Icon: ClipboardCheck,
        tone: "bg-blue-50 text-blue-700",
        heading: "Ready for your first application",
        body: "Add applications, track their status and deadlines, and see how your search is going. Everything here works on its own.",
      };
  }
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Owner-scoped by the server-derived user id, with row-level security
  // applying again underneath — the same read the applications list performs.
  // The whole result is handed over so a failure cannot arrive as a count of
  // zero; the database error itself is never rendered.
  const summary = summarizeTrackedApplications(
    await listActiveApplications(supabase, user.id),
  );
  const headline = headlineCard(summary);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-blue-700">Your workspace</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          Application dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
          Track every application in one place, and connect the AI assistant you
          already use if you want it to do the typing.
        </p>
      </header>

      <Card className="overflow-hidden">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <span
              className={cn(
                "grid size-12 place-items-center rounded-xl",
                headline.tone,
              )}
            >
              <headline.Icon aria-hidden="true" className="size-6" />
            </span>
            <h2 className="mt-5 text-xl font-semibold text-slate-950">
              {headline.heading}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              {headline.body}
            </p>
          </div>
          <ButtonLink href="/applications" variant="secondary">
            Go to your applications
            <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-slate-950">
            Use JobTrack with your AI assistant
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
            Already using an assistant to read job postings? Let it save and
            update applications for you instead of retyping them. Optional, and
            JobTrack never charges you for AI.
          </p>
        </div>
        <ButtonLink
          className="shrink-0"
          href="/settings"
          variant="secondary"
        >
          Set up the connection
        </ButtonLink>
      </Card>
    </div>
  );
}
