import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync("extension/manifest.json", "utf8"),
) as Record<string, unknown>;

describe("the least-privilege Manifest V3 boundary", () => {
  it("requests only the four reviewed extension permissions", () => {
    expect(manifest.permissions).toEqual([
      "activeTab",
      "scripting",
      "storage",
      "identity",
    ]);
  });

  it("has no all-sites access or persistent content scripts", () => {
    expect(manifest.host_permissions).not.toContain("<all_urls>");
    expect(manifest).not.toHaveProperty("content_scripts");
  });

  it("does not request sensitive browsing or device permissions", () => {
    for (const permission of [
      "tabs",
      "cookies",
      "history",
      "webNavigation",
      "notifications",
      "downloads",
      "bookmarks",
      "clipboardRead",
      "clipboardWrite",
    ]) {
      expect(manifest.permissions).not.toContain(permission);
    }
  });
});
