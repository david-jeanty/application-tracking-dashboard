import { describe, expect, it } from "vitest";
import { APPLICATION_LIST_VIEW_HTML } from "@/lib/mcp/app-views/application-list-html";
import {
  APPLICATION_LIST_VIEW_DOMAIN,
  LEGACY_WIDGET_CSP_META_KEY,
  NO_EXTERNAL_DOMAINS,
  SAVE_CONFIRMATION_VIEW_DOMAIN,
  SAVE_CONFIRMATION_VIEW_URI,
  APPLICATION_LIST_VIEW_URI,
  appViewResourceMeta,
  type WidgetCsp,
} from "@/lib/mcp/app-views";
import { SAVE_CONFIRMATION_VIEW_HTML } from "@/lib/mcp/app-views/save-confirmation-html";

/**
 * The regression this file pins: a live ChatGPT connector showed both
 * `ui://interndex/application-list.html` and
 * `ui://interndex/save-confirmation.html` as `Widget CSP is not set` and
 * `Widget domain is not set` — the ChatGPT app-submission checklist marks
 * both `_meta.ui.csp` and `_meta.ui.domain` as required, which is the
 * acceptance criterion here, not the generic MCP Apps spec's looser "both
 * are optional at runtime" framing. Neither field was declared at all.
 *
 * Three things have to hold for that to stay fixed:
 *
 * 1. Every registered view's `_meta` carries `ui.csp` under both spellings a
 *    host might read — checked here directly against `appViewResourceMeta`,
 *    and against a real server's wire contract in
 *    `tests/unit/mcp-tool-registration.test.ts`.
 * 2. The declared CSP is not just present but *true* — an empty
 *    `connectDomains`/`resourceDomains` is only correct because the HTML
 *    genuinely fetches and loads nothing. If a future change adds a
 *    `fetch(`, an `<img src="https://…">`, or any other external reference
 *    without widening the declared policy, that would silently reintroduce
 *    the same bug in the opposite direction: a policy that lies about what
 *    the view does. The scan below is what would catch that.
 * 3. Every registered view also carries a present, unique `ui.domain` —
 *    checked here and against the wire contract, the same way as `csp`.
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
    const meta = appViewResourceMeta(
      APPLICATION_LIST_VIEW_URI,
      NO_EXTERNAL_DOMAINS,
      APPLICATION_LIST_VIEW_DOMAIN,
    );

    // Presence, not just correctness: `ui.csp` must exist as a key at all,
    // because an absent key and an empty-valued key are different claims to
    // a host reading it (see lib/mcp/app-views.ts's file-level comment).
    expect(meta.ui).toHaveProperty("csp");
    expect(meta.ui.csp).toEqual({ connectDomains: [], resourceDomains: [] });
  });

  it("declares the legacy openai/widgetCSP flat key with snake_case fields", () => {
    const meta = appViewResourceMeta(
      SAVE_CONFIRMATION_VIEW_URI,
      NO_EXTERNAL_DOMAINS,
      SAVE_CONFIRMATION_VIEW_DOMAIN,
    );

    expect(meta).toHaveProperty(LEGACY_WIDGET_CSP_META_KEY);
    expect(meta[LEGACY_WIDGET_CSP_META_KEY]).toEqual({
      connect_domains: [],
      resource_domains: [],
    });
  });

  it("carries a non-empty declared CSP through to both spellings, unmodified", () => {
    const meta = appViewResourceMeta(
      APPLICATION_LIST_VIEW_URI,
      CUSTOM_CSP,
      APPLICATION_LIST_VIEW_DOMAIN,
    );

    expect(meta.ui.csp).toEqual({
      connectDomains: ["https://api.example.com"],
      resourceDomains: ["https://cdn.example.com"],
    });
    expect(meta[LEGACY_WIDGET_CSP_META_KEY]).toEqual({
      connect_domains: ["https://api.example.com"],
      resource_domains: ["https://cdn.example.com"],
    });
  });
});

/*
 * The regression this pins: ChatGPT's own app-submission checklist marks
 * `_meta.ui.domain` required and required-unique-per-resource, independent
 * of the generic MCP Apps spec's "optional, host assigns a default when
 * omitted" framing that this repository relied on before. There is no
 * confirmed flat legacy alias for this field — only `_meta.ui.domain` itself
 * is exercised here, and no `openai/widgetDomain` key is asserted anywhere in
 * this repository's code or tests, on purpose (see lib/mcp/app-views.ts's
 * top-of-file comment).
 */
describe("appViewResourceMeta declares a present, unique ui.domain", () => {
  it("declares a non-empty ui.domain for each view", () => {
    const applicationList = appViewResourceMeta(
      APPLICATION_LIST_VIEW_URI,
      NO_EXTERNAL_DOMAINS,
      APPLICATION_LIST_VIEW_DOMAIN,
    );
    const saveConfirmation = appViewResourceMeta(
      SAVE_CONFIRMATION_VIEW_URI,
      NO_EXTERNAL_DOMAINS,
      SAVE_CONFIRMATION_VIEW_DOMAIN,
    );

    expect(applicationList.ui.domain).toBeTypeOf("string");
    expect(applicationList.ui.domain.length).toBeGreaterThan(0);
    expect(saveConfirmation.ui.domain).toBeTypeOf("string");
    expect(saveConfirmation.ui.domain.length).toBeGreaterThan(0);
  });

  it("gives the two views different ui.domain values", () => {
    // Required, not cosmetic: two Interndex resources declaring the same
    // ui.domain would share a sandbox, and with it, each other's storage.
    expect(APPLICATION_LIST_VIEW_DOMAIN).not.toBe(SAVE_CONFIRMATION_VIEW_DOMAIN);
  });

  it("derives both domains from the real canonical Interndex origin, never a placeholder", () => {
    // Not `example.com`, not a Vercel preview host, not an invented
    // subdomain requiring new DNS — the same origin production already
    // deploys at.
    expect(APPLICATION_LIST_VIEW_DOMAIN).toContain("interndex-dev");
    expect(SAVE_CONFIRMATION_VIEW_DOMAIN).toContain("interndex-dev");
    expect(APPLICATION_LIST_VIEW_DOMAIN).not.toContain("vercel.app");
    expect(APPLICATION_LIST_VIEW_DOMAIN).not.toContain("localhost");
  });

  it("matches the exact values registerInterndexAppViews wires up", () => {
    // Pins the literal strings so a change to either constant is a visible
    // diff here, not a silent drift between what this test exercises and
    // what the real server serves.
    expect(APPLICATION_LIST_VIEW_DOMAIN).toBe(
      "application-list.www-interndex-dev.oaiusercontent.com",
    );
    expect(SAVE_CONFIRMATION_VIEW_DOMAIN).toBe(
      "save-confirmation.www-interndex-dev.oaiusercontent.com",
    );
  });
});
