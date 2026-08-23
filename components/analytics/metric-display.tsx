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
  /** How far the bar is drawn, 0–100. */
  percent: number;
};

/**
 * A labelled magnitude comparison, rendered as a table with bars.
 *
 * Ten application statuses is far past the point where colour can carry
 * identity, so identity lives in the row label and the bars use one hue for
 * magnitude alone. The table is not a fallback view bolted on for screen
 * readers — it is the primary structure, with every value present as text, and
 * the bars are decoration layered on top of numbers that are already readable.
 */
export function MetricBars({
  caption,
  rows,
  valueHeading,
}: {
  caption: string;
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
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th
              className="w-40 py-2 pr-3 align-middle font-medium text-slate-800"
              scope="row"
            >
              {row.label}
            </th>
            <td className="py-2 align-middle">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100"
                >
                  <span
                    className="block h-2 rounded-full bg-blue-600"
                    style={{ width: `${Math.max(0, Math.min(100, row.percent))}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums text-slate-700">
                  {row.valueLabel}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A titled panel around one breakdown, matching the rest of the interface. */
export function MetricPanel({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </Card>
  );
}
