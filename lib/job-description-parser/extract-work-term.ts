import { matchLabel } from "@/lib/job-description-parser/rules/labels";
import { resolveField } from "@/lib/job-description-parser/score";
import type {
  ExtractedField,
  FieldCandidate,
  NormalizedDocument,
} from "@/lib/job-description-parser/types";

const SEASON_PATTERNS: Array<{ pattern: RegExp; season: string; score: number }> = [
  { pattern: /\b(?:fall|autumn)\s+(20\d{2})\b/i, season: "Fall", score: 110 },
  { pattern: /\bwinter\s+(20\d{2})\b/i, season: "Winter", score: 110 },
  { pattern: /\bsummer\s+(20\d{2})\b/i, season: "Summer", score: 110 },
  { pattern: /\bspring\s+(20\d{2})\b/i, season: "Spring", score: 110 },
];

/**
 * Month ranges imply a season on the standard Canadian co-op calendar.
 * Mapped conservatively: only ranges that align cleanly with a term.
 */
const MONTH_RANGE_SEASONS: Array<{
  pattern: RegExp;
  season: string;
  months: number;
}> = [
  {
    pattern: /\b(?:september|sept?)\.?\s*(?:to|through|-|–|—)\s*december\b/i,
    season: "Fall",
    months: 4,
  },
  {
    pattern: /\bjanuary\s*(?:to|through|-|–|—)\s*april\b/i,
    season: "Winter",
    months: 4,
  },
  {
    pattern: /\bmay\s*(?:to|through|-|–|—)\s*august\b/i,
    season: "Summer",
    months: 4,
  },
  {
    pattern: /\b(?:september|sept?)\.?\s*(?:to|through|-|–|—)\s*april\b/i,
    season: "Fall",
    months: 8,
  },
  {
    pattern: /\bmay\s*(?:to|through|-|–|—)\s*december\b/i,
    season: "Summer",
    months: 8,
  },
  {
    pattern: /\bjanuary\s*(?:to|through|-|–|—)\s*august\b/i,
    season: "Winter",
    months: 8,
  },
];

/**
 * Unit vocabulary. French forms are accepted alongside English because a
 * Quebec posting states its length as "4 mois" while labelling the rest of the
 * document in either language; the normalized output stays English.
 */
const MONTH_UNIT = "(?:months?|mois)";
const WEEK_UNIT = "(?:weeks?|semaines?)";

/** Matches a French unit so a match can be normalized to the right noun. */
const WEEK_UNIT_TEST = /week|semaine/i;

const DURATION_PATTERNS: Array<{ pattern: RegExp; value: string; score: number }> = [
  {
    pattern: new RegExp(`\\b4\\s*(?:or|to|ou|-|–)\\s*8[\\s-]?${MONTH_UNIT}\\b`, "i"),
    value: "4 or 8 months",
    score: 115,
  },
  {
    pattern: new RegExp(`\\b8\\s*(?:or|to|ou|-|–)\\s*12[\\s-]?${MONTH_UNIT}\\b`, "i"),
    value: "8 or 12 months",
    score: 115,
  },
  {
    pattern: new RegExp(`\\b(?:four|quatre)[\\s-]?${MONTH_UNIT}\\b`, "i"),
    value: "4 months",
    score: 100,
  },
  {
    pattern: new RegExp(`\\b(?:eight|huit)[\\s-]?${MONTH_UNIT}\\b`, "i"),
    value: "8 months",
    score: 100,
  },
  {
    pattern: new RegExp(`\\b(?:twelve|douze)[\\s-]?${MONTH_UNIT}\\b`, "i"),
    value: "12 months",
    score: 100,
  },
  {
    pattern: new RegExp(`\\b(\\d{1,2})[\\s-]?${MONTH_UNIT}\\b`, "i"),
    value: "",
    score: 95,
  },
  {
    pattern: new RegExp(`\\b(\\d{1,2})[\\s-]?${WEEK_UNIT}\\b`, "i"),
    value: "",
    score: 70,
  },
];

function extractSeason(document: NormalizedDocument): FieldCandidate<string>[] {
  const candidates: FieldCandidate<string>[] = [];

  for (const line of document.lines) {
    const labelled = matchLabel(line.original, "workTerm");
    const haystack = labelled ?? line.original;

    for (const { pattern, season, score } of SEASON_PATTERNS) {
      const match = pattern.exec(haystack);
      if (!match) continue;
      candidates.push({
        value: `${season} ${match[1]}`,
        score: labelled ? score + 25 : score,
        evidence: line.original,
        ruleId: `work-term:season:${season.toLowerCase()}`,
        lineIndex: line.index,
      });
    }

    // A month range plus a nearby year yields the same season, at lower score
    // because the year has to be borrowed from elsewhere on the line.
    for (const { pattern, season } of MONTH_RANGE_SEASONS) {
      if (!pattern.test(haystack)) continue;
      const year = /\b(20\d{2})\b/.exec(haystack)?.[1];
      if (!year) continue;
      candidates.push({
        value: `${season} ${year}`,
        score: labelled ? 95 : 75,
        evidence: line.original,
        ruleId: `work-term:month-range:${season.toLowerCase()}`,
        lineIndex: line.index,
      });
    }
  }

  return candidates;
}

function extractDuration(
  document: NormalizedDocument,
): FieldCandidate<string>[] {
  const candidates: FieldCandidate<string>[] = [];

  for (const line of document.lines) {
    const labelled = matchLabel(line.original, "duration");
    const haystack = labelled ?? line.original;

    // A month range states the duration outright and is more reliable than a
    // loose "12 months" that might refer to something else entirely.
    for (const { pattern, months } of MONTH_RANGE_SEASONS) {
      if (!pattern.test(haystack)) continue;
      candidates.push({
        value: `${months} months`,
        score: labelled ? 110 : 90,
        evidence: line.original,
        ruleId: "duration:month-range",
        lineIndex: line.index,
      });
    }

    for (const { pattern, value, score } of DURATION_PATTERNS) {
      const match = pattern.exec(haystack);
      if (!match) continue;

      const unit = WEEK_UNIT_TEST.test(match[0]) ? "weeks" : "months";
      const resolved = value || `${match[1]} ${unit}`;

      candidates.push({
        value: resolved,
        score: labelled ? score + 25 : score,
        evidence: line.original,
        ruleId: `duration:${unit}`,
        lineIndex: line.index,
      });
      break;
    }
  }

  return candidates;
}

export function extractWorkTerm(document: NormalizedDocument): {
  season: ExtractedField<string>;
  duration: ExtractedField<string>;
} {
  return {
    season: resolveField(extractSeason(document)),
    duration: resolveField(extractDuration(document)),
  };
}
