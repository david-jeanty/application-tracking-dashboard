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
 * An optional day between a month name and the range connector, so
 * "September 8th through December 31st" is recognized as the same span as
 * "September to December".
 */
const DAY_IN_RANGE = "(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?";
const RANGE_CONNECTOR = "\\s*(?:to|through|until|-|–|—)\\s*";

function monthRange(from: string, to: string): RegExp {
  return new RegExp(
    `\\b(?:${from})\\.?${DAY_IN_RANGE}${RANGE_CONNECTOR}(?:${to})\\b`,
    "i",
  );
}

/**
 * Month ranges imply a season on the standard Canadian co-op calendar.
 * Mapped conservatively: only ranges that align cleanly with a term.
 */
const MONTH_RANGE_SEASONS: Array<{
  pattern: RegExp;
  season: string;
  months: number;
}> = [
  { pattern: monthRange("september|sept?", "december|dec"), season: "Fall", months: 4 },
  { pattern: monthRange("january|jan", "april|apr"), season: "Winter", months: 4 },
  { pattern: monthRange("may", "august|aug"), season: "Summer", months: 4 },
  { pattern: monthRange("september|sept?", "april|apr"), season: "Fall", months: 8 },
  { pattern: monthRange("may", "december|dec"), season: "Summer", months: 8 },
  { pattern: monthRange("january|jan", "august|aug"), season: "Winter", months: 8 },
];

/** Month name to the co-op term that starts in it. */
const MONTH_SEASONS: Record<string, string> = {
  january: "Winter", february: "Winter", march: "Winter", april: "Winter",
  may: "Summer", june: "Summer", july: "Summer", august: "Summer",
  september: "Fall", october: "Fall", november: "Fall", december: "Fall",
};

const MONTH_ALTERNATION = Object.keys(MONTH_SEASONS).join("|");

/**
 * A placement stated as "September 2026 - August 2027".
 *
 * The recruiting term is named for when the placement *begins*, so only the
 * first month and year are read. Taking the end instead would label a 12-month
 * Fall 2026 placement as "Summer 2027" — a term the student never applied to,
 * and one that sorts the application into the wrong recruiting cycle.
 */
const START_END_MONTH_YEARS = new RegExp(
  `\\b(${MONTH_ALTERNATION})\\s+(20\\d{2})${RANGE_CONNECTOR}(?:${MONTH_ALTERNATION})\\s+(20\\d{2})\\b`,
  "i",
);

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

    // An explicit start-and-end placement names its term by the start date.
    const startEnd = START_END_MONTH_YEARS.exec(haystack);
    if (startEnd) {
      candidates.push({
        value: `${MONTH_SEASONS[startEnd[1].toLowerCase()]} ${startEnd[2]}`,
        score: labelled ? 100 : 88,
        evidence: line.original,
        ruleId: "work-term:start-of-placement",
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
