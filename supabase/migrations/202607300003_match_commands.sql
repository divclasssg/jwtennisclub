create or replace function public.apply_game_day_command(command_json jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
<<command_scope>>
declare
  actor_id uuid := auth.uid();
  operation_id uuid;
  game_day_id uuid;
  device_id uuid;
  base_version integer;
  command_type text;
  payload jsonb;
  occurred_at timestamptz;
  command_source match.change_source;
  command_hash text;
  existing_result jsonb;
  existing_hash text;
  current_version integer;
  before_data jsonb;
  after_data jsonb;
  result jsonb;
  affected integer;
  attendee_count integer;
  requested_courts integer;
  requested_match_id uuid;
  requested_team integer;
  requested_court integer;
  requested_member_id uuid;
  requested_checked_in boolean;
  requested_operator_id uuid;
  requested_device_id uuid;
  team_one uuid[];
  team_two uuid[];
  players uuid[];
  acknowledge_unfinished boolean;
  release_enabled boolean;
begin
  if actor_id is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  begin
    operation_id := (command_json->>'operationId')::uuid;
  exception
    when others then
      raise exception 'invalid game-day command'
        using errcode = '22023';
  end;

  if operation_id is null then
    raise exception 'invalid game-day command'
      using errcode = '22023';
  end if;

  command_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        actor_id::text || chr(31) || command_json::text,
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(operation_id::text, 0)
  );

  select operations.result, operations.command_hash
  into existing_result, existing_hash
  from match.operations as operations
  where operations.id = operation_id;

  if found then
    if existing_hash is distinct from command_hash then
      raise exception 'operation ID was reused with different content'
        using errcode = '22023';
    end if;
    return existing_result;
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

  command_type := command_json->>'type';

  if command_type = 'correct_winner' then
    if not public.has_permission('matches.results.correct') then
      raise exception 'matches.results.correct permission required'
        using errcode = '42501';
    end if;
  elsif not public.has_permission('matches.operate') then
    raise exception 'matches.operate permission required'
      using errcode = '42501';
  end if;

  begin
    game_day_id := (command_json->>'gameDayId')::uuid;
    device_id := (command_json->>'deviceId')::uuid;
    base_version := (command_json->>'baseVersion')::integer;
    payload := command_json->'payload';
    occurred_at := (command_json->>'occurredAt')::timestamptz;
    command_source := coalesce(
      command_json->>'source',
      'online'
    )::match.change_source;
  exception
    when others then
      raise exception 'invalid game-day command'
        using errcode = '22023';
  end;

  if game_day_id is null
     or device_id is null
     or base_version is null
     or command_type is null
     or payload is null
     or occurred_at is null then
    raise exception 'invalid game-day command'
      using errcode = '22023';
  end if;

  if command_source = 'offline'
     and (
       command_type = 'create_game_day'
       or not exists (
         select 1
         from match.offline_leases as lease
         where lease.game_day_id = command_scope.game_day_id
           and lease.operator_id = command_scope.actor_id
           and lease.device_id = command_scope.device_id
           and lease.revoked_at is null
           and command_scope.occurred_at
             between lease.issued_at and lease.expires_at
       )
     ) then
    raise exception 'offline lease does not allow this write'
      using errcode = '42501';
  end if;

  if command_type = 'create_game_day' then
    if base_version <> 0 then
      raise exception 'create_game_day requires base version zero'
        using errcode = '22023';
    end if;

    requested_courts := (payload->>'activeCourts')::integer;
    requested_operator_id := (payload->>'offlineOperatorId')::uuid;
    requested_device_id := (payload->>'offlineDeviceId')::uuid;

    if requested_courts not between 1 and 2 then
      raise exception 'active courts must be one or two'
        using errcode = '22023';
    end if;

    if requested_operator_id is distinct from actor_id then
      raise exception 'offline operator must be the command actor'
        using errcode = '42501';
    end if;

    if not exists (
      select 1
      from match.seasons as seasons
      where seasons.id = (payload->>'seasonId')::uuid
        and seasons.active
    ) then
      raise exception 'active match season not found'
        using errcode = 'P0002';
    end if;

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
      game_day_id,
      (payload->>'seasonId')::uuid,
      (payload->>'playedOn')::date,
      'draft',
      requested_courts,
      1,
      actor_id
    );

    insert into match.offline_leases (
      game_day_id,
      operator_id,
      device_id,
      issued_at,
      expires_at
    )
    values (
      game_day_id,
      actor_id,
      requested_device_id,
      pg_catalog.clock_timestamp(),
      ((payload->>'playedOn')::date + 2)::timestamptz
    );

    current_version := 1;
    before_data := null;
  else
    select game_days.version, pg_catalog.to_jsonb(game_days)
    into current_version, before_data
    from match.game_days as game_days
    where game_days.id = command_scope.game_day_id
    for update;

    if not found then
      raise exception 'match game day not found'
        using errcode = 'P0002';
    end if;

    if base_version <> current_version then
      result := pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'version', current_version,
        'conflict', pg_catalog.jsonb_build_object(
          'currentVersion',
          current_version
        )
      );

      insert into match.operations (
        id,
        game_day_id,
        actor_id,
        device_id,
        operation_type,
        command_hash,
        base_version,
        occurred_at,
        result
      )
      values (
        operation_id,
        game_day_id,
        actor_id,
        device_id,
        command_type,
        command_hash,
        base_version,
        occurred_at,
        result
      );

      return result;
    end if;

    case command_type
      when 'update_attendance' then
        requested_member_id := (payload->>'memberId')::uuid;
        requested_checked_in := (payload->>'checkedIn')::boolean;

        if requested_checked_in is null then
          raise exception 'checkedIn is required'
            using errcode = '22023';
        end if;

        if exists (
          select 1
          from match.game_days as game_days
          where game_days.id = command_scope.game_day_id
            and game_days.status = 'completed'
        ) then
          raise exception 'completed game day attendance cannot change'
            using errcode = '55000';
        end if;

        if not exists (
          select 1
          from match.member_profiles as profiles
          where profiles.member_id = requested_member_id
        ) then
          raise exception 'match profile setup required'
            using errcode = '55000';
        end if;

        if requested_checked_in and exists (
          select 1
          from public.members as members
          where members.id = requested_member_id
            and members.status = 'withdrawn'::public.member_status
        ) then
          raise exception 'withdrawn member cannot participate'
            using errcode = '55000';
        end if;

        if requested_checked_in and exists (
          select 1
          from public.members as members
          where members.id = requested_member_id
            and members.status = 'paused'::public.member_status
        ) and not coalesce((payload->>'allowPaused')::boolean, false) then
          raise exception 'paused member requires explicit opt-in'
            using errcode = '55000';
        end if;

        if not exists (
          select 1
          from public.members as members
          where members.id = requested_member_id
        ) then
          raise exception 'canonical member not found'
            using errcode = 'P0002';
        end if;

        insert into match.attendances (
          game_day_id,
          member_id,
          checked_in,
          checked_in_at
        )
        values (
          game_day_id,
          requested_member_id,
          requested_checked_in,
          occurred_at
        )
        on conflict on constraint attendances_game_day_id_member_id_key
        do update
        set checked_in = excluded.checked_in,
            checked_in_at = excluded.checked_in_at,
            version = match.attendances.version + 1;

      when 'activate_game_day' then
        select pg_catalog.count(*)::integer
        into attendee_count
        from match.attendances as attendances
        where attendances.game_day_id = command_scope.game_day_id
          and attendances.checked_in;

        if attendee_count < 4 then
          raise exception 'at least four attendees are required'
            using errcode = '55000';
        end if;

        update match.game_days as game_day
        set status = 'active',
            active_courts = least(
              active_courts,
              case when attendee_count >= 8 then 2 else 1 end
            )
        where game_day.id = command_scope.game_day_id
          and game_day.status = 'draft';
        get diagnostics affected = row_count;

        if affected <> 1 then
          raise exception 'game day is not draft'
            using errcode = '55000';
        end if;

      when 'set_active_courts' then
        requested_courts := (payload->>'activeCourts')::integer;

        select pg_catalog.count(*)::integer
        into attendee_count
        from match.attendances as attendances
        where attendances.game_day_id = command_scope.game_day_id
          and attendances.checked_in;

        if requested_courts not between 1 and 2
           or (requested_courts = 2 and attendee_count < 8) then
          raise exception 'active court count is not allowed'
            using errcode = '22023';
        end if;

        update match.game_days as game_day
        set active_courts = requested_courts
        where game_day.id = command_scope.game_day_id
          and game_day.status <> 'completed';
        get diagnostics affected = row_count;

        if affected <> 1 then
          raise exception 'game day is completed'
            using errcode = '55000';
        end if;

      when 'designate_offline_device' then
        requested_operator_id := (payload->>'operatorId')::uuid;
        requested_device_id := (payload->>'offlineDeviceId')::uuid;

        if requested_operator_id is distinct from actor_id then
          raise exception 'offline operator must be the command actor'
            using errcode = '42501';
        end if;

        if (payload->>'expiresAt')::timestamptz
           <= pg_catalog.clock_timestamp() then
          raise exception 'offline lease must expire in the future'
            using errcode = '22023';
        end if;

        insert into match.offline_leases (
          game_day_id,
          operator_id,
          device_id,
          issued_at,
          expires_at,
          revoked_at
        )
        values (
          game_day_id,
          actor_id,
          requested_device_id,
          pg_catalog.clock_timestamp(),
          (payload->>'expiresAt')::timestamptz,
          null
        )
        on conflict on constraint offline_leases_pkey do update
        set operator_id = excluded.operator_id,
            device_id = excluded.device_id,
            issued_at = excluded.issued_at,
            expires_at = excluded.expires_at,
            revoked_at = null;

      when 'confirm_match' then
        requested_match_id := (payload->>'matchId')::uuid;
        requested_court := (payload->>'courtNumber')::integer;

        select pg_catalog.array_agg(item.value::uuid order by item.ordinal)
        into team_one
        from pg_catalog.jsonb_array_elements_text(payload->'team1')
          with ordinality as item(value, ordinal);

        select pg_catalog.array_agg(item.value::uuid order by item.ordinal)
        into team_two
        from pg_catalog.jsonb_array_elements_text(payload->'team2')
          with ordinality as item(value, ordinal);

        players := team_one || team_two;

        if pg_catalog.cardinality(team_one) <> 2
           or pg_catalog.cardinality(team_two) <> 2
           or (
             select pg_catalog.count(distinct player)
             from pg_catalog.unnest(players) as player
           ) <> 4 then
          raise exception 'match requires four distinct members'
            using errcode = '22023';
        end if;

        if not exists (
          select 1
          from match.game_days as game_days
          where game_days.id = command_scope.game_day_id
            and game_days.status = 'active'
            and requested_court between 1 and game_days.active_courts
        ) then
          raise exception 'court is not active'
            using errcode = '55000';
        end if;

        if (
          select pg_catalog.count(*)
          from match.attendances as attendances
          join public.members as members
            on members.id = attendances.member_id
          join match.member_profiles as profiles
            on profiles.member_id = attendances.member_id
          where attendances.game_day_id = command_scope.game_day_id
            and attendances.checked_in
            and attendances.member_id = any(players)
            and members.status <> 'withdrawn'::public.member_status
        ) <> 4 then
          raise exception 'all match players must be eligible and checked in'
            using errcode = '55000';
        end if;

        if exists (
          select 1
          from match.matches as existing_match
          join match.match_players as existing_player
            on existing_player.match_id = existing_match.id
          where existing_match.status = 'in_progress'
            and existing_player.member_id = any(players)
        ) then
          raise exception 'a player is already in progress'
            using errcode = '55000';
        end if;

        if exists (
          select 1
          from match.matches as existing_match
          where existing_match.game_day_id = command_scope.game_day_id
            and existing_match.court_number = requested_court
            and existing_match.status = 'confirmed'
        ) then
          raise exception 'court already has a confirmed next match'
            using errcode = '55000';
        end if;

        insert into match.matches (
          id,
          game_day_id,
          court_number,
          status,
          confirmed_at
        )
        values (
          requested_match_id,
          game_day_id,
          requested_court,
          'confirmed',
          pg_catalog.clock_timestamp()
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
          requested_match_id,
          team_player.member_id,
          team_player.slot,
          team_player.team,
          profiles.grade_id,
          grades.strength
        from (
          select
            item.value::uuid as member_id,
            item.ordinal::integer as slot,
            1 as team
          from pg_catalog.jsonb_array_elements_text(payload->'team1')
            with ordinality as item(value, ordinal)
          union all
          select
            item.value::uuid,
            (item.ordinal + 2)::integer,
            2
          from pg_catalog.jsonb_array_elements_text(payload->'team2')
            with ordinality as item(value, ordinal)
        ) as team_player
        join match.member_profiles as profiles
          on profiles.member_id = team_player.member_id
        join match.grades as grades
          on grades.id = profiles.grade_id;

      when 'start_match' then
        requested_match_id := (payload->>'matchId')::uuid;

        if exists (
          select 1
          from match.matches as target
          join match.matches as running
            on running.game_day_id = target.game_day_id
           and running.court_number = target.court_number
           and running.status = 'in_progress'
          where target.id = requested_match_id
        ) then
          raise exception 'court already has a match in progress'
            using errcode = '55000';
        end if;

        if exists (
          select 1
          from match.match_players as target_player
          join match.match_players as running_player
            on running_player.member_id = target_player.member_id
          join match.matches as running
            on running.id = running_player.match_id
          where target_player.match_id = requested_match_id
            and running.status = 'in_progress'
        ) then
          raise exception 'a player is already in progress'
            using errcode = '55000';
        end if;

        update match.matches as target_match
        set status = 'in_progress',
            started_at = pg_catalog.clock_timestamp(),
            version = version + 1
        where target_match.id = requested_match_id
          and target_match.game_day_id = command_scope.game_day_id
          and target_match.status = 'confirmed';
        get diagnostics affected = row_count;

        if affected <> 1 then
          raise exception 'match is not confirmed'
            using errcode = '55000';
        end if;

      when 'record_winner', 'correct_winner' then
        requested_match_id := (payload->>'matchId')::uuid;
        requested_team := (payload->>'winnerTeam')::integer;

        if requested_team not in (1, 2) then
          raise exception 'winner team must be one or two'
            using errcode = '22023';
        end if;

        update match.matches
        set status = 'completed',
            winner_team = requested_team,
            completed_at = coalesce(
              completed_at,
              pg_catalog.clock_timestamp()
            ),
            version = version + 1
        where id = requested_match_id
          and matches.game_day_id = command_scope.game_day_id
          and (
            (
              command_type = 'record_winner'
              and status = 'in_progress'
            )
            or (
              command_type = 'correct_winner'
              and status = 'completed'
            )
          );
        get diagnostics affected = row_count;

        if affected <> 1 then
          raise exception 'match cannot accept this result'
            using errcode = '55000';
        end if;

      when 'cancel_match' then
        requested_match_id := (payload->>'matchId')::uuid;

        update match.matches
        set status = 'cancelled',
            winner_team = null,
            completed_at = null,
            cancelled_at = pg_catalog.clock_timestamp(),
            version = version + 1
        where id = requested_match_id
          and matches.game_day_id = command_scope.game_day_id
          and status in ('suggested', 'confirmed', 'in_progress');
        get diagnostics affected = row_count;

        if affected <> 1 then
          raise exception 'match cannot be cancelled'
            using errcode = '55000';
        end if;

      when 'complete_game_day' then
        acknowledge_unfinished := coalesce(
          (payload->>'acknowledgeUnfinished')::boolean,
          false
        );

        if exists (
          select 1
          from match.matches as matches
          where matches.game_day_id = command_scope.game_day_id
            and matches.status in (
              'suggested',
              'confirmed',
              'in_progress'
            )
        ) and not acknowledge_unfinished then
          raise exception 'unfinished matches require acknowledgement'
            using errcode = '55000';
        end if;

        if acknowledge_unfinished then
          update match.matches
          set status = 'cancelled',
              winner_team = null,
              completed_at = null,
              cancelled_at = pg_catalog.clock_timestamp(),
              version = version + 1
          where matches.game_day_id = command_scope.game_day_id
            and status in ('suggested', 'confirmed', 'in_progress');
        end if;

        update match.game_days as game_day
        set status = 'completed',
            completed_at = pg_catalog.clock_timestamp()
        where game_day.id = command_scope.game_day_id
          and game_day.status <> 'completed';
        get diagnostics affected = row_count;

        if affected <> 1 then
          raise exception 'game day is already completed'
            using errcode = '55000';
        end if;

      else
        raise exception 'unsupported game-day command'
          using errcode = '22023';
    end case;

    update match.game_days as game_day
    set version = version + 1,
        updated_at = pg_catalog.clock_timestamp()
    where game_day.id = command_scope.game_day_id
    returning version into current_version;
  end if;

  select pg_catalog.to_jsonb(game_days)
  into after_data
  from match.game_days as game_days
  where game_days.id = command_scope.game_day_id;

  result := pg_catalog.jsonb_build_object(
    'status', 'applied',
    'version', current_version,
    'conflict', null
  );

  insert into match.operations (
    id,
    game_day_id,
    actor_id,
    device_id,
    operation_type,
    command_hash,
    base_version,
    occurred_at,
    result
  )
  values (
    operation_id,
    game_day_id,
    actor_id,
    device_id,
    command_type,
    command_hash,
    base_version,
    occurred_at,
    result
  );

  insert into match.audit_events (
    operation_id,
    target_type,
    target_id,
    action,
    before_data,
    after_data,
    actor_id,
    device_id,
    source,
    occurred_at
  )
  values (
    operation_id,
    'game_day',
    game_day_id,
    command_type,
    before_data,
    after_data,
    actor_id,
    device_id,
    command_source,
    occurred_at
  );

  update match.release_state
  set first_write_at = pg_catalog.clock_timestamp()
  where singleton
    and first_write_at is null;

  return result;
end;
$$;

revoke all on function public.apply_game_day_command(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.apply_game_day_command(jsonb)
to authenticated;

create or replace function public.apply_admin_command(command_json jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
<<admin_scope>>
declare
  actor_id uuid := auth.uid();
  operation_id uuid;
  device_id uuid;
  command_type text;
  payload jsonb;
  occurred_at timestamptz;
  command_hash text;
  existing_result jsonb;
  existing_hash text;
  result jsonb;
  target_id uuid;
  target_type text;
  before_data jsonb;
  after_data jsonb;
  affected integer;
  changes jsonb;
  release_enabled boolean;
begin
  if actor_id is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  begin
    operation_id := (command_json->>'operationId')::uuid;
  exception
    when others then
      raise exception 'invalid match management command'
        using errcode = '22023';
  end;

  if operation_id is null then
    raise exception 'invalid match management command'
      using errcode = '22023';
  end if;

  command_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        actor_id::text || chr(31) || command_json::text,
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(operation_id::text, 0)
  );

  select operations.result, operations.command_hash
  into existing_result, existing_hash
  from match.operations as operations
  where operations.id = operation_id;

  if found then
    if existing_hash is distinct from command_hash then
      raise exception 'operation ID was reused with different content'
        using errcode = '22023';
    end if;
    return existing_result;
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

  if not public.has_permission('matches.manage') then
    raise exception 'matches.manage permission required'
      using errcode = '42501';
  end if;

  begin
    device_id := (command_json->>'deviceId')::uuid;
    command_type := command_json->>'type';
    payload := command_json->'payload';
    occurred_at := (command_json->>'occurredAt')::timestamptz;
  exception
    when others then
      raise exception 'invalid match management command'
        using errcode = '22023';
  end;

  if device_id is null
     or command_type is null
     or payload is null
     or occurred_at is null then
    raise exception 'invalid match management command'
      using errcode = '22023';
  end if;

  case command_type
    when 'setup_member_profile' then
      target_id := (payload->>'memberId')::uuid;
      target_type := 'member_profile';

      if not exists (
        select 1
        from public.members as members
        where members.id = admin_scope.target_id
      ) then
        raise exception 'canonical member not found'
          using errcode = 'P0002';
      end if;

      if nullif(pg_catalog.btrim(payload->>'publicAlias'), '') is null
         or (payload->>'gradeId') is null then
        raise exception 'complete match profile setup is required'
          using errcode = '22023';
      end if;

      insert into match.member_profiles (
        member_id,
        public_alias,
        gender,
        grade_id
      )
      values (
        target_id,
        pg_catalog.btrim(payload->>'publicAlias'),
        (payload->>'gender')::match.gender_type,
        (payload->>'gradeId')::uuid
      );

      select pg_catalog.to_jsonb(member_profiles)
      into after_data
      from match.member_profiles as member_profiles
      where member_profiles.member_id = admin_scope.target_id;

    when 'update_member', 'update_member_profile' then
      target_id := (payload->>'memberId')::uuid;
      target_type := 'member_profile';
      changes := coalesce(payload->'changes', payload - 'memberId');

      if changes ? 'legalName' or changes ? 'phoneSuffix' then
        raise exception 'canonical member fields are not match-managed'
          using errcode = '42501';
      end if;

      select pg_catalog.to_jsonb(member_profiles)
      into before_data
      from match.member_profiles as member_profiles
      where member_profiles.member_id = admin_scope.target_id
      for update;

      if not found then
        raise exception 'match profile setup required'
          using errcode = '55000';
      end if;

      update match.member_profiles as member_profile
      set public_alias = case
            when changes ? 'publicAlias'
              then pg_catalog.btrim(changes->>'publicAlias')
            else member_profile.public_alias
          end,
          gender = case
            when changes ? 'gender'
              then (changes->>'gender')::match.gender_type
            else member_profile.gender
          end,
          grade_id = case
            when changes ? 'gradeId'
              then (changes->>'gradeId')::uuid
            else member_profile.grade_id
          end,
          updated_at = pg_catalog.clock_timestamp()
      where member_profile.member_id = admin_scope.target_id
        and (
          changes ? 'publicAlias'
          or changes ? 'gender'
          or changes ? 'gradeId'
        );
      get diagnostics affected = row_count;

      if affected <> 1 then
        raise exception 'match profile changes are required'
          using errcode = '22023';
      end if;

      select pg_catalog.to_jsonb(member_profiles)
      into after_data
      from match.member_profiles as member_profiles
      where member_profiles.member_id = admin_scope.target_id;

    when 'create_grade' then
      target_id := pg_catalog.gen_random_uuid();
      target_type := 'grade';

      insert into match.grades (id, name, strength)
      values (
        target_id,
        pg_catalog.btrim(payload->>'name'),
        (payload->>'strength')::integer
      );

      select pg_catalog.to_jsonb(grades)
      into after_data
      from match.grades as grades
      where grades.id = admin_scope.target_id;

    when 'update_grade' then
      target_id := (payload->>'gradeId')::uuid;
      target_type := 'grade';

      select pg_catalog.to_jsonb(grades)
      into before_data
      from match.grades as grades
      where grades.id = admin_scope.target_id
      for update;

      if not found then
        raise exception 'match grade not found'
          using errcode = 'P0002';
      end if;

      update match.grades as grade
      set name = coalesce(
            nullif(pg_catalog.btrim(payload->>'name'), ''),
            grade.name
          ),
          strength = coalesce(
            (payload->>'strength')::integer,
            grade.strength
          ),
          active = coalesce(
            (payload->>'active')::boolean,
            grade.active
          ),
          updated_at = pg_catalog.clock_timestamp()
      where grade.id = admin_scope.target_id
        and (
          payload ? 'name'
          or payload ? 'strength'
          or payload ? 'active'
        );
      get diagnostics affected = row_count;

      if affected <> 1 then
        raise exception 'grade changes are required'
          using errcode = '22023';
      end if;

      select pg_catalog.to_jsonb(grades)
      into after_data
      from match.grades as grades
      where grades.id = admin_scope.target_id;

    when 'create_season' then
      target_id := pg_catalog.gen_random_uuid();
      target_type := 'season';

      insert into match.seasons (
        id,
        name,
        starts_on,
        ends_on
      )
      values (
        target_id,
        pg_catalog.btrim(payload->>'name'),
        (payload->>'startsOn')::date,
        (payload->>'endsOn')::date
      );

      select pg_catalog.to_jsonb(seasons)
      into after_data
      from match.seasons as seasons
      where seasons.id = admin_scope.target_id;

    when 'update_season' then
      target_id := (payload->>'seasonId')::uuid;
      target_type := 'season';

      select pg_catalog.to_jsonb(seasons)
      into before_data
      from match.seasons as seasons
      where seasons.id = admin_scope.target_id
      for update;

      if not found then
        raise exception 'match season not found'
          using errcode = 'P0002';
      end if;

      update match.seasons as season
      set name = coalesce(
            nullif(pg_catalog.btrim(payload->>'name'), ''),
            season.name
          ),
          starts_on = coalesce(
            (payload->>'startsOn')::date,
            season.starts_on
          ),
          ends_on = case
            when payload ? 'endsOn'
              then (payload->>'endsOn')::date
            else season.ends_on
          end,
          active = coalesce(
            (payload->>'active')::boolean,
            season.active
          ),
          updated_at = pg_catalog.clock_timestamp()
      where season.id = admin_scope.target_id
        and (
          payload ? 'name'
          or payload ? 'startsOn'
          or payload ? 'endsOn'
          or payload ? 'active'
        );
      get diagnostics affected = row_count;

      if affected <> 1 then
        raise exception 'season changes are required'
          using errcode = '22023';
      end if;

      select pg_catalog.to_jsonb(seasons)
      into after_data
      from match.seasons as seasons
      where seasons.id = admin_scope.target_id;

    when 'review_member_link' then
      target_id := (payload->>'linkId')::uuid;
      target_type := 'member_link';

      select pg_catalog.to_jsonb(member_links)
      into before_data
      from match.member_links as member_links
      where member_links.id = admin_scope.target_id
      for update;

      if not found then
        raise exception 'member link request not found'
          using errcode = 'P0002';
      end if;

      if payload->>'decision' not in ('approved', 'rejected') then
        raise exception 'invalid member link decision'
          using errcode = '22023';
      end if;

      if payload->>'decision' = 'approved' and exists (
        select 1
        from match.member_links as requested
        join match.member_links as approved
          on approved.member_id = requested.member_id
         and approved.status = 'approved'
         and approved.id <> requested.id
        where requested.id = admin_scope.target_id
      ) then
        raise exception 'member already has an approved account'
          using errcode = '23505';
      end if;

      update match.member_links as member_link
      set status = (payload->>'decision')::match.link_status,
          reviewed_at = pg_catalog.clock_timestamp(),
          reviewed_by = actor_id
      where member_link.id = admin_scope.target_id
        and member_link.status = 'pending';
      get diagnostics affected = row_count;

      if affected <> 1 then
        raise exception 'member link request is not pending'
          using errcode = '55000';
      end if;

      select pg_catalog.to_jsonb(member_links)
      into after_data
      from match.member_links as member_links
      where member_links.id = admin_scope.target_id;

    else
      raise exception 'unsupported match management command'
        using errcode = '22023';
  end case;

  result := pg_catalog.jsonb_build_object(
    'status',
    'applied',
    'targetId',
    target_id
  );

  insert into match.operations (
    id,
    game_day_id,
    actor_id,
    device_id,
    operation_type,
    command_hash,
    base_version,
    occurred_at,
    result
  )
  values (
    operation_id,
    null,
    actor_id,
    device_id,
    command_type,
    command_hash,
    null,
    occurred_at,
    result
  );

  insert into match.audit_events (
    operation_id,
    target_type,
    target_id,
    action,
    before_data,
    after_data,
    actor_id,
    device_id,
    source,
    occurred_at
  )
  values (
    operation_id,
    target_type,
    target_id,
    command_type,
    before_data,
    after_data,
    actor_id,
    device_id,
    'online',
    occurred_at
  );

  update match.release_state
  set first_write_at = pg_catalog.clock_timestamp()
  where singleton
    and first_write_at is null;

  return result;
end;
$$;

revoke all on function public.apply_admin_command(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.apply_admin_command(jsonb)
to authenticated;
