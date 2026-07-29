begin;

select plan(8);

create or replace function public.match_assert_integration_preconditions()
returns void
language plpgsql
set search_path = ''
as $$
declare
  expected_member_count integer;
  expected_member_sha256 text;
  actual_member_count integer;
  actual_member_sha256 text;
begin
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '202607120003'
  ) then
    raise exception 'final member roster migration is not applied';
  end if;

  if to_regprocedure('public.admin_reset_member_roster(jsonb,text,uuid[])') is not null then
    raise exception 'member roster reset RPC must be absent';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.members'::regclass
      and attname = 'phone_last_four'
      and not attisdropped
  ) then
    raise exception 'legacy phone_last_four column must be absent';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.members'::regclass
      and attname = 'member_code'
      and not attisdropped
      and attnotnull
  ) then
    raise exception 'members.member_code must exist and be NOT NULL';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.members'::regclass
      and contype = 'f'
      and not convalidated
  ) then
    raise exception 'members foreign keys must be validated';
  end if;

  expected_member_count := nullif(
    current_setting('app.match_member_baseline_count', true),
    ''
  )::integer;
  expected_member_sha256 := nullif(
    current_setting('app.match_member_baseline_sha256', true),
    ''
  );

  if expected_member_count is null or expected_member_sha256 is null then
    raise exception 'private member baseline evidence is required';
  end if;

  select
    count(*)::integer,
    encode(
      extensions.digest(
        coalesce(string_agg(member_code || ':' || id::text, ',' order by member_code, id), ''),
        'sha256'
      ),
      'hex'
    )
  into actual_member_count, actual_member_sha256
  from public.members;

  if expected_member_count <> actual_member_count
     or expected_member_sha256 <> actual_member_sha256 then
    raise exception 'private member baseline evidence does not match';
  end if;
end;
$$;

select has_function(
  'public',
  'match_assert_integration_preconditions',
  array[]::text[],
  'preflight assertion function is available'
);

select ok(
  exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '202607120003'
  ),
  'the final member roster migration is applied'
);

select ok(
  to_regprocedure('public.admin_reset_member_roster(jsonb,text,uuid[])') is null,
  'the destructive member roster reset RPC is absent'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.members'::regclass
      and attname = 'phone_last_four'
      and not attisdropped
  ),
  'the legacy phone_last_four column is absent'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.members'::regclass
      and attname = 'member_code'
      and not attisdropped
      and attnotnull
  ),
  'members.member_code exists and is NOT NULL'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.members'::regclass
      and contype = 'f'
      and not convalidated
  ),
  'members foreign keys are validated'
);

select throws_like(
  $$select public.match_assert_integration_preconditions()$$,
  '%private member baseline evidence is required%',
  'preflight rejects a run without private member baseline evidence'
);

select set_config(
  'app.match_member_baseline_count',
  (select count(*)::text from public.members),
  true
);
select set_config(
  'app.match_member_baseline_sha256',
  (
    select encode(
      extensions.digest(
        coalesce(string_agg(member_code || ':' || id::text, ',' order by member_code, id), ''),
        'sha256'
      ),
      'hex'
    )
    from public.members
  ),
  true
);

select lives_ok(
  $$select public.match_assert_integration_preconditions()$$,
  'preflight accepts the applied roster schema and matching private evidence'
);

select * from finish();
rollback;
