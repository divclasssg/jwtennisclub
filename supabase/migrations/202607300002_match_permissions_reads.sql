insert into public.role_permissions (role_id, permission)
select roles.id, permissions.permission
from public.roles
join (
  values
    ('operator', 'matches.view'),
    ('operator', 'matches.operate'),
    ('admin', 'matches.view'),
    ('admin', 'matches.operate'),
    ('admin', 'matches.manage'),
    ('admin', 'matches.results.correct')
) as permissions(role_name, permission)
  on permissions.role_name = roles.name
on conflict (role_id, permission) do nothing;

create or replace function public.get_match_member_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member_directory jsonb;
begin
  if not public.has_permission('matches.view') then
    raise exception 'matches.view permission required'
      using errcode = '42501';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', directory.member_id,
        'memberCode', directory.member_code,
        'legalName', directory.legal_name,
        'memberStatus', directory.member_status,
        'setupStatus', directory.setup_status,
        'publicAlias', directory.public_alias,
        'phoneSuffix', case
          when contacts.phone_normalized is null then null
          else pg_catalog.right(contacts.phone_normalized, 4)
        end,
        'gender', directory.gender,
        'gradeId', directory.grade_id,
        'gradeName', directory.grade_name,
        'gradeStrength', directory.grade_strength
      )
      order by
        directory.setup_status,
        directory.public_alias nulls last,
        directory.member_code,
        directory.member_id
    ),
    '[]'::pg_catalog.jsonb
  )
  into member_directory
  from match.member_directory as directory
  left join public.member_contacts as contacts
    on contacts.member_id = directory.member_id
  where directory.member_status = 'active'::public.member_status;

  return member_directory;
end;
$$;

create or replace function public.get_match_operator_read(
  requested_scope text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('matches.view') then
    raise exception 'matches.view permission required'
      using errcode = '42501';
  end if;

  case requested_scope
    when 'members' then
      return pg_catalog.jsonb_build_object(
        'scope', 'members',
        'members', public.get_match_member_directory(),
        'grades', coalesce(
          (
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', grades.id,
                'name', grades.name,
                'strength', grades.strength,
                'active', grades.active,
                'updatedAt', grades.updated_at
              )
              order by grades.strength, grades.id
            )
            from match.grades as grades
          ),
          '[]'::pg_catalog.jsonb
        )
      );

    when 'seasons' then
      return pg_catalog.jsonb_build_object(
        'scope', 'seasons',
        'seasons', coalesce(
          (
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', seasons.id,
                'name', seasons.name,
                'startsOn', seasons.starts_on,
                'endsOn', seasons.ends_on,
                'active', seasons.active,
                'createdAt', seasons.created_at,
                'updatedAt', seasons.updated_at
              )
              order by
                seasons.active desc,
                seasons.starts_on desc,
                seasons.id
            )
            from match.seasons as seasons
          ),
          '[]'::pg_catalog.jsonb
        )
      );

    when 'approvals' then
      return pg_catalog.jsonb_build_object(
        'scope', 'approvals',
        'approvals', coalesce(
          (
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', links.id,
                'memberId', directory.member_id,
                'memberCode', directory.member_code,
                'legalName', directory.legal_name,
                'setupStatus', directory.setup_status,
                'publicAlias', directory.public_alias,
                'phoneSuffix', case
                  when contacts.phone_normalized is null then null
                  else pg_catalog.right(contacts.phone_normalized, 4)
                end,
                'requestedAt', links.requested_at
              )
              order by links.requested_at, links.id
            )
            from match.member_links as links
            join match.member_directory as directory
              on directory.member_id = links.member_id
            left join public.member_contacts as contacts
              on contacts.member_id = directory.member_id
            where links.status = 'pending'::match.link_status
          ),
          '[]'::pg_catalog.jsonb
        )
      );

    else
      raise exception 'unsupported match operator read scope'
        using errcode = '22023';
  end case;
end;
$$;

create or replace function public.get_match_game_day_snapshot(
  requested_game_day_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  game_day_row match.game_days%rowtype;
begin
  if not public.has_permission('matches.view') then
    raise exception 'matches.view permission required'
      using errcode = '42501';
  end if;

  select game_days.*
  into game_day_row
  from match.game_days as game_days
  where game_days.id = requested_game_day_id;

  if not found then
    raise exception 'match game day not found'
      using errcode = 'P0002';
  end if;

  return (
    with completed_games_by_member as (
      select
        players.member_id,
        pg_catalog.count(*)::integer as games_today
      from match.matches as matches
      join match.match_players as players
        on players.match_id = matches.id
      where matches.game_day_id = game_day_row.id
        and matches.status = 'completed'::match.match_status
      group by players.member_id
    ),
    player_lists as (
      select
        players.match_id,
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'memberId', directory.member_id,
            'legalName', directory.legal_name,
            'publicAlias', directory.public_alias,
            'setupStatus', directory.setup_status,
            'team', players.team,
            'slot', players.slot,
            'gradeStrength', players.grade_strength_snapshot
          )
          order by players.slot
        ) as players
      from match.match_players as players
      join match.member_directory as directory
        on directory.member_id = players.member_id
      join match.matches as matches
        on matches.id = players.match_id
      where matches.game_day_id = game_day_row.id
        and matches.status in (
          'confirmed'::match.match_status,
          'in_progress'::match.match_status,
          'completed'::match.match_status
        )
      group by players.match_id
    ),
    match_snapshots as (
      select
        matches.id,
        matches.court_number,
        matches.status,
        matches.confirmed_at,
        matches.started_at,
        matches.completed_at,
        pg_catalog.jsonb_build_object(
          'id', matches.id,
          'courtNumber', matches.court_number,
          'status', matches.status,
          'winnerTeam', matches.winner_team,
          'version', matches.version,
          'players', coalesce(
            player_lists.players,
            '[]'::pg_catalog.jsonb
          )
        ) as snapshot
      from match.matches as matches
      left join player_lists on player_lists.match_id = matches.id
      where matches.game_day_id = game_day_row.id
        and matches.status in (
          'confirmed'::match.match_status,
          'in_progress'::match.match_status,
          'completed'::match.match_status
        )
    )
    select pg_catalog.jsonb_build_object(
      'id', game_day_row.id,
      'seasonId', game_day_row.season_id,
      'playedOn', game_day_row.played_on,
      'status', game_day_row.status,
      'activeCourts', game_day_row.active_courts,
      'version', game_day_row.version,
      'updatedAt', game_day_row.updated_at,
      'attendees', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'memberId', directory.member_id,
              'memberCode', directory.member_code,
              'legalName', directory.legal_name,
              'publicAlias', directory.public_alias,
              'setupStatus', directory.setup_status,
              'phoneSuffix', case
                when contacts.phone_normalized is null then null
                else pg_catalog.right(contacts.phone_normalized, 4)
              end,
              'gender', directory.gender,
              'gradeName', directory.grade_name,
              'gradeStrength', directory.grade_strength,
              'checkedIn', attendances.checked_in,
              'gamesToday', coalesce(
                completed_games_by_member.games_today,
                0
              )
            )
            order by
              directory.public_alias nulls last,
              directory.member_code,
              directory.member_id
          )
          from match.attendances as attendances
          join match.member_directory as directory
            on directory.member_id = attendances.member_id
          left join public.member_contacts as contacts
            on contacts.member_id = directory.member_id
          left join completed_games_by_member
            on completed_games_by_member.member_id = directory.member_id
          where attendances.game_day_id = game_day_row.id
        ),
        '[]'::pg_catalog.jsonb
      ),
      'courts', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'courtNumber', courts.court_number,
              'currentMatch', (
                select match_snapshots.snapshot
                from match_snapshots
                where match_snapshots.court_number = courts.court_number
                  and match_snapshots.status =
                    'in_progress'::match.match_status
                order by
                  match_snapshots.started_at desc,
                  match_snapshots.id
                limit 1
              ),
              'nextMatch', (
                select match_snapshots.snapshot
                from match_snapshots
                where match_snapshots.court_number = courts.court_number
                  and match_snapshots.status =
                    'confirmed'::match.match_status
                order by
                  match_snapshots.confirmed_at,
                  match_snapshots.id
                limit 1
              )
            )
            order by courts.court_number
          )
          from pg_catalog.generate_series(
            1,
            game_day_row.active_courts
          ) as courts(court_number)
        ),
        '[]'::pg_catalog.jsonb
      ),
      'completedMatches', coalesce(
        (
          select pg_catalog.jsonb_agg(
            match_snapshots.snapshot
            order by
              match_snapshots.completed_at desc,
              match_snapshots.id
          )
          from match_snapshots
          where match_snapshots.status = 'completed'::match.match_status
        ),
        '[]'::pg_catalog.jsonb
      )
    )
  );
end;
$$;

revoke execute on function public.get_match_member_directory()
from public, anon, authenticated, service_role;
grant execute on function public.get_match_member_directory()
to authenticated;

revoke execute on function public.get_match_operator_read(text)
from public, anon, authenticated, service_role;
grant execute on function public.get_match_operator_read(text)
to authenticated;

revoke execute on function public.get_match_game_day_snapshot(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_match_game_day_snapshot(uuid)
to authenticated;
