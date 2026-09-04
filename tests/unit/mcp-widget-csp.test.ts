import { describe, expect, it } from "vitest";
import { APPLICATION_LIST_VIEW_HTML } from "@/lib/mcp/app-views/application-list-html";
import {
  LEGACY_WIDGET_CSP_META_KEY,
  NO_EXTERNAL_DOMAINS,
  SAVE_CONFIRMATION_VIEW_URI,
  APPLICATION_LIST_VIEW_URI,
  appViewResourceMeta,
  type WidgetCsp,
} from "@/lib/mcp/app-views";
import { SAVE_CONFIRMATION_VIEW_HTML } from "@/lib/mcp/app-views/save-confirmation-html";

/**
 * The regression this file pins: the ChatGPT connector's own "Widget CSP is
 * not set" indicator was correct, not a developer-shell quirk — Interndex's
 * views never declared `_meta.ui.csp` (or its legacy `openai/widgetCSP`
 * alias) at all, so a host reading either key found nothing.
 *
 * Two things have to hold for that to stay fixed:
 *
 * 1. Every registered view's `_meta` actually carries both spellings of the
 *    CSP declaration — checked here directly against `appViewResourceMeta`,
 *    and against a real server's wire contract in
 *    `tests/unit/mcp-tool-registration.test.ts`.
 * 2. The declared policy is not just present but *true* — an empty
 *    `connectDomains`/`resourceDomains` is only correct because the HTML
 *    genuinely fetches and loads nothing. If a future change adds a
 *    `fetch(`, an `<img src="https://…">`, or any other external reference
 *    without widening the declared policy, that would silently reintroduce
 *    the same bug in the opposite direction: a policy that lies about what
 *    the view does. The scan below is what would catch that.
 */

const EXTERNAL_RESOURCE_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", pattern: /XMLHttpRequest/ },
  { name: "WebSocket", pattern: /\bnew\s+WebSocket\s*\(/ },
  { name: "EventSource", pattern: /\bnew\s+EventSource\s*\(/ },
  { name: "an https:// or http:// literal", pattern: /https?:\/\// },
  { name: "<script src=…>", pattern: /<script[^>]+\bsrc\s*=/i },
  { name: "<link href=…> (stylesheet/font)", pattern: /<link[^>]+\bhref\s*=/i },
  { name: "<img src=…>", pattern: /<img[^>]+\bsrc\s*=/i },
  { name: "<iframe>", pattern: /<iframe\b/i },
  { name: "<base href=…>", pattern: /<base\b/i },
  { name: "window.openai.openExternal", pattern: /openExternal/ },
];

/**
 * Every pattern above that appears in `html`, by name — empty when the
 * document is fully self-contained.
 */
function externalReferencesIn(html: string): string[] {
  return EXTERNAL_RESOURCE_PATTERNS.filter(({ pattern }) =>
    pattern.test(html),
  ).map(({ name }) => name);
}

const VIEWS: Array<{ label: string; html: string }> = [
  { label: "application-list", html: APPLICATION_LIST_VIEW_HTML },
  { label: "save-confirmation", html: SAVE_CONFIRMATION_VIEW_HTML },
];

describe("declared widget CSP matches actual HTML usage", () => {
  it.each(VIEWS)(
    "$label: NO_EXTERNAL_DOMAINS is only correct if the HTML truly has no external reference",
    ({ html }) => {
      // This is the assertion that would fail first if a future change added
      // a fetch, an external image, or any other network reference without
      // also widening the declared CSP: it proves the empty policy every
      // Interndex view currently declares is still an honest description of
      // what the HTML does, not a stale claim.
      expect(externalReferencesIn(html)).toEqual([]);
    },
  );

  it("the shared empty-domains policy used by both views is actually empty", () => {
    // Guards the constant itself, independent of any one view's HTML: if a
    // future edit widens NO_EXTERNAL_DOMAINS "just for now", every view still
    // using it for a real empty policy would silently inherit domains it
    // never asked for.
    expect(NO_EXTERNAL_DOMAINS.connectDomains).toEqual([]);
    expect(NO_EXTERNAL_DOMAINS.resourceDomains).toEqual([]);
  });
});

describe("appViewResourceMeta declares CSP under both spellings", () => {
  const CUSTOM_CSP: WidgetCsp = {
    connectDomains: ["https://api.example.com"],
    resourceDomains: ["https://cdn.example.com"],
  };

  it("declares an explicit, present ui.csp block for the modern MCP Apps spelling", () => {
    const meta = appViewResourceMeta(APPLICATION_LIST_VIEW_URI, NO_EXTERNAL_DOMAINS);

    // Presence, not just correctness: `ui.csp` must exist as a key at all,
    // because an absent key and an empty-valued key are different claims to
    // a host reading it (see lib/mcp/app-views.ts's file-level comment).
    expect(meta.ui).toHaveProperty("csp");
    expect(meta.ui.csp).toEqual({ connectDomains: [], resourceDomains: [] });
  });

  it("declares the legacy openai/widgetCSP flat key with snake_case fields", () => {
    const meta = appViewResourceMeta(SAVE_CONFIRMATION_VIEW_URI, NO_EXTERNAL_DOMAINS);

    expect(meta).toHaveProperty(LEGACY_WIDGET_CSP_META_KEY);
    expect(meta[LEGACY_WIDGET_CSP_META_KEY]).toEqual({
      connect_domains: [],
      resource_domains: [],
    });
  });

  it("carries a non-empty declared domain through to both spellings, unmodified", () => {
    const meta = appViewResourceMeta(APPLICATION_LIST_VIEW_URI, CUSTOM_CSP);

    expect(meta.ui.csp).toEqual({
      connectDomains: ["https://api.example.com"],
      resourceDomains: ["https://cdn.example.com"],
    });
    expect(meta[LEGACY_WIDGET_CSP_META_KEY]).toEqual({
      connect_domains: ["https://api.example.com"],
      resource_domains: ["https://cdn.example.com"],
    });
  });

  it("never declares ui.domain — neither view has a technical need for a dedicated sandbox origin", () => {
    const meta = appViewResourceMeta(APPLICATION_LIST_VIEW_URI, NO_EXTERNAL_DOMAINS);

    // `ui.domain` is a different MCP Apps field from `ui.csp` — it requests a
    // stable per-view sandbox origin, for a view that does an OAuth redirect,
    // a CORS-restricted fetch, or persists something keyed to one origin.
    // Neither Interndex view does any of that, so omitting it is the correct
    // declaration, not an oversight: this pins that nobody adds one without
    // updating this test and explaining why it is now needed.
    expect(meta.ui).not.toHaveProperty("domain");
  });
});
