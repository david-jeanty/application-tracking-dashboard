/**
 * The layout check: is a rendered resume one full page with no widows?
 *
 * The browser (`render.ts`) measures the page resume.lol's printable HTML
 * produces: how many pages, and for each bullet the text of every line and
 * how full that line is. This module turns that measurement into failures,
 * the same way `check_bullets` turns text into failures. It is pure, so the
 * rules are unit tested without a browser.
 *
 * The rules come from STANDARDS.md "Layout rules":
 *
 * - one page,
 * - every bullet a full single line, or two lines whose last line is at least
 *   80% full (no widows), never three,
 * - the page is fully used (a warning, since STANDARDS.md does not mark it as
 *   checked).
 *
 * It also confirms the page shows exactly the bullets that were sent, so a
 * markdown surprise (an asterisk read as italics, a dropped line) is caught.
 */

import { LAST_LINE_FILL } from "@/lib/agent/calibration";
import { lineFillCheck, type LineTargets } from "@/lib/agent/checks/bullets";

export type MeasuredLine = {
  /** The line's text as rendered. */
  text: string;
  /** How much of the bullet's text width the line uses, 0 to 1. */
  fill: number;
};

export type MeasuredBullet = { text: string; lines: MeasuredLine[] };

export type LayoutMeasurement = {
  pages: number;
  bullets: MeasuredBullet[];
  /** How much of the first page's content height is used, 0 to 1. */
  page_fill: number | null;
};

export type LayoutRule =
  | "one_page"
  | "widow"
  | "short_line"
  | "three_lines"
  | "one_line"
  | "content_mismatch"
  | "page_not_full";

export type LayoutIssue = { rule: LayoutRule; detail: string; index?: number };

export type LayoutResult = {
  status: "passed" | "failed";
  pages: number;
  failures: LayoutIssue[];
  warnings: LayoutIssue[];
};

/** Below this share of the page height, the page is not fully used. */
export const PAGE_FILL_WARNING = 0.9;

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Compares rendered text with sent text, ignoring spacing and quote styles. */
export function sameRenderedText(rendered: string, sent: string): boolean {
  const normalize = (text: string) =>
    text
      .normalize("NFC")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  return normalize(rendered) === normalize(sent);
}

export function evaluateLayout(
  measurement: LayoutMeasurement,
  expectedBullets: readonly string[],
  options: {
    pdfPages?: number | null;
    /** Per bullet: may it be one line? See `line-rules.ts`. Missing means no. */
    oneLineAllowed?: readonly boolean[];
  } = {},
): LayoutResult {
  const failures: LayoutIssue[] = [];
  const warnings: LayoutIssue[] = [];
  const pages = Math.max(measurement.pages, options.pdfPages ?? 0);

  if (pages !== 1) {
    failures.push({
      rule: "one_page",
      detail: `The resume runs to ${pages} pages. It must fit on one.`,
    });
  }

  if (measurement.bullets.length !== expectedBullets.length) {
    failures.push({
      rule: "content_mismatch",
      detail: `The page shows ${measurement.bullets.length} bullets, but ${expectedBullets.length} were sent.`,
    });
  } else {
    expectedBullets.forEach((text, index) => {
      if (!sameRenderedText(measurement.bullets[index].text, text)) {
        failures.push({
          rule: "content_mismatch",
          index,
          detail: `Bullet ${index} on the page does not match the text that was sent.`,
        });
      }
    });
  }

  // David's rule: exactly two lines, the last at least 80% full. One line
  // (at least 80% full) only where the experience allows it.
  measurement.bullets.forEach(({ lines }, index) => {
    const last = lines[lines.length - 1];
    if (!last) return;
    const oneLineOk = options.oneLineAllowed?.[index] === true;
    if (lines.length >= 3) {
      failures.push({
        rule: "three_lines",
        index,
        detail: `Bullet ${index} runs to ${lines.length} lines. Cut it to two.`,
      });
    } else if (lines.length === 1 && !oneLineOk) {
      failures.push({
        rule: "one_line",
        index,
        detail: `Bullet ${index} is one line. Bullets here run to two lines: add words until it wraps and the second line is at least 80% full.`,
      });
    } else if (last.fill < LAST_LINE_FILL) {
      failures.push(
        lines.length === 1
          ? {
              rule: "short_line",
              index,
              detail: `Bullet ${index} is one line ${percent(last.fill)} full. Lengthen it to fill the line.`,
            }
          : {
              rule: "widow",
              index,
              detail: oneLineOk
                ? `Bullet ${index} ends on a line ${percent(last.fill)} full. Add words to fill it, or cut to one line.`
                : `Bullet ${index} ends on a line ${percent(last.fill)} full. Add words to fill it.`,
            },
      );
    }
  });

  if (measurement.page_fill !== null && measurement.page_fill < PAGE_FILL_WARNING) {
    warnings.push({
      rule: "page_not_full",
      detail: `The page is ${percent(measurement.page_fill)} full. Add a bullet or lengthen one.`,
    });
  }

  return { status: failures.length ? "failed" : "passed", pages, failures, warnings };
}

/**
 * The line rules by character count, for the fallback path only: when
 * Chrome could not render, this is the best estimate of the layout check.
 */
export function evaluateCharacterLines(
  bullets: readonly string[],
  targets: LineTargets,
  oneLineAllowed: readonly boolean[] = [],
): LayoutIssue[] {
  return bullets.flatMap((text, index) => {
    const issue = lineFillCheck(text.length, targets, { oneLineAllowed: oneLineAllowed[index] === true });
    return issue ? [{ rule: issue.rule, index, detail: `Bullet ${index} (character estimate): ${issue.detail}` }] : [];
  });
}

/**
 * Calibration input: the length of every wrapped (full) line, which is every
 * line of a bullet except its last. See `deriveLineTargets`.
 */
export function fullLineLengths(measurement: LayoutMeasurement): number[] {
  return measurement.bullets.flatMap(({ lines }) =>
    lines.slice(0, -1).map((line) => line.text.trim().length),
  );
}
