import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CompanyLogo } from "@/components/branding/company-logo";
import { APPLICATION_STATUS_SUMMARIES } from "@/lib/applications/constants";
import { displayOptionalText } from "@/lib/applications/mapper";
import { toApplicationStatusSummaryUrl } from "@/lib/applications/search-params";
import type { AttentionItem, AttentionReason } from "@/lib/dashboard/attention";
import {
  activityDayLabel,
  groupActivityByDay,
  type ActivityEntry,
  type WeekSummary,
} from "@/lib/dashboard/calculate";
import type { SavedOpportunity } from "@/lib/dashboard/saved-opportunities";
import { formatDateOnly } from "@/lib/dates/date-only";
import {
  analyticsPath,
  applicationPath,
  applicationsPath,
  type WorkspaceBasePath,
} from "@/lib/demo/paths";

/**
 * A section heading and the rule under it.
 *
 * The rule is the whole visual container. Nothing on this page sits in a card:
 * a heading, a hairline, and the space beneath it are what separate one part
 * of the search from the next, which is the same structure the applications
 * list uses for its column header.
 */
function SectionHeading({
  action,
  children,
  id,
}: {
  action?: ReactNode;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
      <h2 className="text-[17px] font-medium text-foreground" id={id}>
        {children}
      </h2>
      {action}
    </div>
  );
}

/** The quiet inline link a section header can carry. */
export function SectionLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      className="inline-flex shrink-0 items-center gap-1 rounded-control text-[13px] text-accent hover:text-accent-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      href={href}
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
    </Link>
  );
}

/**
 * The four numbers that say how the search stands.
 *
 * A description list, not four cards. The number carries the weight and the
 * label stays quiet underneath it, so the row reads as one summary rather than
 * as four competing tiles. `tabular-nums` keeps a 3-digit count from shifting
 * its neighbours — a serious search runs to three digits, and the row has to
 * hold its shape when it does.
 */
export function SearchSummaryMetrics({
  metrics,
}: {
  metrics: { label: string; value: number }[];
}) {
  const dividers = [
    "border-b border-r sm:border-b-0",
    "border-b sm:border-b-0 sm:border-r",
    "border-r",
    "",
  ];

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4">
      {metrics.map((metric, index) => (
        /*
          The term precedes its description in the DOM, which is what a
          description list means and what a screen reader reads. The visual
          order — number first, label under it — is produced by reversing the
          column, so the markup and the design can each be right.
        */
        <div
          className={`flex min-h-20 flex-col-reverse justify-center gap-1.5 border-border px-4 py-3.5 sm:min-h-24 sm:px-5 ${dividers[index] ?? ""}`}
          key={metric.label}
        >
          <dt className="text-[12px] font-medium text-foreground-secondary sm:text-[13px]">
            {metric.label}
          </dt>
          <dd className="text-[25px] font-medium leading-none tabular-nums tracking-tight text-foreground sm:text-[28px]">
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Jobs that were saved but still have not been submitted. */
export function SavedOpportunities({
  basePath = "",
  opportunities,
}: {
  basePath?: WorkspaceBasePath;
  opportunities: SavedOpportunity[];
}) {
  const savedStatusSummary = APPLICATION_STATUS_SUMMARIES.find(
    (summary) => summary.key === "saved",
  );

  return (
    <section
      aria-labelledby="dashboard-saved-opportunities"
      className="rounded-surface border border-border bg-surface p-5 sm:p-6"
    >
      <SectionHeading
        action={
          <SectionLink
            href={toApplicationStatusSummaryUrl(
              applicationsPath(basePath),
              {},
              savedStatusSummary,
            )}
          >
            View saved applications
          </SectionLink>
        }
        id="dashboard-saved-opportunities"
      >
        Saved opportunities
      </SectionHeading>

      <p className="pt-3 text-[13px] leading-5 text-foreground-secondary">
        Jobs you saved but have not submitted.
      </p>

      <ul className="mt-2 divide-y divide-border/70">
        {opportunities.map((opportunity) => {
          const context = [
            displayOptionalText(opportunity.workTerm),
            displayOptionalText(opportunity.location),
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <li
              className="relative flex items-start gap-3 py-3 first:pt-2.5 last:pb-0"
              key={opportunity.applicationId}
            >
              <CompanyLogo
                companyName={opportunity.companyName}
                domain={opportunity.companyDomain}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium leading-snug text-foreground">
                  <Link
                    aria-label={`${opportunity.jobTitle} at ${opportunity.companyName}`}
                    className="after:absolute after:inset-0 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    href={applicationPath(opportunity.applicationId, basePath)}
                  >
                    {opportunity.jobTitle}
                  </Link>
                </p>
                <p className="mt-0.5 truncate text-[13px] text-foreground-secondary">
                  {opportunity.companyName}
                </p>
                {context ? (
                  <p className="mt-1 truncate text-[12px] text-foreground-muted">
                    {context}
                  </p>
                ) : null}
                <p className="mt-1 text-[12px] font-medium text-foreground-secondary">
                  {opportunity.deadline
                    ? `Apply by ${formatDateOnly(opportunity.deadline)}`
                    : `Saved ${formatDateOnly(opportunity.savedOn)}`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * What actually happened, newest first.
 *
 * A ledger: a day heading, then the events under it, separated by space rather
 * than boxed. Every row is a recorded event — a creation or a real status
 * change — and the role is shown under the employer so two applications at one
 * company can be told apart.
 */
export function RecentActivity({
  basePath = "",
  entries,
  today,
}: {
  basePath?: WorkspaceBasePath;
  entries: ActivityEntry[];
  today: string;
}) {
  return (
    <section
      aria-labelledby="dashboard-activity"
      className="rounded-surface border border-border bg-surface p-5 sm:p-6"
    >
      <SectionHeading id="dashboard-activity">Recent activity</SectionHeading>

      {entries.length === 0 ? (
        <p className="pt-5 text-[14px] text-foreground-secondary">
          Nothing has changed yet. Saving an application or moving its status
          will show up here.
        </p>
      ) : (
        <div className="pt-3">
          {groupActivityByDay(entries).map((group) => (
            <section className="mb-3 last:mb-0" key={group.day}>
              <h3 className="text-[12px] text-foreground-muted">
                {activityDayLabel(group.day, today, formatDateOnly)}
              </h3>
              <ul className="mt-1 divide-y divide-border/70">
                {group.entries.map((entry) => (
                  <li
                    className="relative flex items-start gap-3 py-2.5 first:pt-2"
                    key={`${entry.applicationId}-${entry.changedAt}`}
                  >
                    {/*
                      The domain arrives on the entry itself, joined in memory
                      from the applications the dashboard already read. No row
                      here causes a query.
                    */}
                    <CompanyLogo
                      companyName={entry.companyName}
                      domain={entry.companyDomain}
                    />
                    <div className="min-w-0">
                      {/*
                        The link stretches over the row so the whole entry is
                        clickable, while its accessible name stays the employer
                        and role rather than the whole block of text.
                      */}
                      <p className="text-[14px] font-medium leading-snug text-foreground">
                        <Link
                          className="after:absolute after:inset-0 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                          href={applicationPath(entry.applicationId, basePath)}
                        >
                          {entry.companyName}
                        </Link>
                      </p>
                      <p className="mt-0.5 truncate text-[13px] text-foreground-secondary">
                        {entry.jobTitle}
                      </p>
                      <p className="mt-0.5 text-[12px] text-foreground-muted">
                        {entry.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The week so far, stated and not scored.
 *
 * One flat row. No target, no streak, no comparison with last week: a quiet
 * week in a job search is usually a fact about employers, and turning it into
 * a number a student is failing to hit would make this the section they avoid.
 */
export function ThisWeek({
  basePath = "",
  week,
  weekStartLabel,
}: {
  basePath?: WorkspaceBasePath;
  week: WeekSummary;
  weekStartLabel: string;
}) {
  // The noun agrees with the number. "1 interviews reached" is the kind of
  // seam that makes a page read as generated rather than written.
  const metrics = [
    { label: "submitted", value: week.submitted },
    {
      label: week.statusChanges === 1 ? "status change" : "status changes",
      value: week.statusChanges,
    },
    {
      label: week.interviews === 1 ? "interview reached" : "interviews reached",
      value: week.interviews,
    },
  ];

  return (
    <section
      aria-labelledby="dashboard-week"
      className="rounded-surface border border-border bg-surface-muted/45 px-5 py-4 sm:px-6 sm:py-5"
    >
      <SectionHeading
        action={
          <SectionLink href={analyticsPath(basePath)}>View analytics</SectionLink>
        }
        id="dashboard-week"
      >
        This week
      </SectionHeading>

      <dl className="flex flex-wrap gap-x-8 gap-y-3 pt-4">
        {metrics.map((metric) => (
          <div className="flex items-baseline gap-1.5" key={metric.label}>
            <dd className="text-[20px] font-medium tabular-nums leading-none text-foreground">
              {metric.value}
            </dd>
            <dt className="text-[14px] text-foreground-secondary">
              {metric.label}
            </dt>
          </div>
        ))}
      </dl>

      <p className="mt-2.5 text-[12px] text-foreground-muted">
        Since {weekStartLabel}
      </p>
    </section>
  );
}

/**
 * Which reasons are urgent enough to say so in colour.
 *
 * Only the two that describe something already missed or landing within a day.
 * The rest state their timing in ordinary text — a deadline next Thursday is
 * information, not an alarm, and colouring every row would leave nothing for
 * the rows that genuinely need it.
 */
const URGENT_REASONS: readonly AttentionReason[] = [
  "overdue-action",
  "deadline-critical",
];

/**
 * Dates the student recorded, and postings about to close.
 *
 * A conditional section, rendered only when there is something in it — the
 * page has no empty state for this, because a dashboard that congratulates
 * somebody for having nothing due is a dashboard that has made itself the
 * point. When there is nothing, the page simply ends above.
 *
 * Nothing here is inferred. Every row is either an action the student wrote
 * down or a deadline on an application they have not sent yet.
 */
export function Upcoming({
  basePath = "",
  items,
}: {
  basePath?: WorkspaceBasePath;
  items: AttentionItem[];
}) {
  return (
    <section
      aria-labelledby="dashboard-upcoming"
      className="overflow-hidden rounded-surface border border-border bg-surface"
    >
      <div className="border-l-4 border-accent bg-accent-soft/65 px-4 py-3 sm:px-5">
        <h2 className="text-[17px] font-medium text-foreground" id="dashboard-upcoming">
          Upcoming
        </h2>
        <p className="mt-0.5 text-[12px] text-foreground-secondary">
          Follow-ups, interviews, and deadlines that need attention
        </p>
      </div>

      <ul className="grid px-4 sm:px-5 md:grid-cols-2 md:px-0 md:[&>li:nth-child(odd)]:border-r md:[&>li:nth-last-child(-n+2)]:border-b-0">
        {items.map((item) => {
          const urgent = URGENT_REASONS.includes(item.reason);

          return (
            <li
              className={`relative flex items-start gap-3 border-b border-border py-3.5 last:border-b-0 md:px-5 ${urgent ? "bg-danger-soft/25" : ""}`}
              key={item.applicationId}
            >
              <CompanyLogo
                companyName={item.companyName}
                domain={item.companyDomain}
              />
              {/*
                At comfortable widths, the date stays at the top right of every
                row as a fixed scanning landmark. On a phone it moves below the
                text instead of squeezing or hiding the action itself.
              */}
              <div className="flex min-w-0 flex-1 flex-col gap-y-2 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium leading-snug text-foreground">
                    <Link
                      className="after:absolute after:inset-0 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      href={applicationPath(item.applicationId, basePath)}
                    >
                      {item.companyName}
                    </Link>
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-foreground-secondary">
                    {item.jobTitle}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-5 text-foreground">
                    {item.detail}
                  </p>
                  {/*
                    Only deadlines carry a note, and it says why the deadline
                    still applies: how long the application has sat, and that
                    it has not been submitted. Stated, never advised.
                  */}
                  {item.note ? (
                    <p className="mt-0.5 text-[12px] leading-4 text-foreground-muted">
                      {item.note}
                    </p>
                  ) : null}
                </div>
                {/*
                  The date is what a student scans for, so it leads. The phrase
                  underneath appears only when something is overdue or lands
                  within a day, and it carries the urgency in words — the
                  colour repeats it rather than being the only signal.
                */}
                <div className="shrink-0 text-left sm:text-right">
                  <p className="text-[13px] tabular-nums text-foreground">
                    {item.date ? formatDateOnly(item.date) : null}
                  </p>
                  {urgent ? (
                    <p className="mt-0.5 text-[12px] text-danger">
                      {item.timing}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[12px] text-foreground-muted">
                      {item.timing}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
