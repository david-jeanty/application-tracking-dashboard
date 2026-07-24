import { findDates } from "@/lib/job-description-parser/parse-date";
import { matchLabel } from "@/lib/job-description-parser/rules/labels";
import { resolveField } from "@/lib/job-description-parser/score";
import type {
  ExtractedField,
  FieldCandidate,
  NormalizedDocument,
} from "@/lib/job-description-parser/types";

/** Context phrases that make a nearby date a deadline. */
const POSITIVE_CONTEXT: Array<[RegExp, number]> = [
  [/application deadline/gi, 100],
  [/deadline to apply/gi, 100],
  [/last day to apply/gi, 95],
  [/closing date/gi, 95],
  [/date limite/gi, 95],
  [/applications? close/gi, 92],
  [/posting closes/gi, 90],
  [/apply by/gi, 90],
  [/apply before/gi, 88],
  [/expires?/gi, 75],
  [/deadline/gi, 70],
];

/** Context phrases that mean a nearby date is something else entirely. */
const NEGATIVE_CONTEXT: Array<[RegExp, number]> = [
  [/anticipated start/gi, 120],
  [/start date/gi, 120],
  [/founded in/gi, 110],
  [/copyright/gi, 100],
  [/starts? on/gi, 100],
  [/interviews?/gi, 95],
  [/date posted/gi, 90],
  [/posted/gi, 85],
  [/orientation/gi, 85],
  [/work term (?:begins|starts)/gi, 90],
  [/beginning in/gi, 80],
  [/end date/gi, 70],
];

/** Beyond this many characters a context phrase no longer describes the date. */
const CONTEXT_WINDOW = 90;

type ContextHit = { weight: number; distance: number };

/**
 * Finds the closest occurrence of any phrase in `rules` to `offset`. Distance
 * matters because a single line can carry several dates with different roles:
 * "Apply by December 5. Interviews begin December 15."
 */
function nearestContext(
  text: string,
  offset: number,
  rules: Array<[RegExp, number]>,
): ContextHit | null {
  let best: ContextHit | null = null;

  for (const [pattern, weight] of rules) {
    // Patterns are module-level and carry /g, so reset before every scan.
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;

      // A phrase before the date is the normal ordering ("apply by <date>");
      // one after it is weaker evidence, so it is penalized by distance only.
      const end = match.index + match[0].length;
      const distance = offset >= end ? offset - end : match.index - offset;
      if (distance < 0 || distance > CONTEXT_WINDOW) continue;

      if (!best || distance < best.distance) {
        best = { weight, distance };
      }
    }
  }

  return best;
}

/** Nearer context counts for more, falling off linearly across the window. */
function proximityScore(hit: ContextHit): number {
  const falloff = 1 - (hit.distance / CONTEXT_WINDOW) * 0.5;
  return hit.weight * falloff;
}

export function extractDeadline(
  document: NormalizedDocument,
  today: Date,
): ExtractedField<string> {
  const candidates: FieldCandidate<string>[] = [];

  for (const line of document.lines) {
    const labelled = matchLabel(line.original, "deadline");

    // A labelled line is searched by its value alone so an unrelated date
    // later in the same line cannot ride on the label.
    const searchText = labelled ?? line.original;
    const dates = findDates(searchText, today);
    if (!dates.length) continue;

    for (const date of dates) {
      const warnings: string[] = [];
      let score: number;

      if (labelled) {
        // Only the first date after a deadline label is the deadline.
        score = date.offset === dates[0].offset ? 115 : 40;
      } else {
        const positive = nearestContext(searchText, date.offset, POSITIVE_CONTEXT);
        const negative = nearestContext(searchText, date.offset, NEGATIVE_CONTEXT);
        if (!positive) continue;

        score = proximityScore(positive);
        // A closer negative phrase overrides: the date belongs to that phrase.
        if (negative && negative.distance <= positive.distance) {
          score -= proximityScore(negative);
        }
      }

      if (date.yearInferred) {
        score -= 15;
        warnings.push(
          `The year for "${date.text}" was not stated and was inferred as ${date.value.slice(0, 4)}.`,
        );
      }

      if (date.ambiguousOrder) {
        score -= 20;
        warnings.push(
          `"${date.text}" could be day-first or month-first; it was read as day-first.`,
        );
      }

      if (score <= 0) continue;

      candidates.push({
        value: date.value,
        score,
        evidence: line.original,
        ruleId: labelled ? "deadline:labelled" : "deadline:context",
        lineIndex: line.index,
        warnings,
      });
    }
  }

  return resolveField(candidates);
}
