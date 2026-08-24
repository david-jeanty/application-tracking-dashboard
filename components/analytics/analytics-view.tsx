import { SearchActivity } from "@/components/analytics/activity";
import { Funnel, FunnelNarrowing } from "@/components/analytics/funnel";
import { WhatWorks } from "@/components/analytics/performance";
import { QuietNote } from "@/components/analytics/section";
import { ButtonLink } from "@/components/ui/button";
import { summarizeActivity } from "@/lib/analytics/activity";
import { summarizeFunnel } from "@/lib/analytics/funnel";
import {
  MINIMUM_COMPARABLE_GROUPS,
  summarizePerformance,
} from "@/lib/analytics/performance";
import type { AnalyticsHistoryEvent } from "@/lib/analytics/calculate";
import type { ApplicationAnalyticsRow } from "@/lib/applications/types";

/**
 * Everything Analytics renders once the reads have succeeded.
 *
 * Separated from the page so the page is left with what only a page can do —
 * authenticate, read, and report a failed read — and so this whole tree can be
 * rendered from fixtures during visual review without a database. It takes rows,
 * events and an already-resolved `today`, and reads no clock and no request of
 * its own.
 *
 * Three visualisations, and each one decides for itself whether it has
 * something to show. That is the whole disclosure rule: **hide weak
 * conclusions, not the student's recorded data.**
 *
 * There is deliberately no page-level submitted-count gate. One used to sit
 * here, and it was wrong: a small sample is a reason not to name a narrowest
 * stage, and it is not a reason to withhold a chart that is only reporting what
 * the student entered. Three applications from two sources is a real comparison
 * of two rows marked `n=2` and `n=1`; three applications across two weeks is a
 * real fortnight of history. Neither is a claim about significance, and both
 * belong to the student.
 *
 * So each section owns its own threshold and none of them gates another:
 * `FunnelNarrowing` returns null unless a step is well enough observed,
 * `WhatWorks` needs two comparable groups in some lens, and `SearchActivity`
 * needs dated submissions in more than one week. Sections with nothing
 * meaningful to say are absent rather than empty — five bordered boxes each
 * announcing that they have no data is a worse page than a short one.
 */
export function AnalyticsView({
  events,
  rows,
  today,
}: {
  events: readonly AnalyticsHistoryEvent[];
  rows: readonly ApplicationAnalyticsRow[];
  /** Resolved once by the caller, so no week boundary can shift across a zone. */
  today: string;
}) {
  if (rows.length === 0) return <NoSearchHistory />;

  const funnel = summarizeFunnel(rows, events);
  if (funnel.submitted === 0) return <NoSubmittedHistory />;

  const activity = summarizeActivity(rows, events, today);

  /*
    A lens earns its place by having something to compare. One source filling a
    single full-width bar repeats what the funnel said a moment earlier, so a
    dimension with fewer than two comparable groups is dropped rather than drawn.

    `comparableGroups` rather than `rows.length`, because `Not specified` is a
    row and not a source. A student who recorded `LinkedIn` on half their
    applications and nothing on the rest has one source; letting the residue
    make up the second would render that as a comparison and invite a reader to
    find a difference between a source and an absent record.

    Source leads when it qualifies, because where a posting was found is the
    lever a student actually has. Role type takes over when source cannot form a
    comparison — a student with one named source, or none, still gets the
    analysis through the dimension their data supports.
  */
  const lenses = (["source", "role"] as const)
    .map((lens) => summarizePerformance(rows, events, lens))
    .filter((summary) => summary.comparableGroups >= MINIMUM_COMPARABLE_GROUPS);

  return (
    <div className="space-y-14">
      <AnalyticsHeader />

      <Funnel funnel={funnel} />

      <FunnelNarrowing funnel={funnel} />

      {lenses.length > 0 ? (
        <section aria-labelledby="analytics-performance">
          <WhatWorks
            headingId="analytics-performance"
            initialLens={lenses[0].lens}
            lenses={lenses}
          />
        </section>
      ) : null}

      {activity.hasEnoughHistory ? <SearchActivity activity={activity} /> : null}

      {/*
        One sentence, and only when the funnel is the whole page.

        Not one note per absent section: a student with two sources and a
        single week of dates would otherwise get a chart followed by a line
        apologising for the chart that is missing, which reads as a page
        keeping score. When something beyond the funnel rendered, the page has
        already shown that it grows, and the absence explains itself.

        It says what appears, not what is missing. "More breakdowns appear as
        your search history grows" is a fact about the page; "not enough data
        yet" would be a verdict on the search.
      */}
      {lenses.length === 0 && !activity.hasEnoughHistory ? (
        <QuietNote>More breakdowns appear as your search history grows.</QuietNote>
      ) : null}
    </div>
  );
}

/**
 * The page title, and one line saying what it is for.
 *
 * No eyebrow above the heading — a label reading "Analytics" over a heading
 * reading "Analytics" is the same word twice, and the sidebar has already said
 * it once. No hero copy, no marketing, and nothing claiming an insight the page
 * does not produce.
 */
export function AnalyticsHeader() {
  return (
    <div>
      <h1 className="text-[34px] font-medium leading-tight tracking-tight text-foreground sm:text-[38px]">
        Analytics
      </h1>
      <p className="mt-2 text-[15px] text-foreground-secondary">
        Understand what is converting in your search.
      </p>
    </div>
  );
}

/** Nothing saved at all: the only state with somewhere to send the student. */
function NoSearchHistory() {
  return (
    <div className="space-y-8">
      <AnalyticsHeader />
      {/*
        No panel, no illustration, no icon in a tinted box. The heading above
        has already named the page; what is left to say is one fact and one
        route out of it.
      */}
      <div>
        <p className="text-[16px] text-foreground">No search history yet.</p>
        <p className="mt-1.5 max-w-md text-[14px] leading-6 text-foreground-secondary">
          Save applications and update their progress to start seeing conversion
          patterns.
        </p>
        <div className="mt-6">
          <ButtonLink href="/applications">Add application</ButtonLink>
        </div>
      </div>
    </div>
  );
}

/**
 * Applications saved, none submitted.
 *
 * Stated as a fact about the data and nothing else. A student who has saved
 * twelve roles and sent none is not behind, and this page does not know what
 * their week has looked like — so it says what it can measure and stops. There
 * is deliberately no call to action here: "submit something" is advice, and
 * advice is the one thing this page does not give.
 */
function NoSubmittedHistory() {
  return (
    <div className="space-y-8">
      <AnalyticsHeader />
      <div>
        <p className="text-[16px] text-foreground">No submitted history yet.</p>
        <p className="mt-1.5 max-w-md text-[14px] leading-6 text-foreground-secondary">
          Your funnel and performance comparisons appear after applications have
          been submitted.
        </p>
      </div>
    </div>
  );
}
