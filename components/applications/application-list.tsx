import { AlertCircle, BriefcaseBusiness, SearchX } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplicationStatusLabel } from "@/components/applications/application-status";
import { CompanyLogo } from "@/components/branding/company-logo";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { displayOptionalText } from "@/lib/applications/mapper";
import {
  listActiveApplications,
  type ActiveApplicationFilters,
} from "@/lib/applications/repository";
import { hasActiveFilters } from "@/lib/applications/search-params";
import type { ApplicationListItem } from "@/lib/applications/types";
import { formatDateOnly } from "@/lib/dates/date-only";
import { createClient } from "@/lib/supabase/server";

function DateValue({ value }: { value: string | null }) {
  return value ? formatDateOnly(value) : <span aria-label="Not set">—</span>;
}

function MobileApplicationCard({
  application,
}: {
  application: ApplicationListItem;
}) {
  const location = displayOptionalText(application.location);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <CompanyLogo
            companyName={application.company_name}
            domain={application.company_domain}
          />
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">
              <Link
                className="rounded-sm text-accent-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                href={`/applications/${application.id}`}
              >
                {application.company_name}
              </Link>
            </h3>
            <p className="mt-1 text-sm text-foreground-secondary">
              {application.original_job_title}
            </p>
          </div>
        </div>
        <ApplicationStatusLabel status={application.current_status} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
            Category
          </dt>
          <dd className="mt-1 text-foreground">
            {application.normalized_job_category}
          </dd>
        </div>
        {location ? (
          <div className="col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Location
            </dt>
            <dd className="mt-1 text-foreground">{location}</dd>
          </div>
        ) : null}
        {application.date_applied ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Applied
            </dt>
            <dd className="mt-1 text-foreground">
              <DateValue value={application.date_applied} />
            </dd>
          </div>
        ) : null}
        {application.application_deadline ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Deadline
            </dt>
            <dd className="mt-1 text-foreground">
              <DateValue value={application.application_deadline} />
            </dd>
          </div>
        ) : null}
        {application.next_action ? (
          <div className="col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Next action
            </dt>
            <dd className="mt-1 text-foreground">
              {application.next_action}
              {application.next_action_due_date ? (
                <span className="text-foreground-muted">
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
          className="h-24 animate-pulse rounded-surface border border-border bg-surface"
          key={item}
        />
      ))}
      <span className="sr-only">Loading applications…</span>
    </div>
  );
}

export async function ApplicationList({
  filters = {},
}: {
  filters?: ActiveApplicationFilters;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Archive state is applied inside this read, not passed in, so a filter
  // built from the URL cannot reach archived records.
  const { data, error } = await listActiveApplications(
    supabase,
    user.id,
    filters,
  );

  if (error) {
    return (
      <Card className="flex gap-3 border-danger/30 bg-danger-soft p-5 text-danger">
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
    // A student with no matches has a different problem from a student with no
    // applications, so they get different words and a way out.
    return hasActiveFilters(filters) ? (
      <Card className="px-6 py-12 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-surface bg-surface-muted text-foreground-secondary">
          <SearchX aria-hidden="true" className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          No applications match these filters
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-foreground-secondary">
          Try changing or clearing your search.
        </p>
        <div className="mt-5">
          <ButtonLink href="/applications" variant="secondary">
            Clear filters
          </ButtonLink>
        </div>
      </Card>
    ) : (
      <Card className="px-6 py-12 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-surface bg-accent-soft text-accent">
          <BriefcaseBusiness aria-hidden="true" className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          No applications yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-foreground-secondary">
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
            <thead className="border-b border-border bg-surface-muted text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
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
            <tbody className="divide-y divide-border">
              {data.map((application) => (
                <tr className="align-top hover:bg-surface-muted" key={application.id}>
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <CompanyLogo
                        companyName={application.company_name}
                        domain={application.company_domain}
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          <Link
                            className="rounded-sm text-accent-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                            href={`/applications/${application.id}`}
                          >
                            {application.company_name}
                          </Link>
                        </p>
                        <p className="mt-1 text-foreground-secondary">
                          {application.original_job_title}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-foreground-secondary">
                    {application.normalized_job_category}
                  </td>
                  <td className="px-4 py-4">
                    <ApplicationStatusLabel
                      status={application.current_status}
                    />
                  </td>
                  <td className="px-4 py-4 text-foreground-secondary">
                    {displayOptionalText(application.location) ?? (
                      <span aria-label="Not set">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-foreground-secondary">
                    <DateValue value={application.date_applied} />
                  </td>
                  <td className="px-4 py-4 text-foreground-secondary">
                    <DateValue value={application.application_deadline} />
                  </td>
                  <td className="max-w-56 px-4 py-4 text-foreground-secondary">
                    {application.next_action ?? (
                      <span aria-label="Not set">—</span>
                    )}
                    {application.next_action &&
                    application.next_action_due_date ? (
                      <span className="mt-1 block text-xs text-foreground-muted">
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
