import type { Metadata } from "next";
import { ArrowRight, ClipboardCheck, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
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
            <span className="grid size-12 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <ClipboardCheck aria-hidden="true" className="size-6" />
            </span>
            <h2 className="mt-5 text-xl font-semibold text-slate-950">
              Ready for your first application
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Add applications, track their status and deadlines, and see how
              your search is going. Everything here works on its own.
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
