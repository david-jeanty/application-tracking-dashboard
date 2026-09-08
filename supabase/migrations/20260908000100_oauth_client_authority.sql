-- What a connected OAuth client may do with a student's tracker.
--
-- Every OAuth grant — a connected assistant over MCP, the Interndex Capture
-- extension — is an ordinary Supabase user access token, and until now the
-- database authorised it exactly as it authorises the student's own web
-- session. The consent screen (`lib/mcp/capabilities.ts`) promises less than
-- that: a client can see, add, and update applications, and cannot delete or
-- archive them. Row-level security answered "whose row is this"; nothing
-- answered "what may this client do with it".
--
-- The signal. Supabase Auth's OAuth 2.1 server puts the client's id into the
-- access token as a top-level `client_id` claim, and omits it from every
-- password or session login. Postgres verifies the JWT signature before any
-- policy reads `auth.jwt()`, so a token holder cannot add, remove, or rewrite
-- the claim the way it could a request header or a body field.
--
-- The rule keys on the claim's presence, not on a particular client's id. The
-- consent screen shows every client the same list, so every client gets the
-- same ceiling, and registering a client never requires storing its id or
-- shipping a migration.
--
-- What is enforced for a session carrying `client_id`:
--
--   * deleting an application — denied (restrictive policy);
--   * archiving or restoring one — denied (a trigger on `archived_at`, since
--     "this column may not change" needs both OLD and NEW, which a policy
--     cannot see together). Other columns of an archived row stay editable,
--     exactly as they were;
--   * inserting an application that is already archived — denied (restrictive
--     policy), because that is archiving by another route;
--   * writing the student's profile — denied; nothing on the consent screen
--     says a client may edit it.
--
-- Reads, inserts, and updates of application details are untouched, so
-- `save_job`, `import_jobs`, `update_job`, and browser capture keep working.
--
-- Restrictive policies are ANDed with the existing owner policies rather than
-- replacing them. A web session carries no claim and passes every new
-- predicate, so nothing changes for the student's own use of the app; the
-- pgTAP suite (`supabase/tests/006_oauth_client_authority.test.sql`) proves
-- both halves against a real Postgres.

create function public.is_oauth_client_session()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'client_id', '') <> '';
$$;

comment on function public.is_oauth_client_session() is
  'True when the current request''s access token was issued to an OAuth client (carries a client_id claim), as opposed to the student''s own web session.';

-- ------------------------------------------------------------ applications --

create policy "applications_delete_denied_to_oauth_clients"
on public.applications
as restrictive
for delete
to authenticated
using (not (select public.is_oauth_client_session()));

create policy "applications_insert_archived_denied_to_oauth_clients"
on public.applications
as restrictive
for insert
to authenticated
with check (
  archived_at is null
  or not (select public.is_oauth_client_session())
);

create function public.guard_archive_state_against_oauth_clients()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if public.is_oauth_client_session() then
    raise insufficient_privilege using
      message = 'connected clients cannot archive or restore an application',
      detail = 'The access token was issued to an OAuth client, and archiving is not among the capabilities a client is granted.',
      hint = 'Archive or restore the application from Interndex itself.';
  end if;

  return new;
end;
$$;

comment on function public.guard_archive_state_against_oauth_clients() is
  'Refuses a change to applications.archived_at from a session whose token was issued to an OAuth client. SQLSTATE 42501, which PostgREST reports as HTTP 403.';

create trigger applications_guard_archive_state
before update of archived_at on public.applications
for each row
when (old.archived_at is distinct from new.archived_at)
execute function public.guard_archive_state_against_oauth_clients();

-- ---------------------------------------------------------------- profiles --

create policy "profiles_insert_denied_to_oauth_clients"
on public.profiles
as restrictive
for insert
to authenticated
with check (not (select public.is_oauth_client_session()));

create policy "profiles_update_denied_to_oauth_clients"
on public.profiles
as restrictive
for update
to authenticated
using (not (select public.is_oauth_client_session()))
with check (not (select public.is_oauth_client_session()));

create policy "profiles_delete_denied_to_oauth_clients"
on public.profiles
as restrictive
for delete
to authenticated
using (not (select public.is_oauth_client_session()));
