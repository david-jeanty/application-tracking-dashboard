import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ExtensionManifest = {
  action: { default_popup: string };
  background: { service_worker: string };
};

const extensionRoot = resolve(import.meta.dirname, "..");
const manifestPath = join(extensionRoot, "manifest.json");
const manifest = JSON.parse(
  readFileSync(manifestPath, "utf8"),
) as ExtensionManifest;
const popupPath = resolve(extensionRoot, manifest.action.default_popup);
const popupMarkup = readFileSync(popupPath, "utf8");

const RENDER_SELECTORS = [
  "[data-panel]",
  "#announcement",
  "#disconnect",
  "#connect-error",
  "#extraction-error",
  "#company",
  "#job-title",
  "#location",
  "#status",
  "#extraction-note",
  "#save-problem",
  "#save-issues",
  "#also-found",
  "#also-found-list",
  "#save",
  "#saved-headline",
  "#saved-company",
  "#saved-title",
  "#open-application",
] as const;

describe("the unpacked extension popup runtime", () => {
  it("loads the popup selected by the root manifest", () => {
    expect(dirname(popupPath)).toBe(extensionRoot);
    expect(manifest.action.default_popup).toBe("popup.html");

    document.documentElement.innerHTML = popupMarkup;
    for (const selector of RENDER_SELECTORS) {
      expect(document.querySelector(selector), selector).not.toBeNull();
    }

    expect(document.querySelector('link[rel="stylesheet"]')?.getAttribute("href"))
      .toBe("popup.css");
    expect(document.querySelector('script[type="module"]')?.getAttribute("src"))
      .toBe("dist/popup.js");
  });

  it("keeps dist JavaScript-only so it cannot become a stale second extension", () => {
    const dist = join(extensionRoot, "dist");
    if (!existsSync(dist)) return;

    const nonJavaScriptFiles = readdirSync(dist, { recursive: true }).filter(
      (entry) => typeof entry === "string" && !entry.endsWith(".js"),
    );
    expect(nonJavaScriptFiles).toEqual([]);
    expect(existsSync(join(dist, "manifest.json"))).toBe(false);
    expect(existsSync(join(dist, "popup.html"))).toBe(false);
    expect(existsSync(join(dist, "popup.css"))).toBe(false);
  });

  it("points the root manifest only at files in the supported root layout", () => {
    expect(manifest.background.service_worker).toBe("dist/background.js");
    expect(existsSync(join(extensionRoot, "popup.html"))).toBe(true);
    expect(existsSync(join(extensionRoot, "popup.css"))).toBe(true);
  });
});
