import "server-only";

import type { Browser } from "playwright-core";
import type { LayoutMeasurement } from "@/lib/agent/resume/layout";

/**
 * Rendering resume.lol's printable HTML in headless Chrome.
 *
 * resume.lol has no PDF export on its server: it returns one self-contained
 * HTML file (styles and the PagedJS pagination script inlined) meant to be
 * printed from a browser. This module does that print on the Interndex
 * server, with the same Chrome engine David's print dialog uses, and measures
 * the paginated page on the way: how many pages, and for every bullet the
 * text and fill of each line. `layout.ts` turns the measurement into
 * pass/fail.
 *
 * Which Chrome runs:
 *
 * - `CHROMIUM_EXECUTABLE_PATH` when set (local machines, tests),
 * - on Vercel, the Chrome build in `@sparticuz/chromium`, made for serverless,
 * - otherwise the browser Playwright installed.
 *
 * It never throws. Any failure (Chrome would not start, the function ran out
 * of time or memory, pagination never finished) comes back as `ok: false`
 * with a short reason, so the build can save the resume anyway and mark the
 * layout check as skipped (decision record 0008).
 *
 * The page may load only stylesheets and fonts (over HTTPS), which is what a
 * resume's CSS imports: Google Fonts for zero2sudo, Computer Modern from
 * jsDelivr for Jake's. Every other request (images, scripts, beacons) is
 * blocked, so the render is quick and the HTML cannot reach anywhere else.
 * PagedJS stops if a stylesheet fails to load, so a font host that is down
 * shows up as a skipped layout check rather than a wrong measurement.
 */

export type RenderSkipReason = "launch_failed" | "timeout" | "pagination_failed" | "render_failed";

export type RenderOutcome =
  | { ok: true; measurement: LayoutMeasurement; pdf: Uint8Array | null; durationMs: number }
  | { ok: false; reason: RenderSkipReason; detail: string; durationMs: number };

export type RenderOptions = { timeoutMs?: number; withPdf?: boolean };

export type ResumeRenderer = (html: string, options?: RenderOptions) => Promise<RenderOutcome>;

export const DEFAULT_RENDER_TIMEOUT_MS = 45_000;
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

/** Stylesheets and fonts only. PagedJS re-fetches each stylesheet as XHR. */
export function isAllowedRequest(rawUrl: string, resourceType: string): boolean {
  const url = new URL(rawUrl);
  if (url.protocol === "data:" || url.protocol === "blob:") return true;
  if (url.protocol !== "https:") return false;
  if (FONT_HOSTS.has(url.hostname)) return true;
  if (resourceType === "stylesheet" || resourceType === "font") return true;
  return (resourceType === "xhr" || resourceType === "fetch") && url.pathname.endsWith(".css");
}

class RenderStepError extends Error {
  constructor(
    readonly reason: RenderSkipReason,
    message: string,
  ) {
    super(message);
  }
}

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
  if (executablePath) {
    return chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const serverless = (await import("@sparticuz/chromium")).default;
    return chromium.launch({
      executablePath: await serverless.executablePath(),
      args: serverless.args,
      headless: true,
    });
  }
  return chromium.launch({ headless: true });
}

/**
 * Runs inside the page. Must be self-contained: Playwright sends its source.
 * Measures every bullet's lines character by character, so a line's text and
 * its right edge come from where Chrome actually broke it.
 */
function measurePage(): LayoutMeasurement {
  const pageElements = Array.from(document.querySelectorAll(".pagedjs_page"));
  const scope: ParentNode = pageElements.length
    ? (document.querySelector(".pagedjs_pages") ?? document)
    : document.body;

  const bullets = Array.from(scope.querySelectorAll("li")).map((li) => {
    const style = getComputedStyle(li);
    const box = li.getBoundingClientRect();
    const left = box.left + parseFloat(style.paddingLeft || "0");
    const width = li.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0");

    const lines: { text: string; top: number; height: number; right: number }[] = [];
    const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.nodeValue ?? "";
      for (let index = 0; index < value.length; index += 1) {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getClientRects()[0];
        if (!rect) continue;
        const current = lines[lines.length - 1];
        if (!current || rect.top > current.top + current.height * 0.5) {
          lines.push({ text: value[index], top: rect.top, height: rect.height || 1, right: rect.right });
        } else {
          current.text += value[index];
          if (rect.width > 0 && value[index].trim()) current.right = Math.max(current.right, rect.right);
        }
      }
    }
    return {
      text: (li.textContent ?? "").replace(/\s+/g, " ").trim(),
      lines: lines
        .map((line) => ({
          text: line.text.replace(/\s+/g, " ").trim(),
          fill: width > 0 ? Math.round(((line.right - left) / width) * 1000) / 1000 : 0,
        }))
        .filter((line) => line.text.length > 0),
    };
  });

  let pageFill: number | null = null;
  let topGap: number | null = null;
  let bottomGap: number | null = null;
  const firstPage = pageElements[0];
  const firstContent = firstPage?.querySelector(".pagedjs_page_content");
  if (firstPage && firstContent) {
    const area = firstContent.getBoundingClientRect();
    const pageHeight = firstPage.getBoundingClientRect().height;
    // Measured from the lines of text, not from elements: a template can hold
    // an empty block that stretches to the bottom of the page (zero2sudo
    // does), which made every page look full.
    let top = area.bottom;
    let bottom = area.top;
    const textWalker = document.createTreeWalker(firstContent, NodeFilter.SHOW_TEXT);
    const textRange = document.createRange();
    for (let node = textWalker.nextNode(); node; node = textWalker.nextNode()) {
      if (!(node.nodeValue ?? "").trim()) continue;
      textRange.selectNodeContents(node);
      for (const rect of Array.from(textRange.getClientRects())) {
        if (rect.height > 0 && rect.width > 0) {
          top = Math.min(top, rect.top);
          bottom = Math.max(bottom, rect.bottom);
        }
      }
    }
    const share = (value: number) => Math.round(value * 1000) / 1000;
    pageFill = area.height > 0 ? share((bottom - area.top) / area.height) : null;
    if (pageHeight > 0 && bottom > area.top) {
      topGap = share(Math.max(0, top - area.top) / pageHeight);
      bottomGap = share(Math.max(0, area.bottom - bottom) / pageHeight);
    }
  }

  return {
    pages: Math.max(pageElements.length, 1),
    bullets,
    page_fill: pageFill,
    top_gap: topGap,
    bottom_gap: bottomGap,
  };
}

async function renderWithBrowser(browser: Browser, html: string, withPdf: boolean, deadline: number) {
  const remaining = () => Math.max(1, deadline - Date.now());
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
  await page.route("**/*", (route) =>
    isAllowedRequest(route.request().url(), route.request().resourceType())
      ? route.continue()
      : route.abort(),
  );

  try {
    await page.setContent(html, { waitUntil: "load", timeout: remaining() });
  } catch (error) {
    throw new RenderStepError("render_failed", `Loading the HTML failed: ${(error as Error).message}`);
  }

  // PagedJS lays the resume out into .pagedjs_page boxes after load. Wait for
  // the fonts and for the page count to hold still.
  const hasPagedScript = /pagedjs|Paged\.|PagedPolyfill/i.test(html);
  if (hasPagedScript) {
    try {
      await page.waitForFunction(() => document.querySelectorAll(".pagedjs_page").length > 0, null, {
        timeout: Math.min(remaining(), 20_000),
      });
    } catch {
      throw new RenderStepError("pagination_failed", "Pagination did not finish.");
    }
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  let previous = -1;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const count = await page.evaluate(() => document.querySelectorAll(".pagedjs_page").length);
    if (count === previous) break;
    previous = count;
    await page.waitForTimeout(250);
  }

  const measurement = await page.evaluate(measurePage);
  const pdf = withPdf
    ? new Uint8Array(await page.pdf({ preferCSSPageSize: true, printBackground: true }))
    : null;
  return { measurement, pdf };
}

export const renderResumeHtml: ResumeRenderer = async (html, options = {}) => {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS;
  const deadline = startedAt + timeoutMs;
  const elapsed = () => Date.now() - startedAt;
  let browser: Browser | null = null;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const work = (async () => {
    try {
      browser = await launchBrowser();
    } catch (error) {
      throw new RenderStepError("launch_failed", `Chrome did not start: ${(error as Error).message}`);
    }
    // Chrome started after the time ran out: close it and stop.
    if (finished) {
      await (browser as Browser).close().catch(() => undefined);
      throw new RenderStepError("timeout", "Chrome started too late.");
    }
    return renderWithBrowser(browser, html, options.withPdf ?? true, deadline);
  })();

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RenderStepError("timeout", `Rendering took longer than ${Math.round(timeoutMs / 1000)} seconds.`)),
      timeoutMs,
    );
  });

  try {
    const { measurement, pdf } = await Promise.race([work, timeout]);
    return { ok: true, measurement, pdf, durationMs: elapsed() };
  } catch (error) {
    const reason = error instanceof RenderStepError ? error.reason : "render_failed";
    const detail = (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, 200);
    return { ok: false, reason, detail, durationMs: elapsed() };
  } finally {
    finished = true;
    clearTimeout(timer);
    // The work may still be running after a timeout; close Chrome either way.
    work.catch(() => undefined);
    const opened = browser as Browser | null;
    await opened?.close().catch(() => undefined);
  }
};
