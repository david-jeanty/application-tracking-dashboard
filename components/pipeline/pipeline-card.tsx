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
  CATEGORY_PARAM,
  SEARCH_PARAM,
  WORK_TERM_PARAM,
} from "@/lib/applications/search-params";
import type { ApplicationListItem } from "@/lib/applications/types";
import { formatDateOnly } from "@/lib/dates/date-only";

/*
 * Quiet until it is wanted, and a full-sized target when it is.
 *
 * The control keeps the shell's standard 36px minimum height — it is the touch
 * target every other control in the app offers, and a board is the surface
 * most likely to be used on a phone with a thumb — but it drops the border and
 * fill it would otherwise carry, and it is only as wide as its widest status.
 * A bordered, card-wide bar on every card made the move control the loudest
 * thing in a column, competing with the roles it belongs to. The native
 * dropdown arrow still marks it as a menu, and the border returns on hover and
 * focus.
 */
const selectClassName =
  "min-h-9 max-w-full rounded-control border border-transparent bg-transparent px-1 text-base text-foreground-muted hover:border-border hover:text-foreground-secondary focus:border-accent focus:text-foreground-secondary focus:outline-none focus-visible:outline-none sm:text-[12px]";

/**
 * Where the role is: location and work term, when the record has them.
 *
 * Quiet metadata rather than the card's point. It is what separates two
 * postings that would otherwise read identically, and it is always the same
 * two facts in the same place, so a column can be scanned down rather than
 * read card by card. Either may be missing — `location` and
 * `work_term_season` both carry the legacy `Not specified` sentinel — and the
 * separator goes with whichever is absent.
 */
function CardPlacement({ application }: { application: ApplicationListItem }) {
  const location = displayOptionalText(application.location);
  const workTerm = displayOptionalText(application.work_term_season);

  if (!location && !workTerm) return null;

  return (
    <p className="mt-1.5 truncate text-[12px] text-foreground-muted">
      {[location, workTerm].filter(Boolean).join(" · ")}
    </p>
  );
}

/**
 * The one thing coming up on this application, when there is one.
 *
 * `contextDate` is the shared rule, imported rather than restated: a recorded
 * next action wins outright, and an application deadline shows only while the
 * application has not been submitted. Nothing is shown when the record holds
 * neither — an invented line would push the genuinely urgent cards down the
 * column.
 *
 * Separate from the placement line above rather than a fallback for it. The
 * two answer different questions — where the role is, and what is coming up —
 * and collapsing them would mean a card silently lost its location the moment
 * a follow-up was recorded.
 *
 * The lifecycle rail is deliberately absent from the whole card. The column
 * heading above it already says which stage this application is at, and
 * drawing five dots to repeat it would be the loudest thing on a card the size
 * of a business card.
 */
function CardNext({ application }: { application: ApplicationListItem }) {
  const date = contextDate(application);
  if (!date) return null;

  return (
    <p className="mt-2 flex items-start gap-1.5 text-[12px] text-foreground-muted">
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
            The role leads and the employer follows it, as on the applications
            list: two roles at one employer are the pair a student most needs
            to tell apart, and a column of eight cards is exactly where that
            happens.

            Both lines sit inside the link, so the card's one stretched target
            is announced as "Marketing Intern RBC" rather than as a role that
            could be at any of three employers. The space between them is a
            real text node rather than something the block layout is trusted to
            imply, so the accessible name reads as two words however the
            stylesheet arrives.
          */}
          <h3 className="text-[14px] font-medium leading-snug text-foreground">
            <Link
              className="after:absolute after:inset-0 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              href={`/applications/${application.id}`}
            >
              {application.original_job_title}{" "}
              <span className="mt-0.5 block text-[12px] font-normal text-foreground-secondary">
                {application.company_name}
              </span>
            </Link>
          </h3>
          <CardPlacement application={application} />
        </div>
      </div>

      <CardNext application={application} />

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
        className="relative z-10 mt-2 flex items-center gap-1"
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
        {filters.category ? (
          <input name={CATEGORY_PARAM} type="hidden" value={filters.category} />
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
          className="shrink-0 px-2 text-[12px]"
          type="submit"
          variant="ghost"
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
