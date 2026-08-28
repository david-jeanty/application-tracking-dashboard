import {
  PipelineSnapshot,
  RecentActivity,
  SearchSummaryMetrics,
  ThisWeek,
  Upcoming,
} from "@/components/dashboard/dashboard-sections";
import { ButtonLink } from "@/components/ui/button";
import type { DashboardSummary } from "@/lib/dashboard/summary";
import { formatDateOnly } from "@/lib/dates/date-only";
import { applicationsPath, type WorkspaceBasePath } from "@/lib/demo/paths";

/**
 * The page title, with today's date sitting quietly opposite it.
 *
 * The date is there because every section below is relative to it — "this
 * week", "tomorrow", "overdue by two days" all resolve against one day, and
 * saying which one costs a line of grey text. It is text on the page, not a
 * badge.
 */
export function DashboardHeader({ today }: { today: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h1 className="text-[34px] font-medium leading-tight tracking-tight text-foreground sm:text-[38px]">
        Dashboard
      </h1>
      <p className="shrink-0 text-[13px] text-foreground-muted">
        {formatDateOnly(today)}
      </p>
    </div>
  );
}

/**
 * Everything the dashboard renders once `buildDashboard` has spoken.
 *
 * Split from the page so the page keeps only what a page can do — authenticate,
 * read, and report a failed read — and so the same composition can be rendered
 * from any source of the same rows. The authenticated workspace feeds it an
 * owner-scoped query; the public demo feeds it fixtures. Both go through
 * `buildDashboard` first, so every figure on either page comes from the same
 * calculation and neither has numbers of its own.
 *
 * It reads no clock and no request: `today` is resolved once by the caller,
 * through the product's timezone helper, and passed in.
 */
export function DashboardView({
  basePath = "",
  dashboard,
  today,
}: {
  basePath?: WorkspaceBasePath;
  /** The `ready` or `empty` summary. A failed read is the page's to report. */
  dashboard: Extract<DashboardSummary, { kind: "ready" | "empty" }>;
  today: string;
}) {
  if (dashboard.kind === "empty") {
    return (
      <div className="space-y-8">
        <DashboardHeader today={today} />
        <section aria-labelledby="dashboard-empty">
          <div className="border-b border-border pb-2">
            <h2
              className="text-[17px] font-medium text-foreground"
              id="dashboard-empty"
            >
              Your search
            </h2>
          </div>
          <p className="pt-6 text-[16px] text-foreground">No applications yet.</p>
          <p className="mt-1.5 max-w-md text-[14px] leading-6 text-foreground-secondary">
            Save your first application and Interndex will show your search
            overview, pipeline, recent activity, and upcoming dates here.
          </p>
          <div className="mt-5">
            <ButtonLink href={applicationsPath(basePath)}>
              Add application
            </ButtonLink>
          </div>
        </section>
      </div>
    );
  }

  const { search } = dashboard;

  return (
    <div className="space-y-10">
      <DashboardHeader today={today} />

      <section aria-labelledby="dashboard-summary">
        <div className="border-b border-border pb-2">
          <h2
            className="text-[17px] font-medium text-foreground"
            id="dashboard-summary"
          >
            Your search
          </h2>
        </div>
        <SearchSummaryMetrics
          metrics={[
            { label: "Applications", value: search.applications },
            { label: "Submitted", value: search.submitted },
            { label: "Interviews", value: search.interviews },
            { label: "Offers", value: search.offers },
          ]}
        />
      </section>

      <PipelineSnapshot basePath={basePath} stages={dashboard.pipeline} />

      <RecentActivity
        basePath={basePath}
        entries={dashboard.activity}
        today={today}
      />

      <ThisWeek
        basePath={basePath}
        week={dashboard.week}
        weekStartLabel={formatDateOnly(dashboard.week.weekStart)}
      />

      {/*
        Conditional, and the page simply ends above it when there is nothing.
        A dashboard that congratulates somebody for having nothing due has made
        itself the point; this section is a utility, not the reason to visit.
      */}
      {dashboard.attention.length > 0 ? (
        <Upcoming basePath={basePath} items={dashboard.attention} />
      ) : null}
    </div>
  );
}
