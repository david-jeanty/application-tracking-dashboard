import {
  EVALUATED_FIELDS,
  type CorpusMetrics,
  type EvaluatedField,
  type FieldMetrics,
  type FieldOutcome,
  type FixtureEvaluation,
} from "@/lib/job-description-parser/evaluation/types";

/** Guards the 0/0 case so an unexercised field reports 1 rather than NaN. */
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function isWrong(outcome: FieldOutcome): boolean {
  return outcome.kind === "incorrect" || outcome.kind === "fabricated";
}

export function metricsForField(
  field: EvaluatedField,
  evaluations: FixtureEvaluation[],
): FieldMetrics {
  const outcomes = evaluations
    .map((evaluation) =>
      evaluation.outcomes.find((outcome) => outcome.field === field),
    )
    .filter((outcome): outcome is FieldOutcome => outcome !== undefined);

  const count = (predicate: (outcome: FieldOutcome) => boolean) =>
    outcomes.filter(predicate).length;

  const correct = count((outcome) => outcome.kind === "correct");
  const incorrect = count((outcome) => outcome.kind === "incorrect");
  const missing = count((outcome) => outcome.kind === "missing");
  const expectedAbsence = count((outcome) => outcome.kind === "expected-absence");
  const fabricated = count((outcome) => outcome.kind === "fabricated");

  return {
    field,
    total: outcomes.length,
    correct,
    incorrect,
    missing,
    expectedAbsence,
    fabricated,
    // Asserted values that were right, over every value asserted.
    precision: ratio(correct, correct + incorrect + fabricated),
    // Recovered values, over every value the postings actually state.
    recall: ratio(correct, correct + incorrect + missing),
    // Both kinds of right answer — a correct value and a correct blank.
    exactMatchAccuracy: ratio(correct + expectedAbsence, outcomes.length),
    falsePositiveCount: fabricated,
    highConfidenceWrongCount: count(
      (outcome) => isWrong(outcome) && outcome.confidence === "High",
    ),
    mediumConfidenceWrongCount: count(
      (outcome) => isWrong(outcome) && outcome.confidence === "Medium",
    ),
    missingCount: missing,
  };
}

export function summarizeCorpus(
  evaluations: FixtureEvaluation[],
): CorpusMetrics {
  return {
    fixtureCount: evaluations.length,
    fields: EVALUATED_FIELDS.map((field) => metricsForField(field, evaluations)),
    fullyCorrect: evaluations.filter((one) => one.grade === "fully-correct").length,
    usable: evaluations.filter((one) => one.grade === "usable").length,
    unusable: evaluations.filter((one) => one.grade === "unusable").length,
    prefilledDefects: evaluations.reduce(
      (total, evaluation) =>
        total +
        evaluation.outcomes.filter(
          (outcome) => isWrong(outcome) && outcome.prefilled,
        ).length,
      0,
    ),
  };
}
