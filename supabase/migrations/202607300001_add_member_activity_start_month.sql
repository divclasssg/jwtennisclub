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

create or replace function public.ensure_operator_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kst_today date := public.meeting_kst_today();
begin
  perform public.prepare_meeting_rosters_before_member_change(
    kst_today,
    new.id
  );

  insert into public.members (
    name,
    status,
    joined_date,
    activity_start_month,
    memo,
    operator_profile_id
  )
  values (
    new.display_name,
    'active',
    kst_today,
    null,
    '운영자 계정 생성으로 자동 등록',
    new.id
  )
  on conflict (operator_profile_id) do nothing;

  perform public.sync_meeting_rosters_after_member_change(kst_today);
  return new;
end;
$$;

revoke execute on function public.ensure_operator_member()
from public, anon, authenticated, service_role;

create or replace function public.add_meeting_ad_hoc_member(
  requested_meeting_id uuid,
  requested_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid := public.require_meeting_operator(
    array['meetings.attendance.manage']
  );
  locked_meeting public.club_meetings%rowtype;
  locked_roster_id uuid;
  target_member record;
begin
  select meetings.*
  into locked_meeting
  from public.club_meetings as meetings
  where meetings.id = requested_meeting_id
  for update;

  if not found then
    raise exception 'meeting not found' using errcode = 'P0002';
  end if;
  if locked_meeting.cancelled_at is not null then
    raise exception 'meeting is cancelled' using errcode = '55000';
  end if;
  if locked_meeting.attendance_closed_at is not null then
    raise exception 'meeting attendance is closed' using errcode = '55000';
  end if;

  select rosters.id
  into locked_roster_id
  from public.meeting_month_rosters as rosters
  where rosters.period_month = locked_meeting.period_month
    and rosters.status = 'locked';

  if locked_roster_id is null then
    raise exception 'meeting roster is not locked' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.meeting_month_roster_members as roster_members
    where roster_members.roster_id = locked_roster_id
      and roster_members.member_id = requested_member_id
  ) then
    raise exception 'member already belongs to monthly roster'
      using errcode = '55000';
  end if;

  select members.id, members.member_code, members.name, member_groups.code
  into target_member
  from public.members as members
  left join public.member_groups as member_groups
    on member_groups.id = members.group_id
  where members.id = requested_member_id
    and (
      members.status = 'active'
      or (
        members.status = 'paused'
        and members.pause_start_month > locked_meeting.period_month
      )
      or (
        members.status = 'withdrawn'
        and members.withdrawn_date > (
          locked_meeting.period_month + interval '1 month - 1 day'
        )::date
      )
    )
    and members.activity_start_month is not null
    and members.activity_start_month <= locked_meeting.period_month
  for share of members;

  if not found then
    raise exception 'member is not active' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.meeting_attendance as attendance
    where attendance.meeting_id = locked_meeting.id
      and attendance.member_id = target_member.id
  ) then
    raise exception 'meeting target already exists' using errcode = '23505';
  end if;

  insert into public.meeting_attendance (
    meeting_id,
    member_id,
    roster_member_id,
    target_origin,
    member_code_snapshot,
    member_name_snapshot,
    group_code_snapshot
  )
  values (
    locked_meeting.id,
    target_member.id,
    null,
    'ad_hoc',
    target_member.member_code,
    target_member.name,
    target_member.code
  );

  insert into public.meeting_lifecycle_events (
    meeting_id,
    event_type,
    actor_profile_id,
    details
  )
  values (
    locked_meeting.id,
    'ad_hoc_added',
    actor_profile_id,
    pg_catalog.jsonb_build_object('memberId', target_member.id)
  );

  return pg_catalog.jsonb_build_object('status', 'saved');
end;
$$;

revoke execute on function public.add_meeting_ad_hoc_member(uuid, uuid)
from public, anon;
grant execute on function public.add_meeting_ad_hoc_member(uuid, uuid)
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
    or (
      members.status = 'withdrawn'
      and members.withdrawn_date > (
        requested_period_month + interval '1 month - 1 day'
      )::date
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
          or (
            members.status = 'withdrawn'
            and members.withdrawn_date > (
              requested_period_month + interval '1 month - 1 day'
            )::date
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
        or (
          members.status = 'withdrawn'
          and members.withdrawn_date > (
            requested_period_month + interval '1 month - 1 day'
          )::date
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

create or replace function public.get_club_meeting_directory_page(
  requested_period_month date,
  requested_selected_meeting_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  normalized_period_month date := pg_catalog.date_trunc(
    'month',
    requested_period_month
  )::date;
  month_roster_status public.meeting_roster_status;
  month_roster_id uuid;
  roster_json jsonb;
  meetings_json jsonb;
  summary_json jsonb;
  selected_meeting_id uuid;
  selected_meeting_json jsonb;
  selected_targets_json jsonb;
  ad_hoc_candidates_json jsonb;
  lifecycle_events_json jsonb;
  selected_selection_json jsonb;
  modal_error text;
  can_manage_meeting boolean;
  can_manage_attendance boolean;
begin
  if requested_period_month is null
    or requested_period_month <> normalized_period_month
  then
    raise exception 'period month must be the first day'
      using errcode = '22023';
  end if;

  perform public.require_meeting_operator(array[]::text[]);
  can_manage_meeting := public.has_permission('meetings.manage');
  can_manage_attendance := public.has_permission(
    'meetings.attendance.manage'
  );

  select
    rosters.id,
    rosters.status,
    pg_catalog.jsonb_build_object(
      'status', rosters.status,
      'roster_origin', rosters.roster_origin,
      'statistics_eligible', rosters.statistics_eligible
    )
  into month_roster_id, month_roster_status, roster_json
  from public.meeting_month_rosters as rosters
  where rosters.period_month = normalized_period_month;

  with attendance_counts as (
    select
      attendance.meeting_id,
      pg_catalog.count(*) as total,
      pg_catalog.count(*) filter (
        where attendance.rsvp_status = 'unanswered'
      ) as rsvp_unanswered,
      pg_catalog.count(*) filter (
        where attendance.rsvp_status = 'attending'
      ) as rsvp_attending,
      pg_catalog.count(*) filter (
        where attendance.rsvp_status = 'late'
      ) as rsvp_late,
      pg_catalog.count(*) filter (
        where attendance.rsvp_status = 'declined'
      ) as rsvp_declined,
      pg_catalog.count(*) filter (
        where attendance.attendance_status = 'unchecked'
      ) as attendance_unchecked,
      pg_catalog.count(*) filter (
        where attendance.attendance_status = 'present'
      ) as attendance_present,
      pg_catalog.count(*) filter (
        where attendance.attendance_status = 'late'
      ) as attendance_late,
      pg_catalog.count(*) filter (
        where attendance.attendance_status = 'absent'
      ) as attendance_absent
    from public.meeting_attendance as attendance
    inner join public.club_meetings as attendance_meetings
      on attendance_meetings.id = attendance.meeting_id
    where attendance_meetings.period_month = normalized_period_month
    group by attendance.meeting_id
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', meetings.id,
        'meeting_kind', meetings.meeting_kind,
        'period_month', meetings.period_month,
        'regular_occurrence', meetings.regular_occurrence,
        'meeting_number', meetings.meeting_number,
        'meeting_date', meetings.meeting_date,
        'start_time', meetings.start_time,
        'end_time', meetings.end_time,
        'title', meetings.title,
        'location', meetings.location,
        'linked_regular_meeting_id', meetings.linked_regular_meeting_id,
        'linked_regular_meeting_number', linked_regular_meetings.meeting_number,
        'status', case
          when meetings.cancelled_at is not null then 'cancelled'
          when meetings.attendance_closed_at is not null then 'completed'
          else 'scheduled'
        end,
        'counts', case
          when month_roster_status = 'locked' then
            pg_catalog.jsonb_build_object(
              'total', coalesce(attendance_counts.total, 0),
              'rsvp_unanswered', coalesce(
                attendance_counts.rsvp_unanswered,
                0
              ),
              'rsvp_attending', coalesce(
                attendance_counts.rsvp_attending,
                0
              ),
              'rsvp_late', coalesce(attendance_counts.rsvp_late, 0),
              'rsvp_declined', coalesce(
                attendance_counts.rsvp_declined,
                0
              ),
              'attendance_unchecked', coalesce(
                attendance_counts.attendance_unchecked,
                0
              ),
              'attendance_present', coalesce(
                attendance_counts.attendance_present,
                0
              ),
              'attendance_late', coalesce(
                attendance_counts.attendance_late,
                0
              ),
              'attendance_absent', coalesce(
                attendance_counts.attendance_absent,
                0
              )
            )
          else null
        end
      )
      order by meetings.meeting_date, meetings.start_time, meetings.id
    ),
    '[]'::jsonb
  )
  into meetings_json
  from public.club_meetings as meetings
  left join public.club_meetings as linked_regular_meetings
    on linked_regular_meetings.id = meetings.linked_regular_meeting_id
  left join attendance_counts
    on attendance_counts.meeting_id = meetings.id
  where meetings.period_month = normalized_period_month;

  select pg_catalog.jsonb_build_object(
    'total', pg_catalog.count(*),
    'scheduled', pg_catalog.count(*) filter (
      where meetings.cancelled_at is null
        and meetings.attendance_closed_at is null
    ),
    'completed', pg_catalog.count(*) filter (
      where meetings.cancelled_at is null
        and meetings.attendance_closed_at is not null
    ),
    'cancelled', pg_catalog.count(*) filter (
      where meetings.cancelled_at is not null
    )
  )
  into summary_json
  from public.club_meetings as meetings
  where meetings.period_month = normalized_period_month;

  if nullif(pg_catalog.btrim(requested_selected_meeting_id), '') is not null
  then
    select requested_meeting.id
    into selected_meeting_id
    from public.club_meetings as requested_meeting
    where requested_meeting.id::text = requested_selected_meeting_id
      and requested_meeting.period_month = normalized_period_month;

    if selected_meeting_id is null then
      modal_error := 'selected meeting unavailable';
    else
      select meeting_value
      into selected_meeting_json
      from pg_catalog.jsonb_array_elements(meetings_json)
        as meeting_rows(meeting_value)
      where meeting_value->>'id' = selected_meeting_id::text;

      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'member_id', attendance.member_id,
            'target_origin', attendance.target_origin,
            'member_code_snapshot', attendance.member_code_snapshot,
            'member_name_snapshot', attendance.member_name_snapshot,
            'group_code_snapshot', attendance.group_code_snapshot,
            'rsvp_status', attendance.rsvp_status,
            'attendance_status', attendance.attendance_status,
            'arrival_time', attendance.arrival_time,
            'attendance_origin', attendance.attendance_origin,
            'has_recorded_state',
              attendance.rsvp_updated_by is not null
              or attendance.attendance_updated_by is not null,
            'rsvp_updated_at', attendance.rsvp_updated_at,
            'attendance_updated_at', attendance.attendance_updated_at
          )
          order by
            attendance.member_code_snapshot,
            attendance.member_name_snapshot,
            attendance.member_id
        ),
        '[]'::jsonb
      )
      into selected_targets_json
      from public.meeting_attendance as attendance
      where attendance.meeting_id = selected_meeting_id;

      if can_manage_attendance and month_roster_status = 'locked' then
        select coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', members.id,
              'member_code', members.member_code,
              'name', members.name,
              'group_code', member_groups.code
            )
            order by members.member_code, members.name, members.id
          ),
          '[]'::jsonb
        )
        into ad_hoc_candidates_json
        from public.members as members
        left join public.member_groups as member_groups
          on member_groups.id = members.group_id
        where (
          members.status = 'active'
          or (
            members.status = 'paused'
            and members.pause_start_month > normalized_period_month
          )
          or (
            members.status = 'withdrawn'
            and members.withdrawn_date > (
              normalized_period_month + interval '1 month - 1 day'
            )::date
          )
        )
          and members.activity_start_month is not null
          and members.activity_start_month <= normalized_period_month
          and not exists (
            select 1
            from public.meeting_attendance as existing_attendance
            where existing_attendance.meeting_id = selected_meeting_id
              and existing_attendance.member_id = members.id
          )
          and not exists (
            select 1
            from public.meeting_month_roster_members as candidate_roster_members
            where candidate_roster_members.roster_id = month_roster_id
              and candidate_roster_members.member_id = members.id
          );
      else
        ad_hoc_candidates_json := '[]'::jsonb;
      end if;

      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', lifecycle_events.id,
            'event_type', lifecycle_events.event_type,
            'actor_display_name', actor_profiles.display_name,
            'occurred_at', lifecycle_events.occurred_at,
            'reason', lifecycle_events.reason,
            'details', lifecycle_events.details
          )
          order by
            lifecycle_events.occurred_at desc,
            lifecycle_events.id desc
        ),
        '[]'::jsonb
      )
      into lifecycle_events_json
      from public.meeting_lifecycle_events as lifecycle_events
      inner join public.profiles as actor_profiles
        on actor_profiles.id = lifecycle_events.actor_profile_id
      where lifecycle_events.meeting_id = selected_meeting_id;

      selected_selection_json := pg_catalog.jsonb_build_object(
        'meeting', selected_meeting_json,
        'targets', selected_targets_json,
        'ad_hoc_candidates', ad_hoc_candidates_json,
        'lifecycle_events', lifecycle_events_json
      );
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'period_month', normalized_period_month,
    'can_manage_meeting', can_manage_meeting,
    'can_manage_attendance', can_manage_attendance,
    'roster', roster_json,
    'summary', summary_json,
    'meetings', meetings_json,
    'selected_meeting', selected_selection_json,
    'modal_error', modal_error
  );
end;
$$;

revoke execute on function public.get_club_meeting_directory_page(date, text)
from public, anon;
grant execute on function public.get_club_meeting_directory_page(date, text)
to authenticated;

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
from public, anon, authenticated, service_role;
revoke execute on function public.ensure_locked_meeting_roster(date, uuid, boolean)
from public, anon, authenticated, service_role;
revoke execute on function public.prepare_club_meeting_month(date)
from public, anon;
grant execute on function public.prepare_club_meeting_month(date)
to authenticated;

notify pgrst, 'reload schema';
commit;
