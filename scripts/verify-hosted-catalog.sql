select jsonb_build_object(
  'enums',
  (
    select jsonb_object_agg(enum_name, labels order by enum_name)
    from (
      select
        t.typname as enum_name,
        jsonb_agg(e.enumlabel order by e.enumsortorder) as labels
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname in (
          'application_status',
          'job_category',
          'work_arrangement',
          'classification_confidence'
        )
      group by t.typname
    ) enum_catalog
  ),
  'tables',
  (
    select jsonb_agg(
      jsonb_build_object(
        'name', c.relname,
        'rls_enabled', c.relrowsecurity
      )
      order by c.relname
    )
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'profiles',
        'applications',
        'application_status_history'
      )
  ),
  'constraints',
  (
    select jsonb_agg(
      jsonb_build_object(
        'table', c.relname,
        'name', con.conname,
        'type', con.contype,
        'definition', pg_get_constraintdef(con.oid, true)
      )
      order by c.relname, con.contype, con.conname
    )
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'profiles',
        'applications',
        'application_status_history'
      )
  ),
  'triggers',
  (
    select jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'table', c.relname,
        'name', t.tgname,
        'definition', pg_get_triggerdef(t.oid, true)
      )
      order by n.nspname, c.relname, t.tgname
    )
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and (
        (n.nspname = 'public' and c.relname in ('profiles', 'applications'))
        or (n.nspname = 'auth' and c.relname = 'users')
      )
  ),
  'policies',
  (
    select jsonb_agg(
      jsonb_build_object(
        'table', tablename,
        'name', policyname,
        'command', cmd,
        'roles', roles,
        'using', qual,
        'check', with_check
      )
      order by tablename, policyname
    )
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'applications',
        'application_status_history'
      )
  ),
  'grants',
  (
    select jsonb_agg(
      jsonb_build_object(
        'table', table_name,
        'role', grantee,
        'privileges', privileges
      )
      order by table_name, grantee
    )
    from (
      select
        table_name,
        grantee,
        jsonb_agg(privilege_type order by privilege_type) as privileges
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in (
          'profiles',
          'applications',
          'application_status_history'
        )
        and grantee in ('anon', 'authenticated')
      group by table_name, grantee
    ) grant_catalog
  )
) as hosted_catalog;
