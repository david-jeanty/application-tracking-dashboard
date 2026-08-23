import { Archive, RotateCcw } from "lucide-react";
import Link from "next/link";
import { ApplicationStatusLabel } from "@/components/applications/application-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { restoreApplicationAction } from "@/lib/applications/actions";
import type { ApplicationListItem } from "@/lib/applications/types";
import { formatDateTime } from "@/lib/dates/date-time";

function RestoreButton({ applicationId }: { applicationId: string }) {
  return (
    <form action={restoreApplicationAction}>
      <input name="applicationId" type="hidden" value={applicationId} />
      <Button className="min-h-10 px-3" type="submit" variant="secondary">
        <RotateCcw aria-hidden="true" className="size-4" />
        Restore
      </Button>
    </form>
  );
}

export function ArchivedApplicationsEmptyState() {
  return (
    <Card className="px-6 py-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-600">
        <Archive aria-hidden="true" className="size-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-slate-950">
        No archived applications
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
        Applications you archive will appear here. Archiving keeps an
        application and its history, and you can restore it at any time.
      </p>
    </Card>
  );
}

/**
 * The archived applications, with the one action that applies to them.
 *
 * The shape mirrors the active list — a table above `md`, cards below — so the
 * archive reads as the same product rather than a separate screen. It stays
 * deliberately lighter: an archived application is one a student is done with,
 * so deadlines and next actions are left out.
 */
export function ArchivedApplicationsList({
  applications,
}: {
  applications: ApplicationListItem[];
}) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {applications.map((application) => (
          <Card className="p-4" key={application.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-950">
                  <Link
                    className="rounded-sm text-blue-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    href={`/applications/${application.id}`}
                  >
                    {application.company_name}
                  </Link>
                </h3>
                <p className="mt-1 text-sm text-slate-700">
                  {application.original_job_title}
                </p>
              </div>
              <ApplicationStatusLabel status={application.current_status} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Archived{" "}
              {application.archived_at
                ? formatDateTime(application.archived_at)
                : "—"}
            </p>
            <div className="mt-4">
              <RestoreButton applicationId={application.id} />
            </div>
          </Card>
        ))}
      </div>

      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">Your archived applications</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3" scope="col">
                  Company and role
                </th>
                <th className="px-4 py-3" scope="col">
                  Status
                </th>
                <th className="px-4 py-3" scope="col">
                  Archived
                </th>
                <th className="px-4 py-3" scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applications.map((application) => (
                <tr className="align-top hover:bg-slate-50/70" key={application.id}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-950">
                      <Link
                        className="rounded-sm text-blue-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        href={`/applications/${application.id}`}
                      >
                        {application.company_name}
                      </Link>
                    </p>
                    <p className="mt-1 text-slate-600">
                      {application.original_job_title}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <ApplicationStatusLabel status={application.current_status} />
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    {application.archived_at
                      ? formatDateTime(application.archived_at)
                      : "—"}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <RestoreButton applicationId={application.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
