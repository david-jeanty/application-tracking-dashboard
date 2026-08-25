import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { ApplicationStatusLabel } from "@/components/applications/application-status";
import { CompanyLogo } from "@/components/branding/company-logo";
import { Button } from "@/components/ui/button";
import { restoreApplicationAction } from "@/lib/applications/actions";
import type { ApplicationListItem } from "@/lib/applications/types";
import {
  dateOnlyFromTimestamp,
  formatDateOnly,
} from "@/lib/dates/date-only";
import { DEFAULT_TIME_ZONE } from "@/lib/dates/time-zone";

/**
 * Restore and Delete permanently, in that order and not in the same weight.
 *
 * Restore is the reversible one and keeps a real control. Deletion is a quiet
 * link into a confirmation page rather than a second button beside it, so the
 * destructive path takes a deliberate step and cannot be hit by aiming badly.
 *
 * Both name the record they act on. A screen reader moving through twenty rows
 * would otherwise meet twenty identical "Restore" buttons with nothing to tell
 * them apart.
 */
function RowActions({
  application,
}: {
  application: ApplicationListItem;
}) {
  const record = `${application.original_job_title} at ${application.company_name}`;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:justify-end">
      <form action={restoreApplicationAction}>
        <input name="applicationId" type="hidden" value={application.id} />
        <Button
          aria-label={`Restore ${record}`}
          className="px-3"
          type="submit"
          variant="secondary"
        >
          <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
          Restore
        </Button>
      </form>
      <Link
        aria-label={`Permanently delete ${record}`}
        className="rounded-sm text-[13px] text-danger underline decoration-danger/30 underline-offset-4 hover:decoration-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        href={`/applications/${application.id}/delete`}
      >
        Delete permanently
      </Link>
    </div>
  );
}

/**
 * Nothing put away yet.
 *
 * A rule and a sentence, the same shape the applications list uses when it has
 * nothing to show. The icon in a rounded box that used to sit here was the
 * loudest thing on an otherwise empty page, and it said nothing the two lines
 * below it do not.
 */
export function ArchivedApplicationsEmptyState() {
  return (
    <div className="border-t border-border py-16 text-center">
      <h2 className="text-[16px] text-foreground">No archived applications</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-foreground-secondary">
        Applications you archive appear here. Archiving keeps an application and
        its history, and you can restore it at any time.
      </p>
    </div>
  );
}

/**
 * What the student has put away.
 *
 * The record anatomy is the applications list's — employer mark, role, company
 * — deliberately muted and carrying less. An archived application is one the
 * student is done with, so the deadline, the next action, the lifecycle rail
 * and the rest of the metadata are all left off: what is left is enough to
 * recognise the record, see where it ended, and put it back.
 *
 * One composition for every width, like the active list. The regions sit side
 * by side when there is room and stack into the phone's reading order when
 * there is not, rather than a table and a separate set of cards where a screen
 * reader would meet every archived application twice.
 */
export function ArchivedApplicationsList({
  applications,
}: {
  applications: ApplicationListItem[];
}) {
  return (
    <div>
      <p className="text-[13px] text-foreground-muted">
        {applications.length} archived application
        {applications.length === 1 ? "" : "s"}
      </p>

      {/*
        Four regions rather than three, so the ledger needs a little more room
        than the applications list before it is worth laying them side by side:
        below `lg` the record stacks into the phone's reading order instead of
        squeezing a date and two controls into a hundred pixels each.
      */}
      <div className="mt-5 hidden grid-cols-[minmax(0,38fr)_minmax(0,14fr)_minmax(0,16fr)_minmax(0,32fr)] gap-5 border-b border-border pb-2 text-[12px] text-foreground-muted lg:grid xl:gap-8">
        <span>Application</span>
        <span>Status</span>
        <span>Archived</span>
        <span className="sr-only">Actions</span>
      </div>

      <ul aria-label="Archived applications">
        {applications.map((application) => (
          <li className="border-b border-border" key={application.id}>
            <div className="grid gap-4 py-5 lg:grid-cols-[minmax(0,38fr)_minmax(0,14fr)_minmax(0,16fr)_minmax(0,32fr)] lg:items-center lg:gap-5 lg:py-6 xl:gap-8">
              <div className="flex min-w-0 items-start gap-4">
                <CompanyLogo
                  className="mt-0.5"
                  companyName={application.company_name}
                  domain={application.company_domain}
                  size="md"
                />
                <div className="min-w-0">
                  {/*
                    The role leads, and the company follows it, exactly as in
                    the active list. Two roles at one employer are the pair a
                    student most needs to tell apart, archived or not.
                  */}
                  <h3 className="text-[16px] font-medium leading-snug text-foreground">
                    <Link
                      className="rounded-sm hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      href={`/applications/${application.id}`}
                    >
                      {application.original_job_title}
                    </Link>
                  </h3>
                  <p className="mt-0.5 break-words text-[13px] text-foreground-secondary">
                    {application.company_name}
                  </p>
                </div>
              </div>

              <ApplicationStatusLabel
                status={application.current_status}
                variant="text"
              />

              {/*
                The day it was put away, and not the minute. What hour a
                student archived a rejection is not something they will ever
                need, and the time of day was the widest thing in this column.

                The column heading carries the word on a wide screen. On a
                phone there is no heading above the date, so the word is shown
                there instead — and stays available to assistive technology at
                every width rather than being dropped with the heading.
              */}
              <p className="text-[13px] text-foreground-muted">
                <span className="lg:sr-only">Archived </span>
                {application.archived_at
                  ? formatDateOnly(
                      dateOnlyFromTimestamp(
                        application.archived_at,
                        DEFAULT_TIME_ZONE,
                      ),
                    )
                  : "—"}
              </p>

              <RowActions application={application} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
