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
  corrected_member_count integer;
  corrected_member_id uuid;
  allocator_prefix text;
  allocator_next_suffix integer;
begin
  select pg_catalog.count(*)
  into source_member_count
  from public.members
  where member_code = '#0024';

  select pg_catalog.count(*)
  into reserved_code_count
  from public.members
  where member_code in ('#0020', '#0021', '#0022', '#0023');

  select pg_catalog.count(*)
  into corrected_member_count
  from public.members
  where member_code = '#0020';

  select prefix, next_suffix
  into allocator_prefix, allocator_next_suffix
  from public.member_code_allocator
  where singleton;

  if not found then
    raise exception 'member code allocator was not found';
  end if;

  -- This repair was also applied directly in production. Treat its exact
  -- postcondition as success when migration history later replays the file.
  if allocator_prefix = '#'
    and allocator_next_suffix = 21
    and source_member_count = 0
    and reserved_code_count = 1
    and corrected_member_count = 1
  then
    select id
    into corrected_member_id
    from public.members
    where member_code = '#0020';

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

    raise notice 'member code #0020 repair is already applied';
    return;
  end if;

  -- Other databases may have legitimate allocator/member states. Only mutate
  -- the exact production incident fingerprint; otherwise this migration is a
  -- deliberate no-op so clean migration replays remain portable.
  if allocator_prefix is distinct from '#'
    or allocator_next_suffix is distinct from 25
    or source_member_count <> 1
    or reserved_code_count <> 0
  then
    raise notice
      'skipping #0024 repair for non-matching state: allocator %/%, source %, reserved %',
      allocator_prefix,
      allocator_next_suffix,
      source_member_count,
      reserved_code_count;
    return;
  end if;

  -- The immutable-code trigger is disabled only inside this transaction. Any
  -- failure rolls the DDL and all data changes back together.
  alter table public.members
  disable trigger members_prevent_member_code_change;

  update public.members
  set member_code = '#0020'
  where member_code = '#0024';

  get diagnostics corrected_member_count = row_count;

  if corrected_member_count <> 1 then
    raise exception
      'expected exactly one corrected #0020 member, found %',
      corrected_member_count;
  end if;

  alter table public.members
  enable trigger members_prevent_member_code_change;

  select id
  into corrected_member_id
  from public.members
  where member_code = '#0020';

  update public.meeting_month_roster_members
  set member_code_snapshot = '#0020'
  where member_id = corrected_member_id;

  update public.meeting_attendance
  set member_code_snapshot = '#0020'
  where member_id = corrected_member_id;

  update public.member_code_allocator
  set next_suffix = 21
  where singleton
    and prefix = '#'
    and next_suffix = 25;

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
