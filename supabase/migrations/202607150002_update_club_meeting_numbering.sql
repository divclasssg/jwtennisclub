do $$
declare
  launch_excluded_meeting_id uuid;
begin
  select meetings.id into launch_excluded_meeting_id
  from public.club_meetings as meetings
  where meetings.meeting_kind = 'regular'
    and meetings.meeting_date = date '2026-07-04';

  if launch_excluded_meeting_id is null then
    return;
  end if;

  if exists (
    select 1 from public.club_meetings as lightning
    where lightning.linked_regular_meeting_id = launch_excluded_meeting_id
  ) then
    raise exception 'meeting date 2026-07-04 has linked lightning meeting';
  end if;

  delete from public.meeting_attendance
  where meeting_id = launch_excluded_meeting_id;
  alter table public.meeting_lifecycle_events
  disable trigger meeting_lifecycle_events_prevent_mutation;
  delete from public.meeting_lifecycle_events
  where meeting_id = launch_excluded_meeting_id;
  alter table public.meeting_lifecycle_events
  enable trigger meeting_lifecycle_events_prevent_mutation;
  delete from public.club_meetings
  where id = launch_excluded_meeting_id;
end;
$$;

alter table public.club_meetings
add column meeting_number integer;

create or replace function public.meeting_regular_number(
  requested_period_month date,
  occurrence smallint
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized_month date := pg_catalog.date_trunc('month', requested_period_month)::date;
  numbering_start_month constant date := date '2026-07-01';
  month_offset integer;
begin
  if requested_period_month <> normalized_month or occurrence not in (1, 3) then
    raise exception 'invalid regular meeting month or occurrence' using errcode = '22023';
  end if;

  month_offset := (
    extract(year from normalized_month)::integer
      - extract(year from numbering_start_month)::integer
  ) * 12
    + extract(month from normalized_month)::integer
    - extract(month from numbering_start_month)::integer;

  if month_offset < 0 or (month_offset = 0 and occurrence = 1) then
    return null;
  end if;

  return month_offset * 2 + case when occurrence = 1 then 0 else 1 end;
end;
$$;

update public.club_meetings as meetings
set meeting_number = public.meeting_regular_number(
  meetings.period_month,
  meetings.regular_occurrence
)
where meetings.meeting_kind = 'regular';

update public.club_meetings as meetings
set title = meetings.meeting_number::text || '차 정모'
where meetings.meeting_kind = 'regular';

alter table public.club_meetings
add constraint club_meetings_number_shape check (
  (meeting_kind = 'regular' and meeting_number is not null and meeting_number > 0)
  or (meeting_kind = 'lightning' and meeting_number is null)
);

create unique index club_meetings_regular_number_unique
on public.club_meetings(meeting_number)
where meeting_kind = 'regular';

revoke execute on function public.meeting_regular_number(date, smallint)
from public, anon, authenticated, service_role;

create or replace function public.create_lightning_club_meeting(
  requested_linked_regular_meeting_id uuid,
  requested_meeting_date date,
  requested_start_time time,
  requested_end_time time,
  requested_location text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid := public.require_meeting_operator(
    array['meetings.manage']
  );
  locked_regular_meeting public.club_meetings%rowtype;
  created_lightning_meeting_id uuid;
  normalized_location text := nullif(pg_catalog.btrim(requested_location), '');
  derived_title text;
begin
  if requested_meeting_date is null
    or requested_start_time is null
    or requested_end_time is null
    or requested_end_time <= requested_start_time
  then
    raise exception 'invalid lightning meeting date or time' using errcode = '22023';
  end if;
  if normalized_location is not null
    and pg_catalog.length(normalized_location) > 200
  then
    raise exception 'invalid meeting location' using errcode = '22023';
  end if;

  select meetings.*
  into locked_regular_meeting
  from public.club_meetings as meetings
  where meetings.id = requested_linked_regular_meeting_id
  for update;

  if not found or locked_regular_meeting.meeting_kind <> 'regular' then
    raise exception 'regular meeting not found' using errcode = 'P0002';
  end if;
  if locked_regular_meeting.cancelled_at is null then
    raise exception 'linked regular meeting must be cancelled' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.club_meetings as lightning_meetings
    where lightning_meetings.linked_regular_meeting_id = locked_regular_meeting.id
  ) then
    raise exception 'lightning meeting already exists' using errcode = '23505';
  end if;

  derived_title := locked_regular_meeting.meeting_number::text
    || '차 정모 대체 번개';

  insert into public.club_meetings (
    meeting_kind,
    period_month,
    regular_occurrence,
    meeting_date,
    start_time,
    end_time,
    title,
    location,
    linked_regular_meeting_id,
    created_by,
    updated_by
  )
  values (
    'lightning',
    locked_regular_meeting.period_month,
    null,
    requested_meeting_date,
    requested_start_time,
    requested_end_time,
    derived_title,
    normalized_location,
    locked_regular_meeting.id,
    actor_profile_id,
    actor_profile_id
  )
  returning id into created_lightning_meeting_id;

  insert into public.meeting_attendance (
    meeting_id,
    member_id,
    roster_member_id,
    target_origin,
    member_code_snapshot,
    member_name_snapshot,
    group_code_snapshot
  )
  select
    created_lightning_meeting_id,
    source_attendance.member_id,
    source_attendance.roster_member_id,
    source_attendance.target_origin,
    source_attendance.member_code_snapshot,
    source_attendance.member_name_snapshot,
    source_attendance.group_code_snapshot
  from public.meeting_attendance as source_attendance
  where source_attendance.meeting_id = locked_regular_meeting.id;

  insert into public.meeting_lifecycle_events (
    meeting_id,
    event_type,
    actor_profile_id,
    details
  )
  values (
    created_lightning_meeting_id,
    'lightning_created',
    actor_profile_id,
    pg_catalog.jsonb_build_object(
      'linkedRegularMeetingId', locked_regular_meeting.id
    )
  );

  return pg_catalog.jsonb_build_object(
    'status', 'saved',
    'meetingId', created_lightning_meeting_id
  );
end;
$$;

revoke execute on function public.create_lightning_club_meeting(uuid, date, time, time, text) from public, anon;
grant execute on function public.create_lightning_club_meeting(uuid, date, time, time, text) to authenticated;

create or replace function public.ensure_regular_club_meetings(
  requested_period_month date,
  actor_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_period_month date := pg_catalog.date_trunc(
    'month',
    requested_period_month
  )::date;
  occurrence smallint;
  generated_meeting_number integer;
begin
  if requested_period_month <> normalized_period_month then
    raise exception 'period month must be the first day'
      using errcode = '22023';
  end if;

  foreach occurrence in array array[1, 3]::smallint[]
  loop
    generated_meeting_number := public.meeting_regular_number(
      normalized_period_month,
      occurrence
    );
    continue when generated_meeting_number is null;

    insert into public.club_meetings (
      meeting_kind,
      period_month,
      regular_occurrence,
      meeting_number,
      meeting_date,
      start_time,
      end_time,
      title,
      created_by,
      updated_by
    )
    values (
      'regular',
      normalized_period_month,
      occurrence,
      generated_meeting_number,
      public.meeting_regular_date(normalized_period_month, occurrence),
      '18:00'::time,
      '22:00'::time,
      generated_meeting_number::text || '차 정모',
      actor_profile_id,
      actor_profile_id
    )
    on conflict (period_month, regular_occurrence)
      where meeting_kind = 'regular'
    do nothing;
  end loop;
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
        where members.status = 'active'
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

revoke execute on function public.get_club_meeting_directory_page(date, text) from public, anon;
grant execute on function public.get_club_meeting_directory_page(date, text) to authenticated;
