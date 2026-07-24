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
/**
 * Trailing currency code. Captured as part of the value because "$23-$30" and
 * "$23-$30 CAD" are different claims once a posting spans currencies, and the
 * user pasted the qualifier deliberately.
 */
const CURRENCY = "(?:\\s*(?:CAD|USD|CDN|C\\$|US\\$))?";
const HOURLY = "(?:/\\s?h(?:ou)?r|per hour|hourly|an hour|/hr)";
const ANNUAL = "(?:per year|annually|per annum|/year|a year|yearly)";

const SALARY_PATTERNS: Array<{ pattern: RegExp; score: number; ruleId: string }> = [
  {
    pattern: new RegExp(
      `${AMOUNT}\\s*${DASH}\\s*${AMOUNT}${CURRENCY}\\s*${HOURLY}`,
      "i",
    ),
    score: 115,
    ruleId: "salary:hourly-range",
  },
  {
    pattern: new RegExp(
      `${AMOUNT}\\s*${DASH}\\s*${AMOUNT}${CURRENCY}\\s*${ANNUAL}`,
      "i",
    ),
    score: 115,
    ruleId: "salary:annual-range",
  },
  {
    pattern: new RegExp(`${AMOUNT}${CURRENCY}\\s*${HOURLY}`, "i"),
    score: 105,
    ruleId: "salary:hourly",
  },
  {
    pattern: new RegExp(`${AMOUNT}${CURRENCY}\\s*${ANNUAL}`, "i"),
    score: 105,
    ruleId: "salary:annual",
  },
  {
    // A bare range with no unit; the unit is usually implied by the label.
    pattern: new RegExp(`${AMOUNT}\\s*${DASH}\\s*${AMOUNT}${CURRENCY}`, "i"),
    score: 80,
    ruleId: "salary:bare-range",
  },
];

/**
 * Structured pay blocks put each label on its own line and its value on the
 * next, with no currency symbol anywhere:
 *
 *   Pay Type
 *   Hourly
 *   Hiring Min Rate
 *   28.20 CAD
 *   Hiring Max Rate
 *   32.30 CAD
 *
 * Nothing in that block matches a pattern built around "$", so the whole
 * compensation section reads as absent. These rules recognize the layout and
 * reassemble it into one figure.
 */
const MIN_RATE_LABEL =
  /^(?:hiring\s+)?(?:min(?:imum)?)(?:\s+hiring)?\s*(?:rate|pay|salary|wage)?$/i;
const MAX_RATE_LABEL =
  /^(?:hiring\s+)?(?:max(?:imum)?)(?:\s+hiring)?\s*(?:rate|pay|salary|wage)?$/i;
const PAY_TYPE_LABEL = /^(?:pay|rate|salary)\s*type$/i;

/** A standalone amount line, with or without a currency code. */
const RATE_VALUE = /^\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s*([A-Z]{2,3}\$?)?$/;

const PAY_PERIODS: Record<string, string> = {
  hourly: "per hour",
  hour: "per hour",
  weekly: "per week",
  biweekly: "biweekly",
  monthly: "per month",
  annual: "per year",
  annually: "per year",
  yearly: "per year",
  salaried: "per year",
  salary: "per year",
};

type StructuredPay = {
  min?: { amount: string; currency?: string };
  max?: { amount: string; currency?: string };
  period?: string;
  evidence?: string;
};

/**
 * Reads a structured pay block by pairing each label line with the line that
 * follows it. Returns the assembled figure, or null when no amount was found.
 */
function extractStructuredPay(document: NormalizedDocument): {
  value: string;
  evidence: string;
} | null {
  const found: StructuredPay = {};

  for (const line of document.lines) {
    const next = document.lines[line.index + 1];
    if (!next) continue;

    if (PAY_TYPE_LABEL.test(line.original)) {
      const period = PAY_PERIODS[next.normalized.trim()];
      if (period) found.period = period;
      continue;
    }

    const isMin = MIN_RATE_LABEL.test(line.original);
    const isMax = !isMin && MAX_RATE_LABEL.test(line.original);
    if (!isMin && !isMax) continue;

    const value = RATE_VALUE.exec(next.original.trim());
    if (!value) continue;

    const entry = { amount: value[1], currency: value[2] };
    if (isMin) found.min = entry;
    else found.max = entry;
    found.evidence = `${line.original}: ${next.original}`;
  }

  const anchor = found.min ?? found.max;
  if (!anchor || !found.evidence) return null;

  const currency = found.min?.currency ?? found.max?.currency;
  const range =
    found.min && found.max
      ? `${found.min.amount}–${found.max.amount}`
      : anchor.amount;

  const value = [range, currency, found.period]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    // The dash joins the two amounts directly; only the qualifiers are spaced.
    .replace(/\s*–\s*/, "–");

  return { value, evidence: found.evidence };
}

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

  const structured = extractStructuredPay(document);
  if (structured && structured.value.length <= MAX_SALARY_LENGTH) {
    candidates.push({
      value: structured.value,
      score: 110,
      evidence: structured.evidence,
      ruleId: "salary:structured-block",
    });
  }

  return resolveField(candidates);
}
