# ChatGPT app

Interndex has two native ChatGPT views:

- a student asks *"show me my active applications"*, ChatGPT calls `list_jobs`,
  and the result renders as a compact Interndex list inside the conversation;
- a student asks to save a job, ChatGPT calls `save_job`, and the result
  renders as a compact confirmation of that one job — never a list.

## How it fits

There is no second backend and no ChatGPT-specific API. A ChatGPT app is two
additions to an MCP server that already works:

1. a **resource** whose body is an HTML document, and
2. a **`_meta` pointer** on a tool saying "render my result in that document".

Everything underneath is unchanged. The same `/api/mcp` endpoint, the same
OAuth flow, the same Supabase access token, the same `lib/mcp/repository.ts`,
the same row-level security. ChatGPT reaches a student's applications by
calling `list_jobs` or `save_job` as an authenticated MCP client and nothing
else.

```text
ChatGPT ── tools/call list_jobs ──► /api/mcp ─► token ─► repository ─► Postgres (RLS)
        ◄─ result: text + structuredContent + _meta[openai/outputTemplate]
        ── resources/read ui://interndex/application-list.html ──►
        ◄─ the view's HTML (static; no student data in it)
        ── renders the view in an iframe, hands it the structuredContent

ChatGPT ── tools/call save_job ──► /api/mcp ─► token ─► repository ─► Postgres (RLS)
        ◄─ result: text + structuredContent + _meta[openai/outputTemplate]
        ── resources/read ui://interndex/save-confirmation.html ──►
        ◄─ the view's HTML (static; no student data in it)
        ── renders the view in an iframe, hands it the structuredContent
```

Both views never query anything. Their only input is the tool result the host
gives them, which the caller had to be authenticated to obtain. That is the
whole reason neither can become a path around RLS, and both
`tests/unit/mcp-app-view.test.ts` and
`tests/unit/mcp-save-confirmation-view.test.ts` assert their documents contain
no fetch, no URL and no Supabase client.

## Files

| File | Role |
|---|---|
| `lib/mcp/app-views.ts` | UI resource registration and the `_meta` builders, for both views |
| `lib/mcp/app-views/application-list-html.ts` | The list view: every result of `list_jobs` |
| `lib/mcp/app-views/save-confirmation-html.ts` | The confirmation view: one result of `save_job`, never a list |
| `lib/mcp/tools.ts` | Registers the views and points each tool at its own, or at none |
| `tests/unit/mcp-tool-registration.test.ts` | The Apps SDK wire contract, over a real MCP server, for both views |
| `tests/unit/mcp-app-view.test.ts` | The list view's protocol handling and rendering |
| `tests/unit/mcp-save-confirmation-view.test.ts` | The confirmation view's protocol handling and rendering |

## The application-list view's resource

| | |
|---|---|
| URI | `ui://interndex/application-list.html` |
| MIME type | `text/html+skybridge` (also served as `text/html;profile=mcp-app`) |
| Advertised in | `resources/list`, `resources/templates/list`, `resources/read` |
| Body | A complete HTML document — markup, styles and script in one string |

**The MIME type is load-bearing.** ChatGPT resolves the tool's
`openai/outputTemplate` to a resource and renders a custom component only when
that resource is `text/html+skybridge`. A resource advertised as the newer MCP
Apps type instead is not recognised as a widget, and the tool's result is shown
with the host's default presentation — a plain table — with no error and with
every other part of the integration working. The document is therefore
advertised as `text/html+skybridge` and carries the MCP Apps type as a second
content item on the read, ChatGPT's first. One document, two labels, no second
view to drift.

It is registered twice over: as a concrete resource, which is what
`resources/list` and `resources/read` answer with, and as a resource template,
because that is the third place OpenAI's own servers advertise a widget. The
template lists nothing of its own, so `resources/list` still holds one entry.

Its own `_meta` is a different shape from the tool's, and deliberately so: on a
resource, `_meta.ui` describes how to *render* the document — CSP, sandbox
permissions, border — and carries no `resourceUri`. Interndex declares
`prefersBorder: false`, because the view draws its own hairline and rounded
corners and a host frame around that is a border inside a border. No `csp`
block is declared: the document loads nothing at all. The Apps SDK keys
(`openai/outputTemplate`, `openai/widgetAccessible`) are repeated on the
resource listing, the template and each read content item, because that is what
OpenAI's servers do and a host is entitled to look at any of the three.

It is a TypeScript template literal rather than a file read at request time
because the MCP route runs in the Next.js server bundle: a string is bundled
with the route, whereas `fs.readFileSync` of a widget asset is a deployment
detail that a serverless build can lose.

## How `list_jobs` connects to it

`list_jobs` gained exactly one thing — `_meta`:

```ts
_meta: {
  "openai/outputTemplate": "ui://interndex/application-list.html",
  "openai/toolInvocation/invoking": "Reading your applications",
  "openai/toolInvocation/invoked": "Showed your applications",
  "openai/widgetAccessible": false,
  ui: { resourceUri: "ui://interndex/application-list.html" },
  "ui/resourceUri": "ui://interndex/application-list.html",
}
```

Three spellings of one fact: the Apps SDK's `openai/outputTemplate` — the key
ChatGPT actually resolves — the nested `ui.resourceUri` of the MCP Apps
extension, and its deprecated flat alias. Both contracts are live in OpenAI's
own examples repository, so both are advertised. They always name the same
URI — `appViewToolMeta()` builds all of them from one argument.

The same association is repeated on the `list_jobs` **result** as well as on
its descriptor, again matching OpenAI's servers: the descriptor is read once at
connection time, while the result's `_meta` travels with the payload the host
is about to render.

`openai/widgetAccessible` is `false`: the view renders a result and may not call
tools back. It gates what the view may *do*, not whether it renders.

The tool's arguments, filters, authentication, repository call, plain-text block
and `structuredContent` are untouched. A client that ignores `_meta` — Claude,
`scripts/verify-hosted-mcp.mjs`, any other MCP client — sees precisely the tool
it saw before, and a ChatGPT session whose view fails to load still gets the
text answer.

## The save-confirmation view's resource, and how `save_job` connects to it

Same shape, different URI and a different tool:

| | |
|---|---|
| URI | `ui://interndex/save-confirmation.html` |
| MIME type | `text/html+skybridge` (also served as `text/html;profile=mcp-app`) |
| Points at it | `save_job`, and only `save_job` |

```ts
_meta: {
  "openai/outputTemplate": "ui://interndex/save-confirmation.html",
  "openai/toolInvocation/invoking": "Saving your application",
  "openai/toolInvocation/invoked": "Saved your application",
  "openai/widgetAccessible": false,
  ui: { resourceUri: "ui://interndex/save-confirmation.html" },
  "ui/resourceUri": "ui://interndex/save-confirmation.html",
}
```

The invoking/invoked labels are deliberately not "Reading…" / "Showed…" —
those describe `list_jobs`, and reusing them on a write would tell a host the
wrong verb. `structuredContent` is `save_job`'s own result:
`{ application_id, company, job_title, status, work_term, location }` — one
job, with no `applications` array anywhere in the shape, so there is no field
a future change could accidentally widen into a list.

### Why `save_job` has its own view: the regression this closes

A student pasted a job posting and asked to add it to their tracker. The save
completed correctly, but ChatGPT then displayed the generic application-list
widget above the confirmation — showing existing, unrelated saved
applications — instead of, or beside, a clean one-line confirmation of what
was just saved.

`save_job` never carried `_meta["openai/outputTemplate"]` before this change —
`tests/unit/mcp-tool-registration.test.ts` already pinned that no tool but
`list_jobs` had a view. So the widget was never attached by `save_job`'s own
result; nothing in this repository rendered it. That leaves one explanation:
**ChatGPT's own orchestration called `list_jobs` as a second, separate
`tools/call`** — either before saving, as an ad hoc duplicate check Interndex
never asked for, or after saving, to put something visual next to a
plain-text confirmation. Both are the model choosing to call a second tool;
neither is something a Model Context Protocol server can prevent a client
from doing.

`save_job` now points at its own compact view carrying exactly the saved
job's employer, title, status, work term and location — never another
application, never a count, never an empty-state message. A save that
already renders something visual removes the reason a host or a model would
reach for `list_jobs` to get one. **This is not a guarantee the model will
never call `list_jobs` anyway** — nothing in MCP lets a server forbid a
client from making a second, independent tool call — but it removes the
motive the observed regression matches, in a way a tool description alone
cannot.

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

**ChatGPT uses the other contract**: the tool result arrives on
`window.openai.toolOutput` rather than over `postMessage`, refreshed by an
`openai:set_globals` event. The view reads it at boot, on that event, and — for
a first result only — by polling every 250ms for ten seconds, because the host
may inject the globals around the time the document's script runs and with no
event to announce them. That is the same interval and bound the Apps SDK's own
`useOpenAiGlobal` hook uses.

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
npx vitest run tests/unit/mcp-app-view.test.ts tests/unit/mcp-save-confirmation-view.test.ts tests/unit/mcp-tool-registration.test.ts
```

`mcp-tool-registration.test.ts` drives the real `registerJobTrackTools` over a
real `McpServer` and asserts the wire contract for both views: the `_meta` on
`list_jobs` and on `save_job`, each naming its own resource and never the
other's, the resources in `resources/list`, and the documents returned by
`resources/read` under both MIME types. It also asserts `save_job` never
reads the tracker through its own handler (`database round trips per tool
call`) and never carries list-shaped data.

`mcp-app-view.test.ts` and `mcp-save-confirmation-view.test.ts` each load
their document into JSDOM, **execute its script**, and dispatch the host's
messages at it. `window.parent` is `window` in a JSDOM document, which is the
loopback that lets a test observe the handshake the view sends and answer it.
Nothing calls an internal function: neither view exports one, so what is
asserted is the wire behaviour a host will see.

To look at a rendered view in a real browser, load its exported HTML into an
iframe and send it the two messages above — a host answers `ui/initialize`,
then posts a `ui/notifications/tool-result` carrying the matching tool's
`structuredContent`. That is how the light, dark and narrow renderings in
this project were checked.

Against real ChatGPT, the connection is the ordinary one from `docs/mcp.md`:
deploy or tunnel to a public HTTPS origin, add `https://<domain>/api/mcp` as a
connector, sign in through the consent screen, then ask it to save a job and,
separately, to show your applications. **This is the one verification this
repository cannot perform on its own** — see the manual acceptance checklist
below.

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

- **Nothing here can force ChatGPT not to call `list_jobs` after `save_job`.**
  The Apps SDK and MCP give a server no mechanism to forbid a client from
  making a second `tools/call`. The save-confirmation view makes that choice
  less likely and less useful to the model, but it is not an enforcement
  boundary — see "Why `save_job` has its own view" above. **A real ChatGPT
  session against a deployed build is required to confirm this actually
  changed model behaviour**, not only the wire contract; see the acceptance
  checklist below.
- **Work arrangement is not shown** on the list view. It is not in the
  `list_jobs` projection, and widening that projection would change the
  tool's output schema for every MCP client to serve one view. It is on
  `get_job`, which is where a detail view belongs.
- **No Interndex logo artwork.** The lockup is a PNG under `public/brand`, and
  loading it would need a host CSP allowance for the app's origin. Both views
  use the wordmark and the Interndex palette instead.
- **Both views are read-only.** Nothing in either is clickable and neither can
  call a tool; `openai/widgetAccessible` is `false` on both.
- **Only the wire contract is verified from this repository.** The tests drive
  a real MCP server, and both documents have been rendered in Chromium down
  all three delivery paths — globals with an event, globals with none, and the
  MCP Apps `postMessage` handshake. Whether a given ChatGPT build then chooses
  to render either, and whether the model still reaches for `list_jobs`
  anyway, can only be confirmed against a live connector.
- **Theme follows the host.** `hostContext.theme` and `prefers-color-scheme`
  are honoured; the student's chosen Interndex accent is not, because neither
  view reads their settings.

## Known ChatGPT-side behavior this repository cannot fix

A user-visible latency-and-UX audit traced a ~55 second wait and an
unexpected extra bubble after a `list_jobs` call to ChatGPT's own
orchestration and client behavior, not to this server — which the same
audit measured processing every tool call in well under 100ms (see
`lib/mcp/telemetry.ts`). Two upstream reports match what was observed:

- **ChatGPT can call a tool twice for one user action.** Reported upstream
  as ChatGPT's web client initializing two MCP sessions on different
  protocol versions and invoking tools from both
  ([openai/openai-apps-sdk-examples#171](https://github.com/openai/openai-apps-sdk-examples/issues/171)),
  and separately as two identical widget bubbles rendering for a single
  tool call (OpenAI Developer Community: "Double widget bubble rendered for
  a single MCP tool call"). No server-side workaround is documented for
  either as of this writing. `mcp-handler`'s `legacy: 'stateless' | 'reject'`
  option is the only lever this server has anywhere near this — it decides
  whether pre-2026-07-28 ("legacy") MCP traffic is served at all — but
  nothing in either report confirms which session ChatGPT treats as
  authoritative, so flipping it without being able to test against a live
  ChatGPT connector could as easily break the connection as fix the
  duplicate. It is deliberately left at its default rather than guessed at.
- **A widget-bound tool's `content` is not shown to the model.** When
  `list_jobs`'s result renders as a widget, ChatGPT does not forward the
  tool's `content` text to the model at all — it substitutes a system
  message saying a UI was displayed, and hands the model `structuredContent`
  as a raw JSON code block instead
  ([openai/openai-apps-sdk-examples#144](https://github.com/openai/openai-apps-sdk-examples/issues/144)).
  This means keeping `content` short (already true here — see
  `tools.ts`'s `list_jobs` handler) does not, by itself, discourage the
  model from composing its own prose restatement of the raw JSON once the
  widget has already shown it; the model still produces a normal reply after
  every tool call, by design, and no MCP or Apps SDK field this server can
  set suppresses that reply outright. `lib/mcp/instructions.ts` is the one
  lever aimed at it: it asks the model directly not to restate the list once
  rendered. Whether a given ChatGPT build honours that can only be confirmed
  against a live connector, the same limitation the wire-contract note above
  already carries.

Neither of these is a defect in `registerJobTrackTools`, the repository
layer, or the view's own script — all three are exercised by
`tests/unit/mcp-tool-registration.test.ts` and `tests/unit/mcp-app-view.test.ts`
and behave as documented. They are recorded here rather than "fixed" because
there is nothing on this side of the wire to change: the audit's own rule
was not to claim ChatGPT orchestration latency solved when it is outside
this application's control.

## Manual ChatGPT acceptance checklist

This has not been run against a live ChatGPT connector as part of this
change — it must be performed after deployment to confirm the model actually
behaves as the wire contract now encourages. Use a long, real posting (not a
one-line "Software Engineer at Acme") so the save exercises `job_description`
and company-domain inference too.

1. Connect Interndex to ChatGPT per `docs/mcp.md` against the deployed build
   carrying this change.
2. Paste a full job posting — company, title, location, work term, and a
   multi-paragraph description — and say "add this to my tracker."
   - **Expected tool sequence:** exactly one `tools/call`, to `save_job`. No
     `list_jobs` call before or after it.
   - **Expected UI:** the compact save-confirmation card — employer, title,
     status, work term and location if the posting had them — and nothing
     resembling a list, an empty state, or another application.
   - **Expected latency:** the deployment's logs show one `{"at":"mcp.tool_call",
     "tool":"save_job", "outcome":"success", ...}` line (see
     `lib/mcp/telemetry.ts`) with `totalMs` in the low tens of milliseconds. If
     ChatGPT's own "Worked for Ns" is still large, that gap is
     model/orchestration time outside this repository — worth recording, not
     something to keep chasing here.
3. Separately, ask "show my active applications."
   - **Expected tool sequence:** one `tools/call`, to `list_jobs`.
   - **Expected UI:** the application-list widget, populated with the
     student's real saved applications.
4. Save a second job, then in the same turn ask to see the tracker.
   - **Expected tool sequence:** `save_job`, then `list_jobs` — two calls,
     because the student explicitly asked to see the tracker this time. This
     is the case the fix must not break: an explicit list request after a
     save should still list.
5. Disconnect and reconnect per `docs/mcp.md`'s existing manual test, to
   confirm nothing about OAuth, consent, or revocation changed.

Record what actually happened against each expectation, including the tool
sequence ChatGPT chose — that is the only source of truth this document
cannot manufacture from a unit test.

## Next

`get_job` — a single-application detail view. It is the natural next slice: the
tool already returns the full record, including the fields this list omits, and
attaching a second view is the same two additions this one needed.

Beyond that, in rough order: acting from the view (a status change would need
`openai/widgetAccessible` and an app-visible `update_job`), then a pipeline
view over `list_jobs` grouped by status.
