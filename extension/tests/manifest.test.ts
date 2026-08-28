import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requiredHostPermissions } from "../src/config.js";

/**
 * The permissions the extension asks Chrome for.
 *
 * This file exists because permissions are the one part of an extension a
 * student cannot inspect and a reviewer cannot infer from behaviour. Each
 * assertion below is a promise the product makes: no permission to watch
 * browsing, no permission to read a page before being invoked, no ability to
 * reach any origin other than the student's own Interndex and the Supabase
 * project that signs them in.
 *
 * Adding a permission should require deleting an assertion here, deliberately.
 */

const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, "../manifest.json"), "utf8"),
) as {
  manifest_version: number;
  permissions: string[];
  host_permissions: string[];
  background: { service_worker: string; type: string };
  action: { default_popup: string };
  content_scripts?: unknown;
  web_accessible_resources?: unknown;
};

describe("the extension's permissions", () => {
  it("is Manifest V3 with a module service worker", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({
      service_worker: "dist/background.js",
      type: "module",
    });
  });

  it("asks for exactly the four permissions the feature needs", () => {
    expect([...manifest.permissions].sort()).toEqual([
      "activeTab",
      "identity",
      "scripting",
      "storage",
    ]);
  });

  it.each([
    "tabs",
    "cookies",
    "history",
    "webNavigation",
    "webRequest",
    "notifications",
    "downloads",
    "bookmarks",
    "background",
    "alarms",
    "clipboardRead",
  ])("never asks for %s", (permission) => {
    expect(manifest.permissions).not.toContain(permission);
  });

  it("reaches only Interndex and the Supabase project that signs the student in", () => {
    expect(manifest.host_permissions).toEqual(requiredHostPermissions());
  });

  it.each(["<all_urls>", "*://*/*", "http://*/*", "https://*/*"])(
    "never claims host access to %s",
    (pattern) => {
      expect(manifest.host_permissions).not.toContain(pattern);
    },
  );

  it("registers no content script, so no page is read before it is invoked", () => {
    expect(manifest.content_scripts).toBeUndefined();
  });

  it("exposes nothing from the extension to web pages", () => {
    expect(manifest.web_accessible_resources).toBeUndefined();
  });

  it("opens a popup, which is the only way capture starts", () => {
    expect(manifest.action.default_popup).toBe("popup.html");
  });
});

describe("the extension's configuration", () => {
  it("contains no secret, because a shipped extension cannot hold one", () => {
    const source = readFileSync(
      join(import.meta.dirname, "../src/config.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/client_secret|service_role|sb_secret|SUPABASE_SERVICE/i);
  });
});
