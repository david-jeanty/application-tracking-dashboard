"use client";

import { useId, useState } from "react";
import {
  MILESTONE_BUCKETS,
  MILESTONE_BUCKET_LABELS,
  type MilestoneBucket,
  type PerformanceLens,
  type PerformanceRow,
  type PerformanceSummary,
} from "@/lib/analytics/performance";

/**
 * What happened to submitted applications, by source or by role type.
 *
 * One visualisation with two lenses rather than two charts. A student comparing
 * sources and a student comparing role categories are asking the same question
 * of the same population, and drawing it twice would double the page's visual
 * weight to say one thing. The interaction replaces the clutter.
 *
 * This is the only client component on Analytics, and it holds one piece of
 * state: which lens is showing. Both projections are calculated on the server
 * and arrive as props, so switching lenses re-renders markup and fetches
 * nothing — no request, no loading state, no store.
 */

/**
 * The segment colours, as a progression rather than a palette.
 *
 * Neutral for "did not progress", then the student's own accent at increasing
 * strength for each milestone reached. That is the whole colour system here: a
 * reader can see progression without learning a key, and there is no chart
 * where red means rejection and green means offer — four unrelated hues would
 * make composition impossible to compare across rows and would turn a page
 * about a job search into a status dashboard.
 *
 * Every value derives from `--accent`, so all four accents work and dark mode
 * follows automatically. Colour is never the only carrier: each row states its
 * exact counts as text.
 */
const BUCKET_CLASSES: Record<MilestoneBucket, string> = {
  noResponse: "bg-chart-neutral",
  response: "bg-accent/30",
  interview: "bg-accent/60",
  offer: "bg-accent",
};

const LENS_LABELS: Record<PerformanceLens, string> = {
  source: "Source",
  role: "Role type",
};

/** What the remainder line says, in the vocabulary of the lens showing. */
const LENS_REMAINDER_NOUN: Record<PerformanceLens, [string, string]> = {
  source: ["source", "sources"],
  role: ["role type", "role types"],
};

export function WhatWorks({
  headingId,
  lenses,
  initialLens,
}: {
  headingId: string;
  /** Every lens worth drawing, already filtered by the server. */
  lenses: PerformanceSummary[];
  initialLens: PerformanceLens;
}) {
  const [lens, setLens] = useState<PerformanceLens>(initialLens);
  const groupId = useId();

  const active =
    lenses.find((summary) => summary.lens === lens) ?? lenses[0];

  return (
    <>
      {/*
        The heading and its rule run the full width of the page, like every
        other section in JobTrack. The control does not: a toggle pinned to the
        far right of a 1440px rule floats a quarter of a screen away from the
        rows it re-plots. It sits with the legend instead, on the chart's own
        measure, where the two things that explain the bars are read together.
      */}
      <div className="border-b border-border pb-2">
        <h2 className="text-[17px] font-medium text-foreground" id={headingId}>
          What works
        </h2>
      </div>

      <div className="flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-4">
        <Legend />

        {/*
          A radio group rather than tabs: the rows below are one chart being
          re-plotted, not two panels. Arrow keys and the space bar work because
          these are real buttons in a labelled group, and the selected one is
          announced through `aria-checked` rather than only shown in colour.
          Rendered only when there is a second lens to switch to — a control
          with one option is furniture.
        */}
        {lenses.length > 1 ? (
          <div
            aria-labelledby={groupId}
            className="flex shrink-0 gap-0.5 rounded-record border border-border bg-surface-muted p-0.5"
            role="radiogroup"
          >
            <span className="sr-only" id={groupId}>
              Compare by
            </span>
            {lenses.map((summary) => (
              <button
                aria-checked={summary.lens === active.lens}
                className={`min-h-8 rounded-control px-3 text-[13px] transition-colors ${
                  summary.lens === active.lens
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-foreground-secondary hover:text-foreground"
                }`}
                key={summary.lens}
                onClick={() => setLens(summary.lens)}
                role="radio"
                type="button"
              >
                {LENS_LABELS[summary.lens]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <ul className="mt-6 max-w-3xl space-y-5">
        {active.rows.map((row) => (
          <PerformanceBar key={row.label} row={row} />
        ))}
      </ul>

      <Remainder summary={active} />
    </>
  );
}

/**
 * What the four segments mean, named once above the rows.
 *
 * `Response` is the canonical employer-response set, which includes rejection —
 * so this segment means "the employer recorded something and the application
 * never reached an interview", never "a positive reply". The swatches repeat
 * the bar's own order, so the legend reads left to right exactly as a bar does.
 */
function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {MILESTONE_BUCKETS.map((bucket) => (
        <li
          className="flex items-center gap-1.5 text-[12px] text-foreground-secondary"
          key={bucket}
        >
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-[1px] ${BUCKET_CLASSES[bucket]}`}
          />
          {MILESTONE_BUCKET_LABELS[bucket]}
        </li>
      ))}
    </ul>
  );
}

/**
 * One group: its name, its sample size, its composition, and its exact counts.
 *
 * Every submitted application in the group falls into exactly one segment — its
 * highest recorded milestone — so the bar is a composition that always sums to
 * the whole, and two groups of very different sizes stay comparable.
 *
 * The counts line is the accessible content, not a fallback: the bar is hidden
 * from assistive technology because it restates those numbers, and nothing here
 * needs hover, a pointer, or colour vision. A touch user and a keyboard user
 * get the same figures a mouse user does, because there is nothing to reveal.
 */
function PerformanceBar({ row }: { row: PerformanceRow }) {
  const quiet = row.isSmallSample || row.isUnspecified;

  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p
          className={`min-w-0 text-[14px] ${
            quiet ? "text-foreground-secondary" : "font-medium text-foreground"
          }`}
        >
          {row.label}
          {/*
            Stated, not warned about. A muted label is the whole treatment for a
            small sample: no icon, no colour, no caution — the numbers are the
            student's own and are shown exactly as they are.
          */}
          {row.isSmallSample ? (
            <span className="ml-2 text-[11px] text-foreground-muted">
              small sample
            </span>
          ) : null}
        </p>
        <p className="shrink-0 text-[13px] tabular-nums text-foreground-secondary">
          <span aria-hidden="true">n={row.submitted}</span>
          <span className="sr-only">
            {row.submitted} submitted{" "}
            {row.submitted === 1 ? "application" : "applications"}
          </span>
        </p>
      </div>

      {/*
        Segments divide the track by ratio — `flexGrow` on a zero basis — rather
        than each claiming a percentage width. There are no gaps between them,
        so the row is a continuous 100% bar and adjacent segments are told apart
        by their step in the accent progression.
      */}
      <div
        aria-hidden="true"
        className="mt-2 flex h-5 w-full overflow-hidden rounded-[2px] bg-surface-muted"
      >
        {MILESTONE_BUCKETS.map((bucket) =>
          row.buckets[bucket] === 0 ? null : (
            <span
              className={`h-full ${BUCKET_CLASSES[bucket]}`}
              key={bucket}
              style={{ flexBasis: 0, flexGrow: row.buckets[bucket] }}
            />
          ),
        )}
      </div>

      <p className="mt-1.5 text-[12px] leading-5 text-foreground-muted">
        {MILESTONE_BUCKETS.map((bucket, index) => (
          <span key={bucket}>
            {index > 0 ? " · " : null}
            {MILESTONE_BUCKET_LABELS[bucket]}{" "}
            <span className="tabular-nums text-foreground-secondary">
              {row.buckets[bucket]}
            </span>
          </span>
        ))}
      </p>
    </li>
  );
}

/**
 * What the chart left out, stated exactly.
 *
 * The alternative was an `Other` bar, and an aggregate of several real sources
 * is a composition nobody can act on — drawn beside `Not specified`, which is
 * an absent record rather than a mixture, the two would read as comparable rows
 * when they are not. A sentence keeps the totals recoverable without inventing
 * a source that does not exist.
 */
function Remainder({ summary }: { summary: PerformanceSummary }) {
  if (summary.remainder.groups === 0) return null;

  const [singular, plural] = LENS_REMAINDER_NOUN[summary.lens];
  const noun = summary.remainder.groups === 1 ? singular : plural;
  const applications =
    summary.remainder.submitted === 1 ? "application" : "applications";

  return (
    <p className="pt-5 text-[12px] leading-6 text-foreground-muted">
      {summary.remainder.submitted} submitted {applications} from{" "}
      {summary.remainder.groups} other {noun}{" "}
      {summary.remainder.groups === 1 ? "is" : "are"} not shown.
    </p>
  );
}
