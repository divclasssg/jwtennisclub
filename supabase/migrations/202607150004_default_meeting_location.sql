update public.club_meetings
set location = '용마테니스장'
where location is null;

alter table public.club_meetings
alter column location set default '용마테니스장';

alter table public.club_meetings
alter column location set not null;

create or replace function public.update_club_meeting_location(
  requested_meeting_id uuid,
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
  locked_meeting public.club_meetings%rowtype;
  normalized_location text := coalesce(
    nullif(pg_catalog.btrim(requested_location), ''),
    '용마테니스장'
  );
begin
  if pg_catalog.length(normalized_location) > 200 then
    raise exception 'invalid meeting location' using errcode = '22023';
  end if;

  select meetings.*
  into locked_meeting
  from public.club_meetings as meetings
  where meetings.id = requested_meeting_id
  for update;

  if not found then
    raise exception 'meeting not found' using errcode = 'P0002';
  end if;
  if locked_meeting.meeting_kind <> 'regular' then
    raise exception 'only regular meeting location can be updated'
      using errcode = '22023';
  end if;
  if locked_meeting.cancelled_at is not null then
    raise exception 'meeting is cancelled' using errcode = '55000';
  end if;
  if locked_meeting.attendance_closed_at is not null then
    raise exception 'meeting attendance is closed' using errcode = '55000';
  end if;
  if normalized_location is not distinct from locked_meeting.location then
    return pg_catalog.jsonb_build_object('status', 'saved');
  end if;

  update public.club_meetings as meetings
  set location = normalized_location,
      updated_by = actor_profile_id,
      updated_at = pg_catalog.clock_timestamp()
  where meetings.id = locked_meeting.id;

  insert into public.meeting_lifecycle_events (
    meeting_id,
    event_type,
    actor_profile_id,
    details
  )
  values (
    locked_meeting.id,
    'location_updated',
    actor_profile_id,
    pg_catalog.jsonb_build_object(
      'before', locked_meeting.location,
      'after', normalized_location
    )
  );

  return pg_catalog.jsonb_build_object('status', 'saved');
end;
$$;

revoke execute on function public.update_club_meeting_location(uuid, text) from public, anon;
grant execute on function public.update_club_meeting_location(uuid, text) to authenticated;

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
  normalized_location text := coalesce(
    nullif(pg_catalog.btrim(requested_location), ''),
    '용마테니스장'
  );
  derived_title text;
begin
  if requested_meeting_date is null
    or requested_start_time is null
    or requested_end_time is null
    or requested_end_time <= requested_start_time
  then
    raise exception 'invalid lightning meeting date or time' using errcode = '22023';
  end if;
  if pg_catalog.length(normalized_location) > 200 then
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
    meeting_kind, period_month, regular_occurrence, meeting_date,
    start_time, end_time, title, location, linked_regular_meeting_id,
    created_by, updated_by
  )
  values (
    'lightning', locked_regular_meeting.period_month, null,
    requested_meeting_date, requested_start_time, requested_end_time,
    derived_title, normalized_location, locked_regular_meeting.id,
    actor_profile_id, actor_profile_id
  )
  returning id into created_lightning_meeting_id;

  insert into public.meeting_attendance (
    meeting_id, member_id, roster_member_id, target_origin,
    member_code_snapshot, member_name_snapshot, group_code_snapshot
  )
  select
    created_lightning_meeting_id, source_attendance.member_id,
    source_attendance.roster_member_id, source_attendance.target_origin,
    source_attendance.member_code_snapshot,
    source_attendance.member_name_snapshot,
    source_attendance.group_code_snapshot
  from public.meeting_attendance as source_attendance
  where source_attendance.meeting_id = locked_regular_meeting.id;

  insert into public.meeting_lifecycle_events (
    meeting_id, event_type, actor_profile_id, details
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
