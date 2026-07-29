begin;

select plan(51);

select has_function(
  'public',
  'apply_game_day_command',
  array['jsonb'],
  'the game-day mutation RPC exists'
);

select has_function(
  'public',
  'apply_admin_command',
  array['jsonb'],
  'the match-management mutation RPC exists'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname in ('apply_game_day_command', 'apply_admin_command')
      and (
        not routine.prosecdef
        or routine.proconfig is distinct from array['search_path=""']::text[]
      )
  ),
  'mutation RPCs are security definers with empty search paths'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.apply_game_day_command(jsonb)',
      'public.apply_admin_command(jsonb)'
    ]) as signature(name)
    where not pg_catalog.has_function_privilege(
      'authenticated',
      signature.name,
      'EXECUTE'
    )
  ),
  'authenticated callers may invoke mutation RPCs'
);

select ok(
  not exists (
    select 1
    from unnest(array['public', 'anon']) as role_name(name)
    cross join unnest(array[
      'public.apply_game_day_command(jsonb)',
      'public.apply_admin_command(jsonb)'
    ]) as signature(name)
    where pg_catalog.has_function_privilege(
      role_name.name,
      signature.name,
      'EXECUTE'
    )
  ),
  'public and anonymous callers may not invoke mutation RPCs'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.apply_game_day_command(jsonb)',
      'public.apply_admin_command(jsonb)'
    ]) as signature(name)
    where pg_catalog.has_function_privilege(
      'service_role',
      signature.name,
      'EXECUTE'
    )
  ),
  'mutation RPCs add no service-role execute grants'
);

insert into auth.users (id, aud, role, email)
values
  (
    'b4000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'match-command-ordinary@example.com'
  ),
  (
    'b4000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'match-command-operator@example.com'
  ),
  (
    'b4000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'match-command-admin@example.com'
  );

insert into public.profiles (id, role_id, display_name, email, status)
select fixture.id, roles.id, fixture.display_name, fixture.email, 'active'
from (
  values
    (
      'b4000000-0000-0000-0000-000000000001'::uuid,
      'ordinary',
      'Command Ordinary',
      'match-command-ordinary@example.com'
    ),
    (
      'b4000000-0000-0000-0000-000000000002'::uuid,
      'operator',
      'Command Operator',
      'match-command-operator@example.com'
    ),
    (
      'b4000000-0000-0000-0000-000000000003'::uuid,
      'admin',
      'Command Admin',
      'match-command-admin@example.com'
    )
) as fixture(id, role_name, display_name, email)
join public.roles on roles.name = fixture.role_name;

insert into match.grades (id, name, strength)
values (
  'b4100000-0000-0000-0000-000000000001',
  'Task 4 Grade',
  404
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
    'b4200000-0000-0000-0000-000000000001',
    'Task 4 Ready',
    'active',
    null,
    date '2026-07-01',
    null
  ),
  (
    'b4200000-0000-0000-0000-000000000002',
    'Task 4 Pending',
    'active',
    null,
    date '2026-07-01',
    null
  ),
  (
    'b4200000-0000-0000-0000-000000000003',
    'Task 4 Paused',
    'paused',
    date '2026-08-01',
    date '2026-07-01',
    null
  ),
  (
    'b4200000-0000-0000-0000-000000000004',
    'Task 4 Withdrawn',
    'withdrawn',
    null,
    date '2026-07-01',
    date '2026-07-28'
  ),
  (
    'b4200000-0000-0000-0000-000000000005',
    'Task 4 Ready Two',
    'active',
    null,
    date '2026-07-01',
    null
  );

insert into match.member_profiles (
  member_id,
  public_alias,
  gender,
  grade_id
)
values
  (
    'b4200000-0000-0000-0000-000000000001',
    'Ready Four',
    'female',
    'b4100000-0000-0000-0000-000000000001'
  ),
  (
    'b4200000-0000-0000-0000-000000000003',
    'Paused Four',
    'male',
    'b4100000-0000-0000-0000-000000000001'
  ),
  (
    'b4200000-0000-0000-0000-000000000004',
    'Withdrawn Four',
    'unspecified',
    'b4100000-0000-0000-0000-000000000001'
  ),
  (
    'b4200000-0000-0000-0000-000000000005',
    'Ready Five',
    'unspecified',
    'b4100000-0000-0000-0000-000000000001'
  );

insert into match.seasons (id, name, starts_on)
values (
  'b4300000-0000-0000-0000-000000000001',
  'Task 4 Season',
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
values
  (
    'b4400000-0000-0000-0000-000000000001',
    'b4300000-0000-0000-0000-000000000001',
    date '2026-07-29',
    'draft',
    1,
    1,
    'b4000000-0000-0000-0000-000000000002'
  ),
  (
    'b4400000-0000-0000-0000-000000000002',
    'b4300000-0000-0000-0000-000000000001',
    date '2026-07-30',
    'active',
    1,
    1,
    'b4000000-0000-0000-0000-000000000002'
  );

insert into match.matches (
  id,
  game_day_id,
  court_number,
  status,
  winner_team,
  version,
  completed_at
)
values (
  'b4500000-0000-0000-0000-000000000001',
  'b4400000-0000-0000-0000-000000000002',
  1,
  'completed',
  1,
  1,
  clock_timestamp()
);

insert into match.member_links (
  id,
  auth_user_id,
  member_id,
  status
)
values (
  'b4550000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000001',
  'b4200000-0000-0000-0000-000000000001',
  'pending'
);

select set_config(
  'request.jwt.claim.sub',
  'b4000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select throws_like(
  $$select public.apply_game_day_command('{}'::jsonb)$$,
  '%match traffic is disabled%',
  'release-off rejects a game mutation before parsing its command'
);

select throws_like(
  $$select public.apply_admin_command('{}'::jsonb)$$,
  '%match traffic is disabled%',
  'release-off rejects a management mutation before parsing its command'
);

reset role;

select is(
  (select first_write_at from match.release_state where singleton),
  null::timestamptz,
  'release-off rejections do not mark a first write'
);

update match.release_state
set traffic_enabled = true,
    enabled_at = clock_timestamp()
where singleton;

select set_config(
  'request.jwt.claim.sub',
  'b4000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select throws_like(
  $$
    select public.apply_game_day_command(
      '{
        "operationId":"b4600000-0000-0000-0000-000000000001",
        "gameDayId":"b4400000-0000-0000-0000-000000000001",
        "baseVersion":1,
        "deviceId":"b4700000-0000-0000-0000-000000000001",
        "occurredAt":"2026-07-29T01:00:00Z",
        "source":"online",
        "type":"update_attendance",
        "payload":{"memberId":"b4200000-0000-0000-0000-000000000001","checkedIn":true}
      }'::jsonb
    )
  $$,
  '%matches.operate permission required%',
  'an ordinary member cannot operate a game day'
);

reset role;

select is(
  (select first_write_at from match.release_state where singleton),
  null::timestamptz,
  'permission rejection does not mark a first write'
);

select set_config(
  'request.jwt.claim.sub',
  'b4000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select throws_like(
  $$
    select public.apply_game_day_command(
      '{
        "operationId":"b4600000-0000-0000-0000-000000000002",
        "gameDayId":"b4400000-0000-0000-0000-000000000001",
        "baseVersion":1,
        "deviceId":"b4700000-0000-0000-0000-000000000001",
        "occurredAt":"2026-07-29T01:01:00Z",
        "source":"online",
        "type":"update_attendance",
        "payload":{"memberId":"b4200000-0000-0000-0000-000000000002","checkedIn":true}
      }'::jsonb
    )
  $$,
  '%match profile setup required%',
  'a setup-pending member cannot be added to attendance'
);

select throws_like(
  $$
    select public.apply_game_day_command(
      '{
        "operationId":"b4600000-0000-0000-0000-000000000003",
        "gameDayId":"b4400000-0000-0000-0000-000000000001",
        "baseVersion":1,
        "deviceId":"b4700000-0000-0000-0000-000000000001",
        "occurredAt":"2026-07-29T01:02:00Z",
        "source":"online",
        "type":"update_attendance",
        "payload":{"memberId":"b4200000-0000-0000-0000-000000000004","checkedIn":true}
      }'::jsonb
    )
  $$,
  '%withdrawn member cannot participate%',
  'a withdrawn member cannot be newly checked in'
);

select throws_like(
  $$
    select public.apply_game_day_command(
      '{
        "operationId":"b4600000-0000-0000-0000-000000000004",
        "gameDayId":"b4400000-0000-0000-0000-000000000001",
        "baseVersion":1,
        "deviceId":"b4700000-0000-0000-0000-000000000001",
        "occurredAt":"2026-07-29T01:03:00Z",
        "source":"online",
        "type":"update_attendance",
        "payload":{"memberId":"b4200000-0000-0000-0000-000000000003","checkedIn":true}
      }'::jsonb
    )
  $$,
  '%paused member requires explicit opt-in%',
  'paused attendance defaults closed'
);

reset role;

select is(
  (select first_write_at from match.release_state where singleton),
  null::timestamptz,
  'validation rejections do not mark a first write'
);

select set_config(
  'request.jwt.claim.sub',
  'b4000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000005",
      "gameDayId":"b4400000-0000-0000-0000-000000000001",
      "baseVersion":1,
      "deviceId":"b4700000-0000-0000-0000-000000000001",
      "occurredAt":"2026-07-29T01:04:00Z",
      "source":"online",
      "type":"update_attendance",
      "payload":{"memberId":"b4200000-0000-0000-0000-000000000001","checkedIn":true}
    }'::jsonb
  ),
  '{"status":"applied","version":2,"conflict":null}'::jsonb,
  'a permitted attendance command returns the established response shape'
);

reset role;

select ok(
  (select first_write_at is not null from match.release_state where singleton),
  'the first successful mutation atomically marks the release'
);

select is(
  (select count(*)::integer from match.operations),
  1,
  'a successful mutation records one operation'
);

select set_config(
  'request.jwt.claim.sub',
  'b4000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000005",
      "gameDayId":"b4400000-0000-0000-0000-000000000001",
      "baseVersion":1,
      "deviceId":"b4700000-0000-0000-0000-000000000001",
      "occurredAt":"2026-07-29T01:04:00Z",
      "source":"online",
      "type":"update_attendance",
      "payload":{"memberId":"b4200000-0000-0000-0000-000000000001","checkedIn":true}
    }'::jsonb
  ),
  '{"status":"applied","version":2,"conflict":null}'::jsonb,
  'same-content replay returns the exact stored result'
);

reset role;

select is(
  (select version from match.game_days where id = 'b4400000-0000-0000-0000-000000000001'),
  2,
  'same-content replay does not apply the mutation twice'
);

select set_config(
  'request.jwt.claim.sub',
  'b4000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select throws_like(
  $$
    select public.apply_game_day_command(
      '{
        "operationId":"b4600000-0000-0000-0000-000000000005",
        "gameDayId":"b4400000-0000-0000-0000-000000000001",
        "baseVersion":1,
        "deviceId":"b4700000-0000-0000-0000-000000000001",
        "occurredAt":"2026-07-29T01:04:00Z",
        "source":"online",
        "type":"update_attendance",
        "payload":{"memberId":"b4200000-0000-0000-0000-000000000001","checkedIn":false}
      }'::jsonb
    )
  $$,
  '%operation ID was reused with different content%',
  'different-content operation replay is rejected'
);

select throws_like(
  $$
    select public.apply_game_day_command(
      '{
        "operationId":"b4600000-0000-0000-0000-000000000006",
        "gameDayId":"b4400000-0000-0000-0000-000000000001",
        "baseVersion":2,
        "deviceId":"b4700000-0000-0000-0000-000000000001",
        "occurredAt":"2026-07-29T01:05:00Z",
        "source":"online",
        "type":"update_attendance",
        "payload":{"memberId":"b4200000-0000-0000-0000-000000000003","checkedIn":true,"allowPaused":false}
      }'::jsonb
    )
  $$,
  '%paused member requires explicit opt-in%',
  'a false paused opt-in remains rejected'
);

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000007",
      "gameDayId":"b4400000-0000-0000-0000-000000000001",
      "baseVersion":2,
      "deviceId":"b4700000-0000-0000-0000-000000000001",
      "occurredAt":"2026-07-29T01:06:00Z",
      "source":"online",
      "type":"update_attendance",
      "payload":{"memberId":"b4200000-0000-0000-0000-000000000003","checkedIn":true,"allowPaused":true}
    }'::jsonb
  ),
  '{"status":"applied","version":3,"conflict":null}'::jsonb,
  'explicit paused opt-in permits attendance'
);

select throws_like(
  $$
    select public.apply_game_day_command(
      '{
        "operationId":"b4600000-0000-0000-0000-000000000008",
        "gameDayId":"b4400000-0000-0000-0000-000000000002",
        "baseVersion":1,
        "deviceId":"b4700000-0000-0000-0000-000000000001",
        "occurredAt":"2026-07-29T01:07:00Z",
        "source":"online",
        "type":"correct_winner",
        "payload":{"matchId":"b4500000-0000-0000-0000-000000000001","winnerTeam":2}
      }'::jsonb
    )
  $$,
  '%matches.results.correct permission required%',
  'normal operators cannot correct results'
);

select throws_like(
  $$
    select public.apply_admin_command(
      '{
        "operationId":"b4600000-0000-0000-0000-000000000009",
        "deviceId":"b4700000-0000-0000-0000-000000000001",
        "occurredAt":"2026-07-29T01:08:00Z",
        "type":"setup_member_profile",
        "payload":{
          "memberId":"b4200000-0000-0000-0000-000000000002",
          "publicAlias":"Pending Ready",
          "gender":"unspecified",
          "gradeId":"b4100000-0000-0000-0000-000000000001"
        }
      }'::jsonb
    )
  $$,
  '%matches.manage permission required%',
  'normal operators cannot set up match profiles'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  'b4000000-0000-0000-0000-000000000003',
  true
);
set local role authenticated;

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000010",
      "gameDayId":"b4400000-0000-0000-0000-000000000002",
      "baseVersion":1,
      "deviceId":"b4700000-0000-0000-0000-000000000002",
      "occurredAt":"2026-07-29T01:09:00Z",
      "source":"online",
      "type":"correct_winner",
      "payload":{"matchId":"b4500000-0000-0000-0000-000000000001","winnerTeam":2}
    }'::jsonb
  ),
  '{"status":"applied","version":2,"conflict":null}'::jsonb,
  'result correctors can correct a completed result'
);

select is(
  public.apply_admin_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000011",
      "deviceId":"b4700000-0000-0000-0000-000000000002",
      "occurredAt":"2026-07-29T01:10:00Z",
      "type":"setup_member_profile",
      "payload":{
        "memberId":"b4200000-0000-0000-0000-000000000002",
        "publicAlias":"Pending Ready",
        "gender":"unspecified",
        "gradeId":"b4100000-0000-0000-0000-000000000001"
      }
    }'::jsonb
  ),
  '{"status":"applied","targetId":"b4200000-0000-0000-0000-000000000002"}'::jsonb,
  'match managers can set up a canonical member profile'
);

reset role;

select ok(
  exists (
    select 1
    from match.member_profiles
    where member_id = 'b4200000-0000-0000-0000-000000000002'
      and public_alias = 'Pending Ready'
  ),
  'profile setup writes only the private match profile'
);

select is(
  (select name from public.members where id = 'b4200000-0000-0000-0000-000000000002'),
  'Task 4 Pending',
  'profile setup does not rewrite the canonical member'
);

select set_config(
  'request.jwt.claim.sub',
  'b4000000-0000-0000-0000-000000000003',
  true
);
set local role authenticated;

select is(
  public.apply_admin_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000011",
      "deviceId":"b4700000-0000-0000-0000-000000000002",
      "occurredAt":"2026-07-29T01:10:00Z",
      "type":"setup_member_profile",
      "payload":{
        "memberId":"b4200000-0000-0000-0000-000000000002",
        "publicAlias":"Pending Ready",
        "gender":"unspecified",
        "gradeId":"b4100000-0000-0000-0000-000000000001"
      }
    }'::jsonb
  ),
  '{"status":"applied","targetId":"b4200000-0000-0000-0000-000000000002"}'::jsonb,
  'management replay returns the exact stored result'
);

select throws_like(
  $$
    select public.apply_admin_command(
      '{
        "operationId":"b4600000-0000-0000-0000-000000000011",
        "deviceId":"b4700000-0000-0000-0000-000000000002",
        "occurredAt":"2026-07-29T01:10:00Z",
        "type":"setup_member_profile",
        "payload":{
          "memberId":"b4200000-0000-0000-0000-000000000002",
          "publicAlias":"Different Alias",
          "gender":"unspecified",
          "gradeId":"b4100000-0000-0000-0000-000000000001"
        }
      }'::jsonb
    )
  $$,
  '%operation ID was reused with different content%',
  'management rejects a different-content replay'
);

select is(
  public.apply_admin_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000020",
      "deviceId":"b4700000-0000-0000-0000-000000000002",
      "occurredAt":"2026-07-29T01:19:00Z",
      "type":"review_member_link",
      "payload":{
        "linkId":"b4550000-0000-0000-0000-000000000001",
        "decision":"rejected"
      }
    }'::jsonb
  ),
  '{"status":"applied","targetId":"b4550000-0000-0000-0000-000000000001"}'::jsonb,
  'match managers can review a pending member link'
);

select is(
  public.apply_admin_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000021",
      "deviceId":"b4700000-0000-0000-0000-000000000002",
      "occurredAt":"2026-07-29T01:20:00Z",
      "type":"create_grade",
      "payload":{"name":"Task 4 Managed Grade","strength":405}
    }'::jsonb
  )->>'status',
  'applied',
  'match managers can create a match-only grade setting'
);

select is(
  public.apply_admin_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000022",
      "deviceId":"b4700000-0000-0000-0000-000000000002",
      "occurredAt":"2026-07-29T01:21:00Z",
      "type":"create_season",
      "payload":{"name":"Task 4 Managed Season","startsOn":"2026-08-01","endsOn":null}
    }'::jsonb
  )->>'status',
  'applied',
  'match managers can create a match-only season setting'
);

reset role;

select is(
  (
    select status
    from match.member_links
    where id = 'b4550000-0000-0000-0000-000000000001'
  ),
  'rejected'::match.link_status,
  'member-link review persists only in the private match domain'
);

select set_config(
  'request.jwt.claim.sub',
  'b4000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000012",
      "gameDayId":"b4400000-0000-0000-0000-000000000003",
      "baseVersion":0,
      "deviceId":"b4700000-0000-0000-0000-000000000001",
      "occurredAt":"2026-07-29T01:11:00Z",
      "source":"online",
      "type":"create_game_day",
      "payload":{
        "seasonId":"b4300000-0000-0000-0000-000000000001",
        "playedOn":"2026-07-31",
        "activeCourts":1,
        "offlineOperatorId":"b4000000-0000-0000-0000-000000000002",
        "offlineDeviceId":"b4700000-0000-0000-0000-000000000001"
      }
    }'::jsonb
  ),
  '{"status":"applied","version":1,"conflict":null}'::jsonb,
  'the established create-game-day command shape remains accepted'
);

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000023",
      "gameDayId":"b4400000-0000-0000-0000-000000000003",
      "baseVersion":1,
      "deviceId":"b4700000-0000-0000-0000-000000000001",
      "occurredAt":"2026-07-29T01:11:30Z",
      "source":"online",
      "type":"designate_offline_device",
      "payload":{
        "operatorId":"b4000000-0000-0000-0000-000000000002",
        "offlineDeviceId":"b4700000-0000-0000-0000-000000000003",
        "expiresAt":"2026-08-01T00:00:00Z"
      }
    }'::jsonb
  ),
  '{"status":"applied","version":2,"conflict":null}'::jsonb,
  'an operator can atomically replace the game-day offline lease'
);

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000013",
      "gameDayId":"b4400000-0000-0000-0000-000000000001",
      "baseVersion":3,
      "deviceId":"b4700000-0000-0000-0000-000000000001",
      "occurredAt":"2026-07-29T01:12:00Z",
      "source":"online",
      "type":"update_attendance",
      "payload":{"memberId":"b4200000-0000-0000-0000-000000000002","checkedIn":true}
    }'::jsonb
  ),
  '{"status":"applied","version":4,"conflict":null}'::jsonb,
  'a newly set-up member can be checked in'
);

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000014",
      "gameDayId":"b4400000-0000-0000-0000-000000000001",
      "baseVersion":4,
      "deviceId":"b4700000-0000-0000-0000-000000000001",
      "occurredAt":"2026-07-29T01:13:00Z",
      "source":"online",
      "type":"update_attendance",
      "payload":{"memberId":"b4200000-0000-0000-0000-000000000005","checkedIn":true}
    }'::jsonb
  ),
  '{"status":"applied","version":5,"conflict":null}'::jsonb,
  'a fourth eligible member can be checked in'
);

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000015",
      "gameDayId":"b4400000-0000-0000-0000-000000000001",
      "baseVersion":5,
      "deviceId":"b4700000-0000-0000-0000-000000000001",
      "occurredAt":"2026-07-29T01:14:00Z",
      "source":"online",
      "type":"activate_game_day",
      "payload":{}
    }'::jsonb
  ),
  '{"status":"applied","version":6,"conflict":null}'::jsonb,
  'four eligible attendees allow game-day activation'
);

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000016",
      "gameDayId":"b4400000-0000-0000-0000-000000000001",
      "baseVersion":6,
      "deviceId":"b4700000-0000-0000-0000-000000000001",
      "occurredAt":"2026-07-29T01:15:00Z",
      "source":"online",
      "type":"confirm_match",
      "payload":{
        "matchId":"b4500000-0000-0000-0000-000000000002",
        "courtNumber":1,
        "team1":[
          "b4200000-0000-0000-0000-000000000001",
          "b4200000-0000-0000-0000-000000000003"
        ],
        "team2":[
          "b4200000-0000-0000-0000-000000000002",
          "b4200000-0000-0000-0000-000000000005"
        ]
      }
    }'::jsonb
  ),
  '{"status":"applied","version":7,"conflict":null}'::jsonb,
  'the normal match-confirmation flow persists four eligible players'
);

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000017",
      "gameDayId":"b4400000-0000-0000-0000-000000000001",
      "baseVersion":7,
      "deviceId":"b4700000-0000-0000-0000-000000000001",
      "occurredAt":"2026-07-29T01:16:00Z",
      "source":"online",
      "type":"start_match",
      "payload":{"matchId":"b4500000-0000-0000-0000-000000000002"}
    }'::jsonb
  ),
  '{"status":"applied","version":8,"conflict":null}'::jsonb,
  'a confirmed match can start'
);

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000018",
      "gameDayId":"b4400000-0000-0000-0000-000000000001",
      "baseVersion":8,
      "deviceId":"b4700000-0000-0000-0000-000000000001",
      "occurredAt":"2026-07-29T01:17:00Z",
      "source":"online",
      "type":"record_winner",
      "payload":{"matchId":"b4500000-0000-0000-0000-000000000002","winnerTeam":1}
    }'::jsonb
  ),
  '{"status":"applied","version":9,"conflict":null}'::jsonb,
  'a running match can record its winner'
);

select is(
  public.apply_game_day_command(
    '{
      "operationId":"b4600000-0000-0000-0000-000000000019",
      "gameDayId":"b4400000-0000-0000-0000-000000000001",
      "baseVersion":9,
      "deviceId":"b4700000-0000-0000-0000-000000000001",
      "occurredAt":"2026-07-29T01:18:00Z",
      "source":"online",
      "type":"complete_game_day",
      "payload":{"acknowledgeUnfinished":false}
    }'::jsonb
  ),
  '{"status":"applied","version":10,"conflict":null}'::jsonb,
  'a game day with no unfinished match can complete'
);

reset role;

select ok(
  exists (
    select 1
    from match.offline_leases
    where game_day_id = 'b4400000-0000-0000-0000-000000000003'
      and operator_id = 'b4000000-0000-0000-0000-000000000002'
      and device_id = 'b4700000-0000-0000-0000-000000000003'
  ),
  'game-day creation establishes the requested offline lease'
);

select ok(
  exists (
    select 1
    from match.matches
    where id = 'b4500000-0000-0000-0000-000000000002'
      and status = 'completed'
      and winner_team = 1
  )
  and (
    select status
    from match.game_days
    where id = 'b4400000-0000-0000-0000-000000000001'
  ) = 'completed'::match.game_day_status,
  'the normal game flow finishes both match and game day'
);

select is(
  (select winner_team from match.matches where id = 'b4500000-0000-0000-0000-000000000001'),
  2,
  'result correction persisted the selected winner'
);

select is(
  (select count(*)::integer from match.operations),
  16,
  'only successful unique commands are persisted'
);

select is(
  (select count(*)::integer from match.audit_events),
  16,
  'only successful unique commands are audited'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'match.operations',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'authenticated callers have no direct operation-table privileges'
);

select ok(
  not exists (
    select 1
    from match.audit_events
    where before_data::text like '%Task 4 Pending%'
       or after_data::text like '%Task 4 Pending%'
  ),
  'match audits do not copy canonical legal names'
);

select * from finish();
rollback;
