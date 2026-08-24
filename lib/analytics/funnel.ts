import {
  hasEverReached,
  reachedStatusesByApplication,
  type AnalyticsHistoryEvent,
} from "@/lib/analytics/calculate";
import {
  EMPLOYER_RESPONSE_STATUSES,
  INTERVIEW_STATUSES,
  OFFER_STATUSES,
  SUBMITTED_STATUSES,
  toPercentOrUndefined,
  toRatio,
} from "@/lib/analytics/definitions";
import type { ApplicationStatus } from "@/lib/applications/constants";

/**
 * How far a search actually got, and where it narrowed.
 *
 * Four milestones and the three steps between them. The milestones are the
 * canonical status sets restated nowhere: `SUBMITTED_STATUSES`,
 * `EMPLOYER_RESPONSE_STATUSES`, `INTERVIEW_STATUSES` and `OFFER_STATUSES` are
 * imported, so this module introduces no second vocabulary and cannot disagree
 * with the rest of analytics about what a response is. They are *analytical
 * milestones* over the existing ten-status enum, not new statuses.
 *
 * Every count comes from status history, so an application that interviewed and
 * was later rejected has still reached Interview, and one that was offered and
 * then accepted has still reached Offer. Archived applications are included:
 * a role a student tidied away still happened.
 *
 * The whole module is pure. No clock, no database, no request — the same
 * applications and history always produce the same funnel.
 */

/** The application fields the funnel reads. Only the identifier, in practice. */
export type FunnelApplication = { id: string };

/** One of the four headline milestones, in order. */
export type FunnelMilestoneKey =
  | "submitted"
  | "employerResponse"
  | "interview"
  | "offer";

export type FunnelMilestone = {
  key: FunnelMilestoneKey;
  label: string;
  /** Applications that ever reached this milestone. */
  count: number;
  /**
   * Bar length, 0–100, as a share of the submitted count.
   *
   * The bars encode volume relative to the top of the funnel, which is what
   * makes 54 → 9 → 4 → 1 legible as a shape. It is deliberately *not* the
   * stage-to-stage rate below — those are two different numbers and conflating
   * them is the bug this whole module exists to avoid.
   */
  widthPercent: number;
};

export type FunnelTransition = {
  /** The milestone this conversion is measured *out of*. */
  from: FunnelMilestoneKey;
  to: FunnelMilestoneKey;
  label: string;
  /** How many of `from` went on to reach `to`. */
  reached: number;
  /** The immediately preceding milestone's count — never the submitted count. */
  denominator: number;
  /**
   * `reached / denominator`, rounded.
   *
   * Undefined when the denominator is zero, and that is the point: nobody
   * having received a response is not the same claim as responses having been
   * received and none progressing.
   */
  percent: number | undefined;
};

export type SearchRatios = {
  /** `submitted / interviews`, or undefined with no interviews recorded. */
  applicationsPerInterview: number | undefined;
  /** `submitted / offers`, or undefined with no offers recorded. */
  applicationsPerOffer: number | undefined;
};

export type FunnelNarrowing = {
  transition: FunnelTransition;
  /** Always defined here: an undefined transition can never be the narrowest. */
  percent: number;
};

export type FunnelSummary = {
  milestones: FunnelMilestone[];
  transitions: FunnelTransition[];
  ratios: SearchRatios;
  /**
   * The lowest recorded stage-to-stage conversion, or null.
   *
   * Null below `NARROWING_MINIMUM_SUBMITTED`, and null when no transition has a
   * denominator to be measured against.
   */
  narrowing: FunnelNarrowing | null;
  submitted: number;
};

/**
 * How many submitted applications it takes before naming a narrowest stage.
 *
 * Five. Below that the "narrowest" transition is an artefact of the sample
 * rather than a fact about the search — one application in three looks like a
 * 33% response rate, and putting a heading over it would dress up a coin flip
 * as a finding. This is a threshold on honesty, not on encouragement: the
 * funnel's own counts are still shown from the very first submission.
 */
export const NARROWING_MINIMUM_SUBMITTED = 5;

/** The four milestones, each bound to the canonical status set that defines it. */
const MILESTONES: readonly {
  key: FunnelMilestoneKey;
  label: string;
  statuses: readonly ApplicationStatus[];
}[] = [
  { key: "submitted", label: "Submitted", statuses: SUBMITTED_STATUSES },
  {
    key: "employerResponse",
    label: "Employer response",
    statuses: EMPLOYER_RESPONSE_STATUSES,
  },
  { key: "interview", label: "Interview", statuses: INTERVIEW_STATUSES },
  { key: "offer", label: "Offer", statuses: OFFER_STATUSES },
];

/**
 * The three steps, each measured out of the milestone immediately above it.
 *
 * This is the whole difference from the previous funnel, where every rate was a
 * share of Submitted. `Employer response → Interview` here answers "of the
 * applications an employer replied to, how many reached an interview" — a
 * question the old page could not ask.
 */
const TRANSITIONS: readonly {
  from: FunnelMilestoneKey;
  to: FunnelMilestoneKey;
  label: string;
}[] = [
  {
    from: "submitted",
    to: "employerResponse",
    label: "Submitted → employer response",
  },
  {
    from: "employerResponse",
    to: "interview",
    label: "Employer response → interview",
  },
  { from: "interview", to: "offer", label: "Interview → offer" },
];

/**
 * The funnel, its stage-to-stage conversions, its ratios, and its narrowest step.
 *
 * @param applications every application the student has saved, archived included
 * @param history every status event belonging to them
 */
export function summarizeFunnel(
  applications: readonly FunnelApplication[],
  history: readonly AnalyticsHistoryEvent[],
): FunnelSummary {
  // One pass over history for the whole funnel; each milestone is then a set
  // lookup per application rather than a rescan.
  const reached = reachedStatusesByApplication(history);

  const counts = new Map<FunnelMilestoneKey, number>(
    MILESTONES.map((milestone) => [
      milestone.key,
      applications.filter((application) =>
        hasEverReached(reached, application.id, milestone.statuses),
      ).length,
    ]),
  );

  const submitted = counts.get("submitted") ?? 0;

  const milestones: FunnelMilestone[] = MILESTONES.map((milestone) => {
    const count = counts.get(milestone.key) ?? 0;
    return {
      key: milestone.key,
      label: milestone.label,
      count,
      // A search with nothing submitted draws no bars rather than dividing by
      // zero. Every milestone is a subset of submitted, so this never exceeds
      // 100 for real data.
      widthPercent: submitted > 0 ? (count / submitted) * 100 : 0,
    };
  });

  const transitions: FunnelTransition[] = TRANSITIONS.map((transition) => {
    const denominator = counts.get(transition.from) ?? 0;
    const numerator = counts.get(transition.to) ?? 0;

    return {
      from: transition.from,
      to: transition.to,
      label: transition.label,
      reached: numerator,
      denominator,
      percent: toPercentOrUndefined(numerator, denominator),
    };
  });

  return {
    submitted,
    milestones,
    transitions,
    ratios: {
      // Submitted applications, never everything saved: a job browsed and never
      // sent says nothing about how many applications an interview costs.
      applicationsPerInterview: toRatio(submitted, counts.get("interview") ?? 0),
      applicationsPerOffer: toRatio(submitted, counts.get("offer") ?? 0),
    },
    narrowing: narrowestTransition(transitions, submitted),
  };
}

/**
 * The lowest recorded stage-to-stage conversion.
 *
 * Undefined transitions are not candidates — a step nobody reached cannot be
 * the narrowest one — so a search with five submissions and no responses
 * correctly reports `Submitted → employer response` at 0% and ignores the two
 * steps below it, which have no denominator at all.
 *
 * Comparison is on the exact ratio rather than on the displayed percentage, so
 * two steps that both round to 17% are separated by their real values instead of
 * by whichever the rounding happened to reach first. A genuine tie breaks on
 * funnel order, earliest first: with two equally narrow steps the earlier one is
 * where the search narrowed *first*, and a stable answer matters more than an
 * arbitrary one.
 *
 * This reports a number and nothing else. It does not say why a step is narrow,
 * what to do about it, or whether it is good — a drop-off is arithmetic, and the
 * reasons live with employers, not in this table.
 */
function narrowestTransition(
  transitions: readonly FunnelTransition[],
  submitted: number,
): FunnelNarrowing | null {
  if (submitted < NARROWING_MINIMUM_SUBMITTED) return null;

  let narrowest: FunnelNarrowing | null = null;
  let narrowestExact = Number.POSITIVE_INFINITY;

  for (const transition of transitions) {
    if (transition.percent === undefined) continue;

    const exact = transition.reached / transition.denominator;
    if (exact < narrowestExact) {
      narrowestExact = exact;
      narrowest = { transition, percent: transition.percent };
    }
  }

  return narrowest;
}
