-- A connected OAuth client may not read the student's profile.
--
-- `20260908000100_oauth_client_authority.sql` gave every client session the
-- ceiling the consent screen promises (`lib/mcp/capabilities.ts`): see, add and
-- update applications; no delete, no archive, no profile write. It closed the
-- write half of `profiles` — `profiles_insert_denied_to_oauth_clients` and its
-- update and delete siblings — and left SELECT alone, because the question that
-- migration was answering was "what may a client *do* to this student's data".
--
-- Reading is the half that was missed. `ASSISTANT_CAN` says "See the job
-- applications in your tracker" and nothing else, but a client session holding
-- an ordinary Supabase user token could call PostgREST directly —
--
--   GET /rest/v1/profiles?select=*
--
-- — and receive the student's full name, school, academic program, graduation
-- year, and both consent timestamps. None of that is an application, and none
-- of it is on the screen where the student agreed. It is not a cross-user leak:
-- `profiles_select_own` still scopes the read to `auth.uid()`, so this was only
-- ever the student's own row. It is a mismatch between what was promised and
-- what was enforced, and the fix is the one restrictive policy that was not
-- written the first time.
--
-- Restrictive, so it is ANDed with `profiles_select_own` rather than replacing
-- it. A web session carries no `client_id` claim, passes the predicate, and
-- reads its own profile exactly as before — which is what the account export
-- (`lib/account/export.ts`, the only profile read in the product) depends on,
-- and it runs on the cookie session, never on a bearer token.
--
-- Nothing on a client path reads `profiles`, so no product behaviour changes.
-- The foreign key from `applications.user_id` to `profiles.user_id` is
-- unaffected: PostgreSQL runs referential-integrity checks with row security
-- bypassed, so a client's insert still resolves the reference it always did.
-- `supabase/tests/006_oauth_client_authority.test.sql` proves that insert still
-- works alongside the refusals below, and would fail loudly if it did not.

create policy "profiles_select_denied_to_oauth_clients"
on public.profiles
as restrictive
for select
to authenticated
using (not (select public.is_oauth_client_session()));
