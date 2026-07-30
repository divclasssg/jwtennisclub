\set ON_ERROR_STOP on

begin;
\ir task8_assert_identity.sql

do $guard$
declare
  release_row match.release_state%rowtype;
  table_row record;
  table_count bigint;
begin
  select *
  into strict release_row
  from match.release_state
  where singleton
  for update;

  if release_row.traffic_enabled then
    raise exception 'match traffic must be disabled';
  end if;

  if release_row.first_write_at is not null then
    raise exception 'destructive rollback refused after first write';
  end if;

  for table_row in
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'match'
      and tablename <> 'release_state'
    order by tablename
  loop
    execute format(
      'select count(*) from match.%I',
      table_row.tablename
    )
    into table_count;

    if table_count <> 0 then
      raise exception 'match table % is not empty', table_row.tablename;
    end if;
  end loop;
end;
$guard$;

create temporary table task8_member_baseline on commit drop as
select
  count(*)::bigint as member_count,
  encode(
    extensions.digest(
      coalesce(
        string_agg(member_code || ':' || id::text, ',' order by member_code, id),
        ''
      ),
      'sha256'
    ),
    'hex'
  ) as member_checksum
from public.members;

do $unschedule$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname in (
      'match-member-link-attempt-cleanup-hourly',
      'match-edge-limit-cleanup-hourly'
    )
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end;
$unschedule$;

delete from public.role_permissions
where permission like 'matches.%';

drop function if exists public.get_member_read(text, uuid);
drop function if exists public.get_match_recommendation_input(
  uuid,
  integer,
  integer
);
drop function if exists public.consume_member_link_edge_rate(
  text,
  timestamptz,
  text
);
drop function if exists public.get_match_release_state();
drop function if exists public.request_member_link(text, text);
drop function if exists public.apply_admin_command(jsonb);
drop function if exists public.apply_game_day_command(jsonb);
drop function if exists public.get_match_game_day_snapshot(uuid);
drop function if exists public.get_match_operator_read(text);
drop function if exists public.get_match_member_directory();
drop function if exists public.match_assert_integration_preconditions();

drop schema match cascade;

do $assertions$
declare
  expected task8_member_baseline%rowtype;
  actual task8_member_baseline%rowtype;
begin
  if to_regnamespace('match') is not null then
    raise exception 'match schema remains after simulated removal';
  end if;

  if exists (
    select 1
    from public.role_permissions
    where permission like 'matches.%'
  ) then
    raise exception 'match permissions remain after simulated removal';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and (
        routine.proname like 'get_match_%'
        or routine.proname in (
          'apply_game_day_command',
          'apply_admin_command',
          'request_member_link',
          'consume_member_link_edge_rate',
          'get_member_read',
          'match_assert_integration_preconditions'
        )
      )
  ) then
    raise exception 'public match routines remain after simulated removal';
  end if;

  select * into strict expected from task8_member_baseline;
  select
    count(*)::bigint,
    encode(
      extensions.digest(
        coalesce(
          string_agg(
            member_code || ':' || id::text,
            ','
            order by member_code, id
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    )
  into actual
  from public.members;

  if actual is distinct from expected then
    raise exception 'public member baseline changed during removal proof';
  end if;
end;
$assertions$;

\ir task8_assert_identity.sql
rollback;

\echo 'guarded removal proved in a rolled-back transaction'
