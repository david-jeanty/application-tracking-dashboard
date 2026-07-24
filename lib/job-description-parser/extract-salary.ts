import { matchLabel } from "@/lib/job-description-parser/rules/labels";
import { resolveField } from "@/lib/job-description-parser/score";
import type {
  ExtractedField,
  FieldCandidate,
  NormalizedDocument,
} from "@/lib/job-description-parser/types";

/** The form caps salary at 100 characters. */
const MAX_SALARY_LENGTH = 100;

const DASH = "(?:-|–|—|to)";
const AMOUNT = "\\$\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?";
const HOURLY = "(?:/\\s?h(?:ou)?r|per hour|hourly|an hour|/hr)";
const ANNUAL = "(?:per year|annually|per annum|/year|a year|yearly)";

const SALARY_PATTERNS: Array<{ pattern: RegExp; score: number; ruleId: string }> = [
  {
    pattern: new RegExp(`${AMOUNT}\\s*${DASH}\\s*${AMOUNT}\\s*${HOURLY}`, "i"),
    score: 115,
    ruleId: "salary:hourly-range",
  },
  {
    pattern: new RegExp(`${AMOUNT}\\s*${DASH}\\s*${AMOUNT}\\s*${ANNUAL}`, "i"),
    score: 115,
    ruleId: "salary:annual-range",
  },
  {
    pattern: new RegExp(`${AMOUNT}\\s*${HOURLY}`, "i"),
    score: 105,
    ruleId: "salary:hourly",
  },
  {
    pattern: new RegExp(`${AMOUNT}\\s*${ANNUAL}`, "i"),
    score: 105,
    ruleId: "salary:annual",
  },
  {
    // A bare range with no unit; the unit is usually implied by the label.
    pattern: new RegExp(`${AMOUNT}\\s*${DASH}\\s*${AMOUNT}`, "i"),
    score: 80,
    ruleId: "salary:bare-range",
  },
];

/** Contexts where a dollar figure is definitely not compensation. */
const DISQUALIFYING_CONTEXT = [
  /revenue/i,
  /budget of/i,
  /raised \$/i,
  /valuation/i,
  /funding/i,
  /market cap/i,
  /portfolio of/i,
  /savings of/i,
];

export function extractSalary(
  document: NormalizedDocument,
): ExtractedField<string> {
  const candidates: FieldCandidate<string>[] = [];

  for (const line of document.lines) {
    const labelled = matchLabel(line.original, "salary");
    const haystack = labelled ?? line.original;

    if (!labelled && DISQUALIFYING_CONTEXT.some((p) => p.test(line.original))) {
      continue;
    }

    for (const { pattern, score, ruleId } of SALARY_PATTERNS) {
      const match = pattern.exec(haystack);
      if (!match) continue;

      // The matched text is preserved verbatim rather than normalized, so the
      // user sees exactly what the posting said.
      const value = match[0].replace(/\s+/g, " ").trim();
      if (value.length > MAX_SALARY_LENGTH) continue;

      candidates.push({
        value,
        score: labelled ? score + 20 : score,
        evidence: line.original,
        ruleId,
        lineIndex: line.index,
      });
      break;
    }
  }

  return resolveField(candidates);
}
