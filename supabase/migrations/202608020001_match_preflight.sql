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
  expected_member_foreign_keys text[] := array[
    'public.fee_monthly_notes.fee_monthly_notes_member_id_fkey:member_id->public.members.id',
    'public.fee_payments.fee_payments_member_id_fkey:member_id->public.members.id',
    'public.meeting_attendance.meeting_attendance_member_id_fkey:member_id->public.members.id',
    'public.meeting_month_roster_members.meeting_month_roster_members_member_id_fkey:member_id->public.members.id',
    'public.member_contacts.member_contacts_member_id_fkey:member_id->public.members.id',
    'public.members.members_created_by_fkey:created_by->public.profiles.id',
    'public.members.members_group_id_fkey:group_id->public.member_groups.id',
    'public.members.members_operator_profile_id_fkey:operator_profile_id->public.profiles.id',
    'public.members.members_updated_by_fkey:updated_by->public.profiles.id'
  ];
  actual_member_foreign_keys text[];
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

  select array_agg(
    source_schema.nspname || '.' || source_table.relname || '.' || foreign_key.conname
      || ':' || source_column.attname || '->'
      || target_schema.nspname || '.' || target_table.relname || '.' || target_column.attname
    order by foreign_key.conname
  )
  into actual_member_foreign_keys
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
    );

  if actual_member_foreign_keys is distinct from expected_member_foreign_keys then
    raise exception 'members foreign-key contract does not match';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where contype = 'f'
      and (
        conrelid = 'public.members'::regclass
        or confrelid = 'public.members'::regclass
      )
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

revoke execute on function public.match_assert_integration_preconditions()
from public, anon, authenticated, service_role;
