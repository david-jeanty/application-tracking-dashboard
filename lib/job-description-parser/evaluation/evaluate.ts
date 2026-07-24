import { parseJobDescription } from "@/lib/job-description-parser";
import { shouldPrefill } from "@/lib/job-description-parser/map-to-form";
import {
  DEFECT_PRIORITY,
  EVALUATED_FIELDS,
  type Calibration,
  type Defect,
  type DefectPriority,
  type EvaluatedField,
  type EvaluationFixture,
  type FieldOutcome,
  type FieldOutcomeKind,
  type FixtureEvaluation,
  type FixtureGrade,
} from "@/lib/job-description-parser/evaluation/types";
import type {
  ExtractedField,
  ParsedJobDescription,
} from "@/lib/job-description-parser/types";

/**
 * Fields whose wrong value misdirects the whole application record. A wrong
 * deadline can cause a missed posting; a wrong company or title makes the
 * saved row unrecognizable later.
 */
const CRITICAL_FIELDS = new Set<EvaluatedField>([
  "applicationDeadline",
  "companyName",
  "originalJobTitle",
]);

/**
 * Compares values the way a user would judge them: case and internal spacing
 * are noise, everything else is a real difference. Deadlines are already
 * canonical `YYYY-MM-DD` strings, so they compare exactly under this rule too.
 */
function sameValue(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value.replace(/\s+/g, " ").trim().toLowerCase();
  return normalize(left) === normalize(right);
}

/**
 * Reads one field from a parse result.
 *
 * `confidence === null` is the parser's own signal that it found nothing, and
 * it is the single source of truth for absence here. That matters because two
 * fields carry a non-null placeholder when they fail — `normalizedJobCategory`
 * falls back to "Other" and `workArrangement` to "Unknown" — and scoring those
 * placeholders as extracted values would credit the parser for inventing them.
 */
export function readField(
  parsed: ParsedJobDescription,
  field: EvaluatedField,
): {
  value: string | null;
  confidence: ExtractedField<string>["confidence"];
  evidence: string | null;
  warnings: string[];
} {
  const raw = parsed[field] as ExtractedField<string>;
  const absent = raw.confidence === null;

  return {
    value: absent ? null : raw.value,
    confidence: raw.confidence,
    evidence: raw.evidence,
    warnings: raw.warnings,
  };
}

function classify(
  expected: string | null,
  extracted: string | null,
): FieldOutcomeKind {
  if (expected === null) {
    return extracted === null ? "expected-absence" : "fabricated";
  }
  if (extracted === null) return "missing";
  return sameValue(expected, extracted) ? "correct" : "incorrect";
}

function calibrationFor(
  kind: FieldOutcomeKind,
  prefilled: boolean,
): Calibration {
  if (kind === "missing") return "not-applicable";
  if (kind === "expected-absence") return "well-calibrated";
  if (kind === "correct") return prefilled ? "well-calibrated" : "underconfident";
  // Wrong or fabricated: harmful only when confident enough to populate.
  return prefilled ? "overconfident" : "safe-hedge";
}

export function evaluateFixture(
  fixture: EvaluationFixture,
  today: Date,
): FixtureEvaluation {
  const parsed = parseJobDescription(fixture.text, { today });

  const outcomes = EVALUATED_FIELDS.map<FieldOutcome>((field) => {
    const read = readField(parsed, field);
    const expected = fixture.expected[field];
    const kind = classify(expected, read.value);
    const prefilled = read.value !== null && shouldPrefill(read.confidence);
    const calibration = calibrationFor(kind, prefilled);

    return {
      field,
      expected,
      extracted: read.value,
      kind,
      confidence: read.confidence,
      prefilled,
      calibration,
      confidenceAppropriate:
        calibration !== "overconfident" && calibration !== "underconfident",
      evidence: read.evidence,
      warnings: read.warnings,
    };
  });

  return { name: fixture.name, tags: fixture.tags, outcomes, grade: gradeFixture(outcomes) };
}

/** See `FixtureGrade` for what each verdict means and why. */
export function gradeFixture(outcomes: FieldOutcome[]): FixtureGrade {
  const isWrong = (outcome: FieldOutcome) =>
    outcome.kind === "incorrect" || outcome.kind === "fabricated";

  if (outcomes.some((outcome) => isWrong(outcome) && outcome.prefilled)) {
    return "unusable";
  }
  if (
    outcomes.every(
      (outcome) =>
        outcome.kind === "correct" || outcome.kind === "expected-absence",
    )
  ) {
    return "fully-correct";
  }
  return "usable";
}

/**
 * Maps an outcome onto the remediation priority list, or `null` when the
 * parser behaved acceptably. Ordering follows the agreed fix order: fabricated
 * beats wrong, confident beats hedged, and critical fields beat optional ones.
 */
export function defectPriority(outcome: FieldOutcome): DefectPriority | null {
  const wrong = outcome.kind === "incorrect" || outcome.kind === "fabricated";

  if (wrong) {
    if (outcome.confidence === "High") {
      return outcome.kind === "fabricated"
        ? DEFECT_PRIORITY.highConfidenceFabricated
        : DEFECT_PRIORITY.highConfidenceWrong;
    }
    // Below High, a wrong value still matters most on the fields that define
    // the record, and only while it is confident enough to reach the form.
    if (outcome.prefilled) {
      if (outcome.field === "applicationDeadline") {
        return DEFECT_PRIORITY.wrongDeadline;
      }
      if (CRITICAL_FIELDS.has(outcome.field)) {
        return DEFECT_PRIORITY.wrongCompanyOrTitle;
      }
      return DEFECT_PRIORITY.mediumConfidenceWrong;
    }
    // Held below the prefill threshold: visible in the summary, never silently
    // applied, so it is a calibration nit rather than a data defect.
    return DEFECT_PRIORITY.cosmetic;
  }

  if (outcome.kind === "missing") return DEFECT_PRIORITY.missingValue;
  if (!outcome.confidenceAppropriate) return DEFECT_PRIORITY.cosmetic;
  return null;
}

export function collectDefects(evaluations: FixtureEvaluation[]): Defect[] {
  const defects: Defect[] = [];

  for (const evaluation of evaluations) {
    for (const outcome of evaluation.outcomes) {
      const priority = defectPriority(outcome);
      if (priority === null) continue;
      defects.push({ fixture: evaluation.name, outcome, priority });
    }
  }

  return defects.sort(
    (left, right) =>
      left.priority - right.priority ||
      left.fixture.localeCompare(right.fixture) ||
      left.outcome.field.localeCompare(right.outcome.field),
  );
}

export function evaluateCorpus(
  fixtures: EvaluationFixture[],
  today: Date,
): FixtureEvaluation[] {
  return fixtures.map((fixture) => evaluateFixture(fixture, today));
}
