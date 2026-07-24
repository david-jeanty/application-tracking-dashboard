import type { Metadata } from "next";
import { ArrowRight, ClipboardCheck } from "lucide-react";
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
          The secure foundation is ready. Application tracking and real dashboard
          summaries arrive in the next implementation phases.
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
              Phase 1 establishes authentication, protected data ownership, and
              the responsive workspace. Application entry is deliberately deferred
              to Phase 2.
            </p>
          </div>
          <div
            aria-label="Next planned step"
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
          >
            Phase 2: application management
            <ArrowRight aria-hidden="true" className="size-4 text-blue-700" />
          </div>
        </div>
      </Card>
    </div>
  );
}
