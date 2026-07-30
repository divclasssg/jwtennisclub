begin;

select plan(50);

select has_function(
  'public',
  'get_match_release_state',
  array[]::text[],
  'authenticated Edge callers can read the release gate'
);
select has_function(
  'public',
  'consume_member_link_edge_rate',
  array['text', 'timestamp with time zone', 'text'],
  'the signed shared member-link limiter exists'
);
select has_function(
  'public',
  'get_match_recommendation_input',
  array['uuid', 'integer', 'integer'],
  'the deterministic matcher input RPC exists'
);
select has_function(
  'public',
  'get_member_read',
  array['text', 'uuid'],
  'the approved-member read RPC exists'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname in (
        'get_match_release_state',
        'consume_member_link_edge_rate',
        'get_match_recommendation_input',
        'get_member_read'
      )
      and (
        not routine.prosecdef
        or routine.proconfig is distinct from array['search_path=""']::text[]
      )
  ),
  'all Edge support RPCs are fixed-search-path security definers'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.get_match_release_state()',
      'public.consume_member_link_edge_rate(text,timestamp with time zone,text)',
      'public.get_match_recommendation_input(uuid,integer,integer)',
      'public.get_member_read(text,uuid)'
    ]) as signature(name)
    where pg_catalog.to_regprocedure(signature.name) is null
      or not pg_catalog.has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(signature.name),
        'EXECUTE'
      )
  ),
  'authenticated callers may execute every Edge support RPC'
);

select ok(
  not exists (
    select 1
    from unnest(array['public', 'anon', 'service_role']) as role_name(name)
    cross join unnest(array[
      'public.get_match_release_state()',
      'public.consume_member_link_edge_rate(text,timestamp with time zone,text)',
      'public.get_match_recommendation_input(uuid,integer,integer)',
      'public.get_member_read(text,uuid)'
    ]) as signature(name)
    where pg_catalog.to_regprocedure(signature.name) is not null
      and pg_catalog.has_function_privilege(
        role_name.name,
        pg_catalog.to_regprocedure(signature.name),
        'EXECUTE'
      )
  ),
  'public, anonymous, and service roles receive no Edge support execute grant'
);

select has_table(
  'match',
  'member_link_edge_limits',
  'shared limiter counters are private persisted state'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'match.member_link_edge_limits'::regclass
      and not attribute.attisdropped
      and attribute.attname in (
        'ip',
        'ip_address',
        'origin',
        'legal_name',
        'phone',
        'phone_suffix',
        'raw_request'
      )
  ),
  'shared limiter persistence has no raw origin or identity columns'
);
select ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'match.member_link_edge_limits',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'authenticated callers have no direct limiter table privileges'
);

insert into auth.users (id, aud, role, email)
values
  (
    'd5000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'edge-member@example.com'
  ),
  (
    'd5000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'edge-pending@example.com'
  ),
  (
    'd5000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'edge-operator@example.com'
  );

insert into public.profiles (id, role_id, display_name, email, status)
select
  'd5000000-0000-0000-0000-000000000003'::uuid,
  roles.id,
  'Edge Operator',
  'edge-operator@example.com',
  'active'
from public.roles as roles
where roles.name = 'operator';

insert into public.members (
  id,
  name,
  status,
  pause_start_month,
  joined_date,
  withdrawn_date
)
select
  ('d5100000-0000-0000-0000-' || lpad(value::text, 12, '0'))::uuid,
  'Private Canonical ' || value,
  'active',
  null,
  date '2026-07-01',
  null
from pg_catalog.generate_series(1, 33) as value;

insert into match.grades (id, name, strength)
values ('d5200000-0000-0000-0000-000000000001', 'Edge Grade', 505);

insert into match.member_profiles (
  member_id,
  public_alias,
  gender,
  grade_id
)
select
  ('d5100000-0000-0000-0000-' || lpad(value::text, 12, '0'))::uuid,
  '공개별칭' || value,
  case when value % 2 = 0
    then 'male'::match.gender_type
    else 'female'::match.gender_type
  end,
  'd5200000-0000-0000-0000-000000000001'
from pg_catalog.generate_series(1, 33) as value;

insert into match.member_links (
  id,
  auth_user_id,
  member_id,
  status,
  reviewed_at
)
values
  (
    'd5300000-0000-0000-0000-000000000001',
    'd5000000-0000-0000-0000-000000000001',
    'd5100000-0000-0000-0000-000000000001',
    'approved',
    pg_catalog.clock_timestamp()
  ),
  (
    'd5300000-0000-0000-0000-000000000002',
    'd5000000-0000-0000-0000-000000000002',
    'd5100000-0000-0000-0000-000000000002',
    'pending',
    null
  );

insert into match.seasons (id, name, starts_on)
values (
  'd5400000-0000-0000-0000-000000000001',
  'Edge Season',
  date '2026-07-01'
);
insert into match.seasons (id, name, starts_on, ends_on, active)
values (
  'd5400000-0000-0000-0000-000000000002',
  'Previous Edge Season',
  date '2026-06-01',
  date '2026-06-30',
  false
);
insert into match.game_days (
  id,
  season_id,
  played_on,
  status,
  active_courts,
  created_by
)
values (
  'd5500000-0000-0000-0000-000000000001',
  'd5400000-0000-0000-0000-000000000001',
  date '2026-07-30',
  'active',
  1,
  'd5000000-0000-0000-0000-000000000003'
);
insert into match.attendances (game_day_id, member_id, checked_in)
select
  'd5500000-0000-0000-0000-000000000001',
  ('d5100000-0000-0000-0000-' || lpad(value::text, 12, '0'))::uuid,
  true
from pg_catalog.generate_series(1, 32) as value;
insert into match.game_days (
  id,
  season_id,
  played_on,
  status,
  active_courts,
  created_by,
  completed_at
)
values (
  'd5500000-0000-0000-0000-000000000002',
  'd5400000-0000-0000-0000-000000000002',
  date '2026-06-30',
  'completed',
  1,
  'd5000000-0000-0000-0000-000000000003',
  pg_catalog.clock_timestamp() - interval '30 days'
);
insert into match.matches (
  id,
  game_day_id,
  court_number,
  status,
  winner_team,
  completed_at
)
values (
  'd5600000-0000-0000-0000-000000000001',
  'd5500000-0000-0000-0000-000000000001',
  1,
  'completed',
  1,
  pg_catalog.clock_timestamp() - interval '10 minutes'
);
insert into match.match_players (
  match_id,
  member_id,
  slot,
  team,
  grade_id_snapshot,
  grade_strength_snapshot
)
select
  'd5600000-0000-0000-0000-000000000001',
  ('d5100000-0000-0000-0000-' || lpad(value::text, 12, '0'))::uuid,
  value,
  case when value <= 2 then 1 else 2 end,
  'd5200000-0000-0000-0000-000000000001',
  505
from pg_catalog.generate_series(1, 4) as value;
insert into match.matches (
  id,
  game_day_id,
  court_number,
  status,
  winner_team,
  completed_at
)
values (
  'd5600000-0000-0000-0000-000000000002',
  'd5500000-0000-0000-0000-000000000002',
  1,
  'completed',
  2,
  pg_catalog.clock_timestamp() - interval '30 days'
);
insert into match.match_players (
  match_id,
  member_id,
  slot,
  team,
  grade_id_snapshot,
  grade_strength_snapshot
)
select
  'd5600000-0000-0000-0000-000000000002',
  ('d5100000-0000-0000-0000-' || lpad(value::text, 12, '0'))::uuid,
  value,
  case when value <= 2 then 1 else 2 end,
  'd5200000-0000-0000-0000-000000000001',
  505
from pg_catalog.generate_series(1, 4) as value;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd5000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select is(
  public.get_match_release_state(),
  '{"trafficEnabled":false}'::jsonb,
  'release state defaults off and exposes no owner mutation fields'
);
select is(
  public.get_member_read('all', null)->'member',
  jsonb_build_object(
    'memberId',
    'd5100000-0000-0000-0000-000000000001'::uuid,
    'publicAlias',
    '공개별칭1'
  ),
  'approved member identity contains only private match alias data'
);
select is(
  public.get_member_read('all', null)->>'scope',
  'all',
  'member-read preserves the requested scope'
);
select is(
  public.get_member_read('all', null)->'summary'->>'games',
  '2',
  'member-read summary derives completed match count'
);
select is(
  public.get_member_read('all', null)->'summary'->>'wins',
  '1',
  'member-read summary derives wins'
);
select is(
  public.get_member_read('current', null)->'summary'->>'games',
  '1',
  'current member-read summary uses only the active season'
);
select is(
  public.get_member_read(
    'season',
    'd5400000-0000-0000-0000-000000000002'
  )->'summary'->>'games',
  '1',
  'season member-read summary uses only the requested season'
);
select is(
  public.get_member_read('all', null)->'partners'->0->>'games',
  '2',
  'all member-read partners span both seasons'
);
select is(
  public.get_member_read('current', null)->'partners'->0->>'games',
  '1',
  'current member-read partners use only the active season'
);
select is(
  public.get_member_read(
    'season',
    'd5400000-0000-0000-0000-000000000002'
  )->'partners'->0->>'games',
  '1',
  'season member-read partners use only the requested season'
);
select is(
  pg_catalog.jsonb_array_length(
    public.get_member_read('all', null)->'matchHistory'
  ),
  2,
  'all member-read history spans both seasons'
);
select is(
  pg_catalog.jsonb_array_length(
    public.get_member_read('current', null)->'matchHistory'
  ),
  1,
  'current member-read history uses only the active season'
);
select is(
  pg_catalog.jsonb_array_length(
    public.get_member_read(
      'season',
      'd5400000-0000-0000-0000-000000000002'
    )->'matchHistory'
  ),
  1,
  'season member-read history uses only the requested season'
);
select is(
  public.get_member_read('all', null)
    ->'leaderboards'->'games'->0->>'games',
  '2',
  'all member-read leaderboards span both seasons'
);
select is(
  public.get_member_read('current', null)
    ->'leaderboards'->'games'->0->>'games',
  '1',
  'current member-read leaderboards use only the active season'
);
select is(
  public.get_member_read(
    'season',
    'd5400000-0000-0000-0000-000000000002'
  )->'leaderboards'->'games'->0->>'games',
  '1',
  'season member-read leaderboards use only the requested season'
);
reset role;
update match.seasons set active = false;
set local role authenticated;
select is(
  pg_catalog.jsonb_build_array(
    public.get_member_read('current', null)->'summary'->'games',
    public.get_member_read('current', null)->'partners',
    public.get_member_read('current', null)->'matchHistory',
    public.get_member_read('current', null)->'leaderboards'->'games'
  ),
  '[0, [], [], []]'::jsonb,
  'current member-read is stably empty when no active season exists'
);
reset role;
update match.seasons
set active = true
where id = 'd5400000-0000-0000-0000-000000000001';
set local role authenticated;
select ok(
  public.get_member_read('all', null)::text !~
    'Private Canonical|legalName|phoneSuffix|phoneNumber|memberCode|gender|grade',
  'member-read never exposes canonical identity or private profile fields'
);
select throws_ok(
  $$select public.get_member_read('unknown', null)$$,
  '22023',
  'invalid member read scope',
  'unknown member-read scopes are rejected'
);
select throws_ok(
  $$select public.get_member_read('season', null)$$,
  '22023',
  'season scope requires a season ID',
  'season member reads require a season ID'
);

reset role;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd5000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;
select throws_ok(
  $$select public.get_member_read('all', null)$$,
  '42501',
  'approved link required',
  'pending member links cannot read member models'
);
reset role;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd5000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select public.get_match_recommendation_input(
      'd5500000-0000-0000-0000-000000000001',
      1
    )
  $$,
  '42501',
  'matches.view permission required',
  'ordinary members cannot load private matcher inputs'
);
reset role;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd5000000-0000-0000-0000-000000000003',
  true
);
set local role authenticated;
select is(
  pg_catalog.jsonb_array_length(
    public.get_match_recommendation_input(
      'd5500000-0000-0000-0000-000000000001',
      1
    )->'members'
  ),
  32,
  'operator matcher input accepts the 32-member product cap'
);
select is(
  pg_catalog.jsonb_array_length(
    public.get_match_recommendation_input(
      'd5500000-0000-0000-0000-000000000001',
      1
    )->'completedMatches'
  ),
  1,
  'matcher input preserves completed team history'
);
select throws_ok(
  $$
    select public.get_match_recommendation_input(
      'd5500000-0000-0000-0000-000000000001',
      2
    )
  $$,
  'P0002',
  'active game-day court not found',
  'matcher input rejects inactive courts'
);
reset role;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd5000000-0000-0000-0000-000000000003',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select public.get_match_recommendation_input(
      'd5500000-0000-0000-0000-000000000001',
      1,
      33
    )
  $$,
  '22023',
  'match recommendation limit must be between 4 and 32',
  'matcher input rejects requested limits above the product cap'
);
reset role;
insert into match.attendances (game_day_id, member_id, checked_in)
values (
  'd5500000-0000-0000-0000-000000000001',
  'd5100000-0000-0000-0000-000000000033',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select public.get_match_recommendation_input(
      'd5500000-0000-0000-0000-000000000001',
      1,
      32
    )
  $$,
  '22023',
  'match recommendation member limit exceeded',
  'matcher input rejects a 33-member checked-in population'
);
reset role;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd5000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select public.consume_member_link_edge_rate(
      repeat('a', 64),
      date_trunc('hour', clock_timestamp()),
      repeat('b', 64)
    )
  $$,
  '58000',
  'Edge rate-limit infrastructure is unavailable',
  'missing Vault limiter configuration has a distinct stable error'
);
reset role;

do $vault_setup$
begin
  perform vault.create_secret(
    'task-five-edge-rate-secret',
    'match_edge_rate_limit_hmac',
    'pgTAP Edge limiter proof key',
    null
  );
end;
$vault_setup$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'd5000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.consume_member_link_edge_rate(
      pg_catalog.encode(
        extensions.digest('release-off-origin', 'sha256'),
        'hex'
      ),
      date_trunc('hour', clock_timestamp()),
      pg_catalog.encode(
        extensions.hmac(
          pg_catalog.convert_to(
            'v1' || chr(31)
              || extract(
                epoch from date_trunc('hour', clock_timestamp())
              )::bigint::text
              || chr(31)
              || pg_catalog.encode(
                extensions.digest('release-off-origin', 'sha256'),
                'hex'
              ),
            'utf8'
          ),
          pg_catalog.convert_to(
            'task-five-edge-rate-secret',
            'utf8'
          ),
          'sha256'
        ),
        'hex'
      )
    )
  $$,
  '55000',
  'match traffic is disabled',
  'release shutdown is authoritative immediately before limiter writes'
);
reset role;
select is(
  (select count(*)::integer from match.member_link_edge_limits),
  0,
  'release-off limiter attempts consume no shared capacity'
);
update match.release_state
set traffic_enabled = true,
    enabled_at = pg_catalog.clock_timestamp()
where singleton;
set local role authenticated;

select throws_ok(
  $$
    select public.consume_member_link_edge_rate(
      repeat('a', 64),
      date_trunc('hour', clock_timestamp()),
      repeat('b', 64)
    )
  $$,
  '42501',
  'invalid Edge rate-limit proof',
  'direct callers cannot consume arbitrary limiter buckets'
);
reset role;
select is(
  (select count(*)::integer from match.member_link_edge_limits),
  0,
  'invalid proofs consume no shared capacity'
);

do $origin_limit$
declare
  bucket text := pg_catalog.encode(
    extensions.digest('origin-one', 'sha256'),
    'hex'
  );
  rate_window timestamptz := date_trunc('hour', clock_timestamp());
  proof text;
  attempt integer;
begin
  proof := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(
        'v1' || chr(31)
          || extract(epoch from rate_window)::bigint::text
          || chr(31) || bucket,
        'utf8'
      ),
      pg_catalog.convert_to('task-five-edge-rate-secret', 'utf8'),
      'sha256'
    ),
    'hex'
  );
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    'd5000000-0000-0000-0000-000000000001',
    true
  );
  execute 'set local role authenticated';
  for attempt in 1..20 loop
    if not (
      public.consume_member_link_edge_rate(
        bucket,
        rate_window,
        proof
      )->>'allowed'
    )::boolean then
      raise exception 'origin limit rejected attempt %', attempt;
    end if;
  end loop;
  execute 'reset role';
end;
$origin_limit$;

set local role authenticated;
select is(
  public.consume_member_link_edge_rate(
    pg_catalog.encode(extensions.digest('origin-one', 'sha256'), 'hex'),
    date_trunc('hour', clock_timestamp()),
    pg_catalog.encode(
      extensions.hmac(
        pg_catalog.convert_to(
          'v1' || chr(31)
            || extract(
              epoch from date_trunc('hour', clock_timestamp())
            )::bigint::text
            || chr(31)
            || pg_catalog.encode(
              extensions.digest('origin-one', 'sha256'),
              'hex'
            ),
          'utf8'
        ),
        pg_catalog.convert_to('task-five-edge-rate-secret', 'utf8'),
        'sha256'
      ),
      'hex'
    )
  ),
  '{"allowed":false}'::jsonb,
  'the twenty-first request from one origin is rejected'
);
reset role;
select is(
  (
    select attempts
    from match.member_link_edge_limits
    where bucket_kind = 'origin'
      and window_started_at = date_trunc('hour', clock_timestamp())
  ),
  20,
  'origin attempts stop at twenty'
);

do $service_limit$
declare
  bucket text;
  rate_window timestamptz := date_trunc('hour', clock_timestamp());
  proof text;
  origin_number integer;
  attempt integer;
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    'd5000000-0000-0000-0000-000000000001',
    true
  );
  execute 'set local role authenticated';
  for origin_number in 2..5 loop
    bucket := pg_catalog.encode(
      extensions.digest('origin-' || origin_number::text, 'sha256'),
      'hex'
    );
    proof := pg_catalog.encode(
      extensions.hmac(
        pg_catalog.convert_to(
          'v1' || chr(31)
            || extract(epoch from rate_window)::bigint::text
            || chr(31) || bucket,
          'utf8'
        ),
        pg_catalog.convert_to('task-five-edge-rate-secret', 'utf8'),
        'sha256'
      ),
      'hex'
    );
    for attempt in 1..20 loop
      perform public.consume_member_link_edge_rate(
        bucket,
        rate_window,
        proof
      );
    end loop;
  end loop;
  execute 'reset role';
end;
$service_limit$;

set local role authenticated;
select is(
  public.consume_member_link_edge_rate(
    pg_catalog.encode(extensions.digest('origin-six', 'sha256'), 'hex'),
    date_trunc('hour', clock_timestamp()),
    pg_catalog.encode(
      extensions.hmac(
        pg_catalog.convert_to(
          'v1' || chr(31)
            || extract(
              epoch from date_trunc('hour', clock_timestamp())
            )::bigint::text
            || chr(31)
            || pg_catalog.encode(
              extensions.digest('origin-six', 'sha256'),
              'hex'
            ),
          'utf8'
        ),
        pg_catalog.convert_to('task-five-edge-rate-secret', 'utf8'),
        'sha256'
      ),
      'hex'
    )
  ),
  '{"allowed":false}'::jsonb,
  'the one-hundred-first service request is rejected'
);
reset role;
select is(
  (
    select attempts
    from match.member_link_edge_limits
    where bucket_kind = 'service'
      and window_started_at = date_trunc('hour', clock_timestamp())
  ),
  100,
  'service attempts stop at one hundred'
);

insert into match.member_link_edge_limits (
  window_started_at,
  bucket_kind,
  bucket_hash,
  attempts
)
values (
  date_trunc('hour', clock_timestamp()) - interval '3 hours',
  'origin',
  extensions.digest('expired-origin', 'sha256'),
  1
);
select is(
  match.cleanup_member_link_edge_limits() >= 1,
  true,
  'cleanup removes limiter windows older than two hours'
);
select ok(
  not exists (
    select 1
    from match.member_link_edge_limits
    where window_started_at
      < date_trunc('hour', clock_timestamp()) - interval '2 hours'
  ),
  'expired limiter rows are not retained'
);
select is(
  (select first_write_at from match.release_state where singleton),
  null::timestamptz,
  'release reads and rate checks never mark a domain first write'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'match.member_match_read(uuid)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'match.cleanup_member_link_edge_limits()',
    'EXECUTE'
  ),
  'private member-read and cleanup helpers have no direct client grant'
);

select * from finish();
rollback;
