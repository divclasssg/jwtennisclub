begin;

alter table public.members
  add column activity_start_month date;

alter table public.members
  add constraint members_activity_start_month_is_month
  check (
    activity_start_month is null
    or activity_start_month = date_trunc('month', activity_start_month)::date
  ),
  add constraint members_activity_start_month_not_before_join
  check (
    activity_start_month is null
    or activity_start_month >= date_trunc('month', joined_date)::date
  );

create or replace function public.save_member_with_contact(
  member_id uuid,
  member_data jsonb,
  duplicate_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_member_id uuid := save_member_with_contact.member_id;
  requested_name text := pg_catalog.btrim(member_data->>'name');
  normalized_name text := pg_catalog.lower(
    pg_catalog.btrim(normalize(member_data->>'name', NFKC))
  );
  requested_phone text := nullif(
    pg_catalog.btrim(member_data->>'phone_number'),
    ''
  );
  normalized_phone text;
  duplicate_id uuid;
  name_exists boolean;
  assigned_code text;
  contact_update_requested boolean := member_data ? 'phone_number';
  kst_today date := public.meeting_kst_today();
begin
  if save_member_with_contact.member_id is null
    and not public.has_permission('members.create')
  then
    raise exception 'members.create permission required';
  elsif save_member_with_contact.member_id is not null
    and not public.has_permission('members.update')
  then
    raise exception 'members.update permission required';
  end if;

  if contact_update_requested
     and not public.has_permission('members.contacts.manage') then
    raise exception 'members.contacts.manage permission required';
  end if;

  if requested_name is null or requested_name = '' then
    raise exception 'member name is required';
  end if;

  normalized_phone := nullif(
    pg_catalog.regexp_replace(
      coalesce(requested_phone, ''),
      '[^0-9]',
      '',
      'g'
    ),
    ''
  );
  if normalized_phone is not null
    and normalized_phone !~ '^01[016789][0-9]{7,8}$'
  then
    raise exception 'invalid phone number';
  end if;

  perform public.prepare_meeting_rosters_before_member_change(
    kst_today,
    auth.uid()
  );

  if contact_update_requested then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'member-contact-phone:' || coalesce(normalized_phone, '<none>'),
        0
      )
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('member-contact-name:' || normalized_name, 0)
  );

  if contact_update_requested then
    select contacts.member_id
    into duplicate_id
    from public.member_contacts as contacts
    inner join public.members as duplicate_member
      on duplicate_member.id = contacts.member_id
    where contacts.phone_normalized = normalized_phone
      and contacts.member_id is distinct from save_member_with_contact.member_id
    order by (
      pg_catalog.lower(
        pg_catalog.btrim(normalize(duplicate_member.name, NFKC))
      ) = normalized_name
    ) desc
    limit 1;
  end if;

  if duplicate_id is not null then
    if exists (
      select 1
      from public.members as duplicate_member
      where duplicate_member.id = duplicate_id
        and pg_catalog.lower(
          pg_catalog.btrim(normalize(duplicate_member.name, NFKC))
        ) = normalized_name
    ) then
      return pg_catalog.jsonb_build_object(
        'status', 'DUPLICATE_BLOCKED', 'member_id', duplicate_id
      );
    elsif duplicate_confirmation is distinct from 'CONFIRM_PHONE_REUSE' then
      return pg_catalog.jsonb_build_object(
        'status', 'PHONE_REUSE_CONFIRMATION_REQUIRED', 'member_id', duplicate_id
      );
    end if;
  end if;

  select exists (
    select 1
    from public.members as existing_members
    where existing_members.id is distinct from save_member_with_contact.member_id
      and pg_catalog.lower(
        pg_catalog.btrim(normalize(existing_members.name, NFKC))
      ) = normalized_name
  ) into name_exists;

  if save_member_with_contact.member_id is null
    and normalized_phone is null
    and name_exists
    and duplicate_confirmation is distinct from 'CONFIRM_NAME_ONLY'
  then
    return pg_catalog.jsonb_build_object(
      'status', 'NAME_ONLY_CONFIRMATION_REQUIRED'
    );
  end if;

  if saved_member_id is null then
    insert into public.members (
      name,
      status,
      pause_start_month,
      activity_start_month,
      joined_date,
      withdrawn_date,
      memo,
      created_by,
      updated_by,
      group_id
    ) values (
      requested_name,
      coalesce((member_data->>'status')::public.member_status, 'active'),
      (member_data->>'pause_start_month')::date,
      (member_data->>'activity_start_month')::date,
      coalesce((member_data->>'joined_date')::date, kst_today),
      (member_data->>'withdrawn_date')::date,
      nullif(pg_catalog.btrim(member_data->>'memo'), ''),
      auth.uid(),
      auth.uid(),
      (member_data->>'group_id')::uuid
    )
    returning id into saved_member_id;
  else
    update public.members as saved_members
    set name = requested_name,
        status = coalesce(
          (member_data->>'status')::public.member_status,
          saved_members.status
        ),
        pause_start_month = case
          when coalesce(
            (member_data->>'status')::public.member_status,
            saved_members.status
          ) <> 'paused' then null
          when member_data ? 'pause_start_month'
            then (member_data->>'pause_start_month')::date
          else saved_members.pause_start_month
        end,
        activity_start_month = case
          when member_data ? 'activity_start_month'
            then (member_data->>'activity_start_month')::date
          else saved_members.activity_start_month
        end,
        joined_date = coalesce(
          (member_data->>'joined_date')::date,
          saved_members.joined_date
        ),
        withdrawn_date = (member_data->>'withdrawn_date')::date,
        memo = nullif(pg_catalog.btrim(member_data->>'memo'), ''),
        group_id = case
          when member_data ? 'group_id' then (member_data->>'group_id')::uuid
          else saved_members.group_id
        end,
        updated_by = auth.uid(),
        updated_at = pg_catalog.now()
    where saved_members.id = saved_member_id;

    if not found then
      raise exception 'member not found';
    end if;
  end if;

  if contact_update_requested then
    if requested_phone is not null then
      insert into public.member_contacts (
        member_id, phone_number, phone_normalized, updated_by, updated_at
      ) values (
        saved_member_id, normalized_phone, normalized_phone, auth.uid(), pg_catalog.now()
      )
      on conflict on constraint member_contacts_pkey do update
      set phone_number = excluded.phone_number,
          phone_normalized = excluded.phone_normalized,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;
    else
      delete from public.member_contacts as member_contacts
      where member_contacts.member_id = saved_member_id;
    end if;
  end if;

  perform public.sync_meeting_rosters_after_member_change(kst_today);

  return pg_catalog.jsonb_build_object(
    'status', 'SAVED',
    'member_id', saved_member_id,
    'member_code', coalesce(
      assigned_code,
      (
        select members.member_code
        from public.members as members
        where members.id = saved_member_id
      )
    )
  );
end;
$$;

revoke execute on function public.save_member_with_contact(uuid, jsonb, text)
from public, anon;
grant execute on function public.save_member_with_contact(uuid, jsonb, text)
to authenticated;

create or replace function public.get_member_directory_page(
  requested_status text default 'active',
  search_query text default null
)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with operator_permissions as (
    select role_permissions.permission
    from public.profiles
    inner join public.role_permissions
      on role_permissions.role_id = profiles.role_id
    where profiles.id = auth.uid()
      and profiles.status = 'active'
  ), access as (
    select
      exists (select 1 from operator_permissions where permission = 'members.view') as can_view,
      exists (select 1 from operator_permissions where permission = 'members.create') as can_create,
      exists (select 1 from operator_permissions where permission = 'members.update') as can_update,
      exists (select 1 from operator_permissions where permission = 'members.contacts.manage') as can_manage_contacts
  )
  select pg_catalog.jsonb_build_object(
    'can_create', access.can_create,
    'can_update', access.can_update,
    'members', case when access.can_view then coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', members.id,
        'member_code', members.member_code,
        'name', members.name,
        'operator_profile_id', members.operator_profile_id,
        'club_position_label', club_positions.label,
        'phone_display', case when access.can_manage_contacts
          then member_contacts.phone_number
          else public.mask_phone_number(member_contacts.phone_number)
        end,
        'group_code', member_groups.code,
        'status', members.status,
        'pause_start_month', members.pause_start_month,
        'activity_start_month', members.activity_start_month,
        'joined_date', members.joined_date,
        'withdrawn_date', members.withdrawn_date,
        'memo', members.memo
      ) order by members.member_code)
      from public.members
      left join public.member_groups on member_groups.id = members.group_id
      left join public.member_contacts on member_contacts.member_id = members.id
      left join public.profiles as operator_profiles
        on operator_profiles.id = members.operator_profile_id
      left join public.club_positions
        on club_positions.id = operator_profiles.club_position_id
      where (requested_status is null or members.status::text = requested_status)
        and (
          nullif(pg_catalog.btrim(search_query), '') is null
          or members.name ilike '%' || pg_catalog.btrim(search_query) || '%'
          or members.member_code ilike '%' || pg_catalog.btrim(search_query) || '%'
        )
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  from access;
$$;

revoke execute on function public.get_member_directory_page(text, text)
from public, anon;
grant execute on function public.get_member_directory_page(text, text)
to authenticated;

create or replace function public.sync_preparing_meeting_roster(
  requested_period_month date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_roster_id uuid;
begin
  select rosters.id into target_roster_id
  from public.meeting_month_rosters as rosters
  where rosters.period_month = requested_period_month
    and rosters.status = 'preparing'
  for update;

  if target_roster_id is null then return; end if;

  insert into public.meeting_month_roster_members (
    roster_id, member_id, member_code_snapshot, member_name_snapshot, group_code_snapshot
  )
  select target_roster_id, members.id, members.member_code, members.name, member_groups.code
  from public.members as members
  left join public.member_groups as member_groups on member_groups.id = members.group_id
  where (
    members.status = 'active'
    or (
      members.status = 'paused'
      and members.pause_start_month > requested_period_month
    )
  )
    and members.activity_start_month is not null
    and members.activity_start_month <= requested_period_month
  on conflict (roster_id, member_id) do update
  set member_code_snapshot = excluded.member_code_snapshot,
      member_name_snapshot = excluded.member_name_snapshot,
      group_code_snapshot = excluded.group_code_snapshot;

  delete from public.meeting_month_roster_members as roster_members
  where roster_members.roster_id = target_roster_id
    and not exists (
      select 1 from public.members as members
      where members.id = roster_members.member_id
        and (
          members.status = 'active'
          or (
            members.status = 'paused'
            and members.pause_start_month > requested_period_month
          )
        )
        and members.activity_start_month is not null
        and members.activity_start_month <= requested_period_month
    );

  update public.meeting_month_rosters as rosters
  set updated_at = pg_catalog.clock_timestamp()
  where rosters.id = target_roster_id;
end;
$$;

create or replace function public.ensure_locked_meeting_roster(
  requested_period_month date,
  actor_profile_id uuid,
  allow_bootstrap boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  roster_row record;
  use_bootstrap boolean := false;
begin
  select rosters.id, rosters.status, rosters.roster_origin
  into roster_row
  from public.meeting_month_rosters as rosters
  where rosters.period_month = requested_period_month
  for update;

  if not found then
    use_bootstrap := allow_bootstrap
      and not exists (
        select 1 from public.meeting_month_rosters as existing_rosters
        where existing_rosters.roster_origin = 'bootstrap'
      );

    if use_bootstrap then
      insert into public.meeting_month_rosters (
        period_month, status, roster_origin, statistics_eligible, locked_at, locked_by
      ) values (
        requested_period_month, 'locked', 'bootstrap', false,
        pg_catalog.clock_timestamp(), actor_profile_id
      ) returning id, status, roster_origin into roster_row;

      insert into public.meeting_month_roster_members (
        roster_id, member_id, member_code_snapshot, member_name_snapshot, group_code_snapshot
      )
      select roster_row.id, members.id, members.member_code, members.name, member_groups.code
      from public.members as members
      left join public.member_groups as member_groups on member_groups.id = members.group_id
      where (
        members.status = 'active'
        or (
          members.status = 'paused'
          and members.pause_start_month > requested_period_month
        )
      )
        and members.activity_start_month is not null
        and members.activity_start_month <= requested_period_month
      on conflict (roster_id, member_id) do nothing;
    else
      insert into public.meeting_month_rosters (
        period_month, status, roster_origin, statistics_eligible
      ) values (
        requested_period_month, 'preparing', 'automatic', true
      ) returning id, status, roster_origin into roster_row;
    end if;
  end if;

  if roster_row.status = 'preparing' then
    perform public.sync_preparing_meeting_roster(requested_period_month);
    update public.meeting_month_rosters as rosters
    set status = 'locked',
        locked_at = pg_catalog.clock_timestamp(),
        locked_by = actor_profile_id,
        updated_at = pg_catalog.clock_timestamp()
    where rosters.id = roster_row.id;
  end if;

  perform public.seed_monthly_meeting_attendance(requested_period_month);
end;
$$;

create or replace function public.prepare_club_meeting_month(
  requested_period_month date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_period_month date := pg_catalog.date_trunc(
    'month', requested_period_month
  )::date;
  actor_profile_id uuid;
  kst_today date := public.meeting_kst_today();
  current_period_month date := pg_catalog.date_trunc('month', kst_today)::date;
  last_automatic_period_month date := (
    current_period_month + pg_catalog.make_interval(months => 2)
  )::date;
begin
  if requested_period_month is null
    or requested_period_month <> normalized_period_month
  then
    raise exception 'period month must be the first day' using errcode = '22023';
  end if;

  actor_profile_id := public.require_meeting_operator(array[]::text[]);
  perform public.bootstrap_club_meeting_automation(kst_today, actor_profile_id, false);

  if normalized_period_month between current_period_month and last_automatic_period_month then
    perform public.lock_meeting_period_months(array[normalized_period_month]);
    perform public.lock_meeting_automation_rows(array[normalized_period_month]);
    perform public.ensure_regular_club_meetings(
      normalized_period_month,
      actor_profile_id
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'prepared', 'period_month', normalized_period_month
  );
end;
$$;

revoke execute on function public.sync_preparing_meeting_roster(date)
from public, anon;
grant execute on function public.sync_preparing_meeting_roster(date)
to authenticated;
revoke execute on function public.ensure_locked_meeting_roster(date, uuid, boolean)
from public, anon;
grant execute on function public.ensure_locked_meeting_roster(date, uuid, boolean)
to authenticated;
revoke execute on function public.prepare_club_meeting_month(date)
from public, anon;
grant execute on function public.prepare_club_meeting_month(date)
to authenticated;

notify pgrst, 'reload schema';
commit;
