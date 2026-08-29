"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  DollarSign,
  FileText,
  MapPin,
  Monitor,
  StickyNote,
  Tag,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { ApplicationStatusDot } from "@/components/applications/application-status";
import { LifecycleRail } from "@/components/applications/lifecycle-rail";
import { CompanyLogo } from "@/components/branding/company-logo";
import { ButtonLink } from "@/components/ui/button";
import { contextDate, type ContextDate } from "@/lib/applications/context-date";
import {
  buildApplicationIndexLifecycles,
  type Lifecycle,
} from "@/lib/applications/lifecycle";
import { displayOptionalText } from "@/lib/applications/mapper";
import {
  APPLICATION_STATUS_SUMMARIES,
  type ApplicationStatus,
} from "@/lib/applications/constants";
import type { ActiveApplicationFilters } from "@/lib/applications/repository";
import { toApplicationStatusSummaryUrl } from "@/lib/applications/search-params";
import type {
  ApplicationListItem,
  ApplicationPreviewContent,
  ApplicationStatusEvent,
} from "@/lib/applications/types";
import { formatDateOnly } from "@/lib/dates/date-only";
import {
  applicationPath,
  applicationsPath,
  type WorkspaceBasePath,
} from "@/lib/demo/paths";
import { cn } from "@/lib/utils";

const DESKTOP_QUERY = "(min-width: 1280px)";

function Identity({
  application,
  nextContext,
}: {
  application: ApplicationListItem;
  nextContext: ContextDate;
}) {
  const location = displayOptionalText(application.location);

  return (
    <div className="flex min-w-0 items-start gap-3.5">
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
        <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-foreground-muted">
          {location ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{location}</span>
            </span>
          ) : null}
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <CalendarDays aria-hidden="true" className="size-3" strokeWidth={1.5} />
            {application.work_term_season}
          </span>
          {nextContext ? <InlineNext date={nextContext} /> : null}
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
  const arrangement =
    application.work_arrangement === "Unknown"
      ? null
      : application.work_arrangement;
  const nextAction = displayOptionalText(application.next_action);

  return (
    <section
      aria-label={`${application.original_job_title} details`}
      className="mx-3 mb-3 rounded-lg bg-surface-muted/55 px-4 py-4 xl:hidden"
      id={contextId}
    >
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <InlineFact label="Category" value={application.normalized_job_category} />
        {arrangement ? (
          <InlineFact label="Work arrangement" value={arrangement} />
        ) : null}
        {application.date_applied ? (
          <InlineFact
            label="Date applied"
            value={formatDateOnly(application.date_applied)}
          />
        ) : null}
        {application.application_deadline ? (
          <InlineFact
            label="Deadline"
            value={formatDateOnly(application.application_deadline)}
          />
        ) : null}
        {nextAction ? <InlineFact label="Next action" value={nextAction} /> : null}
        {application.next_action_due_date ? (
          <InlineFact
            label="Next action due"
            value={formatDateOnly(application.next_action_due_date)}
          />
        ) : null}
      </dl>
    </section>
  );
}

function Progress({
  application,
  lifecycle,
  detail = false,
}: {
  application: ApplicationListItem;
  lifecycle: Lifecycle | undefined;
  detail?: boolean;
}) {
  return (
    <div className="min-w-0">
      {lifecycle ? (
        <LifecycleRail lifecycle={lifecycle} size={detail ? "detail" : "compact"} />
      ) : null}
      <p className={lifecycle ? "mt-2.5 text-center" : ""}>
        <ApplicationStatusDot status={application.current_status} />
      </p>
    </div>
  );
}

function InlineNext({ date }: { date: NonNullable<ContextDate> }) {
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 text-foreground-secondary"
      data-next-context
    >
      <CalendarDays
        aria-hidden="true"
        className="size-3 shrink-0"
        strokeWidth={1.5}
      />
      <span className="truncate">
        {date.kind === "next-action" ? date.action : "Application deadline"}
      </span>
      <span aria-hidden="true">·</span>
      <span className="shrink-0">{formatDateOnly(date.date)}</span>
    </span>
  );
}

function StatusSummary({
  basePath,
  filters,
  statuses,
}: {
  basePath: WorkspaceBasePath;
  filters: ActiveApplicationFilters;
  statuses: readonly ApplicationStatus[];
}) {
  const segments = [
    {
      key: "all",
      label: "All",
      count: statuses.length,
      href: toApplicationStatusSummaryUrl(
        applicationsPath(basePath),
        filters,
      ),
      selected: !filters.status && !filters.statusSummary,
    },
    ...APPLICATION_STATUS_SUMMARIES.map((summary) => ({
      key: summary.key,
      label: summary.label,
      count: statuses.filter((status) =>
        (summary.statuses as readonly ApplicationStatus[]).includes(status),
      ).length,
      href: toApplicationStatusSummaryUrl(
        applicationsPath(basePath),
        filters,
        summary,
      ),
      selected:
        filters.statusSummary === summary.key ||
        Boolean(
          filters.status &&
            (summary.statuses as readonly ApplicationStatus[]).includes(
              filters.status,
            ),
        ),
    })),
  ];

  return (
    <ul
      aria-label="Application status summary"
      className="grid grid-cols-2 gap-1.5 rounded-surface bg-surface-muted/55 p-1.5 sm:grid-cols-5"
    >
      {segments.map((segment) => (
        <li key={segment.key}>
          <Link
            aria-current={segment.selected ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors sm:justify-center",
              segment.selected
                ? "bg-accent-soft text-accent"
                : "bg-surface/70 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            )}
            href={segment.href}
          >
            <span className="text-[12px]">{segment.label}</span>
            <span className="text-[15px] font-medium tabular-nums text-foreground">
              {segment.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PreviewFact({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5">
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

function PreviewDisclosure({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <details className="group border-t border-border/60 px-5 py-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control text-[12px] font-medium text-foreground-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        <span className="flex-1">{label}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          strokeWidth={1.5}
        />
      </summary>
      <p className="mt-3 whitespace-pre-wrap text-[13px] leading-5 text-foreground-secondary">
        {value}
      </p>
    </details>
  );
}

function SelectedRecordPreview({
  application,
  basePath,
  content,
  lifecycle,
  onClose,
  previewRef,
  previewId,
}: {
  application: ApplicationListItem;
  basePath: WorkspaceBasePath;
  content: ApplicationPreviewContent | undefined;
  lifecycle: Lifecycle | undefined;
  onClose: () => void;
  previewRef: RefObject<HTMLElement | null>;
  previewId: string;
}) {
  const location = displayOptionalText(application.location);
  const workTerm = displayOptionalText(application.work_term_season);
  const nextAction = displayOptionalText(application.next_action);
  const salary = displayOptionalText(content?.salary);
  const jobDescription = displayOptionalText(content?.job_description);
  const previewNote = displayOptionalText(content?.notes);
  const facts = [
    location ? { icon: MapPin, label: "Location", value: location } : null,
    workTerm ? { icon: CalendarDays, label: "Work term", value: workTerm } : null,
    {
      icon: Tag,
      label: "Category",
      value: application.normalized_job_category,
    },
    application.work_arrangement !== "Unknown"
      ? {
          icon: Monitor,
          label: "Work arrangement",
          value: application.work_arrangement,
        }
      : null,
    application.application_deadline
      ? {
          icon: CalendarDays,
          label: "Application deadline",
          value: formatDateOnly(application.application_deadline),
        }
      : null,
    salary ? { icon: DollarSign, label: "Salary", value: salary } : null,
  ].filter((fact): fact is { icon: LucideIcon; label: string; value: string } =>
    Boolean(fact),
  );

  return (
    <aside
      aria-label="Selected application preview"
      className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto overscroll-contain rounded-xl border border-border/70 bg-surface shadow-sm"
      data-sticky-preview
      id={previewId}
      ref={previewRef}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <CompanyLogo
            companyName={application.company_name}
            domain={application.company_domain}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-foreground-secondary">
              {application.company_name}
            </p>
            <h2 className="mt-0.5 break-words text-[18px] font-medium leading-snug text-foreground">
              {application.original_job_title}
            </h2>
          </div>
          <button
            aria-label="Close application preview"
            className="grid size-8 shrink-0 place-items-center rounded-control text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-5 rounded-lg bg-accent-soft/45 px-4 py-4">
          <Progress application={application} detail lifecycle={lifecycle} />
        </div>
      </div>

      {facts.length ? (
        <dl className="grid gap-5 border-t border-border/60 px-5 py-5 sm:grid-cols-2 xl:grid-cols-1">
          {facts.map((fact) => (
            <PreviewFact {...fact} key={fact.label} />
          ))}
        </dl>
      ) : null}

      {basePath === "" ? (
        <div className="border-t border-border/60 p-5">
          <ButtonLink
            className="w-full justify-center"
            href={applicationPath(application.id)}
          >
            Open full application
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </ButtonLink>
        </div>
      ) : null}

      {nextAction ? (
        <section className="border-t border-border/60 px-5 py-5">
          <h3 className="text-[11px] uppercase tracking-[0.07em] text-foreground-muted">
            Next action
          </h3>
          <p className="mt-2 text-[13px] leading-5 text-foreground">{nextAction}</p>
          {application.next_action_due_date ? (
            <p className="mt-1 text-[12px] text-foreground-muted">
              Due {formatDateOnly(application.next_action_due_date)}
            </p>
          ) : null}
        </section>
      ) : null}

      {jobDescription ? (
        <PreviewDisclosure
          icon={FileText}
          label="Job description"
          value={jobDescription}
        />
      ) : null}
      {previewNote ? (
        <PreviewDisclosure icon={StickyNote} label="Notes" value={previewNote} />
      ) : null}
    </aside>
  );
}

/**
 * The shared Applications index.
 *
 * Wide desktop starts as a full-width index and opens a contextual preview
 * only after selection. Production links keep their ordinary destination
 * below that breakpoint. Demo rows instead expand read-only context in place,
 * and homepage excerpts remain static at every width.
 */
export function ApplicationRecords({
  applications,
  basePath = "",
  filters = {},
  history,
  previewContent = [],
  showSummary = true,
  summaryStatuses,
}: {
  applications: readonly ApplicationListItem[];
  basePath?: WorkspaceBasePath;
  filters?: ActiveApplicationFilters;
  history: readonly ApplicationStatusEvent[] | null;
  previewContent?: readonly ApplicationPreviewContent[];
  showSummary?: boolean;
  summaryStatuses?: readonly ApplicationStatus[];
}) {
  const lifecycles = buildApplicationIndexLifecycles(applications, history);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedDemoId, setExpandedDemoId] = useState<string | null>(null);
  const previewId = useId();
  const rowPrefix = useId();
  const contextPrefix = useId();
  const previewRef = useRef<HTMLElement | null>(null);
  const demoWorkspace = basePath === "/demo";
  const selectedApplication = selectedId
    ? applications.find((application) => application.id === selectedId)
    : undefined;
  const previewContentById = useMemo(
    () => new Map(previewContent.map((content) => [content.id, content])),
    [previewContent],
  );
  const datesById = useMemo(
    () => new Map(applications.map((application) => [application.id, contextDate(application)])),
    [applications],
  );
  const rowGrid = "md:grid-cols-[minmax(0,42fr)_minmax(18rem,58fr)]";

  useEffect(() => {
    if (selectedId && previewRef.current) previewRef.current.scrollTop = 0;
  }, [selectedId]);

  const selectOnDesktop = (
    event: MouseEvent<HTMLAnchorElement>,
    applicationId: string,
  ) => {
    if (!showSummary || !window.matchMedia(DESKTOP_QUERY).matches) return;
    event.preventDefault();
    setSelectedId(applicationId);
  };

  const closePreview = () => {
    if (selectedApplication) {
      document.getElementById(`${rowPrefix}-${selectedApplication.id}`)?.focus();
    }
    setSelectedId(null);
  };

  const list = (
    <div className="min-w-0">
      {showSummary ? (
        <StatusSummary
          basePath={basePath}
          filters={filters}
          statuses={
            summaryStatuses ??
            applications.map((application) => application.current_status)
          }
        />
      ) : null}

      <div
        className={cn(
          "overflow-hidden bg-surface",
          showSummary
            ? "mt-4 rounded-xl border border-border/70"
            : "border-y border-border/70",
        )}
      >
        {showSummary ? (
          <div
            className={cn(
              "hidden items-center gap-7 bg-surface-muted/45 px-5 py-2.5 text-[11px] uppercase tracking-[0.07em] text-foreground-muted md:grid",
              rowGrid,
            )}
          >
            <span>Application</span>
            <span>Progress</span>
          </div>
        ) : null}

        <ul aria-label="Applications" className="divide-y divide-border/60">
          {applications.map((application) => {
            const date = datesById.get(application.id) ?? null;
            const lifecycle = lifecycles?.get(application.id);
            const selected = showSummary && selectedApplication?.id === application.id;
            const detailPath = applicationPath(application.id, basePath);
            const demoExpanded = demoWorkspace && expandedDemoId === application.id;
            const contextId = `${contextPrefix}-${application.id}`;
            const rowId = `${rowPrefix}-${application.id}`;
            const chevron = (
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 transition-transform motion-reduce:transition-none",
                  selected || demoExpanded ? "text-accent" : "text-foreground-muted",
                  demoExpanded && "rotate-90 xl:rotate-0",
                )}
                strokeWidth={1.5}
              />
            );
            const rowContent = (
              <div className={cn("grid gap-5 md:items-center md:gap-7", rowGrid)}>
                <Identity application={application} nextContext={date} />
                <div className="flex min-w-0 items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <Progress application={application} lifecycle={lifecycle} />
                  </div>
                  {chevron}
                </div>
              </div>
            );

            return (
              <li
                className={cn(
                  "relative transition-colors hover:bg-surface-muted/55",
                  selected && "xl:bg-accent-soft/45",
                  demoExpanded && "bg-accent-soft/35",
                )}
                key={application.id}
              >
                {!showSummary ? (
                  <div className="px-4 py-4 md:min-h-[96px] md:px-5">
                    {rowContent}
                  </div>
                ) : demoWorkspace ? (
                  <button
                    aria-controls={`${previewId} ${contextId}`}
                    aria-expanded={selected || demoExpanded}
                    aria-label={`${selected || demoExpanded ? "Hide" : "Show"} details for ${application.original_job_title}`}
                    className="block w-full rounded-lg px-4 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-focus md:min-h-[96px] md:px-5"
                    id={rowId}
                    onClick={() => {
                      if (window.matchMedia(DESKTOP_QUERY).matches) {
                        setSelectedId(selected ? null : application.id);
                        return;
                      }
                      setExpandedDemoId(demoExpanded ? null : application.id);
                    }}
                    type="button"
                  >
                    {rowContent}
                  </button>
                ) : (
                  <Link
                    aria-controls={previewId}
                    aria-expanded={selected}
                    aria-label={application.original_job_title}
                    className="block rounded-lg px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-focus md:min-h-[96px] md:px-5"
                    href={detailPath}
                    id={rowId}
                    onClick={(event) => selectOnDesktop(event, application.id)}
                  >
                    {rowContent}
                  </Link>
                )}
                {demoExpanded ? (
                  <DemoInlineContext application={application} contextId={contextId} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  if (!showSummary) return list;

  return (
    <div
      className={cn(
        "grid grid-cols-1 items-start transition-[grid-template-columns,gap] duration-200 ease-out motion-reduce:transition-none",
        selectedApplication
          ? "xl:grid-cols-[minmax(0,7fr)_minmax(19rem,3fr)] xl:gap-6"
          : "xl:grid-cols-[minmax(0,1fr)_0fr] xl:gap-0",
      )}
      data-layout={selectedApplication ? "preview" : "full"}
    >
      {list}
      <div className="hidden min-w-0 self-stretch xl:block">
        {selectedApplication ? (
          <SelectedRecordPreview
            application={selectedApplication}
            basePath={basePath}
            content={previewContentById.get(selectedApplication.id)}
            key={selectedApplication.id}
            lifecycle={lifecycles?.get(selectedApplication.id)}
            onClose={closePreview}
            previewRef={previewRef}
            previewId={previewId}
          />
        ) : null}
      </div>
    </div>
  );
}
