insert into public.role_permissions (role_id, permission)
select roles.id, permissions.permission
from public.roles
cross join (
  values
    ('meetings.view'),
    ('meetings.manage'),
    ('meetings.attendance.manage')
) as permissions(permission)
where roles.name in ('admin', 'operator')
on conflict (role_id, permission) do nothing;

create type public.meeting_kind as enum ('regular', 'lightning');
create type public.meeting_roster_status as enum ('preparing', 'locked');
create type public.meeting_roster_origin as enum ('automatic', 'bootstrap');
create type public.meeting_rsvp_status as enum (
  'unanswered',
  'attending',
  'late',
  'declined'
);
create type public.meeting_attendance_status as enum (
  'unchecked',
  'present',
  'late',
  'absent'
);
create type public.meeting_target_origin as enum ('monthly_roster', 'ad_hoc');
create type public.meeting_attendance_origin as enum ('manual', 'close_default');
create type public.meeting_lifecycle_event_type as enum (
  'cancelled',
  'restored',
  'attendance_closed',
  'attendance_reopened',
  'location_updated',
  'lightning_created',
  'ad_hoc_added',
  'ad_hoc_removed'
);

create table public.club_meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_kind public.meeting_kind not null,
  period_month date not null,
  regular_occurrence smallint,
  meeting_date date not null,
  start_time time not null,
  end_time time not null,
  title text not null,
  location text,
  linked_regular_meeting_id uuid references public.club_meetings(id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancellation_reason text,
  attendance_closed_at timestamptz,
  attendance_closed_by uuid references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_meetings_period_month_first_day check (
    period_month = date_trunc('month', period_month)::date
  ),
  constraint club_meetings_time_order check (end_time > start_time),
  constraint club_meetings_title_length check (
    length(btrim(title)) between 1 and 200
  ),
  constraint club_meetings_location_length check (
    location is null or length(btrim(location)) between 1 and 200
  ),
  constraint club_meetings_kind_shape check (
    (
      meeting_kind = 'regular'
      and regular_occurrence in (1, 3)
      and linked_regular_meeting_id is null
      and date_trunc('month', meeting_date)::date = period_month
    )
    or (
      meeting_kind = 'lightning'
      and regular_occurrence is null
      and linked_regular_meeting_id is not null
    )
  ),
  constraint club_meetings_cancellation_fields check (
    (
      cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null
    )
    or (
      cancelled_at is not null
      and cancelled_by is not null
      and cancellation_reason is not null
      and length(btrim(cancellation_reason)) between 1 and 500
    )
  ),
  constraint club_meetings_attendance_close_fields check (
    (attendance_closed_at is null and attendance_closed_by is null)
    or (attendance_closed_at is not null and attendance_closed_by is not null)
  )
);

create unique index club_meetings_regular_occurrence_unique
on public.club_meetings(period_month, regular_occurrence)
where meeting_kind = 'regular';

create unique index club_meetings_linked_regular_meeting_unique
on public.club_meetings(linked_regular_meeting_id)
where meeting_kind = 'lightning';

create index club_meetings_period_date_idx
on public.club_meetings(period_month, meeting_date, start_time);

create table public.meeting_month_rosters (
  id uuid primary key default gen_random_uuid(),
  period_month date not null unique,
  status public.meeting_roster_status not null,
  roster_origin public.meeting_roster_origin not null,
  statistics_eligible boolean not null,
  locked_at timestamptz,
  locked_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_month_rosters_period_month_first_day check (
    period_month = date_trunc('month', period_month)::date
  ),
  constraint meeting_month_rosters_lock_fields check (
    (status = 'preparing' and locked_at is null and locked_by is null)
    or (status = 'locked' and locked_at is not null and locked_by is not null)
  ),
  constraint meeting_month_rosters_statistics_origin check (
    (roster_origin = 'bootstrap' and statistics_eligible = false)
    or (roster_origin = 'automatic' and statistics_eligible = true)
  ),
  constraint meeting_month_rosters_bootstrap_locked check (
    roster_origin <> 'bootstrap' or status = 'locked'
  )
);

create index meeting_month_rosters_status_period_idx
on public.meeting_month_rosters(status, period_month);

create table public.meeting_month_roster_members (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null references public.meeting_month_rosters(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  member_code_snapshot text not null,
  member_name_snapshot text not null,
  group_code_snapshot text,
  created_at timestamptz not null default now(),
  constraint meeting_month_roster_members_roster_member_unique unique (roster_id, member_id),
  constraint meeting_month_roster_members_id_member_unique unique (id, member_id),
  constraint meeting_month_roster_members_member_code_not_blank check (
    length(btrim(member_code_snapshot)) > 0
  ),
  constraint meeting_month_roster_members_member_name_not_blank check (
    length(btrim(member_name_snapshot)) > 0
  ),
  constraint meeting_month_roster_members_group_code_not_blank check (
    group_code_snapshot is null or length(btrim(group_code_snapshot)) > 0
  )
);

create index meeting_month_roster_members_member_id_idx
on public.meeting_month_roster_members(member_id);

create table public.meeting_attendance (
  meeting_id uuid not null references public.club_meetings(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  roster_member_id uuid,
  target_origin public.meeting_target_origin not null,
  member_code_snapshot text not null,
  member_name_snapshot text not null,
  group_code_snapshot text,
  rsvp_status public.meeting_rsvp_status not null default 'unanswered',
  attendance_status public.meeting_attendance_status not null default 'unchecked',
  arrival_time time,
  attendance_origin public.meeting_attendance_origin,
  rsvp_updated_by uuid references public.profiles(id) on delete restrict,
  rsvp_updated_at timestamptz not null default clock_timestamp(),
  attendance_updated_by uuid references public.profiles(id) on delete restrict,
  attendance_updated_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  primary key (meeting_id, member_id),
  constraint meeting_attendance_roster_member_fk
    foreign key (roster_member_id, member_id)
    references public.meeting_month_roster_members(id, member_id)
    on delete restrict,
  constraint meeting_attendance_target_origin_link check (
    (target_origin = 'monthly_roster' and roster_member_id is not null)
    or (target_origin = 'ad_hoc' and roster_member_id is null)
  ),
  constraint meeting_attendance_member_code_not_blank check (
    length(btrim(member_code_snapshot)) > 0
  ),
  constraint meeting_attendance_member_name_not_blank check (
    length(btrim(member_name_snapshot)) > 0
  ),
  constraint meeting_attendance_group_code_not_blank check (
    group_code_snapshot is null or length(btrim(group_code_snapshot)) > 0
  ),
  constraint meeting_attendance_arrival_matches_status check (
    (attendance_status = 'late' and arrival_time is not null)
    or (attendance_status <> 'late' and arrival_time is null)
  ),
  constraint meeting_attendance_origin_matches_status check (
    (attendance_status = 'unchecked' and attendance_origin is null)
    or (attendance_status in ('present', 'late') and attendance_origin = 'manual')
    or (attendance_status = 'absent' and attendance_origin in ('manual', 'close_default'))
  ),
  constraint meeting_attendance_rsvp_actor_matches_status check (
    (rsvp_status = 'unanswered' and rsvp_updated_by is null)
    or (rsvp_status <> 'unanswered' and rsvp_updated_by is not null)
  ),
  constraint meeting_attendance_actor_matches_status check (
    (attendance_status = 'unchecked' and attendance_updated_by is null)
    or (attendance_status <> 'unchecked' and attendance_updated_by is not null)
  )
);

create index meeting_attendance_member_id_idx
on public.meeting_attendance(member_id);

create index meeting_attendance_meeting_target_idx
on public.meeting_attendance(meeting_id, target_origin);

create table public.meeting_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.club_meetings(id) on delete restrict,
  event_type public.meeting_lifecycle_event_type not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default clock_timestamp(),
  reason text,
  details jsonb not null default '{}'::jsonb,
  constraint meeting_lifecycle_events_reason_length check (
    reason is null or length(btrim(reason)) between 1 and 500
  ),
  constraint meeting_lifecycle_events_cancel_reason check (
    event_type <> 'cancelled' or reason is not null
  ),
  constraint meeting_lifecycle_events_details_object check (
    jsonb_typeof(details) = 'object'
  )
);

create index meeting_lifecycle_events_meeting_time_idx
on public.meeting_lifecycle_events(meeting_id, occurred_at, id);

create or replace function public.validate_club_meeting_relationship()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_meeting record;
begin
  if new.meeting_kind <> 'lightning' then
    return new;
  end if;

  if new.linked_regular_meeting_id = new.id then
    raise exception 'linked regular meeting cannot reference itself'
      using errcode = '23514';
  end if;

  select
    meetings.meeting_kind,
    meetings.period_month,
    meetings.cancelled_at
  into linked_meeting
  from public.club_meetings as meetings
  where meetings.id = new.linked_regular_meeting_id
  for share;

  if not found or linked_meeting.meeting_kind <> 'regular' then
    raise exception 'linked regular meeting not found'
      using errcode = '23503';
  end if;

  if linked_meeting.cancelled_at is null then
    raise exception 'linked regular meeting must be cancelled'
      using errcode = '23514';
  end if;

  if linked_meeting.period_month <> new.period_month then
    raise exception 'linked regular meeting month mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger club_meetings_validate_relationship
before insert or update of meeting_kind, linked_regular_meeting_id, period_month
on public.club_meetings
for each row execute function public.validate_club_meeting_relationship();

create or replace function public.prevent_club_meeting_period_month_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.period_month is distinct from new.period_month then
    raise exception 'meeting period month is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger club_meetings_prevent_period_month_change
before update of period_month on public.club_meetings
for each row execute function public.prevent_club_meeting_period_month_change();

create or replace function public.validate_meeting_attendance_invariants()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  attendance_meeting record;
  roster_period_month date;
begin
  select
    meetings.period_month,
    meetings.start_time,
    meetings.end_time
  into attendance_meeting
  from public.club_meetings as meetings
  where meetings.id = new.meeting_id
  for share;

  if not found then
    raise exception 'meeting not found'
      using errcode = '23503';
  end if;

  if new.target_origin = 'monthly_roster' then
    select rosters.period_month
    into roster_period_month
    from public.meeting_month_roster_members as roster_members
    inner join public.meeting_month_rosters as rosters
      on rosters.id = roster_members.roster_id
    where roster_members.id = new.roster_member_id
      and roster_members.member_id = new.member_id
    for share of roster_members, rosters;

    if not found then
      raise exception 'monthly roster member not found'
        using errcode = '23503';
    end if;

    if roster_period_month <> attendance_meeting.period_month then
      raise exception 'monthly roster month mismatch'
        using errcode = '23514';
    end if;
  end if;

  if new.attendance_status = 'late'
    and (
      new.arrival_time <= attendance_meeting.start_time
      or new.arrival_time > attendance_meeting.end_time
    )
  then
    raise exception 'arrival time outside meeting window'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger meeting_attendance_validate_invariants
before insert or update on public.meeting_attendance
for each row execute function public.validate_meeting_attendance_invariants();

create or replace function public.prevent_meeting_lifecycle_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'meeting lifecycle events are append-only'
    using errcode = '55000';
end;
$$;

create trigger meeting_lifecycle_events_prevent_mutation
before update or delete on public.meeting_lifecycle_events
for each row execute function public.prevent_meeting_lifecycle_event_mutation();

revoke execute on function public.validate_club_meeting_relationship()
from public, anon, authenticated;
revoke execute on function public.prevent_club_meeting_period_month_change()
from public, anon, authenticated;
revoke execute on function public.validate_meeting_attendance_invariants()
from public, anon, authenticated;
revoke execute on function public.prevent_meeting_lifecycle_event_mutation()
from public, anon, authenticated;

alter table public.club_meetings enable row level security;
alter table public.meeting_month_rosters enable row level security;
alter table public.meeting_month_roster_members enable row level security;
alter table public.meeting_attendance enable row level security;
alter table public.meeting_lifecycle_events enable row level security;

create policy "meeting viewers can read club meetings"
on public.club_meetings for select to authenticated
using (public.has_permission('meetings.view'));

create policy "meeting viewers can read monthly rosters"
on public.meeting_month_rosters for select to authenticated
using (public.has_permission('meetings.view'));

create policy "meeting viewers can read monthly roster members"
on public.meeting_month_roster_members for select to authenticated
using (public.has_permission('meetings.view'));

create policy "meeting viewers can read meeting attendance"
on public.meeting_attendance for select to authenticated
using (public.has_permission('meetings.view'));

create policy "meeting viewers can read meeting lifecycle events"
on public.meeting_lifecycle_events for select to authenticated
using (public.has_permission('meetings.view'));

revoke insert, update, delete on table public.club_meetings from public, anon, authenticated;
revoke insert, update, delete on table public.meeting_month_rosters from public, anon, authenticated;
revoke insert, update, delete on table public.meeting_month_roster_members from public, anon, authenticated;
revoke insert, update, delete on table public.meeting_attendance from public, anon, authenticated;
revoke insert, update, delete on table public.meeting_lifecycle_events from public, anon, authenticated;

grant select on table public.club_meetings to authenticated;
grant select on table public.meeting_month_rosters to authenticated;
grant select on table public.meeting_month_roster_members to authenticated;
grant select on table public.meeting_attendance to authenticated;
grant select on table public.meeting_lifecycle_events to authenticated;
