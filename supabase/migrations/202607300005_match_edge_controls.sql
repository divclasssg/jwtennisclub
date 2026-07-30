create or replace function public.get_match_release_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'trafficEnabled',
    coalesce(release_state.traffic_enabled, false)
  )
  from match.release_state as release_state
  where release_state.singleton
$$;

revoke all on function public.get_match_release_state()
from public, anon, authenticated, service_role;
grant execute on function public.get_match_release_state()
to authenticated;

create table match.member_link_edge_limits (
  window_started_at timestamptz not null,
  bucket_kind text not null
    check (bucket_kind in ('origin', 'service')),
  bucket_hash bytea not null
    check (pg_catalog.octet_length(bucket_hash) = 32),
  attempts integer not null check (attempts between 1 and 100),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (window_started_at, bucket_kind, bucket_hash)
);

alter table match.member_link_edge_limits enable row level security;
revoke all on match.member_link_edge_limits
from public, anon, authenticated, service_role;
revoke all privileges on type match.member_link_edge_limits
from public, anon, authenticated, service_role;

create or replace function match.get_edge_rate_limit_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_material text;
begin
  if pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Edge rate-limit key is unavailable'
      using errcode = '55000';
  end if;

  begin
    execute
      'select decrypted_secret
         from vault.decrypted_secrets
        where name = $1
        order by created_at desc
        limit 1'
    into key_material
    using 'match_edge_rate_limit_hmac';
  exception
    when others then
      key_material := null;
  end;

  if nullif(key_material, '') is null then
    raise exception 'Edge rate-limit key is unavailable'
      using errcode = '55000';
  end if;
  return key_material;
end;
$$;

revoke all on function match.get_edge_rate_limit_key()
from public, anon, authenticated, service_role;

create or replace function public.consume_member_link_edge_rate(
  origin_bucket text,
  window_started_at timestamptz,
  proof text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  current_window timestamptz :=
    pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp());
  key_material text;
  supplied_proof bytea;
  expected_proof bytea;
  origin_hash bytea;
  service_hash bytea;
  origin_attempts integer := 0;
  service_attempts integer := 0;
begin
  if requester_id is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;
  if window_started_at is distinct from current_window
     or origin_bucket !~ '^[0-9a-f]{64}$'
     or proof !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid Edge rate-limit proof'
      using errcode = '42501';
  end if;

  key_material := match.get_edge_rate_limit_key();
  begin
    supplied_proof := pg_catalog.decode(proof, 'hex');
    origin_hash := pg_catalog.decode(origin_bucket, 'hex');
  exception
    when others then
      raise exception 'invalid Edge rate-limit proof'
        using errcode = '42501';
  end;
  expected_proof := extensions.hmac(
    pg_catalog.convert_to(
      'v1' || chr(31)
        || extract(epoch from current_window)::bigint::text
        || chr(31) || origin_bucket,
      'utf8'
    ),
    pg_catalog.convert_to(key_material, 'utf8'),
    'sha256'
  );
  if supplied_proof is distinct from expected_proof then
    raise exception 'invalid Edge rate-limit proof'
      using errcode = '42501';
  end if;
  service_hash := extensions.hmac(
    pg_catalog.convert_to('member-link-service', 'utf8'),
    pg_catalog.convert_to(key_material, 'utf8'),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_window::text, 5)
  );

  select limits.attempts
  into origin_attempts
  from match.member_link_edge_limits as limits
  where limits.window_started_at = current_window
    and limits.bucket_kind = 'origin'
    and limits.bucket_hash = origin_hash;
  select limits.attempts
  into service_attempts
  from match.member_link_edge_limits as limits
  where limits.window_started_at = current_window
    and limits.bucket_kind = 'service'
    and limits.bucket_hash = service_hash;

  if coalesce(origin_attempts, 0) >= 20
     or coalesce(service_attempts, 0) >= 100 then
    return '{"allowed":false}'::pg_catalog.jsonb;
  end if;

  insert into match.member_link_edge_limits (
    window_started_at,
    bucket_kind,
    bucket_hash,
    attempts
  )
  values
    (current_window, 'origin', origin_hash, 1),
    (current_window, 'service', service_hash, 1)
  on conflict on constraint member_link_edge_limits_pkey
  do update
  set attempts = match.member_link_edge_limits.attempts + 1,
      updated_at = pg_catalog.clock_timestamp();

  return '{"allowed":true}'::pg_catalog.jsonb;
end;
$$;

revoke all on function public.consume_member_link_edge_rate(
  text,
  timestamptz,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.consume_member_link_edge_rate(
  text,
  timestamptz,
  text
) to authenticated;

create or replace function match.cleanup_member_link_edge_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from match.member_link_edge_limits as limits
  where limits.window_started_at
    < pg_catalog.date_trunc(
      'hour',
      pg_catalog.clock_timestamp()
    ) - interval '2 hours';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function match.cleanup_member_link_edge_limits()
from public, anon, authenticated, service_role;

do $$
declare
  existing_job record;
  scheduled_job_id bigint;
begin
  if pg_catalog.to_regclass('cron.job') is null
     or pg_catalog.to_regprocedure(
       'cron.schedule(text,text,text)'
     ) is null then
    raise exception 'pg_cron Edge limiter cleanup is unavailable'
      using errcode = '55000';
  end if;
  for existing_job in
    select jobs.jobid
    from cron.job as jobs
    where jobs.jobname = 'match-edge-limit-cleanup-hourly'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
  scheduled_job_id := cron.schedule(
    'match-edge-limit-cleanup-hourly',
    '15 * * * *',
    'select match.cleanup_member_link_edge_limits();'
  );
  if scheduled_job_id is null then
    raise exception 'Edge limiter cleanup scheduling failed'
      using errcode = '55000';
  end if;
end;
$$;

create or replace function public.get_match_recommendation_input(
  requested_game_day_id uuid,
  requested_court_number integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.has_permission('matches.view') then
    raise exception 'matches.view permission required'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from match.game_days as game_days
    where game_days.id = requested_game_day_id
      and game_days.status = 'active'::match.game_day_status
      and requested_court_number between 1 and game_days.active_courts
  ) then
    raise exception 'active game-day court not found'
      using errcode = 'P0002';
  end if;

  with member_stats as (
    select
      profiles.member_id as id,
      profiles.gender,
      grades.strength as grade,
      pg_catalog.count(matches.id) filter (
        where matches.status = 'completed'::match.match_status
      )::integer as games,
      pg_catalog.max(matches.completed_at) filter (
        where matches.status = 'completed'::match.match_status
      ) as last_completed_at
    from match.attendances as attendances
    join match.member_profiles as profiles
      on profiles.member_id = attendances.member_id
    join match.grades as grades on grades.id = profiles.grade_id
    join public.members as members on members.id = profiles.member_id
    left join match.match_players as players
      on players.member_id = profiles.member_id
    left join match.matches as matches
      on matches.id = players.match_id
      and matches.game_day_id = requested_game_day_id
    where attendances.game_day_id = requested_game_day_id
      and attendances.checked_in
      and members.status <> 'withdrawn'::public.member_status
    group by profiles.member_id, profiles.gender, grades.strength
  ),
  ranked_members as (
    select
      member_stats.*,
      (
        pg_catalog.row_number() over (
          partition by member_stats.games
          order by
            (member_stats.last_completed_at is not null),
            member_stats.last_completed_at,
            member_stats.id
        ) - 1
      )::integer as wait_rank
    from member_stats
  ),
  completed_teams as (
    select
      matches.id,
      matches.completed_at,
      pg_catalog.jsonb_agg(
        players.member_id order by players.slot
      ) filter (where players.team = 1) as team_one,
      pg_catalog.jsonb_agg(
        players.member_id order by players.slot
      ) filter (where players.team = 2) as team_two
    from match.matches as matches
    join match.match_players as players on players.match_id = matches.id
    where matches.game_day_id = requested_game_day_id
      and matches.status = 'completed'::match.match_status
    group by matches.id, matches.completed_at
  )
  select pg_catalog.jsonb_build_object(
    'members',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', ranked_members.id,
            'games', ranked_members.games,
            'waitRank', ranked_members.wait_rank,
            'gender', ranked_members.gender,
            'grade', ranked_members.grade
          )
          order by ranked_members.id
        )
        from ranked_members
      ),
      '[]'::pg_catalog.jsonb
    ),
    'completedMatches',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'team1', completed_teams.team_one,
            'team2', completed_teams.team_two
          )
          order by completed_teams.completed_at, completed_teams.id
        )
        from completed_teams
      ),
      '[]'::pg_catalog.jsonb
    ),
    'inProgressMemberIds',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          players.member_id order by players.member_id
        )
        from match.matches as matches
        join match.match_players as players on players.match_id = matches.id
        where matches.game_day_id = requested_game_day_id
          and matches.status = 'in_progress'::match.match_status
      ),
      '[]'::pg_catalog.jsonb
    )
  )
  into result;
  return result;
end;
$$;

revoke all on function public.get_match_recommendation_input(uuid, integer)
from public, anon, authenticated, service_role;
grant execute on function public.get_match_recommendation_input(uuid, integer)
to authenticated;

create or replace function match.member_match_read(
  requested_match_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'matchId', matches.id,
    'courtNumber', matches.court_number,
    'teams',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'team', grouped.team,
            'players', grouped.players
          )
          order by grouped.team
        )
        from (
          select
            players.team,
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'memberId', profiles.member_id,
                'publicAlias', profiles.public_alias
              )
              order by players.slot
            ) as players
          from match.match_players as players
          join match.member_profiles as profiles
            on profiles.member_id = players.member_id
          where players.match_id = matches.id
          group by players.team
        ) as grouped
      ),
      '[]'::pg_catalog.jsonb
    ),
    'winnerTeam', matches.winner_team
  )
  from match.matches as matches
  where matches.id = requested_match_id
    and matches.status in (
      'confirmed'::match.match_status,
      'in_progress'::match.match_status,
      'completed'::match.match_status
    )
$$;

revoke all on function match.member_match_read(uuid)
from public, anon, authenticated, service_role;

create or replace function public.get_member_read(
  requested_scope text,
  requested_season_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_member_id uuid;
  viewer_alias text;
  summary jsonb;
  partners jsonb;
  match_history jsonb;
  leaderboards jsonb;
  live_data jsonb;
  active_day_id uuid;
  active_courts integer;
  active_updated_at timestamptz;
begin
  select links.member_id, profiles.public_alias
  into viewer_member_id, viewer_alias
  from match.member_links as links
  join match.member_profiles as profiles
    on profiles.member_id = links.member_id
  where links.auth_user_id = auth.uid()
    and links.status = 'approved'::match.link_status;

  if viewer_member_id is null then
    raise exception 'approved link required'
      using errcode = '42501';
  end if;
  if requested_scope not in ('current', 'season', 'all') then
    raise exception 'invalid member read scope'
      using errcode = '22023';
  end if;
  if requested_scope = 'season' and requested_season_id is null then
    raise exception 'season scope requires a season ID'
      using errcode = '22023';
  end if;

  with scoped_results as (
    select
      players.member_id,
      partners.member_id as partner_id,
      matches.id as match_id,
      game_days.season_id,
      game_days.played_on,
      matches.completed_at,
      (players.team = matches.winner_team) as won
    from match.matches as matches
    join match.game_days as game_days on game_days.id = matches.game_day_id
    join match.match_players as players on players.match_id = matches.id
    join match.match_players as partners
      on partners.match_id = players.match_id
      and partners.team = players.team
      and partners.member_id <> players.member_id
    where matches.status = 'completed'::match.match_status
      and matches.winner_team is not null
      and players.member_id = viewer_member_id
      and (
        requested_scope in ('all', 'current')
        or game_days.season_id = requested_season_id
      )
  )
  select pg_catalog.jsonb_build_object(
    'games', pg_catalog.count(*)::integer,
    'wins', pg_catalog.count(*) filter (where scoped_results.won)::integer,
    'losses',
      pg_catalog.count(*) filter (where not scoped_results.won)::integer,
    'winRate',
      case when pg_catalog.count(*) = 0 then null
      else pg_catalog.round(
        pg_catalog.count(*) filter (
          where scoped_results.won
        )::numeric / pg_catalog.count(*),
        4
      ) end
  )
  into summary
  from scoped_results;

  with scoped_results as (
    select
      partners.member_id as partner_id,
      (players.team = matches.winner_team) as won
    from match.matches as matches
    join match.game_days as game_days on game_days.id = matches.game_day_id
    join match.match_players as players on players.match_id = matches.id
    join match.match_players as partners
      on partners.match_id = players.match_id
      and partners.team = players.team
      and partners.member_id <> players.member_id
    where matches.status = 'completed'::match.match_status
      and matches.winner_team is not null
      and players.member_id = viewer_member_id
      and (
        requested_scope in ('all', 'current')
        or game_days.season_id = requested_season_id
      )
  ),
  grouped as (
    select
      scoped_results.partner_id,
      profiles.public_alias,
      pg_catalog.count(*)::integer as games,
      pg_catalog.count(*) filter (
        where scoped_results.won
      )::integer as wins,
      pg_catalog.count(*) filter (
        where not scoped_results.won
      )::integer as losses
    from scoped_results
    join match.member_profiles as profiles
      on profiles.member_id = scoped_results.partner_id
    group by scoped_results.partner_id, profiles.public_alias
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'partnerId', grouped.partner_id,
        'publicAlias', grouped.public_alias,
        'games', grouped.games,
        'wins', grouped.wins,
        'losses', grouped.losses,
        'winRate',
          pg_catalog.round(grouped.wins::numeric / grouped.games, 4),
        'sampleQualified', grouped.games >= 5
      )
      order by
        (grouped.games >= 5) desc,
        grouped.wins::numeric / grouped.games desc,
        grouped.games desc,
        grouped.public_alias
    ),
    '[]'::pg_catalog.jsonb
  )
  into partners
  from grouped;

  with scoped_results as (
    select
      partners.member_id as partner_id,
      matches.id as match_id,
      game_days.season_id,
      game_days.played_on,
      matches.completed_at,
      (players.team = matches.winner_team) as won
    from match.matches as matches
    join match.game_days as game_days on game_days.id = matches.game_day_id
    join match.match_players as players on players.match_id = matches.id
    join match.match_players as partners
      on partners.match_id = players.match_id
      and partners.team = players.team
      and partners.member_id <> players.member_id
    where matches.status = 'completed'::match.match_status
      and matches.winner_team is not null
      and players.member_id = viewer_member_id
      and (
        requested_scope in ('all', 'current')
        or game_days.season_id = requested_season_id
      )
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'matchId', scoped_results.match_id,
        'playedOn', scoped_results.played_on,
        'partnerAlias', profiles.public_alias,
        'result', case when scoped_results.won then 'win' else 'loss' end
      )
      order by
        scoped_results.played_on desc,
        scoped_results.completed_at desc,
        scoped_results.match_id
    ),
    '[]'::pg_catalog.jsonb
  )
  into match_history
  from scoped_results
  join match.member_profiles as profiles
    on profiles.member_id = scoped_results.partner_id;

  with scoped_results as (
    select
      players.member_id,
      (players.team = matches.winner_team) as won
    from match.matches as matches
    join match.game_days as game_days on game_days.id = matches.game_day_id
    join match.match_players as players on players.match_id = matches.id
    where matches.status = 'completed'::match.match_status
      and matches.winner_team is not null
      and (
        requested_scope in ('all', 'current')
        or game_days.season_id = requested_season_id
      )
  ),
  totals as (
    select
      scoped_results.member_id,
      profiles.public_alias,
      pg_catalog.count(*)::integer as games,
      pg_catalog.count(*) filter (
        where scoped_results.won
      )::integer as wins
    from scoped_results
    join match.member_profiles as profiles
      on profiles.member_id = scoped_results.member_id
    group by scoped_results.member_id, profiles.public_alias
  )
  select pg_catalog.jsonb_build_object(
    'games',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'memberId', ranked.member_id,
            'publicAlias', ranked.public_alias,
            'games', ranked.games,
            'rank', ranked.rank
          )
          order by ranked.games desc, ranked.public_alias, ranked.member_id
        )
        from (
          select
            totals.*,
            pg_catalog.dense_rank() over (
              order by totals.games desc
            ) as rank
          from totals
        ) as ranked
      ),
      '[]'::pg_catalog.jsonb
    ),
    'wins',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'memberId', ranked.member_id,
            'publicAlias', ranked.public_alias,
            'wins', ranked.wins,
            'rank', ranked.rank
          )
          order by ranked.wins desc, ranked.public_alias, ranked.member_id
        )
        from (
          select
            totals.*,
            pg_catalog.dense_rank() over (
              order by totals.wins desc
            ) as rank
          from totals
        ) as ranked
      ),
      '[]'::pg_catalog.jsonb
    ),
    'winRate',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'memberId', ranked.member_id,
            'publicAlias', ranked.public_alias,
            'games', ranked.games,
            'wins', ranked.wins,
            'winRate',
              pg_catalog.round(ranked.wins::numeric / ranked.games, 4),
            'rank', ranked.rank
          )
          order by
            ranked.wins::numeric / ranked.games desc,
            ranked.games desc,
            ranked.public_alias,
            ranked.member_id
        )
        from (
          select
            totals.*,
            pg_catalog.dense_rank() over (
              order by totals.wins::numeric / totals.games desc,
                totals.games desc
            ) as rank
          from totals
          where totals.games >= 5
        ) as ranked
      ),
      '[]'::pg_catalog.jsonb
    )
  )
  into leaderboards;

  select
    game_days.id,
    game_days.active_courts,
    game_days.updated_at
  into active_day_id, active_courts, active_updated_at
  from match.game_days as game_days
  where game_days.status = 'active'::match.game_day_status
  order by game_days.played_on desc, game_days.created_at desc, game_days.id
  limit 1;

  if active_day_id is null then
    live_data := null;
  else
    select pg_catalog.jsonb_build_object(
      'gameDayId', active_day_id,
      'updatedAt', active_updated_at,
      'attendees',
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'memberId', profiles.member_id,
              'publicAlias', profiles.public_alias,
              'gamesToday',
              (
                select pg_catalog.count(*)::integer
                from match.matches as completed_matches
                join match.match_players as completed_players
                  on completed_players.match_id = completed_matches.id
                where completed_matches.game_day_id = active_day_id
                  and completed_matches.status =
                    'completed'::match.match_status
                  and completed_players.member_id = profiles.member_id
              )
            )
            order by profiles.public_alias, profiles.member_id
          )
          from match.attendances as attendances
          join match.member_profiles as profiles
            on profiles.member_id = attendances.member_id
          where attendances.game_day_id = active_day_id
            and attendances.checked_in
        ),
        '[]'::pg_catalog.jsonb
      ),
      'courts',
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'courtNumber', courts.court_number,
              'currentMatch',
              (
                select match.member_match_read(matches.id)
                from match.matches as matches
                where matches.game_day_id = active_day_id
                  and matches.court_number = courts.court_number
                  and matches.status = 'in_progress'::match.match_status
                order by matches.started_at desc, matches.id
                limit 1
              ),
              'nextMatch',
              (
                select match.member_match_read(matches.id)
                from match.matches as matches
                where matches.game_day_id = active_day_id
                  and matches.court_number = courts.court_number
                  and matches.status = 'confirmed'::match.match_status
                order by matches.confirmed_at, matches.id
                limit 1
              )
            )
            order by courts.court_number
          )
          from pg_catalog.generate_series(
            1,
            active_courts
          ) as courts(court_number)
        ),
        '[]'::pg_catalog.jsonb
      ),
      'completedMatches',
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            match.member_match_read(matches.id)
            order by matches.completed_at desc, matches.id
          )
          from match.matches as matches
          where matches.game_day_id = active_day_id
            and matches.status = 'completed'::match.match_status
        ),
        '[]'::pg_catalog.jsonb
      ),
      'memberStatus',
      case
        when exists (
          select 1
          from match.matches as matches
          join match.match_players as players on players.match_id = matches.id
          where matches.game_day_id = active_day_id
            and matches.status = 'in_progress'::match.match_status
            and players.member_id = viewer_member_id
        ) then 'in_progress'
        when exists (
          select 1
          from match.matches as matches
          join match.match_players as players on players.match_id = matches.id
          where matches.game_day_id = active_day_id
            and matches.status = 'confirmed'::match.match_status
            and players.member_id = viewer_member_id
        ) then 'next'
        else 'waiting'
      end
    )
    into live_data;
  end if;

  return pg_catalog.jsonb_build_object(
    'member', pg_catalog.jsonb_build_object(
      'memberId', viewer_member_id,
      'publicAlias', viewer_alias
    ),
    'scope', requested_scope,
    'summary', summary,
    'partners', partners,
    'matchHistory', match_history,
    'leaderboards', leaderboards,
    'live', live_data
  );
end;
$$;

revoke all on function public.get_member_read(text, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_member_read(text, uuid)
to authenticated;
