begin;

select plan(27);

select is(
  (
    select pg_catalog.array_agg(
      role_permissions.permission
      order by role_permissions.permission
    )
    from public.role_permissions
    join public.roles on roles.id = role_permissions.role_id
    where roles.name = 'operator'
      and role_permissions.permission like 'matches.%'
  ),
  array['matches.operate', 'matches.view']::text[],
  'operators receive only match view and operation permissions'
);

select is(
  (
    select pg_catalog.array_agg(
      role_permissions.permission
      order by role_permissions.permission
    )
    from public.role_permissions
    join public.roles on roles.id = role_permissions.role_id
    where roles.name = 'admin'
      and role_permissions.permission like 'matches.%'
  ),
  array[
    'matches.manage',
    'matches.operate',
    'matches.results.correct',
    'matches.view'
  ]::text[],
  'administrators receive all match permissions'
);

select has_function(
  'public',
  'get_match_member_directory',
  array[]::text[],
  'the protected match member directory exists'
);

select has_function(
  'public',
  'get_match_operator_read',
  array['text'],
  'the protected match operator read exists'
);

select has_function(
  'public',
  'get_match_game_day_snapshot',
  array['uuid'],
  'the protected match game-day snapshot exists'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname in (
        'get_match_member_directory',
        'get_match_operator_read',
        'get_match_game_day_snapshot'
      )
      and (
        not routine.prosecdef
        or routine.proconfig is distinct from array['search_path=""']::text[]
      )
  ),
  'all match read RPCs are security definers with an empty search path'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.get_match_member_directory()',
      'public.get_match_operator_read(text)',
      'public.get_match_game_day_snapshot(uuid)'
    ]) as signature(name)
    where not pg_catalog.has_function_privilege(
      'authenticated',
      signature.name,
      'EXECUTE'
    )
  ),
  'authenticated callers can invoke every match read RPC'
);

select ok(
  not exists (
    select 1
    from unnest(array['public', 'anon']) as role_name(name)
    cross join unnest(array[
      'public.get_match_member_directory()',
      'public.get_match_operator_read(text)',
      'public.get_match_game_day_snapshot(uuid)'
    ]) as signature(name)
    where pg_catalog.has_function_privilege(
      role_name.name,
      signature.name,
      'EXECUTE'
    )
  ),
  'public and anonymous callers cannot invoke match read RPCs'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.get_match_member_directory()',
      'public.get_match_operator_read(text)',
      'public.get_match_game_day_snapshot(uuid)'
    ]) as signature(name)
    where pg_catalog.has_function_privilege(
      'service_role',
      signature.name,
      'EXECUTE'
    )
  ),
  'match read RPCs add no service-role execute grants'
);

insert into auth.users (id, aud, role, email)
values
  (
    'a3000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'match-ordinary@example.com'
  ),
  (
    'a3000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'match-operator@example.com'
  ),
  (
    'a3000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'match-admin@example.com'
  );

insert into public.profiles (
  id,
  role_id,
  display_name,
  email,
  status
)
select
  auth_user.id,
  roles.id,
  auth_user.display_name,
  auth_user.email,
  'active'
from (
  values
    (
      'a3000000-0000-0000-0000-000000000001'::uuid,
      'ordinary',
      'Match Ordinary',
      'match-ordinary@example.com'
    ),
    (
      'a3000000-0000-0000-0000-000000000002'::uuid,
      'operator',
      'Match Operator',
      'match-operator@example.com'
    ),
    (
      'a3000000-0000-0000-0000-000000000003'::uuid,
      'admin',
      'Match Admin',
      'match-admin@example.com'
    )
) as auth_user(id, role_name, display_name, email)
join public.roles on roles.name = auth_user.role_name;

insert into match.grades (id, name, strength)
values (
  'a3100000-0000-0000-0000-000000000001',
  'Task 3 Grade',
  303
);

insert into public.members (
  id,
  name,
  status,
  pause_start_month,
  joined_date,
  withdrawn_date
)
values
  (
    'a3200000-0000-0000-0000-000000000001',
    'Match Ready Contact',
    'active',
    null,
    date '2026-07-01',
    null
  ),
  (
    'a3200000-0000-0000-0000-000000000002',
    'Match Pending No Contact',
    'active',
    null,
    date '2026-07-02',
    null
  ),
  (
    'a3200000-0000-0000-0000-000000000003',
    'Match Paused',
    'paused',
    date '2026-08-01',
    date '2026-07-03',
    null
  ),
  (
    'a3200000-0000-0000-0000-000000000004',
    'Match Withdrawn',
    'withdrawn',
    null,
    date '2026-07-04',
    date '2026-07-28'
  );

insert into public.member_contacts (
  member_id,
  phone_number,
  phone_normalized
)
values (
  'a3200000-0000-0000-0000-000000000001',
  '01012345678',
  '01012345678'
);

insert into match.member_profiles (
  member_id,
  public_alias,
  gender,
  grade_id
)
values
  (
    'a3200000-0000-0000-0000-000000000001',
    'Ready Alias',
    'female',
    'a3100000-0000-0000-0000-000000000001'
  ),
  (
    'a3200000-0000-0000-0000-000000000003',
    'Paused Alias',
    'male',
    'a3100000-0000-0000-0000-000000000001'
  ),
  (
    'a3200000-0000-0000-0000-000000000004',
    'Withdrawn Alias',
    'unspecified',
    'a3100000-0000-0000-0000-000000000001'
  );

insert into match.member_links (
  id,
  auth_user_id,
  member_id,
  status
)
values (
  'a3250000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'a3200000-0000-0000-0000-000000000001',
  'pending'
);

insert into match.seasons (
  id,
  name,
  starts_on
)
values (
  'a3300000-0000-0000-0000-000000000001',
  'Task 3 Season',
  date '2026-07-01'
);

insert into match.game_days (
  id,
  season_id,
  played_on,
  status,
  active_courts,
  version,
  created_by
)
values (
  'a3400000-0000-0000-0000-000000000001',
  'a3300000-0000-0000-0000-000000000001',
  date '2026-07-29',
  'active',
  1,
  7,
  'a3000000-0000-0000-0000-000000000002'
);

insert into match.attendances (
  game_day_id,
  member_id,
  checked_in
)
values (
  'a3400000-0000-0000-0000-000000000001',
  'a3200000-0000-0000-0000-000000000001',
  true
);

insert into match.matches (
  id,
  game_day_id,
  court_number,
  status,
  confirmed_at
)
values (
  'a3500000-0000-0000-0000-000000000001',
  'a3400000-0000-0000-0000-000000000001',
  1,
  'confirmed',
  timestamptz '2026-07-29 01:00:00+00'
);

insert into match.match_players (
  match_id,
  member_id,
  slot,
  team,
  grade_id_snapshot,
  grade_strength_snapshot
)
values (
  'a3500000-0000-0000-0000-000000000001',
  'a3200000-0000-0000-0000-000000000001',
  1,
  1,
  'a3100000-0000-0000-0000-000000000001',
  303
);

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a3000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.get_match_member_directory()$$,
  '42501',
  'matches.view permission required',
  'an authenticated profile without match permission cannot read members'
);

select throws_ok(
  $$select public.get_match_operator_read('members')$$,
  '42501',
  'matches.view permission required',
  'an authenticated profile without match permission cannot read operator data'
);

select throws_ok(
  $$
    select public.get_match_game_day_snapshot(
      'a3400000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  'matches.view permission required',
  'an authenticated profile without match permission cannot read snapshots'
);

reset role;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a3000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select is(
  (
    select item->>'setupStatus'
    from pg_catalog.jsonb_array_elements(
      public.get_match_member_directory()
    ) as item
    where item->>'id' = 'a3200000-0000-0000-0000-000000000002'
  ),
  'pending',
  'an active member without a match profile is pending'
);

select ok(
  (
    select item->'publicAlias' = 'null'::jsonb
       and item->'gender' = 'null'::jsonb
       and item->'gradeId' = 'null'::jsonb
       and item->'gradeName' = 'null'::jsonb
       and item->'gradeStrength' = 'null'::jsonb
       and item->'phoneSuffix' = 'null'::jsonb
    from pg_catalog.jsonb_array_elements(
      public.get_match_member_directory()
    ) as item
    where item->>'id' = 'a3200000-0000-0000-0000-000000000002'
  ),
  'pending setup and missing contact fields remain nullable'
);

select is(
  (
    select item->>'phoneSuffix'
    from pg_catalog.jsonb_array_elements(
      public.get_match_member_directory()
    ) as item
    where item->>'id' = 'a3200000-0000-0000-0000-000000000001'
  ),
  '5678',
  'the authorized server RPC derives only a four-digit phone suffix'
);

select ok(
  not exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      public.get_match_member_directory()
    ) as item
    where item->>'id' = 'a3200000-0000-0000-0000-000000000003'
  ),
  'paused members are excluded from default participation candidates'
);

select ok(
  not exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      public.get_match_member_directory()
    ) as item
    where item->>'id' = 'a3200000-0000-0000-0000-000000000004'
  ),
  'withdrawn members are rejected from participation candidates'
);

select is(
  public.get_match_operator_read('members')->>'scope',
  'members',
  'an operator can read match member administration data'
);

select is(
  pg_catalog.jsonb_array_length(
    public.get_match_operator_read('seasons')->'seasons'
  ),
  1,
  'an operator can read match seasons'
);

select ok(
  not (
    public.get_match_operator_read('approvals')->'approvals'->0
      ? 'authUserId'
  ),
  'pending approval reads do not disclose auth user identifiers'
);

select is(
  public.get_match_game_day_snapshot(
    'a3400000-0000-0000-0000-000000000001'
  )->>'version',
  '7',
  'an operator can read the authoritative game-day snapshot'
);

select is(
  public.get_match_game_day_snapshot(
    'a3400000-0000-0000-0000-000000000001'
  )->'courts'->0->'nextMatch'->>'status',
  'confirmed',
  'the game-day snapshot exposes the confirmed next match'
);

reset role;

select is(
  (
    select traffic_enabled
    from match.release_state
    where singleton
  ),
  false,
  'authorized database reads remain available while external traffic is off'
);

set local role authenticated;

select ok(
  pg_catalog.strpos(
    public.get_match_member_directory()::text
      || public.get_match_operator_read('members')::text
      || public.get_match_operator_read('approvals')::text
      || public.get_match_game_day_snapshot(
        'a3400000-0000-0000-0000-000000000001'
      )::text,
    '01012345678'
  ) = 0,
  'no match read RPC discloses a raw phone number'
);

select throws_ok(
  $$select public.get_match_operator_read('operators')$$,
  '22023',
  'unsupported match operator read scope',
  'unknown operator read scopes are rejected'
);

select throws_ok(
  $$
    select public.get_match_game_day_snapshot(
      'a3400000-0000-0000-0000-000000000099'
    )
  $$,
  'P0002',
  'match game day not found',
  'missing game days are distinguishable from forbidden reads'
);

reset role;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a3000000-0000-0000-0000-000000000003',
  true
);
set local role authenticated;

select is(
  public.get_match_member_directory() is not null
    and public.get_match_operator_read('members') is not null
    and public.get_match_game_day_snapshot(
      'a3400000-0000-0000-0000-000000000001'
    ) is not null,
  true,
  'an administrator can use all protected match reads'
);

select * from finish();
rollback;
