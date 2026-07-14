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

create unique index meeting_month_rosters_single_bootstrap_unique
on public.meeting_month_rosters((roster_origin))
where roster_origin = 'bootstrap';

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

create or replace function public.prevent_meeting_roster_period_month_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.period_month is distinct from new.period_month then
    raise exception 'meeting roster period month is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger meeting_month_rosters_prevent_period_month_change
before update of period_month on public.meeting_month_rosters
for each row execute function public.prevent_meeting_roster_period_month_change();

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
  where meetings.id = new.meeting_id;

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
      and roster_members.member_id = new.member_id;

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
revoke execute on function public.prevent_meeting_roster_period_month_change()
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

create or replace function public.meeting_kst_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (pg_catalog.statement_timestamp() at time zone 'Asia/Seoul')::date;
$$;

create or replace function public.meeting_regular_date(
  period_month date,
  occurrence smallint
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized_month date := pg_catalog.date_trunc('month', period_month)::date;
  first_saturday_offset integer;
begin
  if period_month <> normalized_month or occurrence not in (1, 3) then
    raise exception 'invalid regular meeting month or occurrence'
      using errcode = '22023';
  end if;

  first_saturday_offset := (
    6 - extract(dow from normalized_month)::integer + 7
  ) % 7;

  return normalized_month
    + first_saturday_offset
    + ((occurrence::integer - 1) * 7);
end;
$$;

create or replace function public.lock_meeting_period_months(
  period_months date[]
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  locked_period_month date;
begin
  for locked_period_month in
    select distinct pg_catalog.date_trunc('month', requested_month)::date as period_month
    from pg_catalog.unnest(period_months) as requested_months(requested_month)
    where requested_month is not null
    order by period_month
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'meeting-period-month:' || locked_period_month::text,
        0
      )
    );
  end loop;
end;
$$;

create or replace function public.lock_meeting_automation_rows(
  period_months date[]
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform members.id
  from public.members as members
  order by members.id
  for share;

  perform rosters.id
  from public.meeting_month_rosters as rosters
  where rosters.period_month = any(period_months)
  order by rosters.period_month, rosters.id
  for update;

  perform meetings.id
  from public.club_meetings as meetings
  where meetings.period_month = any(period_months)
  order by meetings.period_month, meetings.id
  for update;

  perform attendance.meeting_id
  from public.meeting_attendance as attendance
  inner join public.club_meetings as attendance_meetings
    on attendance_meetings.id = attendance.meeting_id
  where attendance_meetings.period_month = any(period_months)
  order by attendance_meetings.period_month,
    attendance.meeting_id,
    attendance.member_id
  for update of attendance;
end;
$$;

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
  period_month date := pg_catalog.date_trunc('month', requested_period_month)::date;
  occurrence smallint;
begin
  if requested_period_month <> period_month then
    raise exception 'period month must be the first day'
      using errcode = '22023';
  end if;

  foreach occurrence in array array[1, 3]::smallint[]
  loop
    insert into public.club_meetings (
      meeting_kind,
      period_month,
      regular_occurrence,
      meeting_date,
      start_time,
      end_time,
      title,
      created_by,
      updated_by
    )
    values (
      'regular',
      period_month,
      occurrence,
      public.meeting_regular_date(period_month, occurrence),
      '18:00'::time,
      '22:00'::time,
      extract(month from period_month)::integer::text
        || '월 '
        || occurrence::text
        || '차 정모',
      actor_profile_id,
      actor_profile_id
    )
    on conflict (period_month, regular_occurrence)
      where meeting_kind = 'regular'
    do nothing;
  end loop;
end;
$$;

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
  select rosters.id
  into target_roster_id
  from public.meeting_month_rosters as rosters
  where rosters.period_month = requested_period_month
    and rosters.status = 'preparing'
  for update;

  if target_roster_id is null then
    return;
  end if;

  insert into public.meeting_month_roster_members (
    roster_id,
    member_id,
    member_code_snapshot,
    member_name_snapshot,
    group_code_snapshot
  )
  select
    target_roster_id,
    members.id,
    members.member_code,
    members.name,
    member_groups.code
  from public.members as members
  left join public.member_groups as member_groups
    on member_groups.id = members.group_id
  where members.status = 'active'
  on conflict (roster_id, member_id) do update
  set member_code_snapshot = excluded.member_code_snapshot,
      member_name_snapshot = excluded.member_name_snapshot,
      group_code_snapshot = excluded.group_code_snapshot;

  delete from public.meeting_month_roster_members as roster_members
  where roster_members.roster_id = target_roster_id
    and not exists (
      select 1
      from public.members as members
      where members.id = roster_members.member_id
        and members.status = 'active'
    );

  update public.meeting_month_rosters as rosters
  set updated_at = pg_catalog.clock_timestamp()
  where rosters.id = target_roster_id;
end;
$$;

create or replace function public.seed_monthly_meeting_attendance(
  requested_period_month date
)
returns void
language sql
security definer
set search_path = ''
as $$
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
    meetings.id,
    roster_members.member_id,
    roster_members.id,
    'monthly_roster',
    roster_members.member_code_snapshot,
    roster_members.member_name_snapshot,
    roster_members.group_code_snapshot
  from public.meeting_month_rosters as rosters
  inner join public.meeting_month_roster_members as roster_members
    on roster_members.roster_id = rosters.id
  inner join public.club_meetings as meetings
    on meetings.period_month = rosters.period_month
   and meetings.meeting_kind = 'regular'
  where rosters.period_month = requested_period_month
    and rosters.status = 'locked'
  on conflict (meeting_id, member_id) do nothing;
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
  select
    rosters.id,
    rosters.status,
    rosters.roster_origin
  into roster_row
  from public.meeting_month_rosters as rosters
  where rosters.period_month = requested_period_month
  for update;

  if not found then
    use_bootstrap := allow_bootstrap
      and not exists (
        select 1
        from public.meeting_month_rosters as existing_rosters
        where existing_rosters.roster_origin = 'bootstrap'
      );

    if use_bootstrap then
      insert into public.meeting_month_rosters (
        period_month,
        status,
        roster_origin,
        statistics_eligible,
        locked_at,
        locked_by
      )
      values (
        requested_period_month,
        'locked',
        'bootstrap',
        false,
        pg_catalog.clock_timestamp(),
        actor_profile_id
      )
      returning id, status, roster_origin into roster_row;

      insert into public.meeting_month_roster_members (
        roster_id,
        member_id,
        member_code_snapshot,
        member_name_snapshot,
        group_code_snapshot
      )
      select
        roster_row.id,
        members.id,
        members.member_code,
        members.name,
        member_groups.code
      from public.members as members
      left join public.member_groups as member_groups
        on member_groups.id = members.group_id
      where members.status = 'active'
      on conflict (roster_id, member_id) do nothing;
    else
      insert into public.meeting_month_rosters (
        period_month,
        status,
        roster_origin,
        statistics_eligible
      )
      values (
        requested_period_month,
        'preparing',
        'automatic',
        true
      )
      returning id, status, roster_origin into roster_row;
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

create or replace function public.bootstrap_club_meeting_automation(
  kst_today date,
  actor_profile_id uuid,
  allow_bootstrap boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_period_month date := pg_catalog.date_trunc('month', kst_today)::date;
  next_period_month date := (current_period_month + interval '1 month')::date;
  third_period_month date := (current_period_month + interval '2 months')::date;
  target_period_month date;
begin
  perform public.lock_meeting_period_months(
    array[current_period_month, next_period_month, third_period_month]
  );
  perform public.lock_meeting_automation_rows(
    array[current_period_month, next_period_month, third_period_month]
  );

  foreach target_period_month in array
    array[current_period_month, next_period_month, third_period_month]
  loop
    perform public.ensure_regular_club_meetings(
      target_period_month,
      actor_profile_id
    );
  end loop;

  perform public.ensure_locked_meeting_roster(
    current_period_month,
    actor_profile_id,
    allow_bootstrap and extract(day from kst_today) > 1
  );

  if kst_today >= (next_period_month - 7) then
    insert into public.meeting_month_rosters (
      period_month,
      status,
      roster_origin,
      statistics_eligible
    )
    values (next_period_month, 'preparing', 'automatic', true)
    on conflict (period_month) do nothing;

    perform public.sync_preparing_meeting_roster(next_period_month);
  end if;
end;
$$;

create or replace function public.prepare_meeting_rosters_before_member_change(
  kst_today date,
  actor_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_period_month date := pg_catalog.date_trunc('month', kst_today)::date;
  next_period_month date := (current_period_month + interval '1 month')::date;
begin
  perform public.lock_meeting_period_months(
    array[current_period_month, next_period_month]
  );
  perform public.lock_meeting_automation_rows(
    array[current_period_month, next_period_month]
  );
  perform public.ensure_regular_club_meetings(
    current_period_month,
    actor_profile_id
  );
  perform public.ensure_locked_meeting_roster(
    current_period_month,
    actor_profile_id,
    false
  );

  if kst_today >= (next_period_month - 7) then
    perform public.ensure_regular_club_meetings(
      next_period_month,
      actor_profile_id
    );
    insert into public.meeting_month_rosters (
      period_month,
      status,
      roster_origin,
      statistics_eligible
    )
    values (next_period_month, 'preparing', 'automatic', true)
    on conflict (period_month) do nothing;
    perform public.sync_preparing_meeting_roster(next_period_month);
  end if;
end;
$$;

create or replace function public.sync_meeting_rosters_after_member_change(
  kst_today date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_period_month date := pg_catalog.date_trunc('month', kst_today)::date;
  next_period_month date := (current_period_month + interval '1 month')::date;
begin
  perform public.lock_meeting_period_months(
    array[current_period_month, next_period_month]
  );
  perform public.lock_meeting_automation_rows(
    array[current_period_month, next_period_month]
  );

  if kst_today >= (next_period_month - 7) then
    perform public.sync_preparing_meeting_roster(next_period_month);
  end if;
end;
$$;

revoke execute on function public.meeting_kst_today()
from public, anon, authenticated, service_role;
revoke execute on function public.meeting_regular_date(date, smallint)
from public, anon, authenticated, service_role;
revoke execute on function public.lock_meeting_period_months(date[])
from public, anon, authenticated, service_role;
revoke execute on function public.lock_meeting_automation_rows(date[])
from public, anon, authenticated, service_role;
revoke execute on function public.ensure_regular_club_meetings(date, uuid)
from public, anon, authenticated, service_role;
revoke execute on function public.sync_preparing_meeting_roster(date)
from public, anon, authenticated, service_role;
revoke execute on function public.seed_monthly_meeting_attendance(date)
from public, anon, authenticated, service_role;
revoke execute on function public.ensure_locked_meeting_roster(date, uuid, boolean)
from public, anon, authenticated, service_role;
revoke execute on function public.bootstrap_club_meeting_automation(date, uuid, boolean)
from public, anon, authenticated, service_role;
revoke execute on function public.prepare_meeting_rosters_before_member_change(date, uuid)
from public, anon, authenticated, service_role;
revoke execute on function public.sync_meeting_rosters_after_member_change(date)
from public, anon, authenticated, service_role;

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
  saved_member_id uuid := member_id;
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
  if member_id is null and not public.has_permission('members.create') then
    raise exception 'members.create permission required';
  elsif member_id is not null and not public.has_permission('members.update') then
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
        'member-contact-phone:'
          || coalesce(normalized_phone, '<none>'),
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
      and contacts.member_id is distinct from member_id
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
        'status',
        'DUPLICATE_BLOCKED',
        'member_id',
        duplicate_id
      );
    elsif duplicate_confirmation is distinct from 'CONFIRM_PHONE_REUSE' then
      return pg_catalog.jsonb_build_object(
        'status',
        'PHONE_REUSE_CONFIRMATION_REQUIRED',
        'member_id',
        duplicate_id
      );
    end if;
  end if;

  select exists (
    select 1
    from public.members as existing_members
    where existing_members.id is distinct from member_id
      and pg_catalog.lower(
        pg_catalog.btrim(normalize(existing_members.name, NFKC))
      ) = normalized_name
  )
  into name_exists;

  if member_id is null
    and normalized_phone is null
    and name_exists
    and duplicate_confirmation is distinct from 'CONFIRM_NAME_ONLY'
  then
    return pg_catalog.jsonb_build_object(
      'status',
      'NAME_ONLY_CONFIRMATION_REQUIRED'
    );
  end if;

  if saved_member_id is null then
    insert into public.members (
      name,
      status,
      joined_date,
      withdrawn_date,
      memo,
      created_by,
      updated_by,
      group_id
    )
    values (
      requested_name,
      coalesce(
        (member_data->>'status')::public.member_status,
        'active'
      ),
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
        joined_date = coalesce(
          (member_data->>'joined_date')::date,
          saved_members.joined_date
        ),
        withdrawn_date = (member_data->>'withdrawn_date')::date,
        memo = nullif(pg_catalog.btrim(member_data->>'memo'), ''),
        group_id = case
          when member_data ? 'group_id'
            then (member_data->>'group_id')::uuid
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
        member_id,
        phone_number,
        phone_normalized,
        updated_by,
        updated_at
      )
      values (
        saved_member_id,
        normalized_phone,
        normalized_phone,
        auth.uid(),
        pg_catalog.now()
      )
      on conflict (member_id) do update
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
    'status',
    'SAVED',
    'member_id',
    saved_member_id,
    'member_code',
    coalesce(
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
    memo,
    operator_profile_id
  )
  values (
    new.display_name,
    'active',
    kst_today,
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

create or replace function public.sync_operator_member_name()
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

  update public.members as operator_members
  set name = new.display_name,
      updated_at = pg_catalog.now()
  where operator_members.operator_profile_id = new.id
    and operator_members.name <> new.display_name;

  perform public.sync_meeting_rosters_after_member_change(kst_today);
  return new;
end;
$$;

revoke execute on function public.sync_operator_member_name()
from public, anon, authenticated, service_role;

revoke insert, update, delete on table public.members from authenticated;

do $$
declare
  kst_today date := public.meeting_kst_today();
  bootstrap_actor_id uuid;
begin
  select profiles.id
  into bootstrap_actor_id
  from public.profiles as profiles
  where profiles.status = 'active'
  order by profiles.created_at, profiles.id
  limit 1;

  if bootstrap_actor_id is null then
    raise exception 'active profile required to bootstrap club meeting automation';
  end if;

  perform public.bootstrap_club_meeting_automation(
    kst_today,
    bootstrap_actor_id,
    extract(day from kst_today) > 1
  );
end;
$$;
