import { describe, expect, it } from "vitest";
import { APPLICATION_LIST_VIEW_HTML } from "@/lib/mcp/app-views/application-list-html";
import {
  APPLICATION_LIST_VIEW_DOMAIN,
  INTERNDEX_WIDGET_DOMAIN,
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
 * 3. Every registered view also carries a present `ui.domain` set to
 *    Interndex's real, already-owned production origin — never an invented
 *    hostname or a domain Interndex does not control — checked here and
 *    against the wire contract, the same way as `csp`.
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
 * The regression this pins: a live ChatGPT connector flagged
 * `_meta.ui.domain` as missing, even though the generic MCP Apps spec
 * documents it as optional ("host assigns a default when omitted"). A later
 * attempt to fix that invented a `*.oaiusercontent.com` value per resource —
 * a domain Interndex does not own, and a pattern OpenAI's own
 * `chatgpt-ui` documentation does not use for its own example (which shows
 * `domain: "https://example.com"`, the app's own absolute origin). Both
 * mistakes are retracted here: the value below is Interndex's real,
 * already-deployed production origin, the same for both views, because
 * nothing in OpenAI's documented example or its own example servers
 * requires two resources of one app to declare distinct values. There is no
 * confirmed flat legacy alias for this field — only `_meta.ui.domain` itself
 * is exercised here, and no `openai/widgetDomain` key is asserted anywhere in
 * this repository's code or tests, on purpose (see lib/mcp/app-views.ts's
 * top-of-file comment).
 */
describe("appViewResourceMeta declares a present ui.domain on Interndex's real origin", () => {
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

  it("gives both views the same ui.domain: Interndex is one app, not two sandboxes", () => {
    // Not a requirement to relax carelessly — just not a requirement at all.
    // No OpenAI-published source (the chatgpt-ui reference example, or any
    // server in openai-apps-sdk-examples) requires per-resource uniqueness;
    // sharing the app's one real origin is the non-invented choice.
    expect(APPLICATION_LIST_VIEW_DOMAIN).toBe(SAVE_CONFIRMATION_VIEW_DOMAIN);
  });

  it("uses Interndex's real, already-deployed origin — an absolute HTTPS URL, never a placeholder or an OpenAI-owned domain", () => {
    // Not `example.com` (the documentation's own placeholder), not a Vercel
    // preview host, not an invented oaiusercontent.com subdomain OpenAI's
    // own infrastructure already uses for its default sandbox — the same
    // origin production already deploys at, in the shape
    // developers.openai.com/plugins/build/chatgpt-ui's own example uses
    // (`domain: "https://example.com"`).
    expect(APPLICATION_LIST_VIEW_DOMAIN).toMatch(/^https:\/\//);
    expect(APPLICATION_LIST_VIEW_DOMAIN).toContain("interndex.dev");
    expect(APPLICATION_LIST_VIEW_DOMAIN).not.toContain("example.com");
    expect(APPLICATION_LIST_VIEW_DOMAIN).not.toContain("oaiusercontent.com");
    expect(APPLICATION_LIST_VIEW_DOMAIN).not.toContain("vercel.app");
    expect(APPLICATION_LIST_VIEW_DOMAIN).not.toContain("localhost");
  });

  it("matches the exact value registerInterndexAppViews wires up for both views", () => {
    // Pins the literal string so a change to the constant is a visible diff
    // here, not a silent drift between what this test exercises and what the
    // real server serves.
    expect(INTERNDEX_WIDGET_DOMAIN).toBe("https://www.interndex.dev");
    expect(APPLICATION_LIST_VIEW_DOMAIN).toBe(INTERNDEX_WIDGET_DOMAIN);
    expect(SAVE_CONFIRMATION_VIEW_DOMAIN).toBe(INTERNDEX_WIDGET_DOMAIN);
  });
});
