/**
 * Line height as the last step of filling the page (decision record 0020).
 *
 * David's zero2sudo resumes fill the page by tuning the line height of
 * bullets and paragraphs (`li, p { line-height }`) per resume: 1.18, 1.24,
 * 1.27 against the base's 1.2. After the build has added or cut bullets, the
 * remaining gap is closed the same way, within LINE_HEIGHT_MIN to
 * LINE_HEIGHT_MAX. Line height changes the space between lines, never how
 * many characters fit on one, so it cannot create a widow.
 *
 * Pure functions, no I/O.
 */

import type { LayoutMeasurement } from "@/lib/agent/resume/layout";

export const LINE_HEIGHT_MIN = 1.15;
export const LINE_HEIGHT_MAX = 1.3;
/** The gap the tuning aims for, as a share of the page height. */
const TARGET_GAP = 0.02;
/**
 * How much of the page moves when the line height changes: measured on a
 * real zero2sudo resume, 1.2 to 1.3 shrank the gap from 9.3% to 5.6% of the
 * page, so bullets and paragraphs behave as about half its height. Line
 * height closes at most about 4% of a page; bullets do the rest.
 */
const LINE_SHARE = 0.5;
const DEFAULT_LINE_HEIGHT = 1.2;

const RULE = /((?:^|[}\s])(?:li\s*,\s*p|p\s*,\s*li)\s*\{[^}]*?line-height:\s*)([\d.]+)/;

export function readLineHeight(css: string): number {
  const value = Number(RULE.exec(css)?.[2]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_LINE_HEIGHT;
}

export function setLineHeight(css: string, value: number): string {
  const formatted = value.toFixed(2).replace(/0$/, "");
  if (RULE.test(css)) return css.replace(RULE, (_match, before: string) => `${before}${formatted}`);
  return `${css}\n\n/* Interndex: line height tuned to fill the page */\nli, p {\n    line-height: ${formatted};\n}\n`;
}

const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number) => Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, value));

/**
 * The next line height to try, or null when there is nothing to do or no
 * room left: taller lines for a short page, shorter for one that runs over.
 */
export function nextLineHeight(current: number, measurement: LayoutMeasurement, overflow: boolean): number | null {
  if (overflow) {
    const next = round(clamp(current - 0.03));
    return next < current ? next : null;
  }
  const gap = measurement.bottom_gap;
  if (typeof gap !== "number" || gap <= 0.05) return null;
  const used = Math.max(0.2, 1 - gap - (measurement.top_gap ?? 0));
  const next = round(clamp(current * (1 + (gap - TARGET_GAP) / (LINE_SHARE * used))));
  return next > current ? next : null;
}
