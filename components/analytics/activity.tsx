import { SectionHeading } from "@/components/analytics/section";
import { ACTIVITY_WEEKS, type ActivitySummary } from "@/lib/analytics/activity";
import { formatMonthDay } from "@/lib/dates/date-only";

/** The unchanged 12-week history, drawn as one restrained line with points. */
const PLOT_TOP = 7;
const PLOT_BOTTOM = 93;
const PLOT_LEFT = 4;
const PLOT_RIGHT = 98;

export function SearchActivity({ activity }: { activity: ActivitySummary }) {
  const peak = Math.max(...activity.weeks.map((week) => week.count), 1);
  const lastIndex = activity.weeks.length - 1;
  const points = activity.weeks.map((week, index) => ({
    ...week,
    x: PLOT_LEFT + (index / lastIndex) * (PLOT_RIGHT - PLOT_LEFT),
    y: PLOT_BOTTOM - (week.count / peak) * (PLOT_BOTTOM - PLOT_TOP),
  }));
  const gridValues = [peak, Math.ceil(peak / 2), 0];

  return (
    <section aria-labelledby="analytics-activity">
      <SectionHeading id="analytics-activity">Search activity</SectionHeading>

      <p className="pt-4 text-[13px] leading-6 text-foreground-secondary">
        Submitted applications by week{" "}
        <span className="text-foreground-muted">
          · Last {ACTIVITY_WEEKS} weeks
        </span>
      </p>

      <div className="mt-5">
        <div
          aria-label={`Line chart of submitted applications by week, last ${ACTIVITY_WEEKS} weeks. Exact weekly values follow.`}
          className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2"
          role="img"
        >
          <div aria-hidden="true" className="relative h-56 sm:h-64">
            {gridValues.map((value, index) => (
              <span
                className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-foreground-muted"
                key={`${value}-${index}`}
                style={{ top: `${PLOT_TOP + index * ((PLOT_BOTTOM - PLOT_TOP) / 2)}%` }}
              >
                {value}
              </span>
            ))}
          </div>

          <div className="relative h-56 min-w-0 sm:h-64" data-activity-plot>
            <svg
              aria-hidden="true"
              className="absolute inset-0 size-full overflow-visible"
              preserveAspectRatio="none"
              role="presentation"
              viewBox="0 0 100 100"
            >
              {[PLOT_TOP, (PLOT_TOP + PLOT_BOTTOM) / 2, PLOT_BOTTOM].map(
                (y) => (
                  <line
                    key={y}
                    stroke="var(--border)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    x1={PLOT_LEFT}
                    x2={PLOT_RIGHT}
                    y1={y}
                    y2={y}
                  />
                ),
              )}
              <polyline
                fill="none"
                points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                stroke="var(--accent)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {points.map((point) => (
              <span
                aria-hidden="true"
                className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow-none"
                key={point.weekStart}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                title={`Week of ${formatMonthDay(point.weekStart)}: ${point.count} submitted ${
                  point.count === 1 ? "application" : "applications"
                }`}
              />
            ))}
          </div>
        </div>

        <ol
          aria-label="Weekly application counts"
          className="mt-3 grid grid-cols-4 border-y border-border sm:grid-cols-6 xl:grid-cols-12"
        >
          {activity.weeks.map((week, index) => (
            <li
              className={`min-w-0 px-1.5 py-2 text-center sm:px-2 ${
                index % 4 !== 0 ? "border-l border-border" : ""
              } sm:border-l sm:first:border-l-0 xl:first:border-l-0`}
              key={week.weekStart}
            >
              <span className="block truncate text-[9px] text-foreground-muted sm:text-[10px]">
                {formatMonthDay(week.weekStart)}
              </span>
              <span className="mt-0.5 block text-[12px] font-medium tabular-nums text-foreground">
                {week.count}
              </span>
              <span className="sr-only">
                Week of {formatMonthDay(week.weekStart)}: {week.count} submitted{" "}
                {week.count === 1 ? "application" : "applications"}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <ActivityCoverage activity={activity} />
    </section>
  );
}

function ActivityCoverage({ activity }: { activity: ActivitySummary }) {
  if (activity.dated >= activity.submitted) return null;

  return (
    <p className="max-w-xl pt-4 text-[12px] leading-6 text-foreground-muted">
      Based on {activity.dated} of {activity.submitted} submitted applications
      with a recorded application date.
    </p>
  );
}
