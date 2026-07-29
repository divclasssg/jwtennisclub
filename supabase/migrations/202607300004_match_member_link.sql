create table match.member_link_attempts (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null
    references auth.users(id) on delete cascade,
  request_hmac bytea not null
    check (pg_catalog.octet_length(request_hmac) = 32),
  key_version integer not null check (key_version > 0),
  requested_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index member_link_attempts_user_time_idx
  on match.member_link_attempts(auth_user_id, requested_at desc, id desc);

alter table match.member_link_attempts enable row level security;

revoke all on match.member_link_attempts
from public, anon, authenticated, service_role;
revoke all on sequence match.member_link_attempts_id_seq
from public, anon, authenticated, service_role;
revoke all privileges on type match.member_link_attempts
from public, anon, authenticated, service_role;

create or replace function match.get_member_link_hmac_key()
returns table (
  key_version integer,
  key_material text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_version integer;
  configured_key text;
  vault_secret_name text;
begin
  if pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    raise exception 'member-link HMAC key is unavailable'
      using errcode = '55000';
  end if;

  begin
    execute
      'select nullif(decrypted_secret, '''')::integer
         from vault.decrypted_secrets
        where name = $1
        order by created_at desc
        limit 1'
    into configured_version
    using 'match_member_link_hmac_active_version';
  exception
    when others then
      configured_version := null;
  end;

  if configured_version is null or configured_version <= 0 then
    raise exception 'member-link HMAC key is unavailable'
      using errcode = '55000';
  end if;

  vault_secret_name :=
    'match_member_link_hmac_v' || configured_version::text;

  execute
    'select decrypted_secret
       from vault.decrypted_secrets
      where name = $1
      order by created_at desc
      limit 1'
  into configured_key
  using vault_secret_name;

  if nullif(configured_key, '') is null then
    raise exception 'member-link HMAC key is unavailable'
      using errcode = '55000';
  end if;

  return query
  select configured_version, configured_key;
end;
$$;

revoke all on function match.get_member_link_hmac_key()
from public, anon, authenticated, service_role;

create or replace function public.request_member_link(
  requested_legal_name text,
  requested_phone_suffix text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  normalized_name text;
  normalized_suffix text;
  active_key_version integer;
  active_key text;
  request_fingerprint bytea;
  recent_attempts integer;
  matched_member_id uuid;
  matched_member_count integer := 0;
  release_enabled boolean;
begin
  if requester_id is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  select release_state.traffic_enabled
  into release_enabled
  from match.release_state as release_state
  where release_state.singleton
  for update;

  if not coalesce(release_enabled, false) then
    raise exception 'match traffic is disabled'
      using errcode = '55000';
  end if;

  select hmac_key.key_version, hmac_key.key_material
  into active_key_version, active_key
  from match.get_member_link_hmac_key() as hmac_key;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requester_id::text, 1)
  );

  select pg_catalog.count(*)::integer
  into recent_attempts
  from match.member_link_attempts as attempts
  where attempts.auth_user_id = requester_id
    and attempts.requested_at
      >= pg_catalog.clock_timestamp() - interval '1 hour';

  if recent_attempts >= 5 then
    return '{"accepted":true}'::pg_catalog.jsonb;
  end if;

  normalized_name := pg_catalog.lower(
    pg_catalog.btrim(coalesce(requested_legal_name, ''))
  );
  normalized_suffix := pg_catalog.btrim(
    coalesce(requested_phone_suffix, '')
  );

  request_fingerprint := extensions.hmac(
    pg_catalog.convert_to(
      normalized_name || chr(31) || normalized_suffix,
      'utf8'
    ),
    pg_catalog.convert_to(active_key, 'utf8'),
    'sha256'
  );

  if normalized_name <> ''
     and normalized_suffix ~ '^[0-9]{4}$' then
    select
      (pg_catalog.array_agg(members.id order by members.id))[1],
      pg_catalog.count(*)::integer
    into matched_member_id, matched_member_count
    from public.members as members
    join public.member_contacts as contacts
      on contacts.member_id = members.id
    where members.status <> 'withdrawn'::public.member_status
      and contacts.phone_normalized is not null
      and extensions.hmac(
        pg_catalog.convert_to(
          pg_catalog.lower(pg_catalog.btrim(members.name))
            || chr(31)
            || pg_catalog.right(contacts.phone_normalized, 4),
          'utf8'
        ),
        pg_catalog.convert_to(active_key, 'utf8'),
        'sha256'
      ) = request_fingerprint;
  end if;

  insert into match.member_link_attempts (
    auth_user_id,
    request_hmac,
    key_version
  )
  values (
    requester_id,
    request_fingerprint,
    active_key_version
  );

  delete from match.member_link_attempts as attempts
  where attempts.id in (
    select overflow_attempts.id
    from match.member_link_attempts as overflow_attempts
    where overflow_attempts.auth_user_id = requester_id
    order by
      overflow_attempts.requested_at desc,
      overflow_attempts.id desc
    offset 20
  );

  if matched_member_count = 1 then
    insert into match.member_links (
      auth_user_id,
      member_id,
      status,
      requested_at,
      reviewed_at,
      reviewed_by
    )
    values (
      requester_id,
      matched_member_id,
      'pending',
      pg_catalog.clock_timestamp(),
      null,
      null
    )
    on conflict (auth_user_id) do update
    set member_id = excluded.member_id,
        status = 'pending',
        requested_at = excluded.requested_at,
        reviewed_at = null,
        reviewed_by = null
    where match.member_links.status <> 'approved';
  end if;

  update match.release_state
  set first_write_at = pg_catalog.clock_timestamp()
  where singleton
    and first_write_at is null;

  return '{"accepted":true}'::pg_catalog.jsonb;
end;
$$;

revoke all on function public.request_member_link(text, text)
from public, anon, authenticated, service_role;
grant execute on function public.request_member_link(text, text)
to authenticated;

create or replace function match.cleanup_member_link_attempts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer := 0;
  statement_count integer;
begin
  delete from match.member_link_attempts as attempts
  where attempts.requested_at
    < pg_catalog.clock_timestamp() - interval '24 hours';
  get diagnostics statement_count = row_count;
  deleted_count := deleted_count + statement_count;

  with ranked_attempts as (
    select
      attempts.id,
      pg_catalog.row_number() over (
        partition by attempts.auth_user_id
        order by attempts.requested_at desc, attempts.id desc
      ) as attempt_rank
    from match.member_link_attempts as attempts
  )
  delete from match.member_link_attempts as attempts
  using ranked_attempts
  where attempts.id = ranked_attempts.id
    and ranked_attempts.attempt_rank > 20;
  get diagnostics statement_count = row_count;
  deleted_count := deleted_count + statement_count;

  return deleted_count;
end;
$$;

revoke all on function match.cleanup_member_link_attempts()
from public, anon, authenticated, service_role;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job record;
  scheduled_job_id bigint;
begin
  if pg_catalog.to_regclass('cron.job') is null
     or pg_catalog.to_regprocedure(
       'cron.schedule(text,text,text)'
     ) is null then
    raise exception 'pg_cron cleanup scheduling is unavailable'
      using errcode = '55000';
  end if;

  for existing_job in
    select jobs.jobid
    from cron.job as jobs
    where jobs.jobname = 'match-member-link-attempt-cleanup-hourly'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  scheduled_job_id := cron.schedule(
    'match-member-link-attempt-cleanup-hourly',
    '0 * * * *',
    'select match.cleanup_member_link_attempts();'
  );

  if scheduled_job_id is null
     or not exists (
       select 1
       from cron.job as jobs
       where jobs.jobid = scheduled_job_id
         and jobs.jobname =
           'match-member-link-attempt-cleanup-hourly'
         and jobs.schedule = '0 * * * *'
         and jobs.command =
           'select match.cleanup_member_link_attempts();'
         and jobs.active
     ) then
    raise exception 'pg_cron cleanup scheduling was not persisted'
      using errcode = '55000';
  end if;
end;
$$;
