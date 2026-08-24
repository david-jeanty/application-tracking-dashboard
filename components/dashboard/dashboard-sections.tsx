import { ArrowRight, CalendarClock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { STATUS_PARAM } from "@/lib/applications/search-params";
import type { AttentionItem, AttentionReason } from "@/lib/dashboard/attention";
import {
  activityDayLabel,
  groupActivityByDay,
  type ActivityEntry,
  type PipelineStage,
  type WeekSummary,
} from "@/lib/dashboard/calculate";
import { formatDateOnly } from "@/lib/dates/date-only";

/**
 * What each attention reason is called, and how it is toned.
 *
 * Five priority tiers collapse to three labels, because the tiers exist to
 * rank the list and the labels exist to name the kind of thing an entry is. A
 * student does not need to know that a deadline tomorrow outranks a follow-up
 * due Friday; they need to know which is which.
 *
 * The label is the accessible carrier: every entry states its reason and its
 * timing in words, so colour is a second signal for people who can use it
 * rather than the only one. Several tiers deliberately share a tone — the
 * distinction between them lives in the text, not the swatch.
 */
const reasonPresentation: Record<
  AttentionReason,
  { label: string; className: string }
> = {
  "overdue-action": {
    label: "Overdue",
    className: "border-red-200 bg-red-50 text-red-800",
  },
  "deadline-critical": {
    label: "Deadline",
    className: "border-red-200 bg-red-50 text-red-800",
  },
  "action-due-now": {
    label: "Next action",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  "deadline-important": {
    label: "Deadline",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  "action-due-soon": {
    label: "Next action",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
};

function SectionHeading({
  children,
  id,
}: {
  children: React.ReactNode;
  id: string;
}) {
  return (
    <h2 className="text-base font-semibold text-slate-950" id={id}>
      {children}
    </h2>
  );
}

/**
 * One headline number for the search summary.
 *
 * Smaller than the analytics `StatTile` on purpose. Four of these sit above the
 * section a student actually came for, so they report rather than dominate.
 */
export function SummaryTile({
  context,
  label,
  value,
}: {
  context: string;
  label: string;
  value: number;
}) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{context}</p>
    </Card>
  );
}

/**
 * What needs doing now, most urgent first.
 *
 * Each row is a link to the application, because every entry here is a prompt
 * to go and do something and the row is the largest, easiest target for that.
 * The reason and the timing are both text; nothing about an entry is knowable
 * only from its colour.
 */
export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="flex items-start gap-3 p-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <CheckCircle2 aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="font-semibold text-slate-950">You&rsquo;re caught up.</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Nothing you noted is due, and no application you are still working
            on is about to close.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-slate-100">
      <ul>
        {items.map((item) => {
          const presentation = reasonPresentation[item.reason];

          return (
            <li className="border-b border-slate-100 last:border-b-0" key={item.applicationId}>
              <Link
                className="flex flex-col gap-2 p-4 hover:bg-slate-50/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                href={`/applications/${item.applicationId}`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">
                    {item.companyName}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-slate-600">
                    {item.detail || item.jobTitle}
                  </p>
                  {/*
                    Only deadlines carry a note, and it says why the deadline
                    still applies: how long the application has sat, and that
                    it has not been submitted. Stated, never advised — the
                    dashboard does not tell a student what to do about it.
                  */}
                  {item.note ? (
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {item.note}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${presentation.className}`}
                  >
                    {presentation.label}
                  </span>
                  <span className="text-sm font-medium text-slate-800">
                    {item.timing}
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-slate-400"
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * Where active applications currently sit.
 *
 * A list of links rather than a drawn funnel. Five counts do not need a chart,
 * and each row has somewhere useful to go: the applications list with the
 * status filter that already exists, so this introduces no second filtering
 * vocabulary. The arrows are decorative and hidden from assistive technology —
 * the reading order already carries the progression.
 */
export function PipelineSnapshot({ stages }: { stages: PipelineStage[] }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading id="dashboard-pipeline">Pipeline snapshot</SectionHeading>
        <p className="text-sm text-slate-600">
          {total} active {total === 1 ? "application" : "applications"} in
          progress
        </p>
      </div>

      <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {stages.map((stage, index) => (
          <li className="flex items-center gap-2 sm:flex-1" key={stage.status}>
            <Link
              className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:flex-col sm:items-start sm:gap-1"
              href={`/applications?${STATUS_PARAM}=${encodeURIComponent(stage.status)}`}
            >
              <span className="text-sm font-medium text-slate-700">
                {stage.status}
              </span>
              <span className="text-xl font-semibold tabular-nums text-slate-950">
                {stage.count}
                <span className="sr-only">
                  {" "}
                  {stage.count === 1 ? "application" : "applications"}
                </span>
              </span>
            </Link>
            {index < stages.length - 1 ? (
              <ArrowRight
                aria-hidden="true"
                className="hidden size-4 shrink-0 self-center text-slate-300 sm:block"
              />
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * This week's activity, stated and not scored.
 *
 * No target, no streak, no comparison with last week. A quiet week in a job
 * search is usually a fact about employers, and turning it into a number a
 * student is failing to hit would make this the section they avoid.
 */
export function ThisWeek({
  week,
  weekStartLabel,
}: {
  week: WeekSummary;
  weekStartLabel: string;
}) {
  const metrics = [
    { label: "Applications submitted", value: week.submitted },
    { label: "Status changes", value: week.statusChanges },
    { label: "Interviews reached", value: week.interviews },
  ];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading id="dashboard-week">This week</SectionHeading>
        <p className="text-sm text-slate-600">Since {weekStartLabel}</p>
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt className="text-sm text-slate-600">{metric.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/**
 * The last few things that actually happened.
 *
 * Grouped by day, newest first, with each entry naming the company and what
 * changed. Every row is a real recorded event — a creation or a status change —
 * so nothing here is inferred or reconstructed.
 */
export function RecentActivity({
  entries,
  today,
}: {
  entries: ActivityEntry[];
  today: string;
}) {
  if (entries.length === 0) {
    return (
      <Card className="p-5">
        <SectionHeading id="dashboard-activity">Recent activity</SectionHeading>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Nothing has changed yet. Saving an application or moving its status
          will show up here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <SectionHeading id="dashboard-activity">Recent activity</SectionHeading>
      <div className="mt-4 space-y-4">
        {groupActivityByDay(entries).map((group) => (
          <section key={group.day}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {activityDayLabel(group.day, today, formatDateOnly)}
            </h3>
            <ul className="mt-1.5 space-y-1.5">
              {group.entries.map((entry) => (
                <li
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                  key={`${entry.applicationId}-${entry.changedAt}`}
                >
                  <Link
                    className="rounded-sm font-medium text-blue-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    href={`/applications/${entry.applicationId}`}
                  >
                    {entry.companyName}
                  </Link>
                  <span className="text-slate-600">{entry.description}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

/** The handoff to the page that answers a different question. */
export function AnalyticsLink() {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
          <CalendarClock aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-950">
            How is the search going overall?
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
            This page is about today. Analytics covers the whole search —
            response rates, how far applications got, and what you have applied
            to.
          </p>
        </div>
      </div>
      <ButtonLink className="shrink-0" href="/analytics" variant="secondary">
        View full analytics
        <ArrowRight aria-hidden="true" className="size-4" />
      </ButtonLink>
    </Card>
  );
}
