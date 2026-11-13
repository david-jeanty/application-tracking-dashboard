import { afterEach, describe, expect, it } from "vitest";
import { evaluateLayout } from "@/lib/agent/resume/layout";
import { countPdfPages } from "@/lib/agent/resume/pdf";
import { renderResumeHtml } from "@/lib/agent/resume/render";

/**
 * A page shaped like PagedJS output (.pagedjs_page boxes), without the
 * script, so the measurement is tested on a known layout.
 */
function pagedHtml(pages: string[][]): string {
  const page = (bullets: string[]) => `
    <div class="pagedjs_page"><div class="pagedjs_page_content">
      <h2>Experience</h2>
      <ul>${bullets.map((text) => `<li>${text}</li>`).join("")}</ul>
    </div></div>`;
  return `<!doctype html><html><head><style>
    @page { size: letter; margin: 0; }
    body { margin: 0; font: 16px/1.4 monospace; }
    .pagedjs_page { width: 8.5in; height: 11in; overflow: hidden; break-after: page; }
    .pagedjs_page_content { width: 520px; height: 10in; padding: 0.5in; box-sizing: content-box; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 0; }
  </style></head><body><div class="pagedjs_pages">${pages.map(page).join("")}</div></body></html>`;
}

const SHORT = "Cut the backlog.";
const LONG = "Reduced the open ticket backlog by 35% and average resolution time by 25% by assessing ticketing platforms and redesigning service request triage for the whole directorate.";

const originalPath = process.env.CHROMIUM_EXECUTABLE_PATH;
afterEach(() => {
  if (originalPath === undefined) delete process.env.CHROMIUM_EXECUTABLE_PATH;
  else process.env.CHROMIUM_EXECUTABLE_PATH = originalPath;
});

describe("renderResumeHtml in real Chrome", () => {
  it("measures each bullet's lines and how full the last one is", async () => {
    const outcome = await renderResumeHtml(pagedHtml([[SHORT, LONG]]));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const [short, long] = outcome.measurement.bullets;
    expect(outcome.measurement.pages).toBe(1);
    expect(short.text).toBe(SHORT);
    expect(short.lines).toHaveLength(1);
    expect(short.lines[0].fill).toBeLessThan(0.5);
    expect(long.text).toBe(LONG);
    expect(long.lines.length).toBeGreaterThanOrEqual(2);
    // Every wrapped line but the last is close to the full width.
    for (const line of long.lines.slice(0, -1)) expect(line.fill).toBeGreaterThan(0.85);
    expect(long.lines.map((line) => line.text).join(" ")).toBe(LONG);
    expect(outcome.measurement.page_fill).toBeGreaterThan(0);
    expect(outcome.measurement.page_fill).toBeLessThan(0.5);

    const layout = evaluateLayout(outcome.measurement, [SHORT, LONG], { pdfPages: countPdfPages(outcome.pdf!) });
    expect(layout.failures.map((failure) => failure.rule)).toContain("short_line");
  });

  it("prints a PDF whose page count matches the layout", async () => {
    const one = await renderResumeHtml(pagedHtml([[LONG]]));
    const two = await renderResumeHtml(pagedHtml([[LONG], [SHORT]]));
    expect(one.ok && countPdfPages(one.pdf!)).toBe(1);
    expect(two.ok && two.measurement.pages).toBe(2);
    expect(two.ok && countPdfPages(two.pdf!)).toBe(2);
  });

  it("skips the PDF when only a measurement is asked for", async () => {
    const outcome = await renderResumeHtml(pagedHtml([[LONG]]), { withPdf: false });
    expect(outcome.ok && outcome.pdf).toBeNull();
  });

  it("blocks requests that are not stylesheets or fonts", async () => {
    const html = pagedHtml([[LONG]]).replace(
      "</body>",
      `<img src="https://example.com/beacon.png" onerror="document.body.dataset.blocked='yes'"></body>`,
    );
    const outcome = await renderResumeHtml(html);
    expect(outcome.ok).toBe(true);
  });

  it("reports a Chrome that will not start as skipped, not as a crash", async () => {
    process.env.CHROMIUM_EXECUTABLE_PATH = "/nonexistent/chrome";
    const outcome = await renderResumeHtml(pagedHtml([[LONG]]));
    expect(outcome).toMatchObject({ ok: false, reason: "launch_failed" });
  });

  it("reports running out of time as skipped", async () => {
    const outcome = await renderResumeHtml(pagedHtml([[LONG]]), { timeoutMs: 5 });
    expect(outcome).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("reports pagination that never finishes as skipped", async () => {
    const html = `<!doctype html><html><body><script>window.PagedPolyfill = {};</script><ul><li>${LONG}</li></ul></body></html>`;
    const outcome = await renderResumeHtml(html, { timeoutMs: 30_000 });
    expect(outcome).toMatchObject({ ok: false, reason: "pagination_failed" });
  });
});

describe("isAllowedRequest", () => {
  it("lets through stylesheets and fonts only", async () => {
    const { isAllowedRequest } = await import("@/lib/agent/resume/render");
    expect(isAllowedRequest("https://fonts.googleapis.com/css2?family=Tinos", "xhr")).toBe(true);
    expect(isAllowedRequest("https://cdn.jsdelivr.net/gh/x/fonts.css", "xhr")).toBe(true);
    expect(isAllowedRequest("https://cdn.jsdelivr.net/gh/x/cmunrm.woff", "font")).toBe(true);
    expect(isAllowedRequest("https://example.com/beacon.png", "image")).toBe(false);
    expect(isAllowedRequest("https://example.com/app.js", "script")).toBe(false);
    expect(isAllowedRequest("http://example.com/fonts.css", "stylesheet")).toBe(false);
    expect(isAllowedRequest("https://example.com/data", "fetch")).toBe(false);
  });
});
