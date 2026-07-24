import { classifyCategory } from "@/lib/job-description-parser/classify-category";
import { extractCompany } from "@/lib/job-description-parser/extract-company";
import { extractDeadline } from "@/lib/job-description-parser/extract-deadline";
import { extractLocation } from "@/lib/job-description-parser/extract-location";
import { extractSalary } from "@/lib/job-description-parser/extract-salary";
import { extractTitle } from "@/lib/job-description-parser/extract-title";
import { extractWorkArrangement } from "@/lib/job-description-parser/extract-work-arrangement";
import { extractWorkTerm } from "@/lib/job-description-parser/extract-work-term";
import { normalizeDocument } from "@/lib/job-description-parser/normalize";
import type {
  ParseOptions,
  ParsedJobDescription,
} from "@/lib/job-description-parser/types";

export const PARSER_VERSION = "1.0.0";

/**
 * Extracts structured fields from a pasted job description.
 *
 * Every field carries its own confidence and the evidence line behind it. The
 * caller decides what to prefill; this function never guesses silently.
 */
export function parseJobDescription(
  text: string,
  options: ParseOptions = {},
): ParsedJobDescription {
  const today = options.today ?? new Date();
  const document = normalizeDocument(text);

  const originalJobTitle = extractTitle(document);
  const workTerm = extractWorkTerm(document);

  return {
    companyName: extractCompany(document),
    originalJobTitle,
    // Category depends on the title, so it runs after title extraction.
    normalizedJobCategory: classifyCategory(document, originalJobTitle.value),
    location: extractLocation(document),
    workArrangement: extractWorkArrangement(document),
    applicationDeadline: extractDeadline(document, today),
    workTermSeason: workTerm.season,
    workTermDuration: workTerm.duration,
    salary: extractSalary(document),
    originalText: text,
    parserVersion: PARSER_VERSION,
  };
}

export { mapToFormValues } from "@/lib/job-description-parser/map-to-form";
export type {
  ExtractedField,
  ExtractionConfidence,
  FieldCandidate,
  ParseOptions,
  ParsedJobDescription,
} from "@/lib/job-description-parser/types";
