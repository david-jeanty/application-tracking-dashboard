import { SectionHeading } from "@/components/analytics/section";
import type { ActivitySummary } from "@/lib/analytics/activity";
import { formatMonthDay } from "@/lib/dates/date-only";

/**
 * The rhythm of a search: submitted applications, week by week.
 *
 * One line and nothing else. Overlaying responses, interviews, offers and
 * rejections on the same axes would produce four flat lines near zero under one
 * that is not — five series where a student can read none of them.
 *
 * This is history, not a productivity score. There is no target line, no
 * comparison with last week, no arrow, and no colour that means "down". A quiet
 * fortnight in a job search is usually a fact about employers and about term
 * dates, and turning it into something a student is failing at would make this
 * the section they scroll past.
 */

/** The plot's own coordinate space, scaled uniformly to whatever width it gets. */
const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 180;
/** Room for the stroke and the point radius, so neither is clipped at the edges. */
const INSET = 6;

export function SearchActivity({ activity }: { activity: ActivitySummary }) {
  const peak = Math.max(...activity.weeks.map((week) => week.count), 1);
  const lastIndex = activity.weeks.length - 1;

  const points = activity.weeks.map((week, index) => ({
    ...week,
    x: INSET + (index / lastIndex) * (VIEW_WIDTH - INSET * 2),
    y:
      VIEW_HEIGHT - INSET - (week.count / peak) * (VIEW_HEIGHT - INSET * 2),
    /** Where the label sits along the axis, as a share of the plot's width. */
    offset: index / lastIndex,
  }));

  // First, last, and two evenly spaced between. Four labels stay readable at
  // 390px, and the weeks in between are still available as text below.
  const labelled = new Set([
    0,
    Math.floor(lastIndex / 3),
    Math.floor((lastIndex * 2) / 3),
    lastIndex,
  ]);

  return (
    <section aria-labelledby="analytics-activity">
      <SectionHeading id="analytics-activity">Search activity</SectionHeading>

      <p className="pt-5 text-[14px] text-foreground-secondary">
        Submitted applications by week
      </p>

      <div className="mt-4 max-w-3xl">
        <p className="text-[11px] tabular-nums text-foreground-muted">
          {peak} {peak === 1 ? "application" : "applications"}
        </p>

        {/*
          Uniform scaling, so a point stays a circle and the stroke keeps its
          weight at every width. The axis labels are HTML underneath rather than
          text inside the SVG, which is what keeps them at a readable 11px on a
          390px screen instead of being scaled down with the drawing.

          Hidden from assistive technology: every weekly value is in the list
          below, in the same component, so describing the shape as well would be
          repetition rather than an alternative.
        */}
        <svg
          aria-hidden="true"
          className="mt-1 h-auto w-full"
          role="presentation"
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        >
          {/* One rule, at zero. A grid would be scaffolding around twelve points. */}
          <line
            stroke="var(--border)"
            strokeWidth="1"
            x1="0"
            x2={VIEW_WIDTH}
            y1={VIEW_HEIGHT - INSET}
            y2={VIEW_HEIGHT - INSET}
          />
          <polyline
            fill="none"
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            stroke="var(--accent)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          {points.map((point) => (
            <circle
              cx={point.x}
              cy={point.y}
              fill="var(--accent)"
              key={point.weekStart}
              r="3"
            />
          ))}
        </svg>

        {/*
          Positioned against the same fractions the points use, so each label
          sits under its own week. The ends are pulled inside the box rather
          than centred, which is what stops the first and last from overflowing
          the page at 390px.
        */}
        <div className="relative mt-2 h-4">
          {points.map((point, index) =>
            labelled.has(index) ? (
              <span
                className="absolute top-0 whitespace-nowrap text-[11px] text-foreground-muted"
                key={point.weekStart}
                style={{
                  left: `${point.offset * 100}%`,
                  transform: `translateX(-${point.offset * 100}%)`,
                }}
              >
                {formatMonthDay(point.weekStart)}
              </span>
            ) : null,
          )}
        </div>
      </div>

      {/*
        The structured equivalent of the drawing, and the reason the SVG can be
        hidden. Visually hidden rather than absent: the chart communicates
        rhythm, and a reader who wants the twelve exact numbers gets them here
        without the page growing a table nobody asked for.
      */}
      <ul className="sr-only">
        {activity.weeks.map((week) => (
          <li key={week.weekStart}>
            Week of {formatMonthDay(week.weekStart)}: {week.count} submitted{" "}
            {week.count === 1 ? "application" : "applications"}
          </li>
        ))}
      </ul>

      <ActivityCoverage activity={activity} />
    </section>
  );
}

/**
 * How much of the search this line actually describes.
 *
 * Shown only when some submitted application has no recorded application date,
 * because a complete line has nothing to disclose and a permanent caption
 * claiming completeness would be noise. Quiet, factual, and never a prompt to
 * go and fill anything in — the page reports coverage, it does not assign
 * homework.
 */
function ActivityCoverage({ activity }: { activity: ActivitySummary }) {
  if (activity.dated >= activity.submitted) return null;

  return (
    <p className="max-w-xl pt-5 text-[12px] leading-6 text-foreground-muted">
      Based on {activity.dated} of {activity.submitted} submitted applications
      with a recorded application date.
    </p>
  );
}
