import type { ApplicationFormValues } from "@/lib/applications/types";
import type {
  ExtractedField,
  ExtractionConfidence,
  ParsedJobDescription,
} from "@/lib/job-description-parser/types";

export type PrefillDecision = {
  field: keyof ApplicationFormValues;
  label: string;
  confidence: ExtractionConfidence;
  evidence: string | null;
  warnings: string[];
  /** False when a value existed but was withheld for being too uncertain. */
  applied: boolean;
};

export type PrefillResult = {
  values: Partial<ApplicationFormValues>;
  decisions: PrefillDecision[];
};

/**
 * Fields below this confidence are reported but not written into the form.
 * A wrong confident answer is worse than a blank field, and a Low-confidence
 * prefill is one the user is likely to accept without checking.
 */
function shouldApply(confidence: ExtractionConfidence): boolean {
  return confidence === "High" || confidence === "Medium";
}

/**
 * Converts a parse result into form defaults. The job description itself is
 * always carried over verbatim, since the user pasted it deliberately.
 */
export function mapToFormValues(parsed: ParsedJobDescription): PrefillResult {
  const values: Partial<ApplicationFormValues> = {
    jobDescription: parsed.originalText,
  };
  const decisions: PrefillDecision[] = [];

  /**
   * Records the outcome for one field and writes it only when confident.
   * The `K` binding keeps each extracted value checked against the matching
   * form field's type.
   */
  const consider = <K extends keyof ApplicationFormValues>(
    field: K,
    label: string,
    extracted: ExtractedField<ApplicationFormValues[K]>,
  ) => {
    const applied = extracted.value !== null && shouldApply(extracted.confidence);
    if (applied && extracted.value !== null) {
      values[field] = extracted.value;
    }

    decisions.push({
      field,
      label,
      confidence: extracted.confidence,
      evidence: extracted.evidence,
      warnings: extracted.warnings,
      applied,
    });
  };

  consider("companyName", "Company name", parsed.companyName);
  consider("originalJobTitle", "Original job title", parsed.originalJobTitle);
  consider("normalizedJobCategory", "Normalized category", parsed.normalizedJobCategory);
  consider("location", "Location", parsed.location);
  consider("workArrangement", "Work arrangement", parsed.workArrangement);
  consider("applicationDeadline", "Application deadline", parsed.applicationDeadline);
  consider("workTermSeason", "Work-term season", parsed.workTermSeason);
  consider("workTermDuration", "Work-term duration", parsed.workTermDuration);
  consider("salary", "Salary", parsed.salary);

  return { values, decisions };
}
