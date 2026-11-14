/**
 * The fit read's verdict rule (decision record 0019).
 *
 * The run's own judgment rated a posting a Strong fit while listing the
 * role's core duties (SO&P, forecasting, pricing) as gaps. The verdict now
 * follows from the gaps: count the posting's must-have requirements, which
 * include its main responsibilities, that are true gaps.
 *
 * - none: Strong fit,
 * - up to half: Moderate fit,
 * - more than half: Long shot.
 *
 * `complete_run` refuses a verdict stronger than this allows. Pure, no I/O.
 */

import type { Requirement } from "@/lib/agent/types";

export const FIT_VERDICTS = ["strong_fit", "moderate_fit", "long_shot"] as const;
export type FitVerdict = (typeof FIT_VERDICTS)[number];

const RANK: Readonly<Record<FitVerdict, number>> = { strong_fit: 2, moderate_fit: 1, long_shot: 0 };

export type FitAssessment = {
  /** The strongest verdict the gaps allow. */
  allowed: FitVerdict;
  /** Indexes of the must-have requirements that are gaps. */
  core_gaps: number[];
  /** How many requirements count as must-have (all of them if none is marked). */
  core: number;
};

export function assessFit(requirements: readonly Requirement[], gapIndexes: readonly number[]): FitAssessment {
  const marked = requirements.flatMap((requirement, index) => (requirement.must_have ? [index] : []));
  const core = marked.length ? marked : requirements.map((_, index) => index);
  const gaps = new Set(gapIndexes);
  const coreGaps = core.filter((index) => gaps.has(index));
  const allowed: FitVerdict =
    coreGaps.length === 0 ? "strong_fit" : coreGaps.length * 2 <= core.length ? "moderate_fit" : "long_shot";
  return { allowed, core_gaps: coreGaps, core: core.length };
}

/** True when `verdict` is no stronger than the gaps allow. */
export function verdictAllowed(verdict: FitVerdict, assessment: FitAssessment): boolean {
  return RANK[verdict] <= RANK[assessment.allowed];
}

export const VERDICT_LABELS: Readonly<Record<FitVerdict, string>> = {
  strong_fit: "Strong fit",
  moderate_fit: "Moderate fit",
  long_shot: "Long shot",
};
