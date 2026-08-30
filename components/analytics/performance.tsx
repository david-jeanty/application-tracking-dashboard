"use client";

import { useId, useRef, useState } from "react";
import { SectionHeading } from "@/components/analytics/section";
import {
  MILESTONE_BUCKETS,
  MILESTONE_BUCKET_LABELS,
  type MilestoneBucket,
  type PerformanceLens,
  type PerformanceRow,
  type PerformanceSummary,
} from "@/lib/analytics/performance";

const LENS_LABELS: Record<PerformanceLens, string> = {
  source: "Source",
  role: "Role type",
};

const LENS_REMAINDER_NOUN: Record<PerformanceLens, [string, string]> = {
  source: ["source", "sources"],
  role: ["role type", "role types"],
};

const CELL_CLASSES: Record<MilestoneBucket, string> = {
  noResponse: "bg-chart-neutral/30",
  response: "bg-accent/[0.08]",
  interview: "bg-accent/[0.13]",
  offer: "bg-accent/[0.18]",
};

/** Exact recorded outcomes by one eligible lens, without ranking any group. */
export function OutcomeComparison({
  headingId,
  lenses,
  initialLens,
}: {
  headingId: string;
  lenses: PerformanceSummary[];
  initialLens: PerformanceLens;
}) {
  const [lens, setLens] = useState<PerformanceLens>(initialLens);
  const active = lenses.find((summary) => summary.lens === lens) ?? lenses[0];

  return (
    <>
      <SectionHeading
        action={
          lenses.length > 1 ? (
            <LensPicker active={active.lens} lenses={lenses} onSelect={setLens} />
          ) : undefined
        }
        id={headingId}
      >
        Outcome comparison
      </SectionHeading>

      <p className="pt-4 text-[13px] leading-6 text-foreground-secondary">
        Compares recorded outcomes for submitted applications by the selected lens.
      </p>

      <OutcomeMatrix summary={active} />
      <Remainder summary={active} />
    </>
  );
}

function LensPicker({
  active,
  lenses,
  onSelect,
}: {
  active: PerformanceLens;
  lenses: PerformanceSummary[];
  onSelect: (lens: PerformanceLens) => void;
}) {
  const groupId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, step: number) => {
    const next = (from + step + lenses.length) % lenses.length;
    onSelect(lenses[next].lens);
    buttons.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;

    if (step === 0) return;
    event.preventDefault();
    move(index, step);
  };

  return (
    <div
      aria-labelledby={groupId}
      className="flex shrink-0 gap-0.5 rounded-record border border-border bg-surface-muted p-0.5"
      role="radiogroup"
    >
      <span className="sr-only" id={groupId}>
        Compare by
      </span>
      {lenses.map((summary, index) => {
        const selected = summary.lens === active;
        return (
          <button
            aria-checked={selected}
            className={`min-h-8 rounded-control px-3 text-[13px] transition-colors ${
              selected
                ? "bg-accent-soft font-medium text-accent"
                : "text-foreground-secondary hover:text-foreground"
            }`}
            key={summary.lens}
            onClick={() => onSelect(summary.lens)}
            onKeyDown={(event) => onKeyDown(event, index)}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            role="radio"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {LENS_LABELS[summary.lens]}
          </button>
        );
      })}
    </div>
  );
}

function OutcomeMatrix({ summary }: { summary: PerformanceSummary }) {
  return (
    <div
      className="mt-5 min-w-0 overflow-hidden border-y border-border-strong"
      data-outcome-matrix
    >
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">
          Exact recorded outcome counts and rates by{" "}
          {LENS_LABELS[summary.lens].toLowerCase()}
        </caption>
        <colgroup>
          <col className="w-[37%] sm:w-[34%]" />
          {MILESTONE_BUCKETS.map((bucket) => (
            <col key={bucket} />
          ))}
        </colgroup>
        <thead className="bg-surface-muted">
          <tr className="border-b border-border-strong">
            <th
              className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground-secondary sm:px-3 sm:py-2.5 sm:text-[11px]"
              scope="col"
            >
              {LENS_LABELS[summary.lens]}
            </th>
            {MILESTONE_BUCKETS.map((bucket) => (
              <th
                className="border-l border-border-strong px-0.5 py-2 text-center text-[10px] font-semibold leading-[1.2] text-foreground-secondary sm:px-2 sm:py-2.5 sm:text-[11px]"
                key={bucket}
                scope="col"
              >
                {MILESTONE_BUCKET_LABELS[bucket]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((row) => (
            <OutcomeRow key={row.label} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeRow({ row }: { row: PerformanceRow }) {
  return (
    <tr className="border-b border-border-strong last:border-b-0">
      <th
        aria-label={`${row.label}, ${row.submitted} submitted ${
          row.submitted === 1 ? "application" : "applications"
        }${row.isSmallSample ? ", small sample" : ""}`}
        className="bg-surface-muted/40 px-2 py-2.5 text-left align-middle sm:px-3 sm:py-3"
        scope="row"
      >
        <span className="block break-words text-[12px] font-medium leading-[1.35] text-foreground sm:text-[13px]">
          {row.label}
        </span>
        <span className="mt-1 flex flex-wrap gap-x-1 text-[10px] leading-[1.25] tabular-nums text-foreground-secondary sm:text-[11px]">
          <span aria-hidden="true">n={row.submitted}</span>
          {row.isSmallSample ? <span>small sample</span> : null}
          <span className="sr-only">
            {row.submitted} submitted{" "}
            {row.submitted === 1 ? "application" : "applications"}
          </span>
        </span>
      </th>
      {MILESTONE_BUCKETS.map((bucket) => (
        <td
          aria-label={`${MILESTONE_BUCKET_LABELS[bucket]}: ${row.buckets[bucket]} ${
            row.buckets[bucket] === 1 ? "application" : "applications"
          }, ${row.percents[bucket]}%`}
          className={`border-l border-border-strong px-0.5 py-2.5 text-center align-middle sm:px-2 sm:py-3 ${CELL_CLASSES[bucket]}`}
          key={bucket}
        >
          <span className="block text-[15px] font-semibold leading-none tabular-nums text-foreground sm:text-[18px]">
            {row.buckets[bucket]}
          </span>
          <span className="mt-1 block text-[10px] leading-none tabular-nums text-foreground-secondary sm:text-[11px]">
            {row.percents[bucket]}%
          </span>
        </td>
      ))}
    </tr>
  );
}

function Remainder({ summary }: { summary: PerformanceSummary }) {
  if (summary.remainder.groups === 0) return null;

  const [singular, plural] = LENS_REMAINDER_NOUN[summary.lens];
  const noun = summary.remainder.groups === 1 ? singular : plural;
  const applications =
    summary.remainder.submitted === 1 ? "application" : "applications";

  return (
    <p className="pt-4 text-[12px] leading-6 text-foreground-muted">
      {summary.remainder.submitted} submitted {applications} from{" "}
      {summary.remainder.groups} other {noun}{" "}
      {summary.remainder.groups === 1 ? "is" : "are"} not shown.
    </p>
  );
}
