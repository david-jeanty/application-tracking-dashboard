import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type AuthShellProps = {
  children: ReactNode;
  title: string;
  description: string;
  footer: ReactNode;
};

export function AuthShell({
  children,
  title,
  description,
  footer,
}: AuthShellProps) {
  return (
    <main className="relative grid min-h-screen bg-surface-muted lg:grid-cols-[minmax(0,1fr)_minmax(480px,0.8fr)]">
      <section className="hidden overflow-hidden bg-accent p-12 text-accent-foreground lg:flex lg:flex-col lg:justify-between">
        <Link
          className="flex w-fit items-center gap-3 text-lg font-semibold"
          href="/"
        >
          <span className="grid size-10 place-items-center rounded-record bg-surface/15">
            <BriefcaseBusiness aria-hidden="true" className="size-5" />
          </span>
          JobTrack
        </Link>
        <div className="max-w-xl pb-12">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent-foreground/75">
            Internship and co-op applications
          </p>
          <p className="mt-5 text-4xl font-semibold leading-tight">
            Keep your search organized and know what needs attention next.
          </p>
          <p className="mt-5 max-w-lg text-base leading-7 text-accent-foreground/85">
            A focused workspace for applications, deadlines, and status history.
            No spreadsheets required.
          </p>
        </div>
        <p className="text-sm text-accent-foreground/75">
          Built for students, one careful step at a time.
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link
            className="mb-8 flex w-fit items-center gap-2.5 text-lg font-semibold text-foreground lg:hidden"
            data-testid="mobile-brand"
            href="/"
          >
            <span className="grid size-9 place-items-center rounded-control bg-accent text-accent-foreground">
              <BriefcaseBusiness aria-hidden="true" className="size-5" />
            </span>
            JobTrack
          </Link>
          <Card className="p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-foreground-secondary">{description}</p>
            <div className="mt-7">{children}</div>
          </Card>
          <div className="mt-6 text-center text-sm text-foreground-secondary">{footer}</div>
        </div>
      </section>
    </main>
  );
}
