# ChatGPT app

Interndex has one native ChatGPT view: a student asks *"show me my active
applications"*, ChatGPT calls the existing `list_jobs` tool, and the result is
rendered as a compact Interndex list inside the conversation instead of as a
paragraph of text.

## How it fits

There is no second backend and no ChatGPT-specific API. A ChatGPT app is two
additions to an MCP server that already works:

1. a **resource** whose body is an HTML document, and
2. a **`_meta` pointer** on a tool saying "render my result in that document".

Everything underneath is unchanged. The same `/api/mcp` endpoint, the same
OAuth flow, the same Supabase access token, the same `lib/mcp/repository.ts`,
the same row-level security. ChatGPT reaches a student's applications by
calling `list_jobs` as an authenticated MCP client and nothing else.

```text
ChatGPT ── tools/call list_jobs ──► /api/mcp ─► token ─► repository ─► Postgres (RLS)
        ◄─ result: text + structuredContent + _meta.ui.resourceUri
        ── resources/read ui://interndex/application-list.html ──►
        ◄─ the view's HTML (static; no student data in it)
        ── renders the view in an iframe, hands it the structuredContent
```

The view never queries anything. Its only input is the tool result the host
gives it, which the caller had to be authenticated to obtain. That is the whole
reason it cannot become a path around RLS, and `tests/unit/mcp-app-view.test.ts`
asserts the document contains no fetch, no URL and no Supabase client.

## Files

| File | Role |
|---|---|
| `lib/mcp/app-views.ts` | The UI resource registration and the tool `_meta` builder |
| `lib/mcp/app-views/application-list-html.ts` | The view itself, as one self-contained HTML document |
| `lib/mcp/tools.ts` | Registers the views, and points `list_jobs` at one |
| `tests/unit/mcp-tool-registration.test.ts` | The Apps SDK wire contract, over a real MCP server |
| `tests/unit/mcp-app-view.test.ts` | The view's protocol handling and rendering |

## The UI resource

| | |
|---|---|
| URI | `ui://interndex/application-list.html` |
| MIME type | `text/html;profile=mcp-app` (also served as `text/html+skybridge`) |
| Body | A complete HTML document — markup, styles and script in one string |

Its own `_meta` is a different shape from the tool's, and deliberately so: on a
resource, `_meta.ui` describes how to *render* the document — CSP, sandbox
permissions, border — and carries no `resourceUri`. Interndex declares
`prefersBorder: false`, because the view draws its own hairline and rounded
corners and a host frame around that is a border inside a border. No `csp`
block is declared: the document loads nothing at all.

It is a TypeScript template literal rather than a file read at request time
because the MCP route runs in the Next.js server bundle: a string is bundled
with the route, whereas `fs.readFileSync` of a widget asset is a deployment
detail that a serverless build can lose.

## How `list_jobs` connects to it

`list_jobs` gained exactly one thing — `_meta`:

```ts
_meta: {
  ui: { resourceUri: "ui://interndex/application-list.html" },
  "ui/resourceUri": "ui://interndex/application-list.html",
  "openai/outputTemplate": "ui://interndex/application-list.html",
  "openai/widgetAccessible": false,
}
```

Three spellings of one fact: the nested `ui.resourceUri` of the MCP Apps
extension, its deprecated flat alias, and the Apps SDK's
`openai/outputTemplate`. Both contracts are live in OpenAI's own examples
repository, so both are advertised and the read result carries the document
under each MIME type. They always name the same URI —
`appViewToolMeta()` builds all of them from one argument.

`openai/widgetAccessible` is `false`: the view renders a result and may not call
tools back.

The tool's arguments, filters, authentication, repository call, plain-text block
and `structuredContent` are untouched. A client that ignores `_meta` — Claude,
`scripts/verify-hosted-mcp.mjs`, any other MCP client — sees precisely the tool
it saw before, and a ChatGPT session whose view fails to load still gets the
text answer.

## How structured content reaches the component

The host loads the resource into a sandboxed iframe and speaks the MCP Apps
protocol (revision `2026-01-26`) to it over `postMessage`:

| Direction | Message |
|---|---|
| view → host | `ui/initialize` request (`appInfo`, `appCapabilities`, `protocolVersion`) |
| host → view | initialize result, carrying `hostContext.theme` |
| view → host | `ui/notifications/initialized` |
| host → view | `ui/notifications/tool-result` — **params are the `list_jobs` result** |
| view → host | `ui/notifications/size-changed` after every render |
| host → view | `ui/notifications/host-context-changed` when the theme changes |

`params.structuredContent` is the same object `list_jobs` returns:
`{ applications, returned, has_more }`. The view renders it and nothing else.

The earlier ChatGPT contract — tool output on `window.openai.toolOutput`,
refreshed by an `openai:set_globals` event — is also read, because it costs a
dozen lines and is what a host on that surface hands a widget.

### Fields shown

Everything `list_jobs` already returns per application: company, job title,
status, work term, location, date applied, deadline, and whether it is
archived. Missing optional fields are omitted rather than rendered as blanks —
an application with no work term, location or dates shows just employer, role
and status.

Status colour is semantic and matches the dashboard's rule: only the statuses
that carry a verdict are coloured (Preparing, Offer, Accepted, Rejected,
Withdrawn). Applied, Screening and Interview are progress and stay neutral, so
thirty rows of progress do not drown out one rejection.

The view is not a second copy of the dashboard. It renders text with the
Interndex palette restated as plain custom properties — it has no access to the
app's Tailwind build, and loads no font, image, stylesheet or script over the
network, so it renders under a host CSP that allows no external origin.

## Local testing

```bash
npx vitest run tests/unit/mcp-app-view.test.ts tests/unit/mcp-tool-registration.test.ts
```

`mcp-tool-registration.test.ts` drives the real `registerJobTrackTools` over a
real `McpServer` and asserts the wire contract: the `_meta` on `list_jobs`, the
resource in `resources/list`, and the document returned by `resources/read`
under both MIME types.

`mcp-app-view.test.ts` loads the document into JSDOM, **executes its script**,
and dispatches the host's messages at it. `window.parent` is `window` in a
JSDOM document, which is the loopback that lets a test observe the handshake
the view sends and answer it. Nothing calls an internal function: the view
exports none, so what is asserted is the wire behaviour a host will see.

To look at the rendered view in a real browser, load the exported HTML into an
iframe and send it the two messages above — a host answers `ui/initialize`, then
posts a `ui/notifications/tool-result` carrying a `list_jobs`
`structuredContent`. That is how the light, dark and narrow renderings in this
PR were checked.

Against real ChatGPT, the connection is the ordinary one from `docs/mcp.md`:
deploy or tunnel to a public HTTPS origin, add `https://<domain>/api/mcp` as a
connector, sign in through the consent screen, then ask for your applications.

## Dependencies

**No runtime dependencies were added.** `@types/jsdom@30.0.0` was added as a dev
dependency for the widget tests — `tests/unit/mcp-app-view.test.ts` constructs
its own JSDOM document so the view's script actually runs, and `jsdom` itself
ships no types.

Nothing was needed at runtime: the Apps SDK contract is metadata plus an HTML
resource, and both are expressible with the `registerTool` and
`registerResource` this repository's `@modelcontextprotocol/server` v2 already
has.

`@modelcontextprotocol/ext-apps` was inspected and deliberately not installed:
its `registerAppTool` / `registerAppResource` helpers are typed against the MCP
TypeScript SDK **v1** (`@modelcontextprotocol/sdk`, a peer dependency), while
this repository runs the v2 split packages. The helpers are thin — they
normalize the UI metadata keys and default the MIME type — so installing a
parallel MCP stack to reach two wrappers would have cost more than it removed.
The literals they would have supplied are pinned by tests instead.

## Known limitations

- **Work arrangement is not shown.** It is not in the `list_jobs` projection,
  and widening that projection would change the tool's output schema for every
  MCP client to serve one view. It is on `get_job`, which is where a detail view
  belongs.
- **No Interndex logo artwork.** The lockup is a PNG under `public/brand`, and
  loading it would need a host CSP allowance for the app's origin. The view uses
  the wordmark and the Interndex palette instead.
- **The view is read-only.** Nothing in it is clickable and it cannot call a
  tool; `openai/widgetAccessible` is `false`.
- **Not yet verified inside ChatGPT itself.** Doing that needs a public
  deployment and a ChatGPT developer-mode connector. What has been verified is
  the wire contract over a real MCP server, and the document rendering and
  handshaking correctly in a browser and in JSDOM.
- **Theme follows the host.** `hostContext.theme` and `prefers-color-scheme`
  are honoured; the student's chosen Interndex accent is not, because the view
  never reads their settings.

## Next

`get_job` — a single-application detail view. It is the natural next slice: the
tool already returns the full record, including the fields this list omits, and
attaching a second view is the same two additions this one needed.

Beyond that, in rough order: acting from the view (a status change would need
`openai/widgetAccessible` and an app-visible `update_job`), then a pipeline
view over `list_jobs` grouped by status.
