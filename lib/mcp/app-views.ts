import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/server";
import { APPLICATION_LIST_VIEW_HTML } from "@/lib/mcp/app-views/application-list-html";
import { SAVE_CONFIRMATION_VIEW_HTML } from "@/lib/mcp/app-views/save-confirmation-html";

/**
 * The ChatGPT Apps SDK layer, expressed as metadata on the MCP server we
 * already run.
 *
 * An Apps SDK app is not a second server and not a second API. It is two
 * additions to an ordinary MCP server: a resource whose body is an HTML
 * document, and a `_meta` pointer on a tool saying "render my result in that
 * document". Everything else — authentication, the repository, row-level
 * security, the tool's own arguments and output — is untouched, which is why
 * this file registers resources and builds metadata objects and does nothing
 * else. There is no query in it and no Supabase client in it.
 *
 * Two host contracts exist for that association and they disagree on the MIME
 * type. ChatGPT today reads the Apps SDK ("Skybridge") contract: it resolves
 * `_meta["openai/outputTemplate"]` to a resource and renders it only when that
 * resource is `text/html+skybridge`. The newer MCP Apps extension spells the
 * same thing `_meta.ui.resourceUri` over `text/html;profile=mcp-app`. Every
 * ChatGPT-rendering server in OpenAI's own examples repository — pizzaz,
 * kitchen sink, solar system, shopping cart, and the OAuth-protected one this
 * server most resembles — uses the Skybridge type on the resource listing, the
 * resource-template listing and the read result alike.
 *
 * So the Skybridge type is what every resource here advertises, and the MCP
 * Apps type rides along as a second content item on each read. One document
 * per view, two labels, no second view to drift.
 *
 * Every resource also declares its Content Security Policy explicitly —
 * `connectDomains`/`resourceDomains`, both empty arrays for these two views —
 * rather than omitting the `csp` block. Omitting it and declaring an empty
 * allowlist are two different claims: the first says "this view's network
 * requirements were never stated", the second says "this view was checked and
 * needs nothing". A ChatGPT connector reads the omission as the former and
 * shows it as an unresolved "CSP is not set" warning, which is what this file
 * used to produce. Two independent, working precedents back the exact shape
 * used here — neither is a blog post or a forum reply:
 *
 * - `@modelcontextprotocol/ext-apps` (published by the modelcontextprotocol
 *   GitHub org, the spec's own org) types `_meta.ui.csp` as
 *   `{ connectDomains?, resourceDomains?, frameDomains?, baseUriDomains? }`
 *   and states plainly that "Empty or omitted" both mean no access, but they
 *   are not equivalent as *declarations* — omitting the field states nothing,
 *   declaring it empty states a deny-by-default policy. OpenAI's own
 *   `openai-apps-sdk-examples` repository ships a server
 *   (`cards_against_ai_server_node`) built on this package that declares
 *   `resourceDomains: []` explicitly for exactly this reason, in its own
 *   comment: "no resourceDomains are needed" — stated, not left blank.
 * - ChatGPT also still reads a second, older flat key,
 *   `_meta["openai/widgetCSP"]`, with snake_case `connect_domains` /
 *   `resource_domains` — confirmed by a real, working ChatGPT app example
 *   (MCPJam's `examples/chatgpt-apps/CoffeeShop`) that declares exactly that
 *   key on its resource `_meta`, and by MCPJam's own inspector, which
 *   resolves both spellings against the SEP-1865 MCP Apps CSP proposal with
 *   the modern nested key taking precedence.
 *
 * Both spellings are declared here for the same reason `openai/outputTemplate`
 * and `ui.resourceUri` both are above: a host is entitled to read either one,
 * and nothing here lets them diverge — `uiCsp()` and `legacyWidgetCsp()` build
 * both from one `WidgetCsp` value. `developers.openai.com` could not be
 * reached to check its prose directly against these two independent,
 * executable sources; if either turns out to disagree with it, that is worth
 * re-checking against a live connector, which is the one thing this
 * repository cannot do for itself.
 *
 * Neither view declares `ui.domain` (a *different* MCP Apps field, the one
 * behind ChatGPT's separate "Widget domain is not set" indicator). That field
 * asks a host to give the view a dedicated, stable sandbox origin — useful
 * for a view that needs one for an OAuth redirect target, a CORS-restricted
 * API, or a browser-storage key tied to one origin. Neither Interndex view
 * calls a network API, opens a link, or persists anything at all, so there is
 * no origin to stabilize; the spec's own default — "host uses default sandbox
 * origin" — is already correct, and inventing a hostname to silence an
 * indicator that is accurately describing "this view asked for nothing" would
 * be the wrong fix.
 *
 * There are two views, one per tool that needs a visual result:
 *
 * - `list_jobs` points at the application-list view, unchanged from before.
 * - `save_job` points at its own, separate save-confirmation view — a single
 *   record, never a list. It exists precisely so a save has something visual
 *   of its own, removing the reason ChatGPT's own orchestration was observed
 *   reaching for `list_jobs` after (or before) a save just to put something
 *   visual next to a plain-text confirmation. See
 *   `lib/mcp/app-views/save-confirmation-html.ts` for the full account.
 *
 * The `@modelcontextprotocol/ext-apps` server helpers are deliberately not a
 * dependency: they are typed against the MCP TypeScript SDK v1
 * (`@modelcontextprotocol/sdk`), while this repository runs the v2 split
 * packages (`@modelcontextprotocol/server`), and all they do is normalize the
 * metadata keys and default a MIME type — neither of which is what ChatGPT is
 * checking. `tests/unit/mcp-tool-registration.test.ts` pins every literal
 * below so the contract cannot drift silently.
 */

/**
 * The MIME type ChatGPT requires before it will render a custom component.
 *
 * A resource that does not carry exactly this is not recognised as a widget,
 * and the tool's result is rendered with the host's default presentation — a
 * plain table — however correct the rest of the metadata is.
 */
export const APP_VIEW_MIME_TYPE = "text/html+skybridge";

/** The same document's MIME type under the newer MCP Apps extension. */
export const MCP_APPS_VIEW_MIME_TYPE = "text/html;profile=mcp-app";

/**
 * The `_meta` key the MCP Apps extension deprecated in favour of `ui`.
 *
 * Still emitted, exactly as `registerAppTool` still emits it, because a host
 * that predates the nested form is otherwise handed a tool with no view.
 */
export const LEGACY_RESOURCE_URI_META_KEY = "ui/resourceUri";

/** The ChatGPT Apps SDK key naming a tool's view. This is the one that binds. */
export const OUTPUT_TEMPLATE_META_KEY = "openai/outputTemplate";

/** The list view: every result of `list_jobs`. */
export const APPLICATION_LIST_VIEW_URI = "ui://interndex/application-list.html";
export const APPLICATION_LIST_VIEW_NAME = "Interndex application list";

/** The confirmation view: one result of `save_job`, and nothing else. */
export const SAVE_CONFIRMATION_VIEW_URI = "ui://interndex/save-confirmation.html";
export const SAVE_CONFIRMATION_VIEW_NAME = "Interndex save confirmation";

/** What ChatGPT shows while a tool with a view runs, and once it has. */
export type AppViewLabels = { invoking: string; invoked: string };

export const APPLICATION_LIST_VIEW_LABELS: AppViewLabels = {
  invoking: "Reading your applications",
  invoked: "Showed your applications",
};

/**
 * Deliberately distinct wording from the list view's, and deliberately never
 * "Reading" or "Showing": this is what runs while `save_job` is writing a new
 * row, not while anything is being read back for display.
 */
export const SAVE_CONFIRMATION_VIEW_LABELS: AppViewLabels = {
  invoking: "Saving your application",
  invoked: "Saved your application",
};

/**
 * One view's Content Security Policy, in the vocabulary this file's callers
 * use — the MCP Apps / `@modelcontextprotocol/ext-apps` names. `widgetCsp()`
 * translates this into both wire spellings, so a caller states a view's
 * network requirements exactly once regardless of which spelling a host
 * reads.
 */
export type WidgetCsp = {
  /** Origins the view's own script may `fetch`/`XHR`/open a WebSocket to. */
  connectDomains: readonly string[];
  /** Origins the view may load a script, style, font, image or media from. */
  resourceDomains: readonly string[];
};

/**
 * Both Interndex views today: no `fetch`, no `<img src="https://…">`, no
 * `<script src>`, no external stylesheet or font. `registerInterndexAppViews`
 * passes this to both `registerView` calls below, and
 * `tests/unit/mcp-widget-csp.test.ts` greps each view's actual HTML for the
 * patterns that would require widening it, so this cannot silently go stale
 * if a future change adds one.
 */
export const NO_EXTERNAL_DOMAINS: WidgetCsp = {
  connectDomains: [],
  resourceDomains: [],
};

/**
 * The `_meta["openai/widgetCSP"]` key ChatGPT's own indicator reads, kept as
 * its own constant because its field names — snake_case — differ from the
 * MCP Apps spelling `ui.csp` uses, even though the values are the same.
 */
export const LEGACY_WIDGET_CSP_META_KEY = "openai/widgetCSP";

/** `ui.csp` (MCP Apps / SEP-1865): domains, camelCase, nested under `ui`. */
function uiCsp(csp: WidgetCsp) {
  return {
    connectDomains: [...csp.connectDomains],
    resourceDomains: [...csp.resourceDomains],
  } as const;
}

/** `openai/widgetCSP` (the older flat ChatGPT key): same domains, snake_case. */
function legacyWidgetCsp(csp: WidgetCsp) {
  return {
    connect_domains: [...csp.connectDomains],
    resource_domains: [...csp.resourceDomains],
  } as const;
}

/**
 * The `_meta` that associates a tool with a UI resource.
 *
 * Three spellings of one fact — the Apps SDK's `openai/outputTemplate`, the
 * MCP Apps extension's nested `ui.resourceUri`, and its deprecated flat alias
 * — so the association is discoverable by every host currently shipping. They
 * must always name the same URI; nothing here lets them diverge.
 *
 * `openai/widgetAccessible` is false on purpose for every Interndex view: each
 * one reads a result and renders it, and is not permitted to call tools back.
 * Read-only stays read-only. It gates what the view may do, not whether it
 * renders.
 */
export function appViewToolMeta(resourceUri: string, labels: AppViewLabels) {
  return {
    [OUTPUT_TEMPLATE_META_KEY]: resourceUri,
    "openai/toolInvocation/invoking": labels.invoking,
    "openai/toolInvocation/invoked": labels.invoked,
    "openai/widgetAccessible": false,
    ui: { resourceUri },
    [LEGACY_RESOURCE_URI_META_KEY]: resourceUri,
  } as const;
}

/**
 * The `_meta` the UI resource carries about itself.
 *
 * The Apps SDK keys are repeated here rather than left to the tool, because
 * that is what OpenAI's own servers put on a resource listing, a resource
 * template and a read content item, and a host is entitled to look at any of
 * the three.
 *
 * `ui.prefersBorder` is the MCP Apps half, and false because each view draws
 * its own hairline and rounded corners; a host frame around that is a border
 * inside a border.
 *
 * `csp` is required here, not optional, precisely so a future view cannot be
 * registered without its author stating what it needs — see this file's
 * top-of-file comment for why an explicit empty policy is not the same
 * declaration as no policy at all.
 */
export function appViewResourceMeta(resourceUri: string, csp: WidgetCsp) {
  return {
    [OUTPUT_TEMPLATE_META_KEY]: resourceUri,
    "openai/widgetAccessible": false,
    [LEGACY_WIDGET_CSP_META_KEY]: legacyWidgetCsp(csp),
    ui: { prefersBorder: false, csp: uiCsp(csp) },
  } as const;
}

/**
 * The `_meta` a tool result carries when it should be rendered by a view.
 *
 * The association is on the tool descriptor already, and it is repeated on the
 * result exactly as OpenAI's own servers repeat it: the descriptor is read
 * once at connection time, while this travels with the payload the host is
 * about to render.
 */
export function appViewResultMeta(resourceUri: string, labels: AppViewLabels) {
  return {
    [OUTPUT_TEMPLATE_META_KEY]: resourceUri,
    "openai/toolInvocation/invoking": labels.invoking,
    "openai/toolInvocation/invoked": labels.invoked,
  } as const;
}

const APPLICATION_LIST_VIEW_DESCRIPTION =
  "Renders the applications returned by list_jobs as a compact Interndex list.";

const SAVE_CONFIRMATION_VIEW_DESCRIPTION =
  "Renders the single application save_job just created — never a list, and never any other saved application.";

/** One document, offered under both MIME types. ChatGPT's comes first. */
function viewContents(uri: string, html: string, csp: WidgetCsp) {
  return [
    {
      uri,
      mimeType: APP_VIEW_MIME_TYPE,
      text: html,
      _meta: appViewResourceMeta(uri, csp),
    },
    {
      uri,
      mimeType: MCP_APPS_VIEW_MIME_TYPE,
      text: html,
      _meta: appViewResourceMeta(uri, csp),
    },
  ];
}

/**
 * Registers one Interndex UI resource, as both a concrete resource — what
 * `resources/list` and `resources/read` answer with — and a resource
 * template, because that is the third place OpenAI's servers advertise a
 * widget and a host is entitled to look there. The template lists nothing of
 * its own — `list: undefined` — so `resources/list` is not doubled.
 *
 * Each document is static and holds no student data, so serving it needs no
 * authentication decision of its own; the data it renders arrives later, in a
 * tool result the caller had to be authenticated to obtain.
 */
function registerView(
  server: McpServer,
  name: string,
  uri: string,
  description: string,
  html: string,
  csp: WidgetCsp,
): void {
  server.registerResource(
    name,
    uri,
    {
      title: name,
      description,
      mimeType: APP_VIEW_MIME_TYPE,
      _meta: appViewResourceMeta(uri, csp),
    },
    async () => ({ contents: viewContents(uri, html, csp) }),
  );

  server.registerResource(
    `${name} template`,
    new ResourceTemplate(uri, { list: undefined }),
    {
      title: name,
      description,
      mimeType: APP_VIEW_MIME_TYPE,
      _meta: appViewResourceMeta(uri, csp),
    },
    async () => ({ contents: viewContents(uri, html, csp) }),
  );
}

/**
 * Registers every Interndex UI resource on an MCP server.
 *
 * Called from `registerJobTrackTools`, so the resources a client can resolve
 * are the ones the route serves and the ones the tests drive — the same
 * reason the tools have a single registration function.
 */
export function registerInterndexAppViews(server: McpServer): void {
  registerView(
    server,
    APPLICATION_LIST_VIEW_NAME,
    APPLICATION_LIST_VIEW_URI,
    APPLICATION_LIST_VIEW_DESCRIPTION,
    APPLICATION_LIST_VIEW_HTML,
    NO_EXTERNAL_DOMAINS,
  );
  registerView(
    server,
    SAVE_CONFIRMATION_VIEW_NAME,
    SAVE_CONFIRMATION_VIEW_URI,
    SAVE_CONFIRMATION_VIEW_DESCRIPTION,
    SAVE_CONFIRMATION_VIEW_HTML,
    NO_EXTERNAL_DOMAINS,
  );
}
