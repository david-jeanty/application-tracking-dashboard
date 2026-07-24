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
    <main className="relative grid min-h-screen bg-slate-50 lg:grid-cols-[minmax(0,1fr)_minmax(480px,0.8fr)]">
      <section className="hidden overflow-hidden bg-blue-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link
          className="flex w-fit items-center gap-3 text-lg font-semibold"
          href="/"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-white/15">
            <BriefcaseBusiness aria-hidden="true" className="size-5" />
          </span>
          JobTrack
        </Link>
        <div className="max-w-xl pb-12">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-200">
            Internship and co-op applications
          </p>
          <p className="mt-5 text-4xl font-semibold leading-tight">
            Keep your search organized and know what needs attention next.
          </p>
          <p className="mt-5 max-w-lg text-base leading-7 text-blue-100">
            A focused workspace for applications, deadlines, and status history.
            No spreadsheets required.
          </p>
        </div>
        <p className="text-sm text-blue-200">
          Built for students, one careful step at a time.
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link
            className="mb-8 flex w-fit items-center gap-2.5 text-lg font-semibold text-slate-950 lg:hidden"
            data-testid="mobile-brand"
            href="/"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-blue-600 text-white">
              <BriefcaseBusiness aria-hidden="true" className="size-5" />
            </span>
            JobTrack
          </Link>
          <Card className="p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            <div className="mt-7">{children}</div>
          </Card>
          <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>
        </div>
      </section>
    </main>
  );
}
