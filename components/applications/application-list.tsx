import { AlertCircle, CalendarDays, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplicationStatusLabel } from "@/components/applications/application-status";
import { LifecycleRail } from "@/components/applications/lifecycle-rail";
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

/** Which of the record's dates a row ended up showing, so it can be named. */
type RowDate =
  | { kind: "next-action"; date: string; action: string }
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
    return {
      kind: "next-action",
      date: application.next_action_due_date,
      action: application.next_action,
    };
  }

  const notYetSubmitted = (
    PRE_SUBMISSION_STATUSES as readonly ApplicationStatus[]
  ).includes(application.current_status);

  if (notYetSubmitted && application.application_deadline) {
    return { kind: "deadline", date: application.application_deadline };
  }

  return null;
}

/** Employer mark, role, company, and the two facts that place the role. */
function Identity({ application }: { application: ApplicationListItem }) {
  const location = displayOptionalText(application.location);

  return (
    <div className="flex min-w-0 items-start gap-4">
      <CompanyLogo
        className="mt-0.5"
        companyName={application.company_name}
        domain={application.company_domain}
        size="md"
      />
      <div className="min-w-0">
        {/*
          The role leads here, and the company follows it. Two roles at one
          employer are the pair a student most needs to tell apart in a list;
          the detail page puts the employer first, where the page is about one
          record rather than about choosing between many.

          The link stretches over the whole record so the row is clickable,
          while its accessible name stays just the role.
        */}
        <h3 className="text-[16px] font-medium leading-snug text-foreground">
          <Link
            className="after:absolute after:inset-0 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            href={`/applications/${application.id}`}
          >
            {application.original_job_title}
          </Link>
        </h3>
        <p className="mt-0.5 text-[13px] text-foreground-secondary">
          {application.company_name}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-foreground-muted">
          {location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
              {location}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays
              aria-hidden="true"
              className="size-3.5"
              strokeWidth={1.5}
            />
            {application.work_term_season}
          </span>
        </p>
      </div>
    </div>
  );
}

/** The rail with the exact status beneath it, or the status alone. */
function Progress({
  application,
  lifecycle,
}: {
  application: ApplicationListItem;
  lifecycle: Lifecycle | undefined;
}) {
  return (
    <div>
      {lifecycle ? <LifecycleRail lifecycle={lifecycle} /> : null}
      <p className={lifecycle ? "mt-2.5 text-center" : ""}>
        <ApplicationStatusLabel
          status={application.current_status}
          variant="text"
        />
      </p>
    </div>
  );
}

/** What the student has told JobTrack comes next, if anything. */
function Next({ date }: { date: RowDate }) {
  if (!date) {
    return <span className="text-[13px] text-foreground-muted">—</span>;
  }

  return (
    <div className="flex min-w-0 items-start gap-2">
      <CalendarDays
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-foreground-muted"
        strokeWidth={1.5}
      />
      <div className="min-w-0">
        <p
          className="truncate text-[13px] text-foreground"
          title={date.kind === "next-action" ? date.action : undefined}
        >
          {date.kind === "next-action" ? date.action : "Application deadline"}
        </p>
        <p className="mt-0.5 text-[12px] text-foreground-muted">
          {formatDateOnly(date.date)}
        </p>
      </div>
    </div>
  );
}

export function ApplicationsListLoading() {
  return (
    <div aria-label="Loading applications" className="space-y-px" role="status">
      {[0, 1, 2, 3].map((item) => (
        <div className="h-24 animate-pulse bg-surface-muted" key={item} />
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
        className="flex gap-3 border border-danger/30 bg-danger-soft p-5 text-danger"
        role="alert"
      >
        <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="font-medium">Applications could not be loaded</h2>
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
        <h2 className="text-[16px] text-foreground">
          No applications match these filters
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-foreground-secondary">
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
        <h2 className="text-[16px] text-foreground">No applications yet</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-foreground-secondary">
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
    <div>
      <p className="text-[13px] text-foreground-muted">
        {data.length} application{data.length === 1 ? "" : "s"}
      </p>

      {/*
        A list of records, not a table. Nothing here is tabular data being
        compared column against column — each row is one application, and the
        three regions are its identity, its progress and what comes next.
      */}
      <div className="mt-5 hidden grid-cols-[minmax(0,38fr)_minmax(0,37fr)_minmax(0,25fr)] gap-8 border-b border-border pb-2 text-[12px] text-foreground-muted md:grid">
        <span>Application</span>
        <span>Progress</span>
        <span>Next</span>
      </div>

      <ul aria-label="Applications">
        {data.map((application) => {
          const date = rowDate(application);
          const lifecycle = lifecycles?.get(application.id);

          return (
            <li
              className="relative border-b border-border transition-colors hover:bg-surface-muted/60"
              key={application.id}
            >
              {/*
                One composition for every width. The three regions sit side by
                side when there is room and stack into the phone's reading
                order when there is not — rather than two markups where a
                screen reader would meet each record twice.
              */}
              <div className="grid gap-5 py-5 md:grid-cols-[minmax(0,38fr)_minmax(0,37fr)_minmax(0,25fr)] md:items-center md:gap-8 md:py-6">
                <Identity application={application} />
                <Progress application={application} lifecycle={lifecycle} />
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <Next date={date} />
                  <ChevronRight
                    aria-hidden="true"
                    className="hidden size-4 shrink-0 text-foreground-muted md:block"
                    strokeWidth={1.5}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
