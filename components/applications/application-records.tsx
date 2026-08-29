"use client";

import { useId, useState, type MouseEvent } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  MapPin,
  Monitor,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { ApplicationStatusDot } from "@/components/applications/application-status";
import { LifecycleRail } from "@/components/applications/lifecycle-rail";
import { CompanyLogo } from "@/components/branding/company-logo";
import { ButtonLink } from "@/components/ui/button";
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

const DESKTOP_QUERY = "(min-width: 1280px)";

function Identity({ application }: { application: ApplicationListItem }) {
  const location = displayOptionalText(application.location);

  return (
    <div className="flex min-w-0 items-start gap-3">
      <CompanyLogo
        className="mt-0.5"
        companyName={application.company_name}
        domain={application.company_domain}
        size="md"
      />
      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-medium leading-snug text-foreground">
          {application.original_job_title}
        </h3>
        <p className="mt-0.5 truncate text-[13px] text-foreground-secondary">
          {application.company_name}
        </p>
        <p className="mt-1.5 flex min-w-0 items-center gap-3 text-[12px] text-foreground-muted">
          {location ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{location}</span>
            </span>
          ) : null}
          <span className="inline-flex shrink-0 items-center gap-1">
            <CalendarDays aria-hidden="true" className="size-3" strokeWidth={1.5} />
            {application.work_term_season}
          </span>
        </p>
      </div>
    </div>
  );
}

function InlineFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.07em] text-foreground-muted">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] leading-5 text-foreground">{value}</dd>
    </div>
  );
}

function DemoInlineContext({
  application,
  contextId,
}: {
  application: ApplicationListItem;
  contextId: string;
}) {
  const nextAction = displayOptionalText(application.next_action) ?? "Not recorded";

  return (
    <section
      aria-label={`${application.original_job_title} details`}
      className="border-t border-border bg-surface-muted/25 px-3 py-4 xl:hidden"
      id={contextId}
    >
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <InlineFact
          label="Category"
          value={application.normalized_job_category}
        />
        <InlineFact
          label="Work arrangement"
          value={
            application.work_arrangement === "Unknown"
              ? "Not recorded"
              : application.work_arrangement
          }
        />
        <InlineFact
          label="Date applied"
          value={
            application.date_applied
              ? formatDateOnly(application.date_applied)
              : "Not recorded"
          }
        />
        <InlineFact
          label="Deadline"
          value={
            application.application_deadline
              ? formatDateOnly(application.application_deadline)
              : "Not recorded"
          }
        />
        <InlineFact label="Next action" value={nextAction} />
        <InlineFact
          label="Next action due"
          value={
            application.next_action_due_date
              ? formatDateOnly(application.next_action_due_date)
              : "Not recorded"
          }
        />
      </dl>
    </section>
  );
}

function Progress({
  application,
  lifecycle,
}: {
  application: ApplicationListItem;
  lifecycle: Lifecycle | undefined;
}) {
  return (
    <div className="min-w-0">
      {lifecycle ? (
        <LifecycleRail
          className="[&>li>span:first-child]:text-[10px] [&>li>span:first-child]:tracking-[-0.02em]"
          lifecycle={lifecycle}
        />
      ) : null}
      <p className={lifecycle ? "mt-2 text-center" : ""}>
        <ApplicationStatusDot status={application.current_status} />
      </p>
    </div>
  );
}

function Next({ date }: { date: ContextDate }) {
  if (!date) {
    return <span className="text-[13px] text-foreground-muted">—</span>;
  }

  return (
    <div className="flex min-w-0 items-start gap-2">
      <CalendarDays
        aria-hidden="true"
        className="mt-0.5 size-3.5 shrink-0 text-foreground-muted"
        strokeWidth={1.5}
      />
      <div className="min-w-0">
        <p
          className="truncate text-[12px] text-foreground"
          title={date.kind === "next-action" ? date.action : undefined}
        >
          {date.kind === "next-action" ? date.action : "Application deadline"}
        </p>
        <p className="mt-0.5 text-[11px] text-foreground-muted">
          {formatDateOnly(date.date)}
        </p>
      </div>
    </div>
  );
}

function PreviewFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5 border-b border-border/70 py-3 last:border-b-0">
      <Icon
        aria-hidden="true"
        className="mt-0.5 size-3.5 text-foreground-muted"
        strokeWidth={1.5}
      />
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-[0.07em] text-foreground-muted">
          {label}
        </dt>
        <dd className="mt-1 break-words text-[13px] leading-5 text-foreground">
          {value}
        </dd>
      </div>
    </div>
  );
}

function SelectedRecordPreview({
  application,
  basePath,
  lifecycle,
  previewId,
}: {
  application: ApplicationListItem;
  basePath: WorkspaceBasePath;
  lifecycle: Lifecycle | undefined;
  previewId: string;
}) {
  const location = displayOptionalText(application.location) ?? "Not recorded";
  const nextAction = displayOptionalText(application.next_action);
  const nextActionValue = nextAction
    ? `${nextAction} · ${
        application.next_action_due_date
          ? `Due ${formatDateOnly(application.next_action_due_date)}`
          : "No due date"
      }`
    : "Not recorded";

  return (
    <aside
      aria-label="Selected application preview"
      className="sticky top-9 hidden self-start overflow-hidden rounded-surface border border-border bg-surface xl:block"
      id={previewId}
    >
      <div className="border-b border-border p-5">
        <div className="flex items-start gap-3">
          <CompanyLogo
            companyName={application.company_name}
            domain={application.company_domain}
            size="md"
          />
          <div className="min-w-0">
            <p className="text-[12px] text-foreground-secondary">
              {application.company_name}
            </p>
            <h2 className="mt-0.5 break-words text-[18px] font-medium leading-snug text-foreground">
              {application.original_job_title}
            </h2>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-[11px] uppercase tracking-[0.07em] text-foreground-muted">
            Current status
          </span>
          <ApplicationStatusDot status={application.current_status} />
        </div>
      </div>

      {lifecycle ? (
        <div className="border-b border-border px-5 py-4">
          <LifecycleRail lifecycle={lifecycle} />
        </div>
      ) : null}

      <dl className="px-5">
        <PreviewFact icon={MapPin} label="Location" value={location} />
        <PreviewFact
          icon={CalendarDays}
          label="Work term"
          value={application.work_term_season}
        />
        <PreviewFact
          icon={Tag}
          label="Category"
          value={application.normalized_job_category}
        />
        <PreviewFact
          icon={Monitor}
          label="Work arrangement"
          value={
            application.work_arrangement === "Unknown"
              ? "Not recorded"
              : application.work_arrangement
          }
        />
        <PreviewFact
          icon={CalendarDays}
          label="Next action"
          value={nextActionValue}
        />
      </dl>

      {basePath === "" ? (
        <div className="border-t border-border p-5">
          <ButtonLink
            className="w-full justify-center"
            href={applicationPath(application.id)}
            variant="secondary"
          >
            Open full record
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </ButtonLink>
        </div>
      ) : null}
    </aside>
  );
}

/**
 * The shared application index.
 *
 * At `xl` the list becomes a selected-record workspace. Below that breakpoint
 * the exact same row control follows its existing detail URL, so tablet and
 * phone layouts never inherit desktop-only disclosure UI. The homepage opts
 * out through `showSummary={false}` and remains a simple linked excerpt.
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
  const [selectedId, setSelectedId] = useState(applications[0]?.id ?? null);
  const [expandedDemoId, setExpandedDemoId] = useState<string | null>(null);
  const previewId = useId();
  const contextPrefix = useId();
  const demoWorkspace = basePath === "/demo";
  const selectedApplication =
    applications.find((application) => application.id === selectedId) ??
    applications[0];

  const selectOnDesktop = (
    event: MouseEvent<HTMLAnchorElement>,
    applicationId: string,
  ) => {
    if (!showSummary || !window.matchMedia(DESKTOP_QUERY).matches) return;
    event.preventDefault();
    setSelectedId(applicationId);
  };

  const list = (
    <div className="min-w-0">
      {showSummary ? (
        <div className="flex items-center justify-between border-b border-border pb-2 text-[12px] text-foreground-muted">
          <p>
            {applications.length} application{applications.length === 1 ? "" : "s"}
          </p>
          <p className="hidden xl:block">Select a record to preview</p>
        </div>
      ) : null}

      {showSummary ? (
        <div className="hidden grid-cols-[minmax(0,42fr)_minmax(13rem,36fr)_minmax(7rem,22fr)] gap-5 border-b border-border px-3 py-2 text-[11px] uppercase tracking-[0.07em] text-foreground-muted md:grid">
          <span>Application</span>
          <span>Progress</span>
          <span>Next</span>
        </div>
      ) : null}

      <ul aria-label="Applications" className={showSummary ? "" : "border-t border-border"}>
        {applications.map((application) => {
          const date = contextDate(application);
          const lifecycle = lifecycles?.get(application.id);
          const selected = showSummary && selectedApplication?.id === application.id;
          const detailPath = applicationPath(application.id, basePath);
          const demoExpanded =
            demoWorkspace && expandedDemoId === application.id;
          const contextId = `${contextPrefix}-${application.id}`;
          const rowContent = (
            <div className="grid gap-4 md:grid-cols-[minmax(0,42fr)_minmax(13rem,36fr)_minmax(7rem,22fr)] md:items-center md:gap-5">
              <Identity application={application} />
              <Progress application={application} lifecycle={lifecycle} />
              <div className="flex min-w-0 items-center justify-between gap-2">
                <Next date={date} />
                <ChevronRight
                  aria-hidden="true"
                  className={`size-4 shrink-0 transition-transform ${
                    selected || demoExpanded
                      ? "text-accent"
                      : "text-foreground-muted"
                  } ${demoExpanded ? "rotate-90 xl:rotate-0" : ""}`}
                  strokeWidth={1.5}
                />
              </div>
            </div>
          );

          return (
            <li
              className={`relative border-b border-border transition-colors hover:bg-surface-muted/70 ${
                selected
                  ? "xl:border-l-2 xl:border-l-accent xl:bg-accent-soft/35"
                  : "xl:border-l-2 xl:border-l-transparent"
              } ${
                demoExpanded
                  ? "border-l-2 border-l-accent bg-accent-soft/25 xl:border-l-accent"
                  : ""
              }`}
              key={application.id}
            >
              {!showSummary ? (
                <div className="px-3 py-3 md:min-h-[84px]">{rowContent}</div>
              ) : demoWorkspace ? (
                <button
                  aria-controls={`${previewId} ${contextId}`}
                  aria-expanded={demoExpanded}
                  aria-label={`${demoExpanded ? "Hide" : "Show"} details for ${application.original_job_title}`}
                  aria-pressed={selected}
                  className="block w-full rounded-control px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus md:min-h-[84px]"
                  onClick={() => {
                    if (window.matchMedia(DESKTOP_QUERY).matches) {
                      setSelectedId(application.id);
                      return;
                    }
                    setExpandedDemoId(
                      demoExpanded ? null : application.id,
                    );
                  }}
                  type="button"
                >
                  {rowContent}
                </button>
              ) : (
                <Link
                  aria-controls={previewId}
                  aria-current={selected ? "true" : undefined}
                  aria-label={application.original_job_title}
                  className="block rounded-control px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus md:min-h-[84px]"
                  href={detailPath}
                  onClick={(event) => selectOnDesktop(event, application.id)}
                >
                  {rowContent}
                </Link>
              )}
              {demoExpanded ? (
                <DemoInlineContext
                  application={application}
                  contextId={contextId}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (!showSummary || !selectedApplication) return list;

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(17rem,3fr)] xl:items-start xl:gap-6">
      {list}
      <SelectedRecordPreview
        application={selectedApplication}
        basePath={basePath}
        lifecycle={lifecycles?.get(selectedApplication.id)}
        previewId={previewId}
      />
    </div>
  );
}
