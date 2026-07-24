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
    // "A career at Larkfield Rail Systems will help create a legacy."
    // Also covers "Careers at", "Life at", and "Your career at".
    //
    // Deliberately case-sensitive: the capture ends at the first lowercase
    // word, which is what stops the name from swallowing the rest of the
    // sentence ("... Rail Systems will help create a legacy").
    pattern:
      /(?:[Aa]|[Yy]our|[Tt]he)?\s*(?:[Cc]areers?|[Ll]ife|[Ff]uture)\s+(?:at|with)\s+([A-Z][\w&.\-']*(?:\s+[A-Z][\w&.\-']*){0,4})\b/,
    score: 95,
    ruleId: "company:career-at",
  },
  {
    // Appositive opener: "<Company>, a global leader in ...".
    pattern:
      /^([A-Z][\w&.\-']*(?:\s+[A-Z][\w&.\-']*){0,4}),\s+(?:a|an|the)\s+[a-z]/,
    score: 100,
    ruleId: "company:appositive",
  },
  {
    // Legal name followed by its acronym: "Northgate Lottery & Gaming
    // Corporation (NLGC)". The bracketed initials are what make this
    // unambiguous, so the phrase before them can be trusted as the name.
    pattern:
      /\b([A-Z][\w.\-']*(?:\s+(?:&|[A-Z][\w.\-']*)){1,6})\s+\((?:[A-Z]{2,6})\)/,
    score: 105,
    ruleId: "company:legal-name-acronym",
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

/**
 * Glyphs that join independent facts into one header line, as job boards do:
 * "Northwind Cloud Services · Edmonton, AB · On-site". Each segment has to be
 * considered separately or the employer name arrives glued to the location.
 */
const SEGMENT_SEPARATOR = /\s*[·•|]\s*/;

/**
 * Lead-ins that introduce an employer rather than forming part of its name, as
 * on a careers page header ("Careers at Ironwood Labs") or a banner line
 * ("Join Brightpath Systems"). The lookahead keeps the strip anchored to a
 * following proper noun so ordinary prose is untouched.
 */
const HEADER_LEAD_IN =
  /^(?:careers|jobs|opportunities|openings|work|life|welcome)?\s*(?:at|with|to|join)\s+(?=[A-Z])/i;

/** Role vocabulary, used here only to tell a job title apart from an employer. */
const ROLE_WORD =
  /\b(intern|internship|co-?op|student|analyst|coordinator|associate|specialist|manager|engineer|developer|designer|consultant|advisor|assistant|representative|administrator|technician|lead|director|officer|strategist)\b/i;

/** Two to five capitalized words and nothing else: the shape of a bare name. */
const BARE_NAME = /^[A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){1,4}$/;

/**
 * Splits a header line into the independent names it may contain and removes
 * any lead-in phrase from each. Returns the segments in source order.
 */
function headerSegments(line: string): string[] {
  return line
    .split(SEGMENT_SEPARATOR)
    .map((segment) => segment.replace(HEADER_LEAD_IN, "").trim())
    .filter((segment) => segment.length > 0);
}

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
    // Each segment is judged on its own so a composite header line contributes
    // just the name, not the location and work arrangement stapled to it.
    if (!introMatched && line.index < 4) {
      for (const segment of headerSegments(line.original)) {
        if (!COMPANY_SUFFIX.test(segment)) continue;

        const cleaned = cleanCandidate(segment);
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

    // Last resort: a bare title-case name sitting just under the job title,
    // which is how a plain posting states its employer. Deliberately scored
    // into the Low band — it is a guess from position alone, so it stays
    // visible in the summary without ever populating the form on its own.
    if (!introMatched && line.index >= 1 && line.index <= 3 && !line.original.includes(":")) {
      for (const segment of headerSegments(line.original)) {
        if (!BARE_NAME.test(segment)) continue;
        if (ROLE_WORD.test(segment)) continue;

        const cleaned = cleanCandidate(segment);
        if (cleaned) {
          candidates.push({
            value: cleaned,
            score: 45,
            evidence: line.original,
            ruleId: "company:bare-name",
            lineIndex: line.index,
          });
        }
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
