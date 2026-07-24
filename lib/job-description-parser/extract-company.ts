import {
  containsBoilerplate,
  isGenericHeading,
} from "@/lib/job-description-parser/rules/generic-headings";
import { matchLabel } from "@/lib/job-description-parser/rules/labels";
import { resolveField } from "@/lib/job-description-parser/score";
import type {
  ExtractedField,
  FieldCandidate,
  NormalizedDocument,
} from "@/lib/job-description-parser/types";

/** The form caps the company name at 160 characters. */
const MAX_COMPANY_LENGTH = 160;

/** Legal and descriptive suffixes that mark an organization name. */
const COMPANY_SUFFIX =
  /\b(inc\.?|ltd\.?|llc|llp|corp\.?|corporation|company|technologies|technology|systems|solutions|group|holdings|labs|bank|university|college|hospital|foundation|institute|agency|partners|consulting|services)\b/i;

/**
 * Phrases that introduce a company name. The capture group is the name, and
 * the trailing boundary stops before the rest of the sentence.
 *
 * These are deliberately case-sensitive so `[A-Z]` only captures proper nouns,
 * which is why the leading keywords spell out both cases rather than using /i.
 */
const INTRO_PATTERNS: Array<{ pattern: RegExp; score: number; ruleId: string }> = [
  {
    pattern:
      /^(?:[Aa]bout|[Jj]oin|[Aa]t)\s+([A-Z][\w&.\-']*(?:\s+[A-Z][\w&.\-']*){0,4})\b/,
    score: 85,
    ruleId: "company:intro-phrase",
  },
  {
    pattern:
      /\b([A-Z][\w&.\-']*(?:\s+[A-Z][\w&.\-']*){0,4})\s+is\s+(?:a|an|the|currently|looking|seeking|hiring)\b/,
    score: 90,
    ruleId: "company:is-hiring",
  },
  {
    pattern:
      /\b([A-Z][\w&.\-']*(?:\s+[A-Z][\w&.\-']*){0,4})\s+is\s+(?:looking for|seeking|hiring)\b/,
    score: 95,
    ruleId: "company:is-seeking",
  },
];

/** Words that are never part of a company name captured by intro patterns. */
const STOP_WORDS = new Set([
  "we",
  "our",
  "the",
  "this",
  "these",
  "you",
  "your",
  "us",
  "it",
  "they",
]);

/** Legal abbreviations whose trailing period is part of the name, not prose. */
const ABBREVIATION_END = /\b(inc|ltd|corp|co|llc|llp|plc|gmbh|s\.a)\.$/i;

function cleanCandidate(value: string): string | null {
  const withoutTrailingPunctuation = ABBREVIATION_END.test(value.trim())
    ? value.replace(/[,;:]+$/, "")
    : value.replace(/[,.;:]+$/, "");

  const trimmed = withoutTrailingPunctuation.trim();
  if (!trimmed.length || trimmed.length > MAX_COMPANY_LENGTH) return null;
  if (STOP_WORDS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

export function extractCompany(
  document: NormalizedDocument,
): ExtractedField<string> {
  const candidates: FieldCandidate<string>[] = [];
  const mentionCounts = new Map<string, number>();

  for (const line of document.lines) {
    const labelled = matchLabel(line.original, "company");
    if (labelled) {
      const cleaned = cleanCandidate(labelled);
      if (cleaned) {
        candidates.push({
          value: cleaned,
          score: 120,
          evidence: line.original,
          ruleId: "company:labelled",
          lineIndex: line.index,
        });
        continue;
      }
    }

    if (isGenericHeading(line.normalized) || containsBoilerplate(line.normalized)) {
      continue;
    }

    let introMatched = false;
    for (const { pattern, score, ruleId } of INTRO_PATTERNS) {
      const match = pattern.exec(line.original);
      const cleaned = match?.[1] ? cleanCandidate(match[1]) : null;
      if (!cleaned) continue;

      introMatched = true;
      candidates.push({
        value: cleaned,
        score: line.index < 5 ? score + 10 : score,
        evidence: line.original,
        ruleId,
        lineIndex: line.index,
      });
      mentionCounts.set(cleaned, (mentionCounts.get(cleaned) ?? 0) + 1);
    }

    // A short leading line carrying a legal suffix is very likely the employer,
    // but only when an intro phrase has not already isolated the name: "Join
    // Brightpath Systems" would otherwise yield the whole line as the name.
    if (!introMatched && line.index < 4 && COMPANY_SUFFIX.test(line.original)) {
      const cleaned = cleanCandidate(line.original);
      if (cleaned && cleaned.split(/\s+/).length <= 8) {
        candidates.push({
          value: cleaned,
          score: 95,
          evidence: line.original,
          ruleId: "company:legal-suffix",
          lineIndex: line.index,
        });
      }
    }
  }

  // Repetition is corroborating evidence: a real employer name recurs.
  for (const candidate of candidates) {
    const repeats = mentionCounts.get(candidate.value) ?? 0;
    if (repeats > 1) candidate.score += Math.min(repeats * 5, 20);
  }

  return resolveField(candidates);
}
