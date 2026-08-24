import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplicationStatusLabel } from "@/components/applications/application-status";
import { CompactLifecycleRail } from "@/components/applications/lifecycle-rail";
import { CompanyLogo } from "@/components/branding/company-logo";
import { ButtonLink } from "@/components/ui/button";
import { PRE_SUBMISSION_STATUSES } from "@/lib/analytics/definitions";
import type { ApplicationStatus } from "@/lib/applications/constants";
import { buildLifecycles, type Lifecycle } from "@/lib/applications/lifecycle";
import { displayOptionalText } from "@/lib/applications/mapper";
import {
  listActiveApplications,
  listStatusHistory,
  type ActiveApplicationFilters,
} from "@/lib/applications/repository";
import { hasActiveFilters } from "@/lib/applications/search-params";
import type { ApplicationListItem } from "@/lib/applications/types";
import { formatDateOnly } from "@/lib/dates/date-only";
import { createClient } from "@/lib/supabase/server";

const linkClassName =
  "rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function NotSet() {
  return <span aria-label="Not set">—</span>;
}

/** Which of the record's dates a row ended up showing, so it can be named. */
type RowDate =
  | { kind: "next-action"; date: string }
  | { kind: "deadline"; date: string }
  | null;

/**
 * The one date a row shows.
 *
 * A recorded next action is what the student asked to be reminded of, so it
 * wins outright. Failing that, an application deadline is shown only while the
 * application has not been submitted: once it is out, the deadline has served
 * its purpose, and repeating it would be telling a student about work they
 * have already done.
 *
 * Submission is read from the status, never from `date_applied`. That column
 * is optional — an application can be sitting at Interview with no date
 * recorded — so using it would leak deadlines onto rows long past them. The
 * status vocabulary is reused from the analytics definitions rather than
 * restated here, so this cannot drift from what the dashboard means by the
 * same word.
 *
 * Both branches are facts already on the record. Nothing here works out what
 * the student *should* do next.
 */
function rowDate(application: ApplicationListItem): RowDate {
  if (application.next_action && application.next_action_due_date) {
    return { kind: "next-action", date: application.next_action_due_date };
  }

  const notYetSubmitted = (
    PRE_SUBMISSION_STATUSES as readonly ApplicationStatus[]
  ).includes(application.current_status);

  if (notYetSubmitted && application.application_deadline) {
    return { kind: "deadline", date: application.application_deadline };
  }

  return null;
}

function LocationAndTerm({
  application,
}: {
  application: ApplicationListItem;
}) {
  const location = displayOptionalText(application.location);

  return (
    <>
      <span className="block text-foreground">{location ?? <NotSet />}</span>
      <span className="block text-[13px] text-foreground-muted">
        {application.work_term_season}
      </span>
    </>
  );
}

/**
 * The lifecycle rail with the exact status beside it.
 *
 * `lifecycle` is null when the history read failed. The rail is a summary of
 * data the status already states more precisely, so it simply goes away rather
 * than being guessed at, and the row keeps working.
 */
function Progress({
  application,
  lifecycle,
}: {
  application: ApplicationListItem;
  lifecycle: Lifecycle | undefined;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {lifecycle ? <CompactLifecycleRail lifecycle={lifecycle} /> : null}
      <ApplicationStatusLabel
        status={application.current_status}
        variant="text"
      />
    </div>
  );
}

/** One stacked record, for a phone. */
function MobileApplicationRow({
  application,
  lifecycle,
}: {
  application: ApplicationListItem;
  lifecycle: Lifecycle | undefined;
}) {
  const location = displayOptionalText(application.location);
  const date = rowDate(application);

  return (
    <li className="border-b border-border last:border-b-0">
      <div className="flex items-start gap-3 py-4">
        <CompanyLogo
          companyName={application.company_name}
          domain={application.company_domain}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">
            <Link
              className={linkClassName}
              href={`/applications/${application.id}`}
            >
              {application.company_name}
            </Link>
          </p>
          <p className="mt-0.5 text-[13px] leading-5 text-foreground-secondary">
            {application.original_job_title}
          </p>

          <div className="mt-3 flex items-center gap-3">
            {lifecycle ? (
              <CompactLifecycleRail
                className="max-w-28"
                lifecycle={lifecycle}
              />
            ) : null}
            <ApplicationStatusLabel
              status={application.current_status}
              variant="text"
            />
          </div>

          <p className="mt-2 text-[13px] text-foreground-muted">
            {location ? `${location} · ` : ""}
            {application.work_term_season}
            {date ? (
              <>
                {" · "}
                <span className="text-foreground-secondary">
                  {date.kind === "deadline" ? "Deadline" : "Next"}{" "}
                  {formatDateOnly(date.date)}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </li>
  );
}

export function ApplicationsListLoading() {
  return (
    <div aria-label="Loading applications" className="space-y-px" role="status">
      {[0, 1, 2, 3].map((item) => (
        <div className="h-[72px] animate-pulse bg-surface-muted" key={item} />
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

  // Two owner-scoped reads for the whole page, however many applications come
  // back. The history read is not per row: it returns every event the student
  // owns once, and each row's rail is built from that single result in memory.
  //
  // Archive state is applied inside the list read, not passed in, so a filter
  // built from the URL cannot reach archived records.
  const [applications, history] = await Promise.all([
    listActiveApplications(supabase, user.id, filters),
    listStatusHistory(supabase, user.id),
  ]);

  if (applications.error) {
    return (
      <div
        className="flex gap-3 rounded-record border border-danger/30 bg-danger-soft p-5 text-danger"
        role="alert"
      >
        <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="font-semibold">Applications could not be loaded</h2>
          <p className="mt-1 text-sm">
            Refresh the page to try again. If the problem continues, check the
            database connection.
          </p>
        </div>
      </div>
    );
  }

  const data = applications.data ?? [];

  if (!data.length) {
    // A student with no matches has a different problem from a student with no
    // applications, so they get different words and a way out.
    return hasActiveFilters(filters) ? (
      <div className="border-t border-border py-16 text-center">
        <h2 className="text-base font-semibold text-foreground">
          No applications match these filters
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-foreground-secondary">
          Try changing or clearing your search.
        </p>
        <div className="mt-5">
          <ButtonLink href="/applications" variant="secondary">
            Clear filters
          </ButtonLink>
        </div>
      </div>
    ) : (
      <div className="border-t border-border py-16 text-center">
        <h2 className="text-base font-semibold text-foreground">
          No applications yet
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-foreground-secondary">
          Add your first application to keep its status, dates, and next action
          together.
        </p>
      </div>
    );
  }

  // A failed history read leaves every rail off rather than taking the list
  // down: the exact status still says where each application stands.
  const lifecycles = buildLifecycles(data, history.error ? null : history.data);

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-foreground-muted">
        {data.length} application{data.length === 1 ? "" : "s"}
      </p>

      <ul className="md:hidden">
        {data.map((application) => (
          <MobileApplicationRow
            application={application}
            key={application.id}
            lifecycle={lifecycles?.get(application.id)}
          />
        ))}
      </ul>

      <div className="hidden md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Your active job applications</caption>
          <thead>
            <tr className="border-y border-border text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
              <th className="py-2.5 pr-4 font-medium" scope="col">
                Employer / role
              </th>
              <th className="w-56 py-2.5 pr-4 font-medium" scope="col">
                Progress
              </th>
              <th className="w-48 py-2.5 pr-4 font-medium" scope="col">
                Location / term
              </th>
              <th className="w-28 py-2.5 font-medium" scope="col">
                Next
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((application) => {
              const date = rowDate(application);

              return (
                <tr
                  className="border-b border-border align-middle transition-colors hover:bg-surface-muted"
                  key={application.id}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <CompanyLogo
                        companyName={application.company_name}
                        domain={application.company_domain}
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          <Link
                            className={linkClassName}
                            href={`/applications/${application.id}`}
                          >
                            {application.company_name}
                          </Link>
                        </p>
                        <p className="mt-0.5 text-[13px] text-foreground-secondary">
                          {application.original_job_title}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <Progress
                      application={application}
                      lifecycle={lifecycles?.get(application.id)}
                    />
                  </td>
                  <td className="py-3 pr-4 text-[13px]">
                    <LocationAndTerm application={application} />
                  </td>
                  <td className="py-3 text-[13px] text-foreground-secondary">
                    {date ? formatDateOnly(date.date) : <NotSet />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
