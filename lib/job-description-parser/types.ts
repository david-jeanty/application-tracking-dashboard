import type {
  ClassificationConfidence,
  JobCategory,
  WorkArrangement,
} from "@/lib/applications/constants";

/**
 * Confidence reuses the existing `ClassificationConfidence` union so a parsed
 * category can be written straight to `applications.classification_confidence`.
 * `null` means the field was not found at all, which is deliberately distinct
 * from "Low": a low-confidence value is still a value the user can accept.
 */
export type ExtractionConfidence = ClassificationConfidence | null;

export type FieldCandidate<T> = {
  value: T;
  score: number;
  /** The source line text that justified this candidate, for UI display. */
  evidence: string;
  /** Identifies which rule fired, so a wrong result is traceable to one rule. */
  ruleId: string;
  lineIndex?: number;
  /** Caveats specific to this candidate; surfaced only if it wins. */
  warnings?: string[];
};

export type ExtractedField<T> = {
  value: T | null;
  confidence: ExtractionConfidence;
  evidence: string | null;
  /** Ranked best-first. Retained so the UI can offer runner-up choices. */
  candidates: FieldCandidate<T>[];
  warnings: string[];
};

export type NormalizedLine = {
  index: number;
  original: string;
  normalized: string;
  isHeadingLike: boolean;
};

export type NormalizedDocument = {
  originalText: string;
  normalizedText: string;
  lines: NormalizedLine[];
};

export type ParsedJobDescription = {
  companyName: ExtractedField<string>;
  originalJobTitle: ExtractedField<string>;
  normalizedJobCategory: ExtractedField<JobCategory>;
  location: ExtractedField<string>;
  workArrangement: ExtractedField<WorkArrangement>;
  applicationDeadline: ExtractedField<string>;
  workTermSeason: ExtractedField<string>;
  workTermDuration: ExtractedField<string>;
  salary: ExtractedField<string>;
  originalText: string;
  parserVersion: string;
};

export type ParseOptions = {
  /**
   * Anchor for resolving dates that omit a year. Defaults to the current date.
   * Injected so fixtures stay deterministic across time.
   */
  today?: Date;
};
