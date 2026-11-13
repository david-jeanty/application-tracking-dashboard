import { describe, expect, it } from "vitest";
import {
  evaluateLayout,
  fullLineLengths,
  sameRenderedText,
  type LayoutMeasurement,
  type MeasuredBullet,
} from "@/lib/agent/resume/layout";
import { countPdfPages } from "@/lib/agent/resume/pdf";

const A = "Reduced the open ticket backlog by 35% by redesigning triage.";
const B = "Grew Interndex to 100 student sign-ups and 20+ monthly active users.";

function bullet(text: string, fills: number[]): MeasuredBullet {
  return { text, lines: fills.map((fill) => ({ text: "x".repeat(Math.round(fill * 100)), fill })) };
}

function measurement(overrides: Partial<LayoutMeasurement> = {}): LayoutMeasurement {
  return {
    pages: 1,
    page_fill: 0.97,
    bullets: [bullet(A, [1, 0.9]), bullet(B, [0.92])],
    ...overrides,
  };
}

describe("evaluateLayout", () => {
  it("passes one full page whose bullets end on full lines", () => {
    const result = evaluateLayout(measurement(), [A, B], { pdfPages: 1 });
    expect(result).toMatchObject({ status: "passed", pages: 1, failures: [], warnings: [] });
  });

  it("fails a second page, from the layout or from the PDF", () => {
    expect(evaluateLayout(measurement({ pages: 2 }), [A, B]).failures).toEqual([
      { rule: "one_page", detail: "The resume runs to 2 pages. It must fit on one." },
    ]);
    expect(evaluateLayout(measurement(), [A, B], { pdfPages: 2 }).status).toBe("failed");
  });

  it("fails a widow, a short single line, and a third line, naming the bullet", () => {
    const result = evaluateLayout(
      measurement({
        bullets: [bullet(A, [1, 0.5]), bullet(B, [0.6]), bullet("C.", [1, 1, 0.3])],
      }),
      [A, B, "C."],
    );
    expect(result.failures.map((failure) => [failure.rule, failure.index])).toEqual([
      ["widow", 0],
      ["short_line", 1],
      ["three_lines", 2],
    ]);
    expect(result.failures[0].detail).toContain("50%");
  });

  it("treats exactly 80% as full", () => {
    expect(evaluateLayout(measurement({ bullets: [bullet(A, [1, 0.8]), bullet(B, [0.8])] }), [A, B]).status).toBe(
      "passed",
    );
  });

  it("fails when the page does not show the bullets that were sent", () => {
    const missing = evaluateLayout(measurement({ bullets: [bullet(A, [1, 0.9])] }), [A, B]);
    expect(missing.failures[0].rule).toBe("content_mismatch");
    const changed = evaluateLayout(measurement(), [A, "Something else."]);
    expect(changed.failures).toEqual([
      { rule: "content_mismatch", index: 1, detail: "Bullet 1 on the page does not match the text that was sent." },
    ]);
  });

  it("warns, without failing, when the page is not fully used", () => {
    const result = evaluateLayout(measurement({ page_fill: 0.7 }), [A, B]);
    expect(result.status).toBe("passed");
    expect(result.warnings[0].rule).toBe("page_not_full");
  });
});

describe("sameRenderedText", () => {
  it("ignores spacing and typographic quotes", () => {
    expect(sameRenderedText("David’s  “tool”", "David's \"tool\"")).toBe(true);
    expect(sameRenderedText("A", "B")).toBe(false);
  });
});

describe("fullLineLengths", () => {
  it("measures every wrapped line except each bullet's last", () => {
    const lengths = fullLineLengths({
      pages: 1,
      page_fill: 1,
      bullets: [
        { text: "", lines: [{ text: " ".repeat(2) + "a".repeat(108), fill: 1 }, { text: "b", fill: 0.1 }] },
        { text: "", lines: [{ text: "c".repeat(60), fill: 0.55 }] },
        {
          text: "",
          lines: [
            { text: "d".repeat(110), fill: 1 },
            { text: "e".repeat(109), fill: 1 },
            { text: "f", fill: 0.1 },
          ],
        },
      ],
    });
    expect(lengths).toEqual([108, 110, 109]);
  });
});

describe("countPdfPages", () => {
  const pdf = (body: string) => new TextEncoder().encode(`%PDF-1.4\n${body}\n%%EOF`);

  it("counts page objects, not the page tree", () => {
    expect(countPdfPages(pdf("1 0 obj << /Type /Pages /Count 1 /Kids [2 0 R] >>\n2 0 obj << /Type /Page /Parent 1 0 R >>"))).toBe(1);
    expect(countPdfPages(pdf("<</Type/Pages/Count 2>> <</Type/Page>> <</Type/Page>>"))).toBe(2);
  });

  it("falls back to the page tree count, and gives null for a non-PDF", () => {
    expect(countPdfPages(pdf("<< /Type /Pages /Count 3 >>"))).toBe(3);
    expect(countPdfPages(new TextEncoder().encode("<html></html>"))).toBeNull();
  });
});
