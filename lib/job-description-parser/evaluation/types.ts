import type { ExtractionConfidence } from "@/lib/job-description-parser/types";

/**
 * The nine fields the parser is measured on. Ordered to match the form so the
 * generated report reads in the same order the user sees.
 */
export const EVALUATED_FIELDS = [
  "companyName",
  "originalJobTitle",
  "normalizedJobCategory",
  "location",
  "workArrangement",
  "applicationDeadline",
  "workTermSeason",
  "workTermDuration",
  "salary",
] as const;

export type EvaluatedField = (typeof EVALUATED_FIELDS)[number];

export const FIELD_LABELS: Record<EvaluatedField, string> = {
  companyName: "Company name",
  originalJobTitle: "Job title",
  normalizedJobCategory: "Normalized category",
  location: "Location",
  workArrangement: "Work arrangement",
  applicationDeadline: "Application deadline",
  workTermSeason: "Work-term season",
  workTermDuration: "Work-term duration",
  salary: "Salary",
};

/**
 * Ground truth for one field, written by reading the posting as a human would.
 * `null` asserts the posting genuinely does not state the field, so the only
 * correct behaviour is to leave it blank.
 */
export type FieldExpectation = string | null;

export type FixtureExpectations = Record<EvaluatedField, FieldExpectation>;

/**
 * Corpus tags describing what a fixture is meant to exercise (posting format,
 * role family, structural hazard). Used to prove coverage, never by the parser.
 */
export type FixtureTag = string;

export type EvaluationFixture = {
  name: string;
  tags: FixtureTag[];
  text: string;
  expected: FixtureExpectations;
};

/**
 * The five mutually exclusive outcomes a single field can land in.
 *
 * - `correct`          field exists and was extracted correctly
 * - `incorrect`        field exists but a different value was extracted
 * - `missing`          field exists and the parser found nothing
 * - `expected-absence` field does not exist and the parser stayed silent
 * - `fabricated`       field does not exist but the parser produced a value
 *
 * `fabricated` is the most serious class: every other failure leaves the user
 * with a blank or an obviously editable value, while a fabricated one invents
 * information that was never in the posting.
 */
export type FieldOutcomeKind =
  | "correct"
  | "incorrect"
  | "missing"
  | "expected-absence"
  | "fabricated";

/**
 * How the reported confidence lines up with the prefill policy in
 * `map-to-form.ts`, where High and Medium populate the form and Low does not.
 *
 * - `well-calibrated` a right value was offered, or a blank was correctly left
 * - `safe-hedge`      a wrong value was found but held back below the prefill
 *                     threshold, so the user never silently inherits it
 * - `overconfident`   a wrong value was confident enough to populate the form
 * - `underconfident`  a right value was withheld and must be retyped by hand
 * - `not-applicable`  nothing was asserted, so there is no confidence to judge
 */
export type Calibration =
  | "well-calibrated"
  | "safe-hedge"
  | "overconfident"
  | "underconfident"
  | "not-applicable";

export type FieldOutcome = {
  field: EvaluatedField;
  expected: FieldExpectation;
  extracted: string | null;
  kind: FieldOutcomeKind;
  confidence: ExtractionConfidence;
  /** True when this confidence would populate the form under current policy. */
  prefilled: boolean;
  calibration: Calibration;
  confidenceAppropriate: boolean;
  evidence: string | null;
  warnings: string[];
};

/**
 * Fixture-level verdict, defined against the cost to the user rather than a
 * raw error count:
 *
 * - `fully-correct`  every field is `correct` or `expected-absence`; the
 *                    prefilled form needs no correction at all
 * - `usable`         some fields are blank or wrong, but every wrong value was
 *                    held below the prefill threshold, so the user only ever
 *                    has to *add* information, never to notice and undo a
 *                    silently populated mistake
 * - `unusable`       at least one wrong or fabricated value was confident
 *                    enough to populate the form, so a user who trusts the
 *                    prefill saves bad data
 */
export type FixtureGrade = "fully-correct" | "usable" | "unusable";

export type FixtureEvaluation = {
  name: string;
  tags: FixtureTag[];
  outcomes: FieldOutcome[];
  grade: FixtureGrade;
};

export type FieldMetrics = {
  field: EvaluatedField;
  total: number;
  correct: number;
  incorrect: number;
  missing: number;
  expectedAbsence: number;
  fabricated: number;
  /** Of every value the parser asserted, the share that was right. */
  precision: number;
  /** Of every field the postings actually state, the share recovered. */
  recall: number;
  /** Of every fixture, the share where the parser did exactly the right thing. */
  exactMatchAccuracy: number;
  falsePositiveCount: number;
  highConfidenceWrongCount: number;
  mediumConfidenceWrongCount: number;
  missingCount: number;
};

export type CorpusMetrics = {
  fixtureCount: number;
  fields: FieldMetrics[];
  fullyCorrect: number;
  usable: number;
  unusable: number;
  /** Every wrong or fabricated value that would populate the form. */
  prefilledDefects: number;
};

/**
 * Fix order, lowest number first. Mirrors the agreed remediation priority so
 * the report can sort defects by what must be addressed next.
 */
export const DEFECT_PRIORITY = {
  highConfidenceFabricated: 1,
  highConfidenceWrong: 2,
  wrongDeadline: 3,
  wrongCompanyOrTitle: 4,
  mediumConfidenceWrong: 5,
  missingValue: 6,
  cosmetic: 7,
} as const;

export type DefectPriority =
  (typeof DEFECT_PRIORITY)[keyof typeof DEFECT_PRIORITY];

export const DEFECT_PRIORITY_LABELS: Record<DefectPriority, string> = {
  1: "High-confidence fabricated value",
  2: "High-confidence wrong value",
  3: "Wrong application deadline",
  4: "Wrong company or title",
  5: "Medium-confidence wrong value",
  6: "Missing value",
  7: "Cosmetic confidence, evidence, or warning issue",
};

export type Defect = {
  fixture: string;
  outcome: FieldOutcome;
  priority: DefectPriority;
};
