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
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-foreground-secondary">
          {description}
        </p>
      </header>

      <Card className="grid min-h-80 place-items-center p-8 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid size-12 place-items-center rounded-surface bg-accent-soft text-accent">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <h2 className="mt-5 text-base font-semibold text-foreground">
            Foundation ready
          </h2>
          <p className="mt-2 text-sm leading-6 text-foreground-secondary">
            This route is protected and ready for {plannedFor}. No sample records
            or simulated functionality are shown.
          </p>
        </div>
      </Card>
    </div>
  );
}
