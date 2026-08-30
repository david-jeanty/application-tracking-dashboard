# Chrome Web Store release — Interndex Capture

Status as of this revision — three tracks, tracked separately because they
are genuinely different kinds of "done":

- **CODE / PACKAGING: READY.** Production configuration is substituted, the
  extension gate is green, and the real `0.1.0` release ZIP is built and
  inspected. See §1, §11 (release build), and §12 (automated verification).
- **MANUAL PRODUCTION QA: STILL REQUIRED.** Nobody has loaded the actual
  release ZIP in a real Chrome browser or exercised OAuth/capture against
  the live production Interndex/Supabase project yet. See §13 — nothing
  there is marked PASS.
- **CHROME WEB STORE SUBMISSION: STILL NOT DONE.** The bootstrap draft item
  exists, but the real `0.1.0` package has not been uploaded to it, nothing
  has been submitted for review, and nothing is published. See §14.

Not submitted to, or approved by, the Chrome Web Store. See
"Recommendation" (§16) for the full GO/CONDITIONAL GO/NO-GO reasoning.

This document is the release package for taking Interndex Capture from a
locally loadable unpacked extension to a Chrome Web Store submission. It
does not replace `docs/browser-capture.md`, which remains the architecture
and threat-model source of truth; this document is the release-specific
checklist, listing copy, and manual verification plan built on top of it.

**Revision note.** §2 was corrected against current official Chrome
documentation to replace a vaguer bootstrapping approach with Chrome's
actual documented mechanism (an inert one-time upload to obtain the Store
item's public key, added to the real manifest as `"key"`). That was a
documentation-only correction: no OAuth implementation, permission,
extractor, UI, packaging-script, or database code changed as part of it.

**Progress note.** All of §2's bootstrap/config steps (A through L) are now
complete: the bootstrap draft item exists, its permanent Store item ID and
public key were obtained and pinned into `extension/manifest.json`, a local
unpacked load was manually confirmed to produce that exact ID, the
dedicated Supabase OAuth client is registered against the confirmed
redirect URI, the three production values are substituted into
`extension/src/config.ts`, and the real `0.1.0` release ZIP is built. Steps
M onward — extracting that exact ZIP, reconfirming its extension ID, and
running the full manual QA in §13 — are next and have not been done yet.
Nothing has been uploaded to the Chrome Web Store draft item beyond the
original bootstrap package. See §2 and §13 for full detail.

## 1. Production configuration — CONFIRMED and substituted

All three values that were development placeholders in
`extension/src/config.ts` and the matching `host_permissions` in
`extension/manifest.json` are now confirmed and substituted:

| Value | Status | Confirmed production value |
| --- | --- | --- |
| `jobtrackOrigin` | **CONFIRMED** | `https://application-tracking-dashboard-wfgh.vercel.app` |
| `supabaseUrl` | **CONFIRMED** | `https://jbkrwbofrctithcjevxy.supabase.co` |
| `oauthClientId` | **CONFIRMED** | `461d1918-6343-447b-80f8-73f22e75b34d` (dedicated public OAuth client registered for Interndex Capture specifically — not the MCP client) |

These were supplied directly rather than guessed or invented — this session
never had, and still does not have, access to the live Vercel deployment,
the production Supabase project, or its Dashboard. `extension/manifest.json`'s
`host_permissions` were updated to match exactly:

```
https://application-tracking-dashboard-wfgh.vercel.app/*
https://jbkrwbofrctithcjevxy.supabase.co/*
```

No trailing slash on either origin, matching the existing architecture
(`EXTENSION_CONFIG` values are always passed through `.replace(/\/$/, "")`
or `new URL(...).origin` before use, so a trailing slash was never required
and would only be redundant).

**Production config substitution: COMPLETE.** The packaging script added
earlier in this PR (`extension/scripts/package.mjs`, wired to
`npm run extension:package`) no longer refuses to build — see §11 for the
real release ZIP this produced, inspected for exactly these values and
nothing else.

Everything else in this document — the permission audit, the OAuth security
review, the least-privilege decision, the privacy review, and the listing
copy — never depended on knowing these values and was already complete.

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
| E. Add the public key to `extension/manifest.json` as `"key"` | **Done** |
| F. Load unpacked and confirm the ID matches | **Done** — manually confirmed: Load Unpacked produced exactly `llggmpgoichadgcolincmjcfkljpboad` |
| G. Derive the redirect URI | **Done** — `https://llggmpgoichadgcolincmjcfkljpboad.chromiumapp.org/`, confirmed rather than merely expected, since F passed |
| H. Register the dedicated OAuth client in production Supabase | **Done** — client id `461d1918-6343-447b-80f8-73f22e75b34d`, registered with the redirect URI above |
| I. Put production values into `extension/src/config.ts` | **Done** — see §1 |
| J. Update `manifest.json` `host_permissions` to match | **Done** — see §1 |
| K. Run `extension:check` then `extension:package` | **Done** — see §12, §11 |
| L. Inspect the real release ZIP | **Done** — see §11 |
| M. Extract the ZIP and Load Unpacked from *that* folder | **Not done — next action** |
| N. Reconfirm the extension ID from the extracted build | **Not done** |
| O. Run the full manual QA (§13) | **Not done — nothing in §13 is PASS yet** |
| P–Q. Upload the real package to the Store draft; fill listing; submit | **Not started**, intentionally, until O passes |

**Confirmed redirect URI (step G):** `https://llggmpgoichadgcolincmjcfkljpboad.chromiumapp.org/`
— registered against the dedicated Supabase OAuth client
`461d1918-6343-447b-80f8-73f22e75b34d` (step H). This is no longer merely
*expected*; step F's manual confirmation (Load Unpacked producing exactly
`llggmpgoichadgcolincmjcfkljpboad`) is what makes it safe to treat as
correct.

**A. Generate an inert bootstrap package — kept here for the record; already
done and now obsolete.** Its only purpose was to be *something* to upload
so the Web Store item and its public key would come into existence; it must
never be submitted for review or published, and now that the real `0.1.0`
package exists (§11), this bootstrap command should never be run again for
this item. The guard below already refuses once a real OAuth client id is
configured, which is now the case:

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

**F. Done.** The real extension was loaded unpacked (`chrome://extensions`
→ Developer mode → Load unpacked → `extension/`) and Chrome assigned it
exactly `llggmpgoichadgcolincmjcfkljpboad`, matching the Store item ID from
step C. The pinned `"key"` is confirmed to produce the right ID.

**G. Done.** Redirect URI derived and confirmed:
`https://llggmpgoichadgcolincmjcfkljpboad.chromiumapp.org/`.

**H. Done.** A **dedicated** OAuth client was registered in the production
Supabase project for Interndex Capture, with that redirect URI:
`461d1918-6343-447b-80f8-73f22e75b34d`. This is not the MCP client —
`docs/browser-capture.md` and `docs/mcp.md` are explicit that the two must
remain independently revocable grants with different consent copy.

**I. Done.** The real, public OAuth `client_id`, the production
`jobtrackOrigin`, and the production `supabaseUrl` are in
`extension/src/config.ts` — see §1 for the exact values.

**J. Done.** `extension/manifest.json`'s `host_permissions` were updated to
match exactly — `npm run extension:package` no longer refuses on this
check (`extension/tests/manifest.test.ts` also passes).

**K. Done.** Ran:

```bash
npm run extension:check
npm run extension:package
```

Both succeeded — see §12 for the full `extension:check` results and §11
for the packaging run.

**L. Done.** Inspected the real release ZIP from §11: version `0.1.0` (not
`0.0.0.1`), the Store public key present in its `manifest.json`, no
placeholder strings, no secret-shaped values, and `host_permissions`
matching the production origins exactly.

**M. Next action — not yet done.** Extract that exact ZIP and Load Unpacked
from the extracted folder — not from `extension/` directly, so what you
test is what §11 actually produced. Exact commands in §13.

**N. Not yet done.** Confirm its extension ID still equals
`llggmpgoichadgcolincmjcfkljpboad`. The `key` field is what guarantees
this; if it does not match, stop before any OAuth testing — the redirect
URI registered in step H will not match what this build generates, and
every connect attempt will fail at the redirect step.

**O. Not yet done.** Run the full manual production QA (§13) against that
exact build. Nothing in §13 is marked PASS.

**P. Not started.** Only after QA passes, upload the real `0.1.0` package
to the **same** Store draft item, replacing the bootstrap `0.0.0.1` upload.
Because `0.1.0 > 0.0.0.1`, this is accepted as a normal version increase —
no arbitrary version bump is needed to make the replacement valid.

**Q. Not started.** Only then fill in Store Listing, Privacy practices,
reviewer instructions, and Distribution (§9, §14), and submit for review.

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

**Earlier in this PR**, before production values existed, this was verified
with a disposable, non-production, fixture-shaped configuration (not
committed, reverted immediately after): the script built, its
placeholder/secret/host-permission guards all fired correctly on a
placeholder config, and it correctly refused to build against the
repository's placeholder config as committed at the time.

**Now built for real, with production configuration substituted (§1):**

```
$ npm run extension:package

Built /home/user/application-tracking-dashboard/extension/release/interndex-capture-v0.1.0.zip
  manifest version: 0.1.0
  size: 100196 bytes
  sha256: 4630c34ccb29129ccc94f1cd87ac5b64cee0750f9863be7d6f23d80420406b89
```

**File listing (28 zip entries — 26 files, 2 directory entries — ~246 KB
uncompressed):**

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

**Verified against the extracted contents of this exact ZIP:**

- `manifest.json` is at the ZIP root, and it contains: version `0.1.0`; the
  Store public key as `"key"` (unchanged, 392-character value, identical to
  the one pinned in an earlier commit of this PR); `host_permissions`
  exactly `https://application-tracking-dashboard-wfgh.vercel.app/*` and
  `https://jbkrwbofrctithcjevxy.supabase.co/*`; `permissions` unchanged
  (`activeTab`, `scripting`, `storage`, `identity`).
- `dist/config.js` (the compiled config that ships) contains the confirmed
  production `jobtrackOrigin`, `supabaseUrl`, and `oauthClientId`
  (`461d1918-6343-447b-80f8-73f22e75b34d`) — each appearing exactly once.
- No `jobtrack.example.com`, no `your-project-ref.supabase.co`, no
  `replace-with-the-extension-oauth-client-id`, and no `BOOTSTRAP` text
  anywhere in the archive.
- No `.env` files, no `*.map` source maps, no `*.ts` TypeScript source, no
  `tests/`, no `node_modules/`, no `tsconfig*.json`, no `vitest.config.ts`.
- No secret-shaped value (`client_secret`, `service_role`, `sb_secret`,
  `SUPABASE_SERVICE`) anywhere in the archive — grepped directly, not
  inferred.
- All executable code (`dist/*.js`) is local and compiled ahead of time;
  nothing is fetched or evaluated at runtime.
- Only the intended runtime files are present — the same explicit allow-list
  as before (`manifest.json`, `popup.html`, `popup.css`, `icons/`, `dist/`).

**This is the exact production release candidate.** Do not hand-build a
substitute ZIP for upload, and do not rebuild it again before QA — treat
this exact `extension/release/interndex-capture-v0.1.0.zip` (SHA-256 above)
as the one to extract for QA (§13) and, only after QA passes, upload to the
Store draft (§2 step P). The ZIP itself is not committed to this repository
(`.gitignore` excludes `/extension/release`). Its *contents* are fully
reproducible from this commit by running `npm run extension:package` again,
but the ZIP's own bytes are not guaranteed to match — `zip` embeds file
timestamps, so two builds from identical source produce different SHA-256
checksums even though every file inside is identical. The checksum above
identifies this specific build; use it to confirm you are extracting the
same archive for QA that this document describes, not to verify a fresh
rebuild against it.

## 12. Automated verification results

**Re-run after substituting production configuration** (§1) and pinning the
Store public key (an earlier commit in this PR):

| Gate | Command | Result |
| --- | --- | --- |
| Extension typecheck | `npm run extension:typecheck` | **PASS** |
| Extension unit tests | `npm run extension:test` | **PASS** — 400 tests, 12 files, run from a clean `extension/dist` |
| Extension build | `npm run extension:build` | **PASS** |
| Extension aggregate gate | `npm run extension:check` | **PASS** |
| Manifest/config agreement test | `extension/tests/manifest.test.ts` (part of the above) | **PASS** — confirms `host_permissions` matches `EXTENSION_CONFIG`'s two production origins exactly |
| Release packaging | `npm run extension:package` | **PASS — now succeeds**, producing the real `0.1.0` release ZIP (§11), where it previously refused on placeholder config |
| Privacy page unit tests | `npx vitest run tests/unit/privacy-page.test.tsx` | **PASS** — 5 tests |
| Packaging placeholder guard | `extension/tests/package-script.test.ts` | **PASS**, after a genuine fix (below) |
| pgTAP RLS suite | `npm run test:db` | **BLOCKED / NOT RUN** — requires Docker, unavailable in this session and in the repository owner's own environment (consistent with every prior audit of this repository); no RLS/server code changed in this step, so no expanded database gate was required |
| Credentialed Playwright E2E | `npm run test:e2e` | **NOT RUN** in this session — requires a live Supabase project and real credentials |

**Genuine regression found and fixed:** `extension/tests/package-script.test.ts`
was written when `extension/src/config.ts` always shipped with development
placeholder values, and asserted that `npm run extension:package` refuses
against whatever the repository currently contains. Now that real
production values are committed (§1), that assumption is false, and the
test failed for the right reason — the guard it exercises was never broken,
the test's premise about ambient repository state was. It was rewritten to
inject a known placeholder string directly into the compiled
`dist/config.js` (a gitignored build artifact, not tracked source), run the
script against that, assert the refusal, and restore the original content
immediately after — this makes the test verify the actual guard behavior
regardless of what `extension/src/config.ts` currently contains, which is a
correctness fix, not a weakening: it was previously passing for an
accidental reason (either the real refusal, or merely a missing `dist/`)
and now deterministically exercises the placeholder path every time
`extension/dist` exists. No assertion was loosened or removed.

`npm run check` (lint, typecheck, unit tests, Next.js build, extension:check)
was **not** re-run in full for this step: it requires a live Supabase
project's env vars to complete the Next.js build (unrelated to this
extension-only change — see this PR's second commit, where it was run once
against fixture env vars for that reason), and no web/server code changed
here. The extension-scoped gates above are what this change touches and
all are green.

## 13. Manual QA — the exact production build

This cannot be executed from this session: it requires a real Chrome
browser, a real Interndex account, and the finished production package
from §1/§2/§11. **The real `0.1.0` release ZIP is now built** (§11), but
nothing below has been run against it yet — none of it is marked PASS here.

**Exact commands to extract the real release ZIP and load it (do this
first, before anything else in this section):**

```bash
mkdir -p ~/interndex-capture-qa
rm -rf ~/interndex-capture-qa/*
unzip extension/release/interndex-capture-v0.1.0.zip -d ~/interndex-capture-qa
```

Then in Chrome:

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right), if not already on.
3. Click **Load unpacked** and select `~/interndex-capture-qa` — the
   *extracted* folder, not the repository's `extension/` directory and not
   the ZIP file itself.
4. On the loaded extension's card, confirm the **ID** reads exactly
   `llggmpgoichadgcolincmjcfkljpboad`. This must match before proceeding to
   anything else — see "Gate zero" below.
5. Only once that ID is confirmed, begin the production OAuth/capture QA
   checklist below.

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

1. **Done.** Chrome Web Store developer account confirmed.
2. **Done.** Generated the inert `0.0.0.1` bootstrap ZIP (§2, step A) and
   uploaded it to a **new** dashboard item, **Save Draft only** — not
   submitted for review (§2, steps A–B).
3. **Done.** Recorded the item's permanent ID
   (`llggmpgoichadgcolincmjcfkljpboad`) and copied its public key from the
   Package tab (§2, steps C–D).
4. **Done.** Added that public key to the real, production
   `extension/manifest.json` as the top-level `"key"` field, loaded the
   extension unpacked, and confirmed its ID matched the Store item ID (§2,
   steps E–F).
5. **Done.** Derived the redirect URI
   (`https://llggmpgoichadgcolincmjcfkljpboad.chromiumapp.org/`) and
   registered the dedicated Interndex Capture OAuth client
   (`461d1918-6343-447b-80f8-73f22e75b34d`) in production Supabase with it
   (§2, steps G–H).
6. **Done.** Put the real production `jobtrackOrigin`, `supabaseUrl`, and
   `oauthClientId` into `extension/src/config.ts`, updated
   `host_permissions` to match, and ran `npm run extension:check` and
   `npm run extension:package` to produce the real `0.1.0` release ZIP (§2,
   steps I–L; §11).
7. **Next action — not yet done.** Extract that exact ZIP, Load Unpacked,
   and re-confirm the extension ID still matches the Store item ID before
   doing anything else (§2, steps M–N; §13's exact commands and "Gate
   zero").
8. **Not yet done.** Run the full manual QA in §13 against that exact
   build (§2, step O).
9. **Not started.** Only after QA passes, upload the real `0.1.0` package
   to the **same** draft item, replacing the `0.0.0.1` bootstrap upload
   (§2, step P). **The bootstrap package is now obsolete: once this
   replacement happens, it must never be uploaded to this item again** —
   the item's real content is the `0.1.0` package from here on.
10. **Not started.** Fill in Store Listing (§9A–C), icon (already
    present), and screenshots (§9H — you provide).
11. **Not started.** Fill in Privacy practices / data disclosure using §9E
    and the privacy policy URL from §8.
12. **Not started.** Add reviewer test instructions (§9G) and, separately
    in the dashboard's own credential mechanism, disposable reviewer
    test-account credentials — never in this repository.
13. **Not started.** Configure Distribution (visibility, countries — §9H,
    your decision).
14. **Not started.** Submit for review. Use Chrome's deferred/staged
    publication option (if still offered on your dashboard at submission
    time) so an approved listing does not go instantly public — this lets
    you install and verify the actual Store-distributed build first.
15. **Not started.** Once approved, install the real Store-distributed
    build (not the local unpacked one) on a clean profile and re-run the
    OAuth and capture checks from §13 against it specifically, including
    the extension-ID check — the Store's own packaging step is a
    difference from your local ZIP worth re-verifying.
16. **Not started.** Only then, publish.

Steps 1–6 above are complete. **Nothing has been uploaded to the Chrome Web
Store beyond the original bootstrap package, nothing has been submitted for
review, and nothing is published.** Step 7 (extract and reconfirm the ID)
is the next action.

## 15. Scope control — what this review did not touch

Out of scope and not changed: new job-site extractors, AI features,
auto-apply, background monitoring, popup redesign, analytics, new
application-status features, homepage/dashboard work, dependency upgrades,
or any architectural rewrite. The `client_id`-aware RLS design in §6 is
described, not implemented, for exactly this reason plus the inability to
verify it here — see §6 for the full reasoning.

## 16. Recommendation

**CONDITIONAL GO.** Split across three tracks, because they are genuinely
different kinds of "done" and conflating them is exactly how a package gets
submitted before it should:

- **CODE / PACKAGING: READY.** §1's three production values are confirmed
  and substituted, §2's bootstrap-through-repackage sequence (steps A–L) is
  complete, `npm run extension:check` is green, and the real `0.1.0`
  release ZIP is built and inspected clean (§11) — no placeholders, no
  secrets, correct host permissions, correct public key, correct file set.
  The permission audit, single-purpose audit, Web Store security review,
  privacy/data-flow audit, privacy policy update, and listing copy were
  already complete before this step and remain so.
- **MANUAL PRODUCTION QA: STILL REQUIRED.** Nothing in §13 is marked PASS.
  §2 steps M–O — extract the real ZIP, reconfirm its extension ID, and run
  the full OAuth/capture checklist against a live production account — have
  not been performed. This is the next action; §13 gives the exact
  commands.
- **CHROME WEB STORE SUBMISSION: STILL NOT DONE.** The draft item holds
  only the obsolete `0.0.0.1` bootstrap package. Nothing has been uploaded,
  submitted, or published (§2 steps P–Q, §14 steps 7–16).

Conditions that must be satisfied before actual submission:

1. Run §13's extraction commands and confirm the extension ID
   (`llggmpgoichadgcolincmjcfkljpboad`) before testing anything else — "Gate
   zero."
2. Run the full manual QA checklist in §13 against that exact build and
   record the results (PASS/FAIL per item, not assumed).
3. Decide on §6's residual risk: accept it for this release (this review's
   recommendation) or require the `client_id`-aware RLS follow-up first.
   This is unchanged by production config being confirmed — it was never
   blocked on that.
4. Resolve §9H's open items (screenshots, support contact, category,
   distribution settings).
5. Only after 1–2 pass, upload the real `0.1.0` package to the Store draft,
   replacing the bootstrap upload (§2 step P), then proceed through listing,
   privacy, reviewer instructions, and distribution (§14 steps 10–13)
   before submitting for review.

None of these are code defects — they are the parts of a release that
cannot be settled by reading and testing source code alone.
