begin;

-- Meeting writes lock roster rows before member writes. Keep the same order so
-- this one-time correction cannot deadlock with a concurrent member save.
lock table public.meeting_month_roster_members
  in share row exclusive mode;
lock table public.meeting_attendance
  in share row exclusive mode;
lock table public.members
  in access exclusive mode;
lock table public.member_code_allocator
  in share row exclusive mode;

do $$
declare
  source_member_count integer;
  reserved_code_count integer;
  allocator_prefix text;
  allocator_next_suffix integer;
begin
  select pg_catalog.count(*)
  into source_member_count
  from public.members
  where member_code = '#0024';

  if source_member_count <> 1 then
    raise exception
      'expected exactly one #0024 member, found %',
      source_member_count;
  end if;

  select pg_catalog.count(*)
  into reserved_code_count
  from public.members
  where member_code in ('#0020', '#0021', '#0022', '#0023');

  if reserved_code_count <> 0 then
    raise exception
      'member codes #0020 through #0023 must be vacant, found %',
      reserved_code_count;
  end if;

  select prefix, next_suffix
  into allocator_prefix, allocator_next_suffix
  from public.member_code_allocator
  where singleton;

  if not found
    or allocator_prefix is distinct from '#'
    or allocator_next_suffix is distinct from 25
  then
    raise exception
      'expected member code allocator #/25, found %/%',
      allocator_prefix,
      allocator_next_suffix;
  end if;
end;
$$;

-- The immutable-code trigger is disabled only inside this transaction. Any
-- failure rolls the DDL and all data changes back together.
alter table public.members
disable trigger members_prevent_member_code_change;

update public.members
set member_code = '#0020'
where member_code = '#0024';

alter table public.members
enable trigger members_prevent_member_code_change;

update public.meeting_month_roster_members
set member_code_snapshot = '#0020'
where member_id = (
  select id
  from public.members
  where member_code = '#0020'
);

update public.meeting_attendance
set member_code_snapshot = '#0020'
where member_id = (
  select id
  from public.members
  where member_code = '#0020'
);

update public.member_code_allocator
set next_suffix = 21
where singleton
  and prefix = '#'
  and next_suffix = 25;

do $$
declare
  corrected_member_id uuid;
  allocator_prefix text;
  allocator_next_suffix integer;
begin
  select id
  into corrected_member_id
  from public.members
  where member_code = '#0020';

  if not found then
    raise exception 'corrected #0020 member was not found';
  end if;

  if exists (
    select 1
    from public.members
    where member_code in ('#0021', '#0022', '#0023', '#0024')
  ) then
    raise exception 'vacated member code range is not empty';
  end if;

  if exists (
    select 1
    from public.meeting_month_roster_members
    where member_id = corrected_member_id
      and member_code_snapshot is distinct from '#0020'
  ) or exists (
    select 1
    from public.meeting_attendance
    where member_id = corrected_member_id
      and member_code_snapshot is distinct from '#0020'
  ) then
    raise exception 'meeting member code snapshots were not corrected';
  end if;

  select prefix, next_suffix
  into allocator_prefix, allocator_next_suffix
  from public.member_code_allocator
  where singleton;

  if not found
    or allocator_prefix is distinct from '#'
    or allocator_next_suffix is distinct from 21
  then
    raise exception
      'expected corrected member code allocator #/21, found %/%',
      allocator_prefix,
      allocator_next_suffix;
  end if;
end;
$$;

commit;
