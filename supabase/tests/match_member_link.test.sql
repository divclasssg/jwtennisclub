begin;

select plan(33);

select has_function(
  'public',
  'request_member_link',
  array['text', 'text'],
  'the generic member-link request RPC exists'
);

select has_function(
  'match',
  'cleanup_member_link_attempts',
  array[]::text[],
  'the private member-link cleanup routine exists'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname = 'request_member_link'
      and routine.prosecdef
      and routine.proconfig = array['search_path=""']::text[]
  ),
  'the member-link RPC is a security definer with an empty search path'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.request_member_link(text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.request_member_link(text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'public',
    'public.request_member_link(text,text)',
    'EXECUTE'
  ),
  'only authenticated clients receive member-link execute privilege'
);

select ok(
  not pg_catalog.has_function_privilege(
    'service_role',
    'public.request_member_link(text,text)',
    'EXECUTE'
  ),
  'the member-link RPC adds no service-role execute grant'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'match.member_link_attempts'::regclass
      and not attribute.attisdropped
      and attribute.attname in (
        'legal_name',
        'name',
        'phone',
        'phone_suffix',
        'contact',
        'raw_request'
      )
  ),
  'attempt persistence has no raw identity columns'
);

insert into auth.users (id, aud, role, email)
values
  (
    'c4000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'match-link-one@example.com'
  ),
  (
    'c4000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'match-link-two@example.com'
  ),
  (
    'c4000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'match-link-three@example.com'
  ),
  (
    'c4000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'match-link-rate@example.com'
  ),
  (
    'c4000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'match-link-cap@example.com'
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
    'c4200000-0000-0000-0000-000000000001',
    'Link Unique',
    'active',
    null,
    date '2026-07-01',
    null
  ),
  (
    'c4200000-0000-0000-0000-000000000002',
    'Link Duplicate',
    'active',
    null,
    date '2026-07-01',
    null
  ),
  (
    'c4200000-0000-0000-0000-000000000003',
    'Link Duplicate',
    'active',
    null,
    date '2026-07-01',
    null
  );

insert into public.member_contacts (
  member_id,
  phone_number,
  phone_normalized
)
values
  (
    'c4200000-0000-0000-0000-000000000001',
    '01012345678',
    '01012345678'
  ),
  (
    'c4200000-0000-0000-0000-000000000002',
    '01099990000',
    '01099990000'
  ),
  (
    'c4200000-0000-0000-0000-000000000003',
    '01088880000',
    '01088880000'
  );

select set_config(
  'request.jwt.claim.sub',
  'c4000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select throws_like(
  $$select public.request_member_link('Link Unique', '5678')$$,
  '%match traffic is disabled%',
  'release-off rejects link mutations'
);

reset role;

select is(
  (select count(*)::integer from match.member_link_attempts),
  0,
  'release-off leaves no attempt row'
);

update match.release_state
set traffic_enabled = true,
    enabled_at = clock_timestamp()
where singleton;

select set_config(
  'request.jwt.claim.sub',
  'c4000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select throws_like(
  $$select public.request_member_link('Link Unique', '5678')$$,
  '%member-link HMAC key is unavailable%',
  'missing server-only HMAC material fails closed'
);

reset role;

select is(
  (select count(*)::integer from match.member_link_attempts),
  0,
  'missing HMAC material leaves no attempt row'
);

select is(
  (select first_write_at from match.release_state where singleton),
  null::timestamptz,
  'failed link requests do not mark a first write'
);

select set_config('app.match_link_hmac_key_version', '7', true);
select set_config(
  'app.match_link_hmac_key_v7',
  'task-4-local-hmac-key-not-for-production',
  true
);

select set_config(
  'request.jwt.claim.sub',
  'c4000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select is(
  public.request_member_link(' Link Unique ', '5678'),
  '{"accepted":true}'::jsonb,
  'a unique match returns the generic accepted shape'
);

reset role;

select ok(
  (select first_write_at is not null from match.release_state where singleton),
  'a persisted link attempt marks the first write'
);

select is(
  (
    select pg_catalog.encode(request_hmac, 'hex')
    from match.member_link_attempts
    where auth_user_id = 'c4000000-0000-0000-0000-000000000001'
  ),
  pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to('link unique' || chr(31) || '5678', 'utf8'),
      pg_catalog.convert_to(
        'task-4-local-hmac-key-not-for-production',
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'attempts persist only the expected HMAC-SHA256 fingerprint'
);

select is(
  (
    select key_version
    from match.member_link_attempts
    where auth_user_id = 'c4000000-0000-0000-0000-000000000001'
  ),
  7,
  'attempts persist the active HMAC key version'
);

select ok(
  exists (
    select 1
    from match.member_links
    where auth_user_id = 'c4000000-0000-0000-0000-000000000001'
      and member_id = 'c4200000-0000-0000-0000-000000000001'
      and status = 'pending'
  ),
  'a unique active member creates a pending review link'
);

select set_config(
  'request.jwt.claim.sub',
  'c4000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select is(
  public.request_member_link('Nobody Here', '1111'),
  '{"accepted":true}'::jsonb,
  'a mismatch returns the same generic accepted shape'
);

select set_config('app.match_link_hmac_key_version', '8', true);
select set_config(
  'app.match_link_hmac_key_v8',
  'task-4-rotated-local-hmac-key-not-for-production',
  true
);

select is(
  public.request_member_link('Nobody Here', '1111'),
  '{"accepted":true}'::jsonb,
  'a rotated key keeps the same generic accepted response'
);

reset role;

select ok(
  (
    select pg_catalog.array_agg(
      distinct attempts.key_version
      order by attempts.key_version
    )
    from match.member_link_attempts as attempts
    where attempts.auth_user_id =
      'c4000000-0000-0000-0000-000000000002'
  ) = array[7, 8]::integer[]
  and (
    select pg_catalog.count(distinct attempts.request_hmac)
    from match.member_link_attempts as attempts
    where attempts.auth_user_id =
      'c4000000-0000-0000-0000-000000000002'
  ) = 2,
  'key rotation persists versions and produces distinct HMACs'
);

select set_config('app.match_link_hmac_key_version', '7', true);

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  'c4000000-0000-0000-0000-000000000003',
  true
);

select is(
  public.request_member_link('Link Duplicate', '0000'),
  '{"accepted":true}'::jsonb,
  'an ambiguous duplicate returns the same generic accepted shape'
);

reset role;

select ok(
  not exists (
    select 1
    from match.member_links
    where auth_user_id in (
      'c4000000-0000-0000-0000-000000000002',
      'c4000000-0000-0000-0000-000000000003'
    )
  ),
  'mismatch and ambiguous inputs create no reviewable link'
);

select set_config(
  'request.jwt.claim.sub',
  'c4000000-0000-0000-0000-000000000004',
  true
);
set local role authenticated;

select is(public.request_member_link('Rate One', '1001'), '{"accepted":true}'::jsonb, 'rate attempt one accepted');
select is(public.request_member_link('Rate Two', '1002'), '{"accepted":true}'::jsonb, 'rate attempt two accepted');
select is(public.request_member_link('Rate Three', '1003'), '{"accepted":true}'::jsonb, 'rate attempt three accepted');
select is(public.request_member_link('Rate Four', '1004'), '{"accepted":true}'::jsonb, 'rate attempt four accepted');
select is(public.request_member_link('Rate Five', '1005'), '{"accepted":true}'::jsonb, 'rate attempt five accepted');
select is(public.request_member_link('Rate Six', '1006'), '{"accepted":true}'::jsonb, 'over-limit attempt keeps the generic response');

reset role;

select is(
  (
    select count(*)::integer
    from match.member_link_attempts
    where auth_user_id = 'c4000000-0000-0000-0000-000000000004'
  ),
  5,
  'the sixth request in one hour leaves no attempt row'
);

insert into match.member_link_attempts (
  auth_user_id,
  request_hmac,
  key_version,
  requested_at
)
select
  'c4000000-0000-0000-0000-000000000005',
  extensions.hmac(
    pg_catalog.convert_to('cap-' || item::text, 'utf8'),
    pg_catalog.convert_to('task-4-local-hmac-key-not-for-production', 'utf8'),
    'sha256'
  ),
  7,
  case when item = 1
    then clock_timestamp() - interval '25 hours'
    else clock_timestamp() - item * interval '1 minute'
  end
from pg_catalog.generate_series(1, 25) as item;

select lives_ok(
  $$select match.cleanup_member_link_attempts()$$,
  'the private cleanup routine runs'
);

select ok(
  not exists (
    select 1
    from match.member_link_attempts
    where requested_at < clock_timestamp() - interval '24 hours'
  ),
  'cleanup removes attempts older than 24 hours'
);

select is(
  (
    select count(*)::integer
    from match.member_link_attempts
    where auth_user_id = 'c4000000-0000-0000-0000-000000000005'
  ),
  20,
  'cleanup retains at most the newest 20 attempts per user'
);

select ok(
  exists (
    select 1
    from cron.job
    where jobname = 'match-member-link-attempt-cleanup-hourly'
      and schedule = '0 * * * *'
      and active
  ),
  'pg_cron has an active hourly cleanup schedule'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'match.member_link_attempts',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'authenticated callers cannot inspect or mutate attempts directly'
);

select * from finish();
rollback;
