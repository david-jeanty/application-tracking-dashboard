/**
 * Line-fill calibration: turning measured line lengths into character targets.
 *
 * `calibrate_template` builds one test resume per template and measures, from
 * the PDF, how many characters each wrapped (full) line holds. This module is
 * the pure arithmetic from those measurements to the three targets the bullet
 * checker uses. The PDF reading itself lives elsewhere.
 *
 * Why the minimum and the median:
 *
 * - A line wraps at a word boundary, so each full line is a little shorter
 *   than the true capacity, and how much shorter depends on the word that did
 *   not fit. The **shortest** full line measured is therefore a safe ceiling
 *   for "this fits on one line": anything at or under it fit every time.
 * - The **median** is the best estimate of a line's real capacity, which is
 *   what "at least 80% full" is measured against.
 *
 * With full lines of 108 to 111 characters this gives 108 / 196 / 216, close to
 * the seed values in STANDARDS.md (about 108 to 110 per line, two-liners from
 * 199 to 220), which is the check that the method is sound.
 */

import type { LineTargets } from "@/lib/agent/checks/bullets";

/** Fewer measurements than this cannot tell a typical line from an outlier. */
export const MIN_CALIBRATION_LINES = 5;

/** The share of a line the last line of a bullet must fill (STANDARDS.md). */
export const LAST_LINE_FILL = 0.8;

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function deriveLineTargets(fullLineLengths: readonly number[]): LineTargets {
  const lengths = fullLineLengths
    .filter((length) => Number.isFinite(length) && length > 0)
    .map((length) => Math.round(length))
    .sort((a, b) => a - b);

  if (lengths.length < MIN_CALIBRATION_LINES) {
    throw new Error(
      `Calibration needs at least ${MIN_CALIBRATION_LINES} full lines; got ${lengths.length}.`,
    );
  }

  const oneLineChars = lengths[0];
  const capacity = median(lengths);

  return {
    oneLineChars,
    twoLineMin: oneLineChars + Math.ceil(capacity * LAST_LINE_FILL),
    twoLineMax: oneLineChars * 2,
  };
}
