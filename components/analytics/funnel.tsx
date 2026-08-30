import { SectionHeading } from "@/components/analytics/section";
import {
  EM_DASH,
  formatPercent,
  formatRatio,
} from "@/lib/analytics/definitions";
import type {
  FunnelMilestone,
  FunnelSummary,
  FunnelTransition,
} from "@/lib/analytics/funnel";

/**
 * One conversion workspace: the historical path is primary and the narrowing
 * conclusion, when supported, is attached to it rather than promoted into a
 * second chart. The grid exists only when the conclusion exists, so sparse
 * histories leave no reserved column behind.
 */
export function ConversionWorkspace({ funnel }: { funnel: FunnelSummary }) {
  return (
    <div
      className={`overflow-hidden border-y border-border bg-surface ${
        funnel.narrowing
          ? "xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]"
          : ""
      }`}
      data-analytics-conversion-workspace
      data-has-narrowing={funnel.narrowing ? "true" : "false"}
    >
      <Funnel funnel={funnel} />
      {funnel.narrowing ? <FunnelNarrowing funnel={funnel} /> : null}
    </div>
  );
}

/** A connected milestone path over historical records, never user-level flow. */
export function Funnel({ funnel }: { funnel: FunnelSummary }) {
  return (
    <section
      aria-labelledby="analytics-funnel"
      className="min-w-0 px-4 py-5 sm:px-6 sm:py-6 lg:px-7"
    >
      <SectionHeading id="analytics-funnel">Your funnel</SectionHeading>

      <ol className="mt-6 grid gap-0 sm:grid-cols-4" data-funnel-path>
        {funnel.milestones.map((milestone, index) => (
          <FunnelStage
            key={milestone.key}
            milestone={milestone}
            transition={index > 0 ? funnel.transitions[index - 1] : null}
          />
        ))}
      </ol>

      <SearchRatios funnel={funnel} />
      <p className="mt-4 max-w-2xl text-[11px] leading-5 text-foreground-muted">
        Stages summarize the furthest recorded milestone across your historical
        applications; the path does not represent individual application journeys.
      </p>
    </section>
  );
}

function FunnelStage({
  milestone,
  transition,
}: {
  milestone: FunnelMilestone;
  transition: FunnelTransition | null;
}) {
  const submittedShare = Math.round(milestone.widthPercent);

  return (
    <li className="relative min-w-0 border-l-2 border-border-strong pb-6 pl-5 last:pb-0 sm:border-l-0 sm:border-t-2 sm:pb-0 sm:pl-0 sm:pr-4 sm:pt-5 sm:last:pr-0">
      <span
        aria-hidden="true"
        className="absolute -left-[5px] top-0 size-2 rounded-full bg-accent sm:-top-[5px] sm:left-0"
      />

      <div className="flex items-start justify-between gap-3 sm:block">
        <p className="text-[13px] font-medium leading-5 text-foreground">
          {milestone.label}
          <span className="sr-only">
            , {milestone.count}{" "}
            {milestone.count === 1 ? "application" : "applications"}
          </span>
        </p>
        <span
          aria-hidden="true"
          className="text-[28px] font-medium leading-none tabular-nums tracking-tight text-foreground sm:mt-2 sm:block"
        >
          {milestone.count}
        </span>
      </div>

      <p className="mt-1 text-[11px] tabular-nums text-foreground-muted sm:mt-2">
        {formatPercent(submittedShare)} of submitted
      </p>

      {transition ? (
        <p className="mt-2 text-[12px] leading-5 text-foreground-secondary">
          {transition.percent === undefined ? (
            <>
              <span aria-hidden="true">{EM_DASH}</span>
              <span className="sr-only">Not yet recorded</span>
              <span aria-hidden="true"> continued</span>
            </>
          ) : (
            <>{formatPercent(transition.percent)} continued</>
          )}
        </p>
      ) : (
        <p className="mt-2 text-[12px] leading-5 text-foreground-muted">
          Starting population
        </p>
      )}
    </li>
  );
}

function SearchRatios({ funnel }: { funnel: FunnelSummary }) {
  const ratios = [
    {
      value: formatRatio(funnel.ratios.applicationsPerInterview),
      label: "applications per interview",
    },
    {
      value: formatRatio(funnel.ratios.applicationsPerOffer),
      label: "applications per offer",
    },
  ];

  return (
    <dl className="mt-6 grid grid-cols-2 border-t border-border pt-4 sm:max-w-xl">
      {ratios.map((ratio, index) => (
        <div
          className={`flex min-w-0 flex-col-reverse gap-1 ${
            index === 0 ? "border-r border-border pr-4" : "pl-4"
          }`}
          key={ratio.label}
        >
          <dt className="text-[11px] leading-5 text-foreground-secondary">
            {ratio.label}
          </dt>
          <dd className="text-[22px] font-medium leading-none tabular-nums tracking-tight text-foreground">
            {ratio.value === EM_DASH ? (
              <>
                <span aria-hidden="true">{EM_DASH}</span>
                <span className="sr-only">Not yet recorded</span>
              </>
            ) : (
              ratio.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The supported arithmetic conclusion, attached to the primary evidence. */
export function FunnelNarrowing({ funnel }: { funnel: FunnelSummary }) {
  if (!funnel.narrowing) return null;

  const { transition, percent } = funnel.narrowing;

  return (
    <section
      aria-labelledby="analytics-narrowing"
      className="border-t border-border bg-accent-soft/35 px-4 py-5 sm:px-6 sm:py-6 xl:border-l xl:border-t-0 xl:px-7"
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-accent">
        Recorded narrowing
      </p>
      <h2
        className="mt-2 text-[15px] font-medium leading-6 text-foreground"
        id="analytics-narrowing"
      >
        Where your funnel narrows
      </h2>

      <p className="mt-5 text-[13px] font-medium leading-5 text-foreground-secondary">
        {transition.label}
      </p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[30px] font-medium leading-none tabular-nums tracking-tight text-foreground">
          {formatPercent(percent)}
        </span>
        <span className="text-[12px] tabular-nums text-foreground-secondary">
          {transition.reached} of {transition.denominator} progressed
        </span>
      </p>

      <p className="mt-5 text-[12px] leading-6 text-foreground-muted">
        This describes what happened in your recorded search, not why an
        employer made a decision.
      </p>
    </section>
  );
}
