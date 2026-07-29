begin;

select plan(11);

select has_function(
  'public',
  'match_assert_integration_preconditions',
  array[]::text[],
  'preflight assertion function is available'
);

select is(
  (
    select array_agg(
      source_schema.nspname || '.' || source_table.relname || '.' || foreign_key.conname
        || ':' || source_column.attname || '->'
        || target_schema.nspname || '.' || target_table.relname || '.' || target_column.attname
      order by foreign_key.conname
    )
    from pg_catalog.pg_constraint as foreign_key
    join pg_catalog.pg_class as source_table on source_table.oid = foreign_key.conrelid
    join pg_catalog.pg_namespace as source_schema on source_schema.oid = source_table.relnamespace
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = foreign_key.conrelid
     and source_column.attnum = foreign_key.conkey[1]
    join pg_catalog.pg_class as target_table on target_table.oid = foreign_key.confrelid
    join pg_catalog.pg_namespace as target_schema on target_schema.oid = target_table.relnamespace
    join pg_catalog.pg_attribute as target_column
      on target_column.attrelid = foreign_key.confrelid
     and target_column.attnum = foreign_key.confkey[1]
    where foreign_key.contype = 'f'
      and (
        foreign_key.conrelid = 'public.members'::regclass
        or (
          foreign_key.confrelid = 'public.members'::regclass
          and source_schema.nspname = 'public'
        )
      )
  ),
  array[
    'public.fee_monthly_notes.fee_monthly_notes_member_id_fkey:member_id->public.members.id',
    'public.fee_payments.fee_payments_member_id_fkey:member_id->public.members.id',
    'public.meeting_attendance.meeting_attendance_member_id_fkey:member_id->public.members.id',
    'public.meeting_month_roster_members.meeting_month_roster_members_member_id_fkey:member_id->public.members.id',
    'public.member_contacts.member_contacts_member_id_fkey:member_id->public.members.id',
    'public.members.members_created_by_fkey:created_by->public.profiles.id',
    'public.members.members_group_id_fkey:group_id->public.member_groups.id',
    'public.members.members_operator_profile_id_fkey:operator_profile_id->public.profiles.id',
    'public.members.members_updated_by_fkey:updated_by->public.profiles.id'
  ]::text[],
  'members retains the complete expected incoming and outgoing foreign-key contract'
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
    where contype = 'f'
      and (
        conrelid = 'public.members'::regclass
        or confrelid = 'public.members'::regclass
      )
      and not convalidated
  ),
  'all incoming and outgoing members foreign keys are validated'
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

select set_config(
  'app.match_member_baseline_count',
  ((select count(*) + 1 from public.members)::text),
  true
);
select throws_like(
  $$select public.match_assert_integration_preconditions()$$,
  '%private member baseline evidence does not match%',
  'preflight rejects a private member baseline with the wrong count'
);

select set_config(
  'app.match_member_baseline_count',
  (select count(*)::text from public.members),
  true
);
select set_config(
  'app.match_member_baseline_sha256',
  (
    select case
      when encode(
        extensions.digest(
          coalesce(string_agg(member_code || ':' || id::text, ',' order by member_code, id), ''),
          'sha256'
        ),
        'hex'
      ) = repeat('0', 64) then repeat('1', 64)
      else repeat('0', 64)
    end
    from public.members
  ),
  true
);
select throws_like(
  $$select public.match_assert_integration_preconditions()$$,
  '%private member baseline evidence does not match%',
  'preflight rejects a private member baseline with the wrong digest'
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
