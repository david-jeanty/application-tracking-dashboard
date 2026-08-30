# Chrome Web Store release — Interndex Capture

Status as of this review: **CONDITIONAL GO**, blocked on production
configuration values only this session cannot supply, plus a documented
least-privilege risk-acceptance decision. Not submitted to, or approved by,
the Chrome Web Store. See "Recommendation" at the end.

This document is the release package for taking Interndex Capture from a
locally loadable unpacked extension to a Chrome Web Store submission. It
does not replace `docs/browser-capture.md`, which remains the architecture
and threat-model source of truth; this document is the release-specific
checklist, listing copy, and manual verification plan built on top of it.

**Revision note.** §2 was corrected against current official Chrome
documentation to replace a vaguer bootstrapping approach with Chrome's
actual documented mechanism (an inert one-time upload to obtain the Store
item's public key, added to the real manifest as `"key"`). This was a
documentation-only correction: no OAuth implementation, permission,
extractor, UI, packaging-script, or database code changed as part of it —
see §12.

**Progress note.** §2 steps A–E are now complete: the bootstrap item exists
as a saved Draft, its permanent Store item ID and public key were obtained,
and that public key is committed as `extension/manifest.json`'s top-level
`"key"` field. Step F — confirming a locally loaded unpacked build's
extension ID actually matches the Store item ID — is the next action and
has not been done yet. Steps G onward (registering the OAuth redirect URI,
configuring production values) are intentionally not started until F is
confirmed. See §2 for full detail.

## 1. What blocks a real production build today

Three values are still development placeholders in `extension/src/config.ts`
and the matching `host_permissions` in `extension/manifest.json`:

| Value | Current placeholder | Where the real value comes from |
| --- | --- | --- |
| `jobtrackOrigin` | `https://jobtrack.example.com` | The canonical production origin Interndex is actually deployed to (Vercel project settings / DNS, the same value that belongs in `NEXT_PUBLIC_SITE_URL` for production). |
| `supabaseUrl` | `https://your-project-ref.supabase.co` | Supabase Dashboard → the **production** project → Project Settings → API (or the Connect dialog). Must be the production project, not a local/dev/staging one. |
| `oauthClientId` | `replace-with-the-extension-oauth-client-id` | A **dedicated** public OAuth client registered against the production Supabase project for Interndex Capture specifically — not the MCP client, not a shared client. See §2 for why this has to happen after the Web Store item exists. |

This session has no access to the live Vercel deployment or the production
Supabase project, and no `.env.local` or equivalent is present in this
repository checkout (by design — `.gitignore` excludes it, and it was not
supplied). Per the task instructions this review works under: **these
values are not guessed.** Producing a "production" package with invented
values would be worse than not producing one, so the packaging script added
in this PR (`extension/scripts/package.mjs`, wired to
`npm run extension:package`) refuses to build a ZIP while any of the three
placeholder strings above are still present anywhere in the built output —
see §11.

Everything else in this document — the permission audit, the OAuth security
review, the least-privilege decision, the privacy review, and the listing
copy — does not depend on knowing these values and is complete now.

## 2. OAuth client and Web Store extension ID sequence

**Corrected in this revision** against current official Chrome
documentation (the previous version of this section described the right
problem but a vaguer, unverified mechanism for solving it):

- <https://developer.chrome.com/docs/extensions/mv3/tut_oauth>
- <https://developer.chrome.com/docs/extensions/reference/api/identity>
- <https://developer.chrome.com/docs/webstore/prepare>
- <https://developer.chrome.com/docs/webstore/api/v1>

The extension's OAuth redirect URI is
`https://<app-id>.chromiumapp.org/*`, produced by
`chrome.identity.getRedirectURL()` (`extension/src/background.ts`). Chrome
derives `<app-id>` from the extension's public key, not from where it was
installed from. A Chrome Web Store item gets its permanent item ID and
public key the moment a package is first uploaded to the dashboard — it
does not need to be published, or even submitted for review, for that ID
and key to exist. Chrome's documented mechanism for making a locally loaded
unpacked build share that same ID is to copy the Store item's public key
into the unpacked build's own `manifest.json` as a top-level `"key"` field.
That is the actual resolution to the chicken-and-egg problem: **the ID
comes from the public key, and the public key comes from uploading
something — it does not have to be the real, fully-configured extension.**

**Do not hardcode a temporary unpacked-extension ID and call this done.**
The correct sequence, in order:

**Progress so far:**

| Step | Status |
| --- | --- |
| A. Generate bootstrap ZIP | **Done** |
| B. Upload to a new Store item, Save Draft only | **Done** — not submitted for review |
| C. Record the permanent Store item ID | **Done** — `llggmpgoichadgcolincmjcfkljpboad` |
| D. Copy the public key from the Package tab | **Done** |
| E. Add the public key to `extension/manifest.json` as `"key"` | **Done** — committed in this revision |
| F. Load unpacked and confirm the ID matches | **Not done — next action** |
| G–Q. Redirect URI, OAuth client, production config, QA, submission | **Not started**, intentionally, until F is confirmed |

**Expected redirect URI once F is confirmed (step G):**
`https://llggmpgoichadgcolincmjcfkljpboad.chromiumapp.org/`

This is derived directly from the Store item ID recorded in step C and
should be treated as expected, not final, until step F's local ID check
confirms the pinned `"key"` actually produces this same ID on a real
`chrome://extensions` load — see §16 for why that check comes first, before
touching Supabase or `extension/src/config.ts`.

**A. Generate an inert bootstrap package.** Its only purpose is to be
*something* to upload so the Web Store item and its public key come into
existence; it must never be submitted for review or published. Run this
once, from the repository root:

```bash
# One-time manual bootstrap. Not part of the tracked build and not run by
# npm run extension:package, which remains the only production packager.
# Refuses to run once a real OAuth client id is configured, because at that
# point bootstrap has already been done and is no longer needed.

grep -q "replace-with-the-extension-oauth-client-id" extension/src/config.ts || {
  echo "Bootstrap not needed: extension/src/config.ts already has a real oauthClientId." >&2
  echo "Stop here — do not create another bootstrap package." >&2
  exit 1
}

BOOTSTRAP_DIR="$(mktemp -d)"
mkdir -p "$BOOTSTRAP_DIR/icons"
cp extension/icons/*.png "$BOOTSTRAP_DIR/icons/"

cat > "$BOOTSTRAP_DIR/manifest.json" <<'JSON'
{
  "manifest_version": 3,
  "name": "Interndex Capture — BOOTSTRAP ONLY — DO NOT SUBMIT",
  "version": "0.0.0.1",
  "description": "Bootstrap-only draft for reserving the Interndex Capture Chrome Web Store item ID. Not for review or publication.",
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
JSON

OUTPUT="$HOME/Downloads/interndex-capture-BOOTSTRAP-ONLY-DO-NOT-SUBMIT-v0.0.0.1.zip"
( cd "$BOOTSTRAP_DIR" && zip -X -r "$OUTPUT" . )
rm -rf "$BOOTSTRAP_DIR"

echo "Bootstrap package written to $OUTPUT"
echo "Upload this to a NEW Chrome Web Store item and Save Draft only. Never submit it for review."
```

This package has no `background`, no `action`, no `permissions`, no
`host_permissions`, and no OAuth client id — it cannot run, connect to
anything, or do anything besides exist long enough for the dashboard to
assign an item ID and a public key. It is written to `~/Downloads`, not to
any tracked or gitignored path inside this repository, and its name makes
its non-release status unmistakable in a directory listing.

The `description` above was corrected in this revision: an earlier draft of
this document exceeded the Chrome Web Store's 132-character manifest
description limit. The text now shown is the one actually uploaded and
accepted.

**B. Done.** Uploaded the bootstrap ZIP to a new item in the Chrome Web
Store Developer Dashboard and saved it as a **Draft only** — not submitted
for review.

**C. Done.** Permanent Store item ID: `llggmpgoichadgcolincmjcfkljpboad`.

**D. Done.** Package tab → View public key → copied.

**E. Done.** The public key is committed in `extension/manifest.json` as a
top-level `"key"` field (alongside `manifest_version`, `name`, `version`,
etc. — not inside any other object). This is a public key, safe to have in
the repository; it is not a secret the way a client secret would be.

**F. Next action — not yet done.** Load the real extension unpacked
(`chrome://extensions` → enable Developer mode → Load unpacked → select the
`extension/` directory) and confirm the ID Chrome assigns it is exactly
`llggmpgoichadgcolincmjcfkljpboad`, matching the Store item ID from step C.
If it does not match, the `key` field was not copied correctly — stop and
fix this before continuing; every step after this one depends on it.

**G. Not started — do this only after F is confirmed.** Derive the redirect
URI from the Store item ID: `https://llggmpgoichadgcolincmjcfkljpboad.chromiumapp.org/`.
This value is *expected*, not yet *confirmed* — step F is what proves the
pinned `"key"` actually makes a real Chrome load produce this exact ID.
Registering an OAuth redirect URI before that confirmation risks
registering a value nothing will ever actually generate.

**H.** Register a **dedicated** OAuth client in the production Supabase
project for Interndex Capture, with that redirect URI. Do not reuse the MCP
client — `docs/browser-capture.md` and `docs/mcp.md` are explicit that the
two must remain independently revocable grants with different consent
copy.

**I.** Put the real, public OAuth `client_id`, the production
`jobtrackOrigin`, and the production `supabaseUrl` into
`extension/src/config.ts`.

**J.** Update `extension/manifest.json`'s `host_permissions` to match
exactly (or just run `npm run extension:package`, which refuses to proceed
if they disagree — `extension/tests/manifest.test.ts` also asserts this).

**K.** Run:

```bash
npm run extension:check
npm run extension:package
```

**L.** Inspect the real release ZIP from §11: version `0.1.0` (not
`0.0.0.1`), the Store public key present in its `manifest.json`, no
placeholder strings, no secret-shaped values, and `host_permissions`
matching the production origins exactly.

**M.** Extract that exact ZIP and Load Unpacked from the extracted folder —
not from `extension/` directly, so what you test is what §11 actually
produced.

**N.** Confirm its extension ID still equals the Store item ID from step C.
The `key` field is what guarantees this; if it does not match, stop before
any OAuth testing — the redirect URI registered in step H will not match
what this build generates, and every connect attempt will fail at the
redirect step.

**O.** Run the full manual production QA (§13) against that exact build.

**P.** Only after QA passes, upload the real `0.1.0` package to the **same**
Store draft item, replacing the bootstrap `0.0.0.1` upload. Because
`0.1.0 > 0.0.0.1`, this is accepted as a normal version increase — no
arbitrary version bump is needed to make the replacement valid.

**Q.** Only then fill in Store Listing, Privacy practices, reviewer
instructions, and Distribution (§9, §14), and submit for review.

If the Web Store item's ID ever changes (a new item created by mistake, a
developer account change), the redirect URI changes too and the OAuth
client's registered redirect must be updated to match, or every connect
attempt will fail at the redirect step with a mismatch Supabase rejects
before issuing a token — this is intentional; a redirect URI Supabase did
not register is not a value the extension can point itself into accepting.

## 3. Permission audit

Every permission in `manifest.json` is exercised by a real code path, and
`extension/tests/manifest.test.ts` pins both the allow-list and a deny-list
of common broad permissions so a future addition has to consciously delete
an assertion. Audited against the current source:

| Permission | Code path | User-facing feature | Narrower alternative? |
| --- | --- | --- | --- |
| `activeTab` | `chrome.scripting.executeScript` in `extension/src/popup.ts` (`collectFrom`, `probeFrames`), scoped to the tab the popup was opened from | Reading the one job posting the student is looking at, only after they click the toolbar icon | This *is* the narrower alternative — it replaces a persistent host permission for every job site. No narrower option exists that still lets a click read the current page. |
| `scripting` | Same call sites as above; `chrome.scripting.executeScript` is the only way to run `collectPageSignals`/`probeLinkedInFrame` in the page | Runs the page-reading collector exactly once per capture, in the isolated world | Required to use `activeTab` at all for DOM reading; no narrower scripting permission exists. |
| `storage` | `extension/src/tokens.ts` (`chromeCredentialStore`) — `chrome.storage.session` for the access token, `chrome.storage.local` for the refresh token | Staying signed in to Interndex between popup opens and browser restarts | `chrome.storage.session` alone would lose the refresh token on every browser restart, forcing a re-login each session; documented trade-off in `docs/browser-capture.md`. |
| `identity` | `extension/src/background.ts` (`chrome.identity.launchWebAuthFlow`, `chrome.identity.getRedirectURL`) | The OAuth "Connect Interndex" flow | This is the standard, narrowest Chrome API for an extension OAuth flow; no alternative avoids it. |
| `host_permissions`: Interndex origin | `extension/src/capture.ts` (`captureEndpoint`), `extension/src/config.ts` (`jobtrackUrl`) | Sends the confirmed capture and builds the "Open application" link | Exactly the one origin the extension writes to. |
| `host_permissions`: Supabase project origin | `extension/src/auth.ts` (`authorizationEndpoint`, `tokenEndpoint`) | OAuth authorize/token requests | Exactly the one origin that issues and refreshes the extension's tokens. |

Confirmed absent, and asserted absent by `manifest.test.ts`: `tabs`,
`cookies`, `history`, `webNavigation`, `webRequest`, `notifications`,
`downloads`, `bookmarks`, `background`, `alarms`, `clipboardRead`,
`<all_urls>`, and every host wildcard pattern. No permission was added or
removed in this review — the existing set was already the narrowest set
that supports the single purpose, and regression tests already lock it in.

`tabs` deliberately stays absent: the popup calls `chrome.tabs.query` for
the active tab, and without the `tabs` permission that call still returns
the tab (Chrome always exposes the currently active tab to an extension's
own UI surfaces) — it just omits `url`/`title`, which the extension does
not need, since it reads the posting's URL from the page `activeTab` already
granted it.

## 4. Single-purpose / capture behavior audit

Traced through `extension/src/background.ts`, `popup.ts`, and
`page-collector.ts`: capture begins in exactly one place — a toolbar click
opens the popup, which asks Chrome to run the collector once in the active
tab (`extension/src/popup.ts`, `readActivePage`). There is:

- no `alarms`, no timer, no polling;
- no listener on `chrome.tabs.onUpdated`/`onActivated`/navigation events;
- no content script (`manifest.test.ts` asserts `content_scripts` is
  undefined), so nothing runs on a page before the student opens the popup
  on it;
- no state carried between captures — closing the popup ends the
  extension's interest in that page (`docs/browser-capture.md`, "Explicit
  invocation");
- nothing resembling job discovery, auto-apply, submission detection,
  resume matching, or classification anywhere in `extension/src/*.ts`.

This matches the stated single purpose exactly: on an explicit user action,
send the known facts about the currently-viewed posting to that user's own
Interndex account. No change was needed here.

## 5. Web Store security review

- **No remotely hosted or dynamically fetched code.** `extension/` is
  compiled by `tsc` alone (`extension/tsconfig.json`) into local ES modules
  under `dist/`. `popup.html` loads `dist/popup.js` as a local `<script
  type="module">`. There is no CDN `<script src>`, no `importScripts` of a
  remote URL, no `fetch`-then-`eval` pattern anywhere.
- **No `eval` or `new Function`** — confirmed absent by search across
  `extension/src/*.ts`.
- **No unsafe HTML injection.** `extension/src/html-text.ts` converts
  posting HTML to plain text with string handling only — no `innerHTML`
  assignment, no `DOMParser`, no element built from page content. The one
  `innerHTML` reference in the codebase (`page-collector.ts`, `markupOf`)
  is a **read** of an existing element's markup for the text converter to
  process, not a write; nothing is ever assigned to `innerHTML`.
- **No secrets in the package.** `extension/src/config.ts` holds only
  values that are public by construction (the whole point of PKCE instead
  of a client secret); `manifest.test.ts` asserts the source never matches
  `client_secret|service_role|sb_secret|SUPABASE_SERVICE`, and the
  packaging script (§11) re-checks the same patterns against the actual
  compiled output that ships.
- **No console logging of sensitive values.** `extension/src/background.ts`
  and `auth.ts` explicitly avoid logging thrown errors that could carry a
  token, code, or verifier (see the comments in `requestToken` and the
  `onMessage` handler) — confirmed by reading every `catch` block on the
  authenticated paths; none logs its caught error.
- **No `.env`, test credentials, or build artifacts in the package.** The
  packaging script assembles the ZIP from an explicit allow-list
  (`manifest.json`, `popup.html`, `popup.css`, `icons/`, `dist/`) rather
  than copying the extension directory wholesale, so `tests/`,
  `tsconfig*.json`, `vitest.config.ts`, and anything else in `extension/`
  cannot end up in the ZIP by omission.
- **No source maps.** `extension/tsconfig.json` sets `"sourceMap": false`.
- **CSP / manifest scope.** No custom `content_security_policy` is declared
  (MV3's strict default applies), no `content_scripts`, no
  `web_accessible_resources`, no `externally_connectable`.

Ordinary HTTPS calls to the configured Interndex origin and Supabase
project (data, not code) are not remote code and are not a Web Store policy
concern; see §9F for the exact remote-code declaration.

## 6. Least-privilege / OAuth-grant security review

Full analysis: `docs/browser-capture.md`, "Chrome Web Store release review
(this review)" (new section added by this PR, under "Trust and
authentication boundaries").

Summary of the conclusion, restated here because it is a release-gating
decision:

- The extension already uses Authorization Code + PKCE (`S256` only), an
  unpredictable 32-byte `state`, state verified before any callback data is
  trusted, no client secret, no token logging, full token-response
  validation before storage, and refresh-token rotation handling
  (`extension/src/auth.ts`, `extension/src/pkce.ts`). No defect was found;
  none of this was changed.
- A trustworthy, cryptographically-verified signal to distinguish the
  extension's grant **does exist**: Supabase's OAuth 2.1 authorization
  server embeds `client_id` as a JWT claim on tokens issued through it,
  which Postgres validates via the JWT signature before any RLS policy
  reads `auth.jwt() ->> 'client_id'` — this is not a caller-supplied value
  and not something a stolen token can rewrite.
- It is **not implemented in this PR**. Writing and shipping a
  `client_id`-aware RLS policy requires (a) the extension's real,
  registered `client_id`, which does not exist until §2 completes, and (b)
  verification against a real Postgres instance via the pgTAP suite, which
  this session cannot run (Docker unavailable — see §12). Shipping an RLS
  change of this sensitivity unverified risks breaking access for every
  user, not just narrowing the extension's — a materially worse outcome
  than the current, bounded residual risk.
- **What is bounded regardless:** cross-user isolation is absolute (RLS
  authorizes strictly by `auth.uid()`); there is no service-role key or
  elevated path reachable from any bearer token. A compromised extension
  grant reaches only that one user's own data, at the same ceiling an
  ordinary authenticated web session already has.
- **What changes with public distribution:** exposure, not blast radius.
  More installs mean more opportunities for a tampered build or a stolen
  `chrome.storage.local` refresh token, but the ceiling per compromised
  grant is unchanged.

**This review's recommendation: accept the residual risk for this release**
and track the `client_id`-aware RLS design (sketched in
`docs/browser-capture.md`) as a follow-up implemented and pgTAP-verified
against a real Postgres project before it ships. This is called out
explicitly as a human decision in §14 — it is not this review's call to
make silently.

## 7. Privacy / data-flow audit

Traced field by field through `page → extension → local storage →
Interndex/Supabase`:

| Data | Read from | Held locally | Sent to | Purpose |
| --- | --- | --- | --- | --- |
| Current page URL | `chrome.tabs.query` (activeTab-scoped) | Not persisted — held only for the duration of one capture in memory | Interndex, as `job_url` on the capture record | Deduplication and the "Open application" link; never sent to Supabase directly |
| Page/posting content | JSON-LD, microdata, allowlisted `<meta>`, `h1`, `document.title`, and (LinkedIn/Indeed/Workday only) a fixed set of selectors — `extension/src/page-collector.ts` | Not persisted — processed in memory for one extraction | Not sent as raw content; only the structured fields extracted from it are sent | Deriving the fields below; the page's full HTML/text is never transmitted |
| Extracted job title/company/location/description/etc. | `extension/src/extractor.ts` | Held in the popup's in-memory form state until submit or the popup closes | Interndex, via `POST /api/browser-capture` | The capture record itself |
| Access token | Supabase token endpoint | `chrome.storage.session` (memory-backed, cleared on browser close) | Interndex, as a `Bearer` header; Supabase, at token exchange/refresh | Authenticating the capture request |
| Refresh token | Supabase token endpoint | `chrome.storage.local` (on disk, unencrypted by Chrome — documented trade-off) | Supabase only, to obtain a new access token | Avoiding a re-login every browser session |
| Interndex account identity | Resolved server-side from the access token (`auth.uid()`) | Not held by the extension at all — it never receives or stores a user ID | N/A (server-side only) | Row ownership |
| Analytics/telemetry | None. No analytics SDK, no error-monitoring SDK, and no network destination other than the two host-permission origins exists anywhere in `extension/src/*.ts`. | — | — | — |

Verified against the actual code, not asserted:

- **HTTPS only.** `authorizationEndpoint`, `tokenEndpoint`, and
  `captureEndpoint` are all built from `EXTENSION_CONFIG` origins, which are
  validated Supabase/Interndex URLs; nothing in the extension constructs an
  `http://` request. (Chrome Web Store review will additionally see this
  from `host_permissions`, which only ever list `https://` origins.)
- **No sale, no advertising use.** No code path exists that could send
  captured data anywhere other than the two configured origins — there is
  no third network destination in the source at all.
- **No undisclosed third party.** The only two destinations the extension
  can reach are the ones in `host_permissions`: Interndex and Supabase.

## 8. Privacy policy

`app/privacy/page.tsx` (route: `/privacy`) already exists, predates this
PR, and was updated by this PR to:

- describe the extension across both a Chrome Web Store install and an
  unpacked developer build, rather than assuming only the latter;
- add an explicit statement that all extension traffic is HTTPS-only and
  that captured data is not shared with any third party;
- add a "Managing your data" section explaining that Settings, not the
  extension's own disconnect button, is the source of truth for revoking
  access, matching `extension/src/auth.ts`'s own documented behavior
  exactly (disconnecting locally does not revoke the server-side grant).

This is a factual product page, not a legal document, and this review did
not fabricate anything it does not cover:

- **No company legal entity, registered address, or compliance
  certification is stated**, because none was found anywhere in this
  repository. If the Chrome Web Store dashboard's privacy fields ask for
  one, that is a decision for you, not this review.
- **No data-retention period is stated**, because none exists in the
  product today (records persist until the user deletes them; there is no
  automatic expiry).
- **No support email is referenced**, because none exists in the codebase —
  see §9G and §10's checklist. The Chrome Web Store Developer Dashboard
  requires a privacy-policy URL and, separately, will want a support
  contact; the second one is not something this review can create without
  guessing an address that may not exist or may not be monitored.

**Stable URL for the Chrome Web Store dashboard's Privacy Policy field:**
`<production-jobtrack-origin>/privacy` — i.e. this route, once
`NEXT_PUBLIC_SITE_URL`/the production deployment is live at its real
domain. This is already linked from the public footer on every page.

## 9. Chrome Web Store listing copy

### A. Single purpose

> Interndex Capture saves the job or internship posting you are currently
> viewing into your own Interndex account, only when you click the
> extension's button. It does not browse, search, or apply on your behalf.

### B. Short description (≤132 characters for the Store's summary field)

> Save the job posting you're viewing straight into your Interndex tracker, one click at a time.

(96 characters — leaves headroom if Interndex's naming changes.)

### C. Full listing description

> **Interndex Capture — save postings to your tracker without retyping them.**
>
> Interndex Capture is a one-button companion to Interndex, built for
> students tracking internship and co-op applications. Open a job posting,
> click the toolbar icon, and Interndex Capture reads the posting's own
> published details — company, title, location, description, and (where the
> posting states them) salary, deadline, work arrangement, term, and
> duration — into a short confirmation you can edit before saving.
>
> Nothing is saved until you review it and press "Track job." Interndex
> Capture does not run in the background, does not watch your browsing, and
> does not decide anything on your behalf: it reads the one page you opened
> it on, at the moment you opened it, and nothing else.
>
> **What it does:**
> - Reads the currently open job posting's own published details.
> - Shows you exactly what it found before saving anything.
> - Saves the confirmed posting to your own Interndex account.
> - Flags a duplicate if you've already tracked that exact posting.
>
> **What it deliberately does not do:**
> - It does not browse or search for jobs on your behalf.
> - It does not fill out or submit applications.
> - It does not run in the background or monitor your browsing history.
> - It does not use AI to classify postings, match your resume, or write
>   anything for you.
> - It does not sell your data or use it for advertising.
>
> Interndex Capture currently reads structured job-posting data on any
> site, plus dedicated support for LinkedIn, Indeed, and Workday-hosted
> career sites. On a site it cannot read confidently, the confirmation
> screen simply opens blank for you to fill in — it never guesses.
>
> Requires a free Interndex account. Connect it once from the extension;
> disconnect any time from Interndex Settings.

### D. Permission justifications (for the Store's permission-justification fields)

- **`activeTab`** — "Reads the job posting on the tab you're currently
  viewing, only after you click the extension icon. This replaces the need
  for standing access to every job site."
- **`scripting`** — "Runs the posting reader in the current tab once, at
  the moment you click the icon, to extract the posting's own published
  details."
- **`storage`** — "Keeps you signed in to your Interndex account between
  uses, so you don't have to reconnect every time you open the extension."
- **`identity`** — "Used for Interndex's sign-in flow (OAuth), so the
  extension can save postings to your own account."
- **Host permission: your production Interndex origin** — "The extension
  sends the posting you confirm to your own Interndex account at this
  address."
- **Host permission: your Supabase project origin** — "Interndex's
  authentication provider; used only to sign you in and refresh your
  session."

### E. Data-use / privacy declaration guidance

Based on the audit in §7, these Chrome Web Store data-use categories
appear applicable — confirm final wording against the current Chrome Web
Store Developer Program Policy data-disclosure form at submission time,
since the dashboard's exact category list can change:

- **Personally identifiable information** — applicable. The extension
  authenticates as a specific Interndex account (email/account identity is
  never read or stored by the extension itself, but the OAuth connection
  ties activity to one account).
- **Web history** — **not applicable**, and should not be checked. The
  extension does not read or transmit browsing history; it reads only the
  single page open when the button is clicked, and keeps no record of
  prior pages.
- **User activity** — arguably applicable narrowly (the single click that
  triggers a capture is the only "activity" involved); there is no
  activity tracking beyond that single, user-initiated action.
- **Website content** — applicable. The posting's own published content on
  the currently open page is read to populate the confirmation form.
- **Authentication information** — applicable. OAuth access/refresh tokens
  are stored locally to keep the user signed in to their own Interndex
  account.

Declare, per §7 and §5: data is **not sold**; data is **not used for
purposes unrelated to the extension's core function**; all data is
transmitted over **HTTPS** only; there is **no** third-party analytics or
advertising SDK of any kind in the package.

### F. Remote-code declaration

**Factual answer, after auditing the built package (§5, §11): No.** The
extension executes no remotely hosted or dynamically fetched JavaScript.
All executable code (`dist/*.js`) is compiled locally by `tsc` and shipped
inside the package. Network requests the extension makes (to Interndex and
Supabase) exchange data (JSON), never executable code, and nothing in the
codebase fetches a script or evaluates a string as code.

### G. Reviewer test instructions

> 1. Load the unpacked build (or the uploaded package, if testing that
>    directly) and pin the toolbar icon.
> 2. Click the Interndex Capture icon. You'll see a "Connect Interndex"
>    screen.
> 3. Click "Connect Interndex" and sign in with the test account provided
>    separately (see note below) — this opens a standard OAuth consent
>    screen; approve it.
> 4. Open a public job posting — for example, a LinkedIn `/jobs/view/`
>    posting, an Indeed posting, or a Workday-hosted careers page — and
>    click the Interndex Capture icon again.
> 5. The popup should show the posting's company, title, and location
>    pre-filled (may be blank on an unsupported page — that is expected
>    behavior, not a bug).
> 6. Click "Track job." You should see a confirmation with a link to the
>    saved application in Interndex.
> 7. Sign in to the provided Interndex test account in a browser tab and
>    confirm the application now appears in the tracker.
>
> **Test account:** provide disposable reviewer credentials through the
> Chrome Web Store dashboard's own reviewer-notes mechanism at submission
> time. Do not commit a password to this repository, and do not reuse a
> real student's account.

### H. Store assets checklist — what you still need to provide manually

- [ ] Screenshots (Chrome Web Store currently requires at least one,
      1280×800 or 640×400) — capture the popup in its "ready" state after a
      successful extraction, and optionally the "Connect Interndex" and
      "saved" states.
- [ ] Small promo tile / promotional imagery, if you want one (optional,
      not required for a first submission).
- [ ] Icon verification — `extension/icons/icon-128.png` (128×128, RGBA)
      already exists and is wired into `manifest.json`; confirmed present
      and correctly sized in this review. No action needed unless you want
      a different icon design.
- [ ] Privacy policy URL — `<production-origin>/privacy` (§8); confirm the
      production origin is live before pasting this into the dashboard.
- [ ] Support URL or email — **not currently present anywhere in this
      codebase.** Decide on one (a support page, a monitored mailbox, or a
      GitHub issues link) before submission; the Store listing has a field
      for it and reviewers may expect it for an extension handling
      authentication data.
- [ ] Category — likely "Productivity," but this is a listing decision, not
      a code fact this review can settle.
- [ ] Distribution visibility and countries — a business decision (public
      vs. unlisted vs. private, and which countries) with no code
      dependency.
- [ ] Developer account — confirm a Chrome Web Store developer account
      (one-time registration fee, if not already registered) exists under
      the account that should own this listing.
- [ ] Any additional current dashboard fields (e.g. the "Purpose" dropdown
      accompanying each declared data-use category) — fill these from §9E's
      audit, but the dashboard's exact current field set should be checked
      against `developer.chrome.com`/Chrome Web Store documentation at
      submission time, since Google has changed this form before.

## 10. Manifest / version / icon review

- Manifest V3, correct (`manifest_version: 3`).
- `minimum_chrome_version: "116"` — reasonable for the MV3 features used
  (module service workers, `chrome.scripting.executeScript` with a
  function argument); not changed in this review, no evidence it is wrong.
- `version: "0.1.0"` — **left unchanged.** This is a valid first Chrome Web
  Store submission version (semver-ish major.minor.patch is fine for
  Chrome's four-integer-max scheme). It does not need a bump for this
  release-readiness pass.
- **The one-time bootstrap package (§2, step A) is a separate, throwaway
  artifact, not a Store release.** It is versioned `0.0.0.1` — deliberately
  lower than `0.1.0` and outside the normal `major.minor.patch` shape a real
  release would use, so it cannot be confused for one in the dashboard's
  version history. It is generated manually to `~/Downloads`, is never
  built by `npm run extension:package`, and is never submitted for review.
  Because `0.1.0 > 0.0.0.1`, uploading the real source's `0.1.0` package to
  replace the bootstrap upload in the same draft item (§2, step P) is
  already a strictly higher version — no arbitrary bump is needed just to
  make that replacement valid.
- **After the real `0.1.0` package is uploaded to the Store draft**, every
  subsequent upload to that item must strictly increase the version number
  — Chrome rejects a re-upload at the same or a lower version. Bump it
  (`0.1.1`, `0.2.0`, etc.) only when you actually rebuild after that first
  real upload, not before, and never for the bootstrap package, which stays
  at `0.0.0.1` and is only ever uploaded once.
- `description` — accurate and unchanged: "Save the job posting you are
  viewing into your own Interndex account."
- Icons — all four declared sizes (16/32/48/128) exist and are correctly
  sized PNGs (verified in this review with `file`, see §5 for the full
  security pass). No broken or missing icon reference.
- `background.service_worker` — `dist/background.js`, `"type": "module"`,
  matching the actual build output path.
- `action.default_popup` — `popup.html`, matching the actual file.

No manifest field was changed in this review beyond what §1/§2 will require
once production values are known: the `host_permissions` substitution, and
(per §2's corrected sequence) adding the Store item's public key as a
top-level `"key"` field once it exists. Neither has been done here, since
neither value exists yet.

## 11. Release build / ZIP

Added `extension/scripts/package.mjs`, wired to `npm run extension:package`
(runs `extension:build` first). This is a small, dependency-free script —
no bundler, no release framework — that:

1. Refuses to run if `extension/dist` is missing (forces a fresh build).
2. Scans the manifest and every compiled `dist/*.js` file for the three
   placeholder strings named in §1 and for secret-shaped patterns
   (`client_secret`, `service_role`, `sb_secret`, `SUPABASE_SERVICE`),
   aborting with a clear message if either is found.
3. Re-derives the two required host-permission origins from the compiled
   `dist/config.js` and fails if `manifest.json`'s `host_permissions`
   disagree.
4. Fails if any host permission is `<all_urls>` or a wildcard host pattern.
5. Assembles exactly the runtime files — `manifest.json`, `popup.html`,
   `popup.css`, `icons/`, `dist/` — into a temporary staging directory (not
   the whole `extension/` tree, so `tests/`, `tsconfig*.json`, and
   `vitest.config.ts` cannot end up in the package by omission) and zips
   that directory with `manifest.json` at the root.
6. Reports the output path, manifest version, size, SHA-256 checksum, and
   full file listing.

**Verified in this review**, using a disposable, non-production,
fixture-shaped configuration (not committed, reverted immediately after):
the script builds, its placeholder/secret/host-permission guards all fire
correctly, and the resulting ZIP contained exactly:

```
manifest.json
popup.html
popup.css
icons/icon-16.png
icons/icon-32.png
icons/icon-48.png
icons/icon-128.png
dist/*.js  (18 compiled modules, no .map files, no .ts sources)
```

28 files, ~246 KB uncompressed, well under the Web Store's size limits.

**Against the actual repository as committed right now** (still carrying
placeholder config), running `npm run extension:package` correctly refuses
to build, exactly as intended — see the test added at
`extension/tests/package-script.test.ts`, which asserts this refusal as a
regression check so it cannot silently start succeeding with a placeholder
config in place.

**The real production ZIP cannot be produced by this review** because §1's
values are not available here. Once you have them: fill in
`extension/src/config.ts` and `extension/manifest.json`'s
`host_permissions`, then run `npm run extension:package`, and treat that
exact ZIP as the one to upload — not a hand-built one.

## 12. Automated verification results

Run in this session, on the unmodified-except-for-this-PR repository:

| Gate | Command | Result |
| --- | --- | --- |
| Extension typecheck | `npm run extension:typecheck` | **PASS** |
| Extension unit tests | `npm run extension:test` | **PASS** — 400 tests (399 pre-existing + 1 new packaging-guard regression test), 12 files |
| Extension build | `npm run extension:build` | **PASS** |
| Extension aggregate gate | `npm run extension:check` | **PASS** |
| Manifest/config agreement test | `extension/tests/manifest.test.ts` (part of the above) | **PASS** |
| Privacy page unit tests | `npx vitest run tests/unit/privacy-page.test.tsx` | **PASS** — 5 tests, updated for this PR's copy changes |
| Packaging placeholder guard | `extension/tests/package-script.test.ts` (new) | **PASS** |
| Full app gate | `npm run check` (lint, typecheck, unit tests, Next.js build, extension:check) | Run at the end of this PR — see final commit for output |
| pgTAP RLS suite | `npm run test:db` | **BLOCKED / NOT RUN** — requires Docker, unavailable in this session and in the repository owner's own environment (consistent with every prior audit of this repository) |
| Credentialed Playwright E2E | `npm run test:e2e` | **NOT RUN** in this session — requires a live Supabase project and real credentials, same limitation as every prior audit |

No server/RLS code was changed in this PR (§6's decision was to document,
not implement, the least-privilege change), so no expanded database gate
was required.

**§2's correction (the bootstrap-ID sequencing fix) changed no executable
code** — `extension/scripts/package.mjs` (`npm run extension:package`) is
unmodified and remains the only production packager, no manifest or
`config.ts` value changed, and no test was added or altered. The results
above, recorded before that correction, still stand; the full suite was not
rerun for a documentation-only change.

## 13. Manual QA — the exact production build

This cannot be executed from this session: it requires a real Chrome
browser, a real Interndex account, and the finished production package
from §1/§2/§11. What follows is the exact checklist to run once you have
that package — none of it is marked PASS here, because none of it has been
run against the described production build.

**Never QA the bootstrap package.** The `0.0.0.1` `BOOTSTRAP ONLY — DO NOT
SUBMIT` package from §2 step A has no OAuth configuration, no permissions,
and no runtime code — there is nothing in it to test, and connecting it to
anything is not meaningful. QA only the exact `0.1.0` production ZIP §2
step L produces.

**Gate zero, before any OAuth testing: confirm the extension ID.** Because
the production `manifest.json` now carries the Store item's public key as
its top-level `"key"` field (§2 step E), loading the real build unpacked
must show the *same* extension ID as the Store draft item (§2 steps F and
N). Check this first, every time you load a rebuilt package for QA. If the
ID differs from the Store item ID, **stop before testing OAuth at all** —
the redirect URI registered with Supabase (§2 step H) is
`https://<store-item-id>.chromiumapp.org/`, and a build with a different ID
generates a different redirect URI that Supabase will not recognize; every
connect attempt will fail at the redirect step regardless of anything else
being correctly configured.

Representative sites are the ones this repository's extractor and tests
actually cover (`extension/src/sites.ts`, `docs/browser-capture.md`'s
"Real-site compatibility" section) — LinkedIn, Indeed, and a Workday-hosted
careers page — plus one JSON-LD-only generic site if you have one handy,
since that path is real and tested but not one of the three named
adapters.

- [ ] **Clean install.** Load the exact production ZIP from §11 (via "Load
      unpacked" on its extracted contents, or via the Store's own install
      once uploaded) into a fresh Chrome profile with no prior extension
      state.
- [ ] **Disconnected state.** Click the icon with no prior connection;
      confirm it shows "Connect Interndex" and nothing else.
- [ ] **OAuth connect.** Click "Connect Interndex"; confirm the consent
      screen shows the real production Interndex/Supabase domain (not
      `jobtrack.example.com` or `your-project-ref.supabase.co` anywhere in
      the URL bar during the flow), sign in, approve, and confirm the popup
      returns to a ready/extracting state.
- [ ] **OAuth cancel.** Start "Connect Interndex," close the OAuth window
      without completing it; confirm the popup returns to "Connect
      Interndex" with no error implying something went wrong.
- [ ] **OAuth deny.** Start "Connect Interndex," explicitly deny consent on
      the Supabase screen; confirm the popup shows a clear
      denied/not-connected state, not a silent failure.
- [ ] **Successful authenticated state.** After connecting, open a
      supported posting and confirm the popup reaches the "ready" state
      with fields populated.
- [ ] **Explicit capture — LinkedIn.** Open a `/jobs/view/<id>` posting;
      capture; verify company, title, location, and description in the
      confirmation and in Interndex afterward.
- [ ] **Explicit capture — LinkedIn search result.** Select a job inside
      `/jobs/search-results/?currentJobId=…`; capture; verify the same
      fields, and specifically that it is the *selected* job's fields, not
      whichever job the list started on.
- [ ] **Explicit capture — LinkedIn Similar Jobs.** From a posting's
      "Similar Jobs" panel, select a different posting without reloading;
      capture; verify the saved record is the newly selected posting, not
      the one you navigated from (`docs/browser-capture.md` flags this as
      previously wrong and corrected but not yet retested live).
- [ ] **Explicit capture — Indeed.** Open a posting; capture; verify
      company, title, location, description, and that `source` reads
      "Indeed."
- [ ] **Explicit capture — Workday.** Open a tenant posting; capture;
      verify title/location/description populate and that neither `source`
      nor `company_domain` is ever set to the Workday tenant/hostname.
- [ ] **Verify in Interndex.** For each capture above, confirm the resulting
      application actually appears in the production Interndex account
      (not just that the popup reported success) with the expected fields.
- [ ] **Duplicate / same-URL behavior.** Capture the same posting twice;
      confirm the second attempt reports "already tracked" with a link to
      the existing record, and does not create a second row.
- [ ] **Unsupported / non-job page.** Open a page with no job-posting
      signal (e.g. a news article); open the popup; confirm it either shows
      blank editable fields (not a fabricated title) or a clear "cannot
      read this page" state — never a wrong guess.
- [ ] **Popup close/reopen.** Open the popup mid-extraction, close it,
      reopen it on the same page; confirm no stuck "extracting" state and
      no duplicate submission.
- [ ] **Browser restart / session persistence.** Restart Chrome after
      connecting; open the popup; confirm it is still connected (refresh
      token in `chrome.storage.local` survived) without asking to
      reconnect.
- [ ] **Access-token refresh.** If practical, wait for/force an access-token
      expiry (or inspect that a refresh occurs on the next capture after
      expiry) and confirm a capture still succeeds via the one
      refresh-and-retry in `background.ts`.
- [ ] **Disconnect.** Click "Sign out" in the popup; confirm the popup
      returns to "Connect Interndex" and a subsequent capture attempt
      requires reconnecting.
- [ ] **Reconnect.** Reconnect after disconnecting; confirm a normal
      capture succeeds again.
- [ ] **Revoke from Interndex Settings.** With the extension still
      "connected" locally, revoke its grant from Interndex Settings
      (`revokeGrantAction`); confirm the extension's next capture attempt
      is rejected as unauthorized and it prompts to reconnect — i.e. that
      server-side revocation actually takes effect, not just the local
      disconnect button.
- [ ] **No capture without explicit action.** With the extension connected,
      browse several job postings without opening the popup; confirm
      nothing appears in Interndex from that browsing alone.
- [ ] **No unexpected console errors/network calls.** With DevTools open on
      the background service worker and the popup, run through the above
      and confirm no errors are logged and no network request goes to any
      destination other than the two configured origins.

## 14. Chrome Web Store draft workflow

Based on Chrome's current documented mechanism for resolving the OAuth
extension-ID chicken-and-egg problem (§2; verify against
`developer.chrome.com`'s Chrome Web Store documentation at submission time,
since Google revises this dashboard periodically):

1. Confirm/create the Chrome Web Store developer account (one-time
   registration) if not already done.
2. Generate the inert `0.0.0.1` bootstrap ZIP (§2, step A) and upload it to
   a **new** dashboard item, **Save Draft only** — do not submit it for
   review (§2, steps A–B).
3. Record the item's permanent ID and copy its public key from the Package
   tab (§2, steps C–D).
4. Add that public key to the real, production `extension/manifest.json` as
   the top-level `"key"` field, load the extension unpacked, and confirm
   its ID now matches the Store item ID (§2, steps E–F).
5. Derive the redirect URI from that ID and register the dedicated
   Interndex Capture OAuth client in production Supabase with it (§2, steps
   G–H).
6. Put the real production `jobtrackOrigin`, `supabaseUrl`, and
   `oauthClientId` into `extension/src/config.ts`, update
   `host_permissions` to match, and run `npm run extension:check` and
   `npm run extension:package` to produce the real `0.1.0` release ZIP (§2,
   steps I–L).
7. Extract that exact ZIP, Load Unpacked, and re-confirm the extension ID
   still matches the Store item ID before doing anything else (§2, steps
   M–N; §13's "Gate zero").
8. Run the full manual QA in §13 against that exact build (§2, step O).
9. Only after QA passes, upload the real `0.1.0` package to the **same**
   draft item, replacing the `0.0.0.1` bootstrap upload (§2, step P).
10. Fill in Store Listing (§9A–C), icon (already present), and screenshots
    (§9H — you provide).
11. Fill in Privacy practices / data disclosure using §9E and the privacy
    policy URL from §8.
12. Add reviewer test instructions (§9G) and, separately in the dashboard's
    own credential mechanism, disposable reviewer test-account credentials —
    never in this repository.
13. Configure Distribution (visibility, countries — §9H, your decision).
14. Submit for review. Use Chrome's deferred/staged publication option (if
    still offered on your dashboard at submission time) so an approved
    listing does not go instantly public — this lets you install and
    verify the actual Store-distributed build first.
15. Once approved, install the real Store-distributed build (not the local
    unpacked one) on a clean profile and re-run the OAuth and capture
    checks from §13 against it specifically, including the extension-ID
    check — the Store's own packaging step is a difference from your local
    ZIP worth re-verifying.
16. Only then, publish.

This review does not perform any of these steps. Nothing has been uploaded
or submitted.

## 15. Scope control — what this review did not touch

Out of scope and not changed: new job-site extractors, AI features,
auto-apply, background monitoring, popup redesign, analytics, new
application-status features, homepage/dashboard work, dependency upgrades,
or any architectural rewrite. The `client_id`-aware RLS design in §6 is
described, not implemented, for exactly this reason plus the inability to
verify it here — see §6 for the full reasoning.

## 16. Recommendation

**CONDITIONAL GO.**

Everything code-level that does not require a production value or a live
browser/OAuth/Postgres environment is complete: permission audit, single-
purpose audit, Web Store security review, privacy/data-flow audit, privacy
policy update, listing copy, packaging tooling with a placeholder/secret
guard, and the least-privilege decision (documented, risk accepted,
explicitly flagged for your sign-off rather than assumed).

Conditions that must be satisfied before actual submission:

1. §2 steps A–E are done (Store item ID `llggmpgoichadgcolincmjcfkljpboad`,
   public key committed as `manifest.json`'s `"key"`). **Next: step F** —
   load the extension unpacked and confirm its ID actually matches before
   doing anything else. Only after that confirmation, proceed to step G
   (derive the redirect URI), register the dedicated OAuth client (step H),
   supply the three production values in §1, and complete steps I–L to
   rebuild and repackage.
2. Decide on §6's residual risk: accept it for this release (this review's
   recommendation) or require the `client_id`-aware RLS follow-up first.
3. Confirm the extension-ID match ("Gate zero" in §13) before running the
   rest of the manual QA in §13 against the real rebuilt package, and
   record the results.
4. Resolve §9H's open items (screenshots, support contact, category,
   distribution settings, developer account).
5. Run the full `npm run check` gate one more time against the final
   commit before upload.

None of these are code defects — they are the parts of a release that
cannot be settled by reading and testing source code alone.
