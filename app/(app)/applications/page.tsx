import type { Metadata } from "next";
import { Suspense } from "react";
import { ApplicationCreatePanel } from "@/components/applications/application-form";
import {
  ApplicationList,
  ApplicationsListLoading,
} from "@/components/applications/application-list";

export const metadata: Metadata = { title: "Applications" };

export default function ApplicationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">Applications</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            Your applications
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Add applications and keep their current status, important dates, and
            next action in one place.
          </p>
        </div>
        <ApplicationCreatePanel />
      </div>

      <Suspense fallback={<ApplicationsListLoading />}>
        <ApplicationList />
      </Suspense>
    </div>
  );
}
