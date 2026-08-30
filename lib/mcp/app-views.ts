import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/server";
import { APPLICATION_LIST_VIEW_HTML } from "@/lib/mcp/app-views/application-list-html";

/**
 * The ChatGPT Apps SDK layer, expressed as metadata on the MCP server we
 * already run.
 *
 * An Apps SDK app is not a second server and not a second API. It is two
 * additions to an ordinary MCP server: a resource whose body is an HTML
 * document, and a `_meta` pointer on a tool saying "render my result in that
 * document". Everything else — authentication, the repository, row-level
 * security, the tool's own arguments and output — is untouched, which is why
 * this file registers a resource and builds metadata objects and does nothing
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
 * So the Skybridge type is what this resource advertises, and the MCP Apps
 * type rides along as a second content item on the read. One document, two
 * labels, no second view to drift.
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

/** The one view this slice ships: the result of `list_jobs`. */
export const APPLICATION_LIST_VIEW_URI = "ui://interndex/application-list.html";

export const APPLICATION_LIST_VIEW_NAME = "Interndex application list";

/** What ChatGPT shows while the tool runs, and once it has. */
const INVOKING_LABEL = "Reading your applications";
const INVOKED_LABEL = "Showed your applications";

/**
 * The `_meta` that associates a tool with a UI resource.
 *
 * Three spellings of one fact — the Apps SDK's `openai/outputTemplate`, the
 * MCP Apps extension's nested `ui.resourceUri`, and its deprecated flat alias
 * — so the association is discoverable by every host currently shipping. They
 * must always name the same URI; nothing here lets them diverge.
 *
 * `openai/widgetAccessible` is false on purpose: this view reads a result and
 * renders it, and is not permitted to call tools back. Read-only stays
 * read-only. It gates what the view may do, not whether it renders.
 */
export function appViewToolMeta(resourceUri: string) {
  return {
    [OUTPUT_TEMPLATE_META_KEY]: resourceUri,
    "openai/toolInvocation/invoking": INVOKING_LABEL,
    "openai/toolInvocation/invoked": INVOKED_LABEL,
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
 * `ui.prefersBorder` is the MCP Apps half, and false because the view draws
 * its own hairline and rounded corners; a host frame around that is a border
 * inside a border. No `csp` block is declared because the document loads
 * nothing at all — no script, style, font or image leaves its own origin.
 */
export function appViewResourceMeta(resourceUri: string) {
  return {
    [OUTPUT_TEMPLATE_META_KEY]: resourceUri,
    "openai/widgetAccessible": false,
    ui: { prefersBorder: false },
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
export function appViewResultMeta(resourceUri: string) {
  return {
    [OUTPUT_TEMPLATE_META_KEY]: resourceUri,
    "openai/toolInvocation/invoking": INVOKING_LABEL,
    "openai/toolInvocation/invoked": INVOKED_LABEL,
  } as const;
}

const APPLICATION_LIST_VIEW_DESCRIPTION =
  "Renders the applications returned by list_jobs as a compact Interndex list.";

/** The document, offered under both MIME types. ChatGPT's comes first. */
function applicationListContents() {
  return [
    {
      uri: APPLICATION_LIST_VIEW_URI,
      mimeType: APP_VIEW_MIME_TYPE,
      text: APPLICATION_LIST_VIEW_HTML,
      _meta: appViewResourceMeta(APPLICATION_LIST_VIEW_URI),
    },
    {
      uri: APPLICATION_LIST_VIEW_URI,
      mimeType: MCP_APPS_VIEW_MIME_TYPE,
      text: APPLICATION_LIST_VIEW_HTML,
      _meta: appViewResourceMeta(APPLICATION_LIST_VIEW_URI),
    },
  ];
}

/**
 * Registers the Interndex UI resources on an MCP server.
 *
 * Called from `registerJobTrackTools`, so the resource a client can resolve is
 * the one the route serves and the one the tests drive — the same reason the
 * tools have a single registration function.
 *
 * The view is registered twice over: once as a concrete resource, which is
 * what `resources/list` and `resources/read` answer with, and once as a
 * resource template, because that is the third place OpenAI's servers
 * advertise a widget and a host is entitled to look there. The template lists
 * nothing of its own — `list: undefined` — so `resources/list` stays a single
 * entry rather than the same view twice.
 *
 * The document is static. It holds no student data, so serving it needs no
 * authentication decision of its own; the data it renders arrives later, in a
 * `list_jobs` result the caller had to be authenticated to obtain.
 */
export function registerInterndexAppViews(server: McpServer): void {
  server.registerResource(
    APPLICATION_LIST_VIEW_NAME,
    APPLICATION_LIST_VIEW_URI,
    {
      title: APPLICATION_LIST_VIEW_NAME,
      description: APPLICATION_LIST_VIEW_DESCRIPTION,
      mimeType: APP_VIEW_MIME_TYPE,
      _meta: appViewResourceMeta(APPLICATION_LIST_VIEW_URI),
    },
    async () => ({ contents: applicationListContents() }),
  );

  server.registerResource(
    `${APPLICATION_LIST_VIEW_NAME} template`,
    new ResourceTemplate(APPLICATION_LIST_VIEW_URI, { list: undefined }),
    {
      title: APPLICATION_LIST_VIEW_NAME,
      description: APPLICATION_LIST_VIEW_DESCRIPTION,
      mimeType: APP_VIEW_MIME_TYPE,
      _meta: appViewResourceMeta(APPLICATION_LIST_VIEW_URI),
    },
    async () => ({ contents: applicationListContents() }),
  );
}
