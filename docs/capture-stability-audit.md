# Capture stability audit

Status: read-only audit, 2 September 2026. This document is the single source
of truth for what Interndex Capture actually supports today, as distinct from
what any individual PR describes about its own scope. It does not change
production code, and it supersedes any looser "supported site" language
implied elsewhere until that language is corrected to match it.

Scope: `extension/src/{adapters,sites,page-collector,identity,evidence,
extractor,source}.ts`, their tests, `docs/browser-capture.md`, and PR #50
(`feat(extension): add safe Greenhouse structured-data recognition`,
`b361477`, open, `mergeable_state: clean`, base `main` @ `5062336`).

## 1. Site-by-site status

| Site | Implementation level | Category | Real-browser verification | Honestly "launch-ready supported"? |
| --- | --- | --- | --- | --- |
| LinkedIn | `linkedin_identity_aware` adapter; DOM-root-scoped evidence (`observedPosting` job ids), two strategies (job-detail, split-pane), frame resolution for Similar Jobs | **Real identity-aware capture** | Partial — `/jobs/view/<id>` and `/jobs/search-results/?currentJobId=<id>` confirmed correct on all four fields in a real-Chrome pass; the Similar Jobs correction was built from real DOM evidence but "has not itself been run against LinkedIn" (`browser-capture.md`, Real-site compatibility) | **Yes**, for the two verified routes. **No**, for Similar Jobs specifically — correction unretested |
| Indeed | `legacy_site_fields` with real `data-testid` selectors, no page-local identity root | **Legacy selector support** (not identity-aware; `postingIdentity` is always `{support:"unsupported", observed:"unsupported"}`, `adapters.ts:284,286`) | Yes — "verified Indeed on every field" (company, title, location, description, source, posting URL) | **Yes** |
| Workday | `workday_identity_aware` adapter; requisition-id-matched DOM root (`jobPostingPage`/`jobDetails`), P1.2 board-employer/domain evidence | **Real identity-aware capture** | Split — title/location/description confirmed in an early real-Chrome pass; the newer P1.2 board-employer/domain evidence and the BDO split-pane fixture each carry an explicit, still-open "Real-Chrome confirmation is still required" in `browser-capture.md`'s P1.2 fixtures section | **Yes**, for title/location/description. **No**, for the employer/domain feature — unverified against a live board |
| Greenhouse | Route recognizes `boards.greenhouse.io`/`job-boards.greenhouse.io`, parses `jobId` from the URL only; zero DOM selectors, zero page-local evidence root; routed through `legacy_site_fields` (`adapters.ts` match condition) | **Safe structured-data recognition only** | None. This environment's egress to every Greenhouse host is blocked (confirmed twice, independently, in this session); fixtures in `greenhouse-evidence.test.ts` are synthetic, written from general `schema.org` convention, not from any real Greenhouse HTML/JSON-LD — none exists anywhere in this repo's history (checked via `git log --all -S greenhouse`) | **No.** PR #50's own description and `browser-capture.md` already say this explicitly; this audit confirms nothing has changed since |
| Lever | None. `lever.co`/`jobs.lever.co` exist only in `source.ts`'s applicant-tracking host list (never-employer-domain, never-source); no `SiteId`, no route, no adapter | **Generic fallback only** (same as any unrecognized page) | N/A — unimplemented | **No** |
| Generic JSON-LD (unrecognized sites / employer careers pages) | `findJobPostings`/microdata reader + `selectStructuredCandidate` (URL/host/token identity correlation, not DOM-scoped) + a heading fallback gated on 2-of-3 corroboration signals | **Generic fallback**, architecturally conservative | Mixed on real employer pages: KPMG mostly correct (two now-fixed faults, "not retested since"); L3Harris and IBM get a correct title but weak company/location/description ("separate evidence, not addressed") | **No**, and not meant to be — this is the safety net beneath the named sites, not a site family. It does hold the blank-over-wrong invariant by design (2-signal corroboration + page-furniture rejection), which is real and verified by ~56 tests in `extraction.test.ts`, even where recall is low |

Verification citations are all existing text in `docs/browser-capture.md`
("Real-site compatibility", "P1.2 Workday fixtures", "Read-only Greenhouse
data feasibility attempt"); nothing here required re-deriving them, only
reading the caveats that were already there rather than the headline claims.

## 2. The exact launch standard

Four invariants, each checked against what the code and tests actually
enforce today — not what a comment claims:

1. **Current visible job only.** Enforced structurally, not by convention, on
   LinkedIn and Workday: every field is recorded beside the posting id on its
   own DOM root (`observePostingField`, `page-collector.ts`), and a field
   whose root disagrees with the route is rejected before it can reach a
   value (`identityForField`/`correlateObservedPosting`, `adapters.ts`,
   `identity.ts`). Indeed and Greenhouse have no such structural gate; they
   rely on the page only ever showing one posting (true of Indeed's rendered
   page; unverified for Greenhouse) and, for any structured data, on
   `selectStructuredCandidate`'s URL/token correlation, which is real but
   coarser than a DOM root.
2. **Zero stale/prior-job reuse.** Same mechanism as (1) for LinkedIn/Workday
   — a root that named a different job cannot lend a field. For structured
   data generally, `selectStructuredCandidate` explicitly rejects a record
   that names a different posting on the same host (`mismatched`) or that
   cannot be told apart from another candidate (`ambiguous`), and Workday's
   structured JSON-LD is additionally never trusted at all
   (`workday_structured_data_untrusted`) because a live SPA can retain a
   stale backend record after its visible pane changed.
3. **Blank over wrong.** The evidence ledger (`evidence.ts`) only ever
   projects an `accepted` entry; every rejection path is a no-op on the
   returned value, never a fallback to "something." Verified by the
   overwhelming majority of this codebase's ~600 extension tests, which are
   almost all negative assertions (mismatched/ambiguous/unobserved → blank).
4. **No false success.** Outside this audit's scope in the strict sense
   (this is a save/duplicate-detection property, not an extraction one), but
   worth naming: `docs/browser-capture.md`'s Duplicate behavior section
   describes exact-URL matching with an explicit conflict response, no silent
   merge, no "save another copy" control. Unaffected by any site's capture
   quality.
5. **Clear partial/unsupported states.** `postingIdentity.support` /
   `.observed` is real, correctly reported per adapter (`unsupported` for
   Indeed/Greenhouse/generic, `supported`+state for LinkedIn/Workday), and
   surfaces through `extractionDiagnostics` and the popup's "Also found"
   list. This is the one invariant every site here already satisfies
   honestly at the code level — the risk audited here is entirely in
   **prose**, not in what the extension reports to itself.

**A site earns "launch-ready supported" only when it satisfies all four
structurally** (not "usually true of the page shape") **and has been opened
in real Chrome and confirmed correct.** Recognized-but-unverified,
recognized-but-non-identity-aware, and unimplemented are three different
"not yet" states and this document does not collapse them into one.

## 3. Smallest ordered plan to five genuinely supported families

Today: **2 fully verified** (LinkedIn's two main routes, Indeed), **1
partially verified** (Workday — core fields yes, P1.2 employer/domain no),
**2 not supported** (Greenhouse: scaffolding only, zero verification; Lever:
unimplemented). Ordered by cost, cheapest first:

1. **Real-Chrome verify Workday's P1.2 employer/domain evidence and the BDO
   split-pane fixture.** No new code — the architecture and tests already
   exist; this closes an already-flagged gap and would make Workday the
   third fully-supported family.
2. **Real-Chrome retest LinkedIn Similar Jobs.** No new code — the DOM
   evidence and the corrected read already exist; only the retest is
   missing.
3. **Real-Chrome verify Greenhouse's structured-data assumptions** on both
   `boards.greenhouse.io` and `job-boards.greenhouse.io`, across a few
   different employers: does `identifier`/`url` reliably correlate, does
   `jobLocation` actually appear, does the newer job-boards UI emit the same
   shape as the classic template. If confirmed, Greenhouse graduates to
   "safe structured-data support, verified" — genuinely supported, still
   correctly described as not identity-aware in the LinkedIn/Workday sense,
   but no longer an open question mark. This is verification-only and
   therefore cheaper than new capture code.
4. **Only if step 3 finds real gaps** (e.g., structured data frequently
   absent or non-correlating), decide whether Greenhouse needs a DOM
   identity-aware adapter — and build it only from live DOM evidence
   captured in that step, the same discipline that replaced LinkedIn's
   originally-guessed selector list.
5. **Implement Lever from nothing**, in the same order this session used for
   Greenhouse: attempt live inspection first; if network-blocked (likely,
   per precedent), ship the same safe-structured-data pattern (route a
   posting id parsed from Lever's URL, zero selectors, structured-data-only)
   as an interim step; then real-Chrome-verify before calling it supported;
   add DOM selectors later only against live evidence, never speculatively.

This order clears the two cheapest, already-flagged verification debts
first, treats Greenhouse's next step as verification rather than more code,
and leaves Lever — genuinely unstarted — for last.

## 4. Merge recommendation for PR #50

**Merge.** Concrete reasons, not a default:

- The PR's own description and the linked docs already state the correct,
  narrow scope — "safe Greenhouse structured-data recognition, not a
  dedicated or identity-aware Greenhouse adapter" — and this audit did not
  find that claim to be an overstatement anywhere in the diff.
- It changes no LinkedIn/Indeed/Workday behavior (confirmed by this
  session's own test run: 600/600 passing, only 3 pre-existing assertions
  updated, all for URLs that were previously unrecognized and are now
  correctly recognized).
- It adds no selector, no scraping, no new dependency — nothing in it can
  regress correctness on a site it doesn't touch, and its own worst-case
  behavior (an unverified route token) is a documented safe-failure, not a
  silent one.
- `mergeable_state` is `clean`; the only PR activity is a Vercel preview
  deploy comment. Note for the record: **no test/typecheck CI workflow ran
  on this PR** (the only check run is `Vercel Preview Comments`) — this is a
  repository CI-configuration gap, not a defect in this PR's content, but it
  means the 600/600 pass reported in the PR body was verified in-session,
  not by an independent GitHub check.

**Do not treat merging PR #50 as making Greenhouse a supported launch
site.** Track step 3 of the plan above (real-Chrome Greenhouse
verification) as a follow-up before Greenhouse appears in any user-facing
"supported sites" list, marketing copy, or onboarding text.
