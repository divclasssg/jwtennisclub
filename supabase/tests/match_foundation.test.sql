begin;

select plan(23);

select has_schema(
  'match',
  'the private match schema exists'
);

select is(
  (
    select array_agg(class.relname order by class.relname)
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'match'
      and class.relkind = 'r'
  ),
  array[
    'attendances',
    'audit_events',
    'game_days',
    'grades',
    'match_players',
    'matches',
    'member_links',
    'member_profiles',
    'offline_leases',
    'operations',
    'release_state',
    'seasons'
  ]::name[],
  'the match schema contains only the private foundation tables'
);

select ok(
  to_regclass('match.members') is null,
  'the canonical public members table is not duplicated'
);

select is(
  (
    select array_agg(
      source_table.relname || '.' || source_column.attname
        || '->' || target_schema.nspname || '.' || target_table.relname
        || '.' || target_column.attname
      order by source_table.relname, source_column.attname
    )
    from pg_catalog.pg_constraint as foreign_key
    join pg_catalog.pg_class as source_table
      on source_table.oid = foreign_key.conrelid
    join pg_catalog.pg_namespace as source_schema
      on source_schema.oid = source_table.relnamespace
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = foreign_key.conrelid
     and source_column.attnum = foreign_key.conkey[1]
    join pg_catalog.pg_class as target_table
      on target_table.oid = foreign_key.confrelid
    join pg_catalog.pg_namespace as target_schema
      on target_schema.oid = target_table.relnamespace
    join pg_catalog.pg_attribute as target_column
      on target_column.attrelid = foreign_key.confrelid
     and target_column.attnum = foreign_key.confkey[1]
    where foreign_key.contype = 'f'
      and source_schema.nspname = 'match'
      and foreign_key.confrelid = 'public.members'::regclass
  ),
  array[
    'attendances.member_id->public.members.id',
    'match_players.member_id->public.members.id',
    'member_links.member_id->public.members.id',
    'member_profiles.member_id->public.members.id'
  ]::text[],
  'all match member references use the existing public member UUID'
);

select has_view(
  'match',
  'member_directory',
  'the internal member directory view exists'
);

create temporary table match_foundation_fixture (
  member_id uuid primary key
) on commit drop;

with inserted_member as (
  insert into public.members (name, status, joined_date)
  values ('Match Foundation Pending', 'active', date '2026-07-29')
  returning id
)
insert into match_foundation_fixture (member_id)
select id from inserted_member;

select is(
  (
    select directory.setup_status
    from match.member_directory as directory
    where directory.member_id = (
      select fixture.member_id from match_foundation_fixture as fixture
    )
  ),
  'pending',
  'a canonical member without a match profile reads as pending'
);

select ok(
  (
    select directory.public_alias is null
       and directory.gender is null
       and directory.grade_id is null
       and directory.grade_name is null
       and directory.grade_strength is null
    from match.member_directory as directory
    where directory.member_id = (
      select fixture.member_id from match_foundation_fixture as fixture
    )
  ),
  'a pending member exposes nullable match profile fields'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'match'
      and class.relkind = 'r'
      and not class.relrowsecurity
  ),
  'row level security is enabled on every match table'
);

select ok(
  not exists (
    select 1
    from unnest(array['public', 'anon', 'authenticated']) as role_name(name)
    where has_schema_privilege(role_name.name, 'match', 'USAGE')
       or has_schema_privilege(role_name.name, 'match', 'CREATE')
  ),
  'client roles have no match schema privileges'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    cross join unnest(array['public', 'anon', 'authenticated'])
      as role_name(name)
    where namespace.nspname = 'match'
      and class.relkind in ('r', 'v')
      and has_table_privilege(
        role_name.name,
        class.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
  ),
  'client roles have no match table or view privileges'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    cross join unnest(array['public', 'anon', 'authenticated'])
      as role_name(name)
    where namespace.nspname = 'match'
      and class.relkind = 'S'
      and has_sequence_privilege(
        role_name.name,
        class.oid,
        'USAGE,SELECT,UPDATE'
      )
  ),
  'client roles have no match sequence privileges'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    cross join unnest(array['public', 'anon', 'authenticated'])
      as role_name(name)
    where namespace.nspname = 'match'
      and has_function_privilege(role_name.name, routine.oid, 'EXECUTE')
  ),
  'client roles have no match routine privileges'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_type as type
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = type.typnamespace
    cross join unnest(array['public', 'anon', 'authenticated'])
      as role_name(name)
    where namespace.nspname = 'match'
      and type.typtype in ('e', 'c')
      and has_type_privilege(role_name.name, type.oid, 'USAGE')
  ),
  'client roles have no match type privileges'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_default_acl as default_acl
    cross join lateral aclexplode(default_acl.defaclacl) as privilege
    where default_acl.defaclnamespace = (
      select oid from pg_catalog.pg_namespace where nspname = 'match'
    )
      and privilege.grantee in (
        0,
        (select oid from pg_catalog.pg_roles where rolname = 'anon'),
        (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
      )
  ),
  'client roles receive no match default privileges'
);

select is(
  (select count(*)::integer from match.release_state),
  1,
  'release state has exactly one row'
);

select is(
  (select traffic_enabled from match.release_state where singleton),
  false,
  'match traffic defaults off'
);

select is(
  (select first_write_at from match.release_state where singleton),
  null::timestamptz,
  'release state starts without a first write timestamp'
);

select ok(
  not has_table_privilege(
    'service_role',
    'match.release_state',
    'UPDATE'
  ),
  'the service role cannot change the release flag directly'
);

select lives_ok(
  $$
    update match.release_state
    set first_write_at = clock_timestamp()
    where singleton and first_write_at is null
  $$,
  'the first write timestamp can be set once'
);

select throws_like(
  $$
    update match.release_state
    set first_write_at = first_write_at + interval '1 second'
    where singleton
  $$,
  '%first_write_at is immutable%',
  'the first write timestamp cannot be changed after it is set'
);

select throws_like(
  $$delete from match.release_state where singleton$$,
  '%release_state singleton cannot be deleted%',
  'the release singleton cannot be deleted'
);

select throws_like(
  $$insert into match.release_state (singleton) values (false)$$,
  '%violates check constraint%',
  'a second release row cannot be inserted'
);

select throws_like(
  $$truncate match.release_state$$,
  '%release_state singleton cannot be truncated%',
  'the release singleton cannot be truncated'
);

select * from finish();
rollback;
