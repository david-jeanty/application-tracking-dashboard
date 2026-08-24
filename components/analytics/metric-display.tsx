import { Card } from "@/components/ui/card";

/**
 * One headline number.
 *
 * The number is the chart: a single current value gets a stat tile rather than
 * a one-bar bar chart. Proportional figures, not tabular ones — equal-width
 * digits make a large standalone number look loose.
 */
export function StatTile({
  context,
  label,
  value,
}: {
  context?: string;
  label: string;
  value: number;
}) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      {context ? (
        <p className="mt-1 text-sm leading-6 text-slate-600">{context}</p>
      ) : null}
    </Card>
  );
}

export type MetricRow = {
  label: string;
  /** The number a reader should take away, already formatted. */
  valueLabel: string;
  /**
   * A second figure shown beside the first — a share of a total, say. Present
   * so a reader never has to derive one number from another, or from a bar.
   */
  detailLabel?: string;
  /** How far the bar is drawn, 0–100. */
  percent: number;
  /**
   * Marks the row every other row is measured against.
   *
   * Set on the denominator of a funnel, so the shared base is visible as a row
   * rather than only stated in prose. Distinguished by weight and a rule, not
   * by colour: the bars stay one hue, which is doing magnitude and nothing else.
   */
  isBaseline?: boolean;
};

/**
 * A labelled magnitude comparison, rendered as a table with bars.
 *
 * Ten application statuses and sixteen categories are both far past the point
 * where colour can carry identity, so identity lives in the row label and the
 * bars use one hue for magnitude alone. Deliberately not a value-ramp: shading
 * each bar darker where it is longer would spend the only free channel
 * restating the length the bar already shows.
 *
 * The table is not a fallback bolted on for screen readers — it is the primary
 * structure. Every value is present as text, in a real cell, with a row header;
 * the bars are decoration layered over numbers that are already readable, and
 * are hidden from assistive technology because they say nothing the cells do
 * not. Nothing here needs hover, keyboard focus, or colour vision to read.
 */
export function MetricBars({
  caption,
  detailHeading,
  rows,
  valueHeading,
}: {
  caption: string;
  detailHeading?: string;
  rows: MetricRow[];
  valueHeading: string;
}) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Name</th>
          <th scope="col">{valueHeading}</th>
          {detailHeading ? <th scope="col">{detailHeading}</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            className={
              row.isBaseline ? "border-b border-slate-200" : undefined
            }
            key={row.label}
          >
            <th
              className={`py-2 pr-3 align-middle sm:w-44 ${
                row.isBaseline
                  ? "font-semibold text-slate-950"
                  : "font-medium text-slate-800"
              }`}
              scope="row"
            >
              {row.label}
            </th>
            <td className="w-14 py-2 pr-3 text-right align-middle tabular-nums font-medium text-slate-950">
              {row.valueLabel}
            </td>
            {detailHeading ? (
              <td className="w-14 py-2 pr-3 text-right align-middle tabular-nums text-slate-700">
                {row.detailLabel}
              </td>
            ) : null}
            <td className="py-2 align-middle">
              {/*
                Purely decorative. Every number it encodes is in a cell to its
                left, so it carries no information of its own and is hidden
                rather than described.
              */}
              <span
                aria-hidden="true"
                className="block h-2 w-full min-w-16 overflow-hidden rounded-sm bg-slate-100"
              >
                <span
                  className="block h-2 rounded-r-sm bg-blue-600"
                  style={{
                    width: `${Math.max(0, Math.min(100, row.percent))}%`,
                  }}
                />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A titled panel around one breakdown, matching the rest of the interface.
 *
 * `titleId` lets the surrounding `section` point its `aria-labelledby` at this
 * heading, so each part of the page is a named landmark rather than an
 * anonymous card a reader has to enter to identify.
 */
export function MetricPanel({
  children,
  description,
  title,
  titleId,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
  titleId?: string;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-950" id={titleId}>
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

/**
 * What a section says when there is not enough of the right data to measure.
 *
 * Stated flatly, and only about the data. A student with nothing submitted is
 * not behind, not failing, and not in need of encouragement — they simply have
 * not sent anything yet, and this page's job is to say so and stop.
 */
export function NotEnoughData({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-600">
      {children}
    </p>
  );
}
