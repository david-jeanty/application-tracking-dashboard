"use client";

import { useId, useState, type MouseEvent } from "react";
import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { ApplicationStatusLabel } from "@/components/applications/application-status";
import { LifecycleRail } from "@/components/applications/lifecycle-rail";
import { CompanyLogo } from "@/components/branding/company-logo";
import { contextDate, type ContextDate } from "@/lib/applications/context-date";
import { buildLifecycles, type Lifecycle } from "@/lib/applications/lifecycle";
import { displayOptionalText } from "@/lib/applications/mapper";
import type {
  ApplicationListItem,
  ApplicationStatusEvent,
} from "@/lib/applications/types";
import { formatDateOnly } from "@/lib/dates/date-only";
import {
  applicationPath,
  type WorkspaceBasePath,
} from "@/lib/demo/paths";

/** Employer mark, role, company, and the two facts that place the role. */
function Identity({
  application,
  basePath,
  onOpenRecord,
  titleId,
}: {
  application: ApplicationListItem;
  basePath: WorkspaceBasePath;
  onOpenRecord?: (event: MouseEvent<HTMLAnchorElement>) => void;
  titleId?: string;
}) {
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
        <h3
          className="text-[16px] font-medium leading-snug text-foreground"
          id={titleId}
        >
          <Link
            className="relative z-10 rounded-sm hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            href={applicationPath(application.id, basePath)}
            onClick={onOpenRecord}
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
        <ApplicationStatusLabel status={application.current_status} variant="text" />
      </p>
    </div>
  );
}

/** What the student has told Interndex comes next, if anything. */
function Next({ date }: { date: ContextDate }) {
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

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground-muted">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] text-foreground">{value}</dd>
    </div>
  );
}

function InlineContext({
  application,
  basePath,
  labelledBy,
}: {
  application: ApplicationListItem;
  basePath: WorkspaceBasePath;
  labelledBy: string;
}) {
  const detailPath = applicationPath(application.id, basePath);
  const nextAction = application.next_action ?? "Not recorded";
  const nextActionDue = application.next_action_due_date
    ? formatDateOnly(application.next_action_due_date)
    : "Not recorded";

  return (
    <section
      aria-labelledby={labelledBy}
      className="border-t border-border px-5 py-4 md:px-6"
    >
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metadata label="Category" value={application.normalized_job_category} />
        <Metadata label="Work arrangement" value={application.work_arrangement} />
        <Metadata
          label="Date applied"
          value={application.date_applied ? formatDateOnly(application.date_applied) : "Not recorded"}
        />
        <Metadata
          label="Deadline"
          value={
            application.application_deadline
              ? formatDateOnly(application.application_deadline)
              : "Not recorded"
          }
        />
        <Metadata label="Status" value={application.current_status} />
        <Metadata label="Next action" value={nextAction} />
        <Metadata label="Next action due" value={nextActionDue} />
      </dl>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
        {basePath === "" ? (
          <Link
            className="relative z-10 rounded-sm text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            href={`${detailPath}/edit`}
          >
            Edit
          </Link>
        ) : null}
        <Link
          className="relative z-10 rounded-sm text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          href={detailPath}
        >
          Open record
        </Link>
      </div>
    </section>
  );
}

/**
 * A full-width index of applications with an optional inline disclosure.
 *
 * The homepage intentionally opts out. Its short excerpt remains a static
 * preview of the existing row composition rather than becoming a second
 * interactive applications workspace.
 */
export function ApplicationRecords({
  applications,
  basePath = "",
  history,
  showSummary = true,
}: {
  applications: readonly ApplicationListItem[];
  basePath?: WorkspaceBasePath;
  history: readonly ApplicationStatusEvent[] | null;
  showSummary?: boolean;
}) {
  const lifecycles = buildLifecycles(applications, history);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const disclosurePrefix = useId();
  const disclosuresEnabled = showSummary;

  return (
    <div>
      {showSummary ? (
        <p className="text-[13px] text-foreground-muted">
          {applications.length} application{applications.length === 1 ? "" : "s"}
        </p>
      ) : null}

      {showSummary ? (
        <div className="mt-5 hidden grid-cols-[minmax(0,38fr)_minmax(0,37fr)_minmax(0,25fr)] gap-8 border-b border-border pb-2 text-[12px] text-foreground-muted md:grid">
          <span>Application</span>
          <span>Progress</span>
          <span>Next</span>
        </div>
      ) : null}

      <ul aria-label="Applications">
        {applications.map((application) => {
          const date = contextDate(application);
          const lifecycle = lifecycles?.get(application.id);
          const expanded = disclosuresEnabled && expandedId === application.id;
          const contextId = `${disclosurePrefix}-${application.id}`;
          const titleId = `${contextId}-title`;

          return (
            <li
              className={`relative border-b border-border transition-colors hover:bg-surface-muted/60 ${
                disclosuresEnabled ? "cursor-pointer" : ""
              } ${expanded ? "border-l-2 border-l-accent bg-accent-soft/20" : ""
              }`}
              key={application.id}
              onClick={
                disclosuresEnabled
                  ? () => setExpandedId(expanded ? null : application.id)
                  : undefined
              }
            >
              <div className="grid gap-5 px-5 py-5 md:grid-cols-[minmax(0,38fr)_minmax(0,37fr)_minmax(0,25fr)] md:items-center md:gap-8 md:px-6 md:py-2">
                <div>
                  <Identity
                    application={application}
                    basePath={basePath}
                    onOpenRecord={disclosuresEnabled ? (event) => event.stopPropagation() : undefined}
                    titleId={titleId}
                  />
                </div>
                <Progress application={application} lifecycle={lifecycle} />
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <Next date={date} />
                  {disclosuresEnabled ? (
                    <button
                      aria-controls={contextId}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Hide" : "Show"} details for ${application.original_job_title}`}
                      className="relative z-10 grid size-8 shrink-0 place-items-center rounded-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedId(expanded ? null : application.id);
                      }}
                      type="button"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
                        strokeWidth={1.5}
                      />
                    </button>
                  ) : (
                    <ChevronRight
                      aria-hidden="true"
                      className="hidden size-4 shrink-0 text-foreground-muted md:block"
                      strokeWidth={1.5}
                    />
                  )}
                </div>
              </div>
              {expanded ? (
                <div id={contextId} onClick={(event) => event.stopPropagation()}>
                  <InlineContext
                    application={application}
                    basePath={basePath}
                    labelledBy={titleId}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
