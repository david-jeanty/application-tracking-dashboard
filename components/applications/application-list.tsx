import { AlertCircle, BriefcaseBusiness } from "lucide-react";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  UNSPECIFIED_DATABASE_VALUE,
  type ApplicationStatus,
} from "@/lib/applications/constants";
import { listActiveApplications } from "@/lib/applications/repository";
import type { ApplicationListItem } from "@/lib/applications/types";
import { formatDateOnly } from "@/lib/dates/date-only";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const statusClasses: Partial<Record<ApplicationStatus, string>> = {
  Interested: "border-slate-200 bg-slate-100 text-slate-800",
  Preparing: "border-amber-200 bg-amber-50 text-amber-900",
  Applied: "border-blue-200 bg-blue-50 text-blue-800",
  Screening: "border-violet-200 bg-violet-50 text-violet-800",
  Assessment: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
  Interview: "border-purple-200 bg-purple-50 text-purple-800",
  Offer: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Accepted: "border-green-200 bg-green-50 text-green-800",
  Rejected: "border-red-200 bg-red-50 text-red-800",
  Withdrawn: "border-slate-300 bg-slate-100 text-slate-700",
};

function StatusLabel({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusClasses[status],
      )}
    >
      <span className="sr-only">Status: </span>
      {status}
    </span>
  );
}

function optionalLocation(value: string) {
  return value === UNSPECIFIED_DATABASE_VALUE ? null : value;
}

function DateValue({ value }: { value: string | null }) {
  return value ? formatDateOnly(value) : <span aria-label="Not set">—</span>;
}

function MobileApplicationCard({
  application,
}: {
  application: ApplicationListItem;
}) {
  const location = optionalLocation(application.location);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-950">
            {application.company_name}
          </h3>
          <p className="mt-1 text-sm text-slate-700">
            {application.original_job_title}
          </p>
        </div>
        <StatusLabel status={application.current_status} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Category
          </dt>
          <dd className="mt-1 text-slate-800">
            {application.normalized_job_category}
          </dd>
        </div>
        {location ? (
          <div className="col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Location
            </dt>
            <dd className="mt-1 text-slate-800">{location}</dd>
          </div>
        ) : null}
        {application.date_applied ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Applied
            </dt>
            <dd className="mt-1 text-slate-800">
              <DateValue value={application.date_applied} />
            </dd>
          </div>
        ) : null}
        {application.application_deadline ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Deadline
            </dt>
            <dd className="mt-1 text-slate-800">
              <DateValue value={application.application_deadline} />
            </dd>
          </div>
        ) : null}
        {application.next_action ? (
          <div className="col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Next action
            </dt>
            <dd className="mt-1 text-slate-800">
              {application.next_action}
              {application.next_action_due_date ? (
                <span className="text-slate-500">
                  {" "}
                  · <DateValue value={application.next_action_due_date} />
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}

export function ApplicationsListLoading() {
  return (
    <div aria-label="Loading applications" className="space-y-3" role="status">
      {[0, 1, 2].map((item) => (
        <div
          className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white"
          key={item}
        />
      ))}
      <span className="sr-only">Loading applications…</span>
    </div>
  );
}

export async function ApplicationList() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await listActiveApplications(supabase, user.id);

  if (error) {
    return (
      <Card className="flex gap-3 border-red-200 bg-red-50 p-5 text-red-900">
        <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="font-semibold">Applications could not be loaded</h2>
          <p className="mt-1 text-sm">
            Refresh the page to try again. If the problem continues, check the
            database connection.
          </p>
        </div>
      </Card>
    );
  }

  if (!data?.length) {
    return (
      <Card className="px-6 py-12 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">
          <BriefcaseBusiness aria-hidden="true" className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-slate-950">
          No applications yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
          Add your first application to keep its status, dates, and next action
          together.
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {data.map((application) => (
          <MobileApplicationCard
            application={application}
            key={application.id}
          />
        ))}
      </div>

      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Your active job applications
            </caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3" scope="col">
                  Company and role
                </th>
                <th className="px-4 py-3" scope="col">
                  Category
                </th>
                <th className="px-4 py-3" scope="col">
                  Status
                </th>
                <th className="px-4 py-3" scope="col">
                  Location
                </th>
                <th className="px-4 py-3" scope="col">
                  Applied
                </th>
                <th className="px-4 py-3" scope="col">
                  Deadline
                </th>
                <th className="px-4 py-3" scope="col">
                  Next action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((application) => (
                <tr className="align-top hover:bg-slate-50/70" key={application.id}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-950">
                      {application.company_name}
                    </p>
                    <p className="mt-1 text-slate-600">
                      {application.original_job_title}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    {application.normalized_job_category}
                  </td>
                  <td className="px-4 py-4">
                    <StatusLabel status={application.current_status} />
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    {optionalLocation(application.location) ?? (
                      <span aria-label="Not set">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <DateValue value={application.date_applied} />
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <DateValue value={application.application_deadline} />
                  </td>
                  <td className="max-w-56 px-4 py-4 text-slate-700">
                    {application.next_action ?? (
                      <span aria-label="Not set">—</span>
                    )}
                    {application.next_action &&
                    application.next_action_due_date ? (
                      <span className="mt-1 block text-xs text-slate-500">
                        Due{" "}
                        <DateValue value={application.next_action_due_date} />
                      </span>
                    ) : null}
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
