import { describe, expect, it } from "vitest";
import {
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  nextLineHeight,
  readLineHeight,
  setLineHeight,
} from "@/lib/agent/resume/line-height";

/** The rule as David's zero2sudo base writes it. */
const BASE_CSS = "/* meta */\nbody {\n    font-size:  12px;\n}\n\n/* line height so the content fills the full page */\nli, p {\n    line-height: 1.2;\n}\n";

const page = (bottom_gap: number) => ({ pages: 1, bullets: [], page_fill: null, top_gap: 0, bottom_gap });

describe("line height", () => {
  it("reads and replaces the base resume's li, p rule", () => {
    expect(readLineHeight(BASE_CSS)).toBe(1.2);
    const tuned = setLineHeight(BASE_CSS, 1.24);
    expect(readLineHeight(tuned)).toBe(1.24);
    expect(tuned).toContain("li, p {\n    line-height: 1.24;\n}");
    expect(tuned.replace("1.24", "1.2")).toBe(BASE_CSS);
  });

  it("adds the rule when a template has none", () => {
    const tuned = setLineHeight("body { margin: 0; }", 1.25);
    expect(readLineHeight(tuned)).toBe(1.25);
  });

  it("grows the line height for a short page, within the limit", () => {
    const next = nextLineHeight(1.2, page(0.093), false)!;
    expect(next).toBeGreaterThan(1.2);
    expect(next).toBeLessThanOrEqual(LINE_HEIGHT_MAX);
    expect(nextLineHeight(LINE_HEIGHT_MAX, page(0.2), false)).toBeNull();
  });

  it("leaves a page that is already full", () => {
    expect(nextLineHeight(1.2, page(0.04), false)).toBeNull();
  });

  it("tightens a page that runs over, down to the limit", () => {
    expect(nextLineHeight(1.2, page(0), true)).toBe(1.17);
    expect(nextLineHeight(LINE_HEIGHT_MIN, page(0), true)).toBeNull();
  });
});
