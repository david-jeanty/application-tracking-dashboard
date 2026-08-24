import { SectionHeading } from "@/components/analytics/section";
import {
  EM_DASH,
  formatPercent,
  formatRatio,
} from "@/lib/analytics/definitions";
import type { FunnelSummary } from "@/lib/analytics/funnel";

/**
 * How far applications got, and how much of each stage carried into the next.
 *
 * Descending horizontal bars on a common baseline, deliberately not a
 * triangle. A tapering funnel shape encodes each stage twice — once as width
 * and once as the taper — and the second encoding is the one that lies: a
 * trapezoid's area falls faster than its numbers do, so a 44% step looks
 * catastrophic. Bars from a shared left edge make 54 → 9 → 4 → 1 a length
 * comparison and nothing more.
 *
 * The chart carries two different quantities, and keeping them apart is the
 * whole design:
 *
 * - **Bar length** is a share of Submitted, so the shape reads as volume.
 * - **The line between two bars** is a share of the stage immediately above it.
 *
 * The previous version of this page used Submitted as the denominator for
 * every rate, which could not answer "of the employers who replied, how many
 * interviewed". Both numbers are shown as text, so nothing depends on reading
 * a bar.
 */
export function Funnel({ funnel }: { funnel: FunnelSummary }) {
  return (
    <section aria-labelledby="analytics-funnel">
      <SectionHeading id="analytics-funnel">Your funnel</SectionHeading>

      <ol className="max-w-3xl pt-6">
        {funnel.milestones.map((milestone, index) => {
          // The step that leads *into* this milestone. The first has none:
          // Submitted is the top of the funnel, not a conversion from anything.
          const transition = index > 0 ? funnel.transitions[index - 1] : null;

          return (
            <li key={milestone.key}>
              {/*
                Rendered only when the conversion is defined. A step whose
                denominator is zero has no answer, and printing "0% continued"
                there would assert that a stage was reached and nobody moved on
                — a claim about employers the data does not support.
              */}
              {transition?.percent !== undefined ? (
                <p className="pb-4 pl-[3.5rem] pt-1.5 text-[12px] text-foreground-muted sm:pl-[4.5rem]">
                  {formatPercent(transition.percent)} continued
                </p>
              ) : null}

              {/*
                An undefined step renders no annotation, and without this the
                two bars either side of it would sit closer together than every
                other pair — reading as a group rather than as two stages. The
                40px replaces exactly what the missing line occupied: 6px above
                it, its own 18px, and 16px below.
              */}
              <div
                className={`flex items-center gap-3 sm:gap-4 ${
                  index > 0 && transition?.percent === undefined ? "pt-10" : ""
                }`}
              >
                <div className="min-w-0 shrink-0 basis-11 text-right sm:basis-14">
                  <span className="block text-[22px] font-medium leading-none tabular-nums tracking-tight text-foreground sm:text-[26px]">
                    {milestone.count}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-none text-foreground-secondary">
                    {milestone.label}
                    <span className="sr-only">
                      : {milestone.count}{" "}
                      {milestone.count === 1 ? "application" : "applications"}
                    </span>
                  </p>
                  {/*
                    Decorative. Every number it encodes is already text beside
                    it, so it is hidden rather than described, and it adds no
                    tab stop. A minimum width keeps the last stage of a long
                    funnel from vanishing into a sliver at 390px — one offer out
                    of fifty-four is a real result and has to stay visible.
                  */}
                  <span
                    aria-hidden="true"
                    className="mt-2 block h-6 w-full overflow-hidden rounded-[2px] bg-surface-muted sm:h-7"
                  >
                    <span
                      className="block h-full rounded-[2px] bg-accent"
                      style={{
                        width:
                          milestone.count > 0
                            ? `max(3px, ${milestone.widthPercent}%)`
                            : "0%",
                      }}
                    />
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <SearchRatios funnel={funnel} />
    </section>
  );
}

/**
 * Two ratios, stated and not graded.
 *
 * "13.5 applications per interview" is a fact about a search. It is not a
 * score, and nothing here says whether a higher or a lower number is better —
 * for a student applying to three very selective firms and a student applying
 * to forty postings, the same figure means completely different things, and
 * this page does not know which one is reading it.
 *
 * An em dash where a ratio is undefined. Applications per interview with no
 * interviews yet is neither zero nor infinite; it is a question the search has
 * not answered.
 */
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
    <dl className="flex max-w-3xl flex-wrap gap-x-12 gap-y-6 pt-9 sm:gap-x-20">
      {ratios.map((ratio) => (
        /*
          Term before description in the DOM, which is what a description list
          means and the order a screen reader reads it. The visual order —
          number first, label under it — comes from reversing the column, so the
          markup and the design can each be right. The same pattern the
          dashboard's search summary uses.
        */
        <div className="flex flex-col-reverse gap-1.5" key={ratio.label}>
          <dt className="text-[13px] text-foreground-secondary">
            {ratio.label}
          </dt>
          <dd className="text-[30px] font-medium leading-none tabular-nums tracking-tight text-foreground">
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

/**
 * The lowest recorded stage-to-stage conversion, and nothing more.
 *
 * Subordinate to the funnel by construction: a left rule rather than a section
 * rule, smaller type, and no chart of its own. It restates one number the
 * funnel already shows, which is the entire feature — a student scanning three
 * percentages should not have to work out which is smallest.
 *
 * The closing sentence is not boilerplate. This section names an arithmetic
 * drop-off and stops; it does not know why an employer decided anything, and
 * the difference between "fewest applications continued here" and "your resume
 * is the problem" is the difference between a measurement and a guess. Nothing
 * on this page crosses that line.
 */
export function FunnelNarrowing({ funnel }: { funnel: FunnelSummary }) {
  if (!funnel.narrowing) return null;

  const { transition, percent } = funnel.narrowing;

  return (
    <section aria-labelledby="analytics-narrowing">
      <div className="border-l border-border-strong pl-4 sm:pl-5">
        <h2
          className="text-[15px] font-medium text-foreground"
          id="analytics-narrowing"
        >
          Where your funnel narrows
        </h2>

        <p className="mt-3 text-[13px] text-foreground-secondary">
          {transition.label}
        </p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[26px] font-medium leading-none tabular-nums tracking-tight text-foreground">
            {formatPercent(percent)}
          </span>
          <span className="text-[13px] text-foreground-secondary">
            {transition.reached} of {transition.denominator} progressed
          </span>
        </p>

        <p className="mt-3 max-w-xl text-[12px] leading-6 text-foreground-muted">
          This describes what happened in your recorded search, not why an
          employer made a decision.
        </p>
      </div>
    </section>
  );
}
