import type { McpServer } from "@modelcontextprotocol/server";
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
 * this file registers a resource and builds a metadata object and does nothing
 * else. There is no query in it and no Supabase client in it.
 *
 * The wire contract implemented here is the MCP Apps extension the Apps SDK
 * builds on (`@modelcontextprotocol/ext-apps`). That package's server helpers
 * are deliberately not a dependency: they are typed against the MCP TypeScript
 * SDK v1 (`@modelcontextprotocol/sdk`), while this repository runs the v2
 * split packages (`@modelcontextprotocol/server`). `registerAppTool` and
 * `registerAppResource` are thin — they normalize the UI metadata keys and
 * default the MIME type — so the contract is applied directly to the v2
 * `registerTool` and `registerResource` instead of installing a parallel MCP
 * stack to reach two wrappers. `tests/unit/mcp-app-view.test.ts` pins every
 * literal below so the contract cannot drift silently.
 */

/** The MIME type an MCP Apps host reads a UI resource as. */
export const APP_VIEW_MIME_TYPE = "text/html;profile=mcp-app";

/**
 * The earlier ChatGPT ("Skybridge") MIME type for the same document.
 *
 * Both contracts are live in OpenAI's own examples, so the read result carries
 * the document under each type and the tool advertises both metadata keys. A
 * host takes the content item matching what it asked for and ignores the
 * other; neither is a second resource and neither is a second data path.
 */
export const LEGACY_APP_VIEW_MIME_TYPE = "text/html+skybridge";

/**
 * The `_meta` key the MCP Apps extension deprecated in favour of `ui`.
 *
 * Still emitted, exactly as `registerAppTool` still emits it, because a host
 * that predates the nested form is otherwise handed a tool with no view.
 */
export const LEGACY_RESOURCE_URI_META_KEY = "ui/resourceUri";

/** The ChatGPT Apps SDK key naming a tool's view. */
export const OUTPUT_TEMPLATE_META_KEY = "openai/outputTemplate";

/** The one view this slice ships: the result of `list_jobs`. */
export const APPLICATION_LIST_VIEW_URI = "ui://interndex/application-list.html";

export const APPLICATION_LIST_VIEW_NAME = "Interndex application list";

/**
 * The `_meta` that associates a tool with a UI resource.
 *
 * Three spellings of one fact — the nested `ui.resourceUri` of the MCP Apps
 * extension, its deprecated flat alias, and the Apps SDK's
 * `openai/outputTemplate` — so the association is discoverable by every host
 * currently shipping. They must always name the same URI; nothing here lets
 * them diverge.
 *
 * `openai/widgetAccessible` is false on purpose: this view reads a result and
 * renders it, and is not permitted to call tools back. Read-only stays
 * read-only.
 */
export function appViewToolMeta(resourceUri: string) {
  return {
    ui: { resourceUri },
    [LEGACY_RESOURCE_URI_META_KEY]: resourceUri,
    [OUTPUT_TEMPLATE_META_KEY]: resourceUri,
    "openai/widgetAccessible": false,
  } as const;
}

/**
 * The `_meta` a UI resource carries about itself.
 *
 * Not the same shape as the tool's, and deliberately so: on a resource,
 * `_meta.ui` describes how to render the document — its content security
 * policy, its sandbox permissions, its border — and has no `resourceUri` in
 * it. The Apps SDK keys beside it are the earlier ChatGPT contract, which
 * repeats the tool's association here.
 *
 * `prefersBorder` is false because the view draws its own hairline and
 * rounded corners; a host frame around that is a border inside a border. No
 * `csp` block is declared because the document loads nothing at all — no
 * script, style, font or image leaves its own origin.
 */
export function appViewResourceMeta(resourceUri: string) {
  return {
    ui: { prefersBorder: false },
    [OUTPUT_TEMPLATE_META_KEY]: resourceUri,
    "openai/widgetAccessible": false,
  } as const;
}

/**
 * Registers the Interndex UI resources on an MCP server.
 *
 * Called from `registerJobTrackTools`, so the resource a client can resolve is
 * the one the route serves and the one the tests drive — the same reason the
 * tools have a single registration function.
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
      description:
        "Renders the applications returned by list_jobs as a compact Interndex list.",
      mimeType: APP_VIEW_MIME_TYPE,
      _meta: appViewResourceMeta(APPLICATION_LIST_VIEW_URI),
    },
    async () => ({
      contents: [
        {
          uri: APPLICATION_LIST_VIEW_URI,
          mimeType: APP_VIEW_MIME_TYPE,
          text: APPLICATION_LIST_VIEW_HTML,
        },
        {
          uri: APPLICATION_LIST_VIEW_URI,
          mimeType: LEGACY_APP_VIEW_MIME_TYPE,
          text: APPLICATION_LIST_VIEW_HTML,
        },
      ],
    }),
  );
}
