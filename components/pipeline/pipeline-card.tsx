import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { CompanyLogo } from "@/components/branding/company-logo";
import { Button } from "@/components/ui/button";
import { moveApplicationStatusAction } from "@/lib/applications/actions";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";
import { contextDate } from "@/lib/applications/context-date";
import { displayOptionalText } from "@/lib/applications/mapper";
import type { ActiveApplicationFilters } from "@/lib/applications/repository";
import {
  SEARCH_PARAM,
  WORK_TERM_PARAM,
} from "@/lib/applications/search-params";
import type { ApplicationListItem } from "@/lib/applications/types";
import { formatDateOnly } from "@/lib/dates/date-only";

/*
 * The board's controls stay at the shell's standard 36px minimum rather than
 * shrinking to suit a small card: it is the touch target every other control
 * in the app offers, and a board is the surface most likely to be used on a
 * phone with a thumb.
 */
const selectClassName =
  "min-h-9 w-full rounded-control border border-border bg-surface px-1.5 text-base text-foreground-secondary hover:border-border-strong focus:border-accent focus:outline-none focus-visible:outline-none sm:text-[12px]";

/**
 * The one line of context a card carries, and only one.
 *
 * A recorded follow-up or a live deadline is the fact worth a student's
 * attention, and `contextDate` is the same rule the applications list applies,
 * imported rather than restated. When there is neither, the work term is shown
 * instead: it is always recorded, it is what separates two otherwise identical
 * postings, and it is a fact on the record rather than a guess at one.
 *
 * The lifecycle rail is deliberately absent. The column heading above the card
 * already says which stage this application is at, and drawing five dots to
 * repeat it would be the loudest thing on a card the size of a business card.
 */
function CardContext({ application }: { application: ApplicationListItem }) {
  const date = contextDate(application);
  const workTerm = displayOptionalText(application.work_term_season);

  if (!date) {
    if (!workTerm) return null;

    return (
      <p className="mt-2.5 text-[12px] text-foreground-muted">{workTerm}</p>
    );
  }

  return (
    <p className="mt-2.5 flex items-start gap-1.5 text-[12px] text-foreground-muted">
      <CalendarDays
        aria-hidden="true"
        className="mt-px size-3.5 shrink-0"
        strokeWidth={1.5}
      />
      <span className="min-w-0">
        <span className="block truncate text-foreground-secondary">
          {date.kind === "next-action" ? date.action : "Application deadline"}
        </span>
        {formatDateOnly(date.date)}
      </span>
    </p>
  );
}

/**
 * One application on the board.
 *
 * Employer, role, one contextual line, and the control that moves it. The
 * employer leads here — the opposite of the applications list, where the role
 * does — because a column is already a set of applications at one stage, and
 * the question a student answers while scanning it is "who is this with".
 *
 * The whole card is a link to the detail page, and the move control sits above
 * that overlay so it stays clickable.
 */
export function PipelineCard({
  application,
  filters,
}: {
  application: ApplicationListItem;
  filters: ActiveApplicationFilters;
}) {
  const moveId = `move-${application.id}`;

  return (
    <li className="relative border border-border bg-surface p-3 transition-colors hover:border-border-strong">
      <div className="flex min-w-0 items-start gap-2.5">
        <CompanyLogo
          companyName={application.company_name}
          domain={application.company_domain}
          size="sm"
        />
        <div className="min-w-0">
          {/*
            Both lines sit inside the link, so the card's one stretched target
            is announced as "RBC Marketing Intern" rather than as an employer
            name that could belong to any of three postings. The space between
            them is a real text node rather than something the block layout is
            trusted to imply, so the accessible name reads as two words however
            the stylesheet arrives.
          */}
          <h3 className="text-[14px] font-medium leading-snug text-foreground">
            <Link
              className="after:absolute after:inset-0 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              href={`/applications/${application.id}`}
            >
              {application.company_name}{" "}
              <span className="mt-0.5 block text-[13px] font-normal text-foreground-secondary">
                {application.original_job_title}
              </span>
            </Link>
          </h3>
        </div>
      </div>

      <CardContext application={application} />

      {/*
        A native select and a submit button: the status menu is reachable by
        keyboard because it is a real form control, not because a drag was
        given a fallback. The board carries no drag-and-drop dependency at all,
        so there is one way to move an application and every student has it.

        The filters travel as hidden fields so the move returns to the board
        the student was actually looking at. Both are re-parsed and re-encoded
        server-side before they reach a redirect.
      */}
      <form
        action={moveApplicationStatusAction}
        className="relative z-10 mt-3 flex gap-1.5"
      >
        <input name="applicationId" type="hidden" value={application.id} />
        {filters.search ? (
          <input name={SEARCH_PARAM} type="hidden" value={filters.search} />
        ) : null}
        {filters.workTermSeason ? (
          <input
            name={WORK_TERM_PARAM}
            type="hidden"
            value={filters.workTermSeason}
          />
        ) : null}
        <label className="sr-only" htmlFor={moveId}>
          Move {application.original_job_title} at {application.company_name} to
          another status
        </label>
        <select
          className={selectClassName}
          defaultValue={application.current_status}
          id={moveId}
          name="currentStatus"
        >
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        {/*
          "Move" is all a student needs to read beside the menu they just used.
          A board of thirty cards is also thirty buttons to somebody listening
          to them one at a time, so the name each one announces says which
          application it belongs to.
        */}
        <Button
          className="shrink-0 px-2.5 text-[12px]"
          type="submit"
          variant="secondary"
        >
          Move{" "}
          <span className="sr-only">
            {application.original_job_title} at {application.company_name}
          </span>
        </Button>
      </form>
    </li>
  );
}
