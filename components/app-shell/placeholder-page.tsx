import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";

type PlaceholderPageProps = {
  title: string;
  description: string;
  plannedFor: string;
  icon?: LucideIcon;
};

export function PlaceholderPage({
  title,
  description,
  plannedFor,
  icon: Icon = Construction,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-blue-700">Application Tracker</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
          {description}
        </p>
      </header>

      <Card className="grid min-h-80 place-items-center p-8 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-700">
            <Icon aria-hidden="true" className="size-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-slate-950">
            Foundation ready
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This route is protected and ready for {plannedFor}. No sample records
            or simulated functionality are shown.
          </p>
        </div>
      </Card>
    </div>
  );
}
