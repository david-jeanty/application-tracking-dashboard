import type { SourcePerformanceRow } from "@/lib/analytics/sources";

/**
 * Where a student's submitted applications came from, and what happened to them.
 *
 * A table rather than a chart, and deliberately. Six figures per row, several
 * of them small counts, is reading work rather than shape-comparison work — a
 * chart would put the numbers in tooltips and make a reader hover to recover
 * what a cell shows outright.
 *
 * The one bar is on the submitted count, not on the interview rate. Drawing the
 * rate would give a source with one lucky application the longest bar on the
 * page, which is the visual version of the ranking this section deliberately
 * refuses to do. Volume is also what a reader needs to judge whether a rate
 * means anything.
 *
 * Rates always arrive with their sample: `50% · 2 of 4`, never a bare `50%`.
 * That is the whole treatment of small samples — no hiding, no grading, no
 * invented confidence intervals, and no "best source". The numbers are shown
 * and the student decides what they mean.
 */

/** `50% · 2 of 4`. The rate never appears without the sample behind it. */
function rateLabel(row: SourcePerformanceRow): string {
  return `${row.interviewRate}% · ${row.interviews} of ${row.submitted}`;
}

const COLUMNS = [
  "Submitted",
  "Responses",
  "Interviews",
  "Offers",
] as const;

function countsFor(row: SourcePerformanceRow): number[] {
  return [row.submitted, row.employerResponded, row.interviews, row.offers];
}

/**
 * One source as a card, for narrow screens.
 *
 * The table below `md` would be six columns of small numbers inside a
 * horizontal scroller, which is how a table stops being readable. The same
 * values become a labelled grid instead — no scrolling, no truncation, and the
 * source name gets a full line to itself.
 */
function SourceCard({ row }: { row: SourcePerformanceRow }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3
          className={`font-semibold ${
            row.isUnspecified ? "text-slate-600" : "text-slate-950"
          }`}
        >
          {row.source}
        </h3>
        <p className="text-sm text-slate-600">
          Interview rate{" "}
          <span className="font-medium tabular-nums text-slate-900">
            {rateLabel(row)}
          </span>
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        {COLUMNS.map((column, index) => (
          <div key={column}>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {column}
            </dt>
            <dd className="mt-0.5 tabular-nums text-slate-900">
              {countsFor(row)[index]}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SourcePerformance({
  rows,
}: {
  rows: SourcePerformanceRow[];
}) {
  // The widest row sets the scale, so the bars compare sources with each other
  // rather than against a total nothing on this table shows.
  const widest = Math.max(...rows.map((row) => row.submitted), 1);

  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <SourceCard key={row.source} row={row} />
        ))}
      </div>

      <div className="hidden md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Submitted applications by source, with what happened to them and the
            share that reached an interview
          </caption>
          <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="py-2 pr-3" scope="col">
                Source
              </th>
              {COLUMNS.map((column) => (
                <th className="py-2 pr-3 text-right" key={column} scope="col">
                  {column}
                </th>
              ))}
              <th className="py-2 text-right" scope="col">
                Interview rate
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.source}>
                <th
                  className={`py-2.5 pr-3 align-middle font-medium ${
                    row.isUnspecified ? "text-slate-600" : "text-slate-800"
                  }`}
                  scope="row"
                >
                  <span className="block">{row.source}</span>
                  {/*
                    Decorative: the submitted count sits in the very next cell.
                    It is on volume rather than on the rate, so a single-
                    application source can never draw the longest bar here.
                  */}
                  <span
                    aria-hidden="true"
                    className="mt-1 block h-1.5 w-full max-w-40 overflow-hidden rounded-sm bg-slate-100"
                  >
                    <span
                      className="block h-1.5 rounded-r-sm bg-blue-600"
                      style={{ width: `${(row.submitted / widest) * 100}%` }}
                    />
                  </span>
                </th>
                {countsFor(row).map((count, index) => (
                  <td
                    className="py-2.5 pr-3 text-right align-middle tabular-nums text-slate-900"
                    key={COLUMNS[index]}
                  >
                    {count}
                  </td>
                ))}
                <td className="py-2.5 text-right align-middle tabular-nums text-slate-900">
                  {rateLabel(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
