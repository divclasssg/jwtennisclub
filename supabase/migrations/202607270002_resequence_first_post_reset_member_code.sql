begin;

-- Keep a stable cross-table view while validating the historical repair. This
-- migration no longer writes data, so read-compatible locks are sufficient.
lock table public.meeting_month_roster_members
  in share mode;
lock table public.meeting_attendance
  in share mode;
lock table public.members
  in share mode;
lock table public.member_code_allocator
  in share mode;

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

  -- The old incident fingerprint (#/25, one #0024, and vacancies #0020-#0023)
  -- is not unique to the affected production database. Production is already
  -- repaired, so every other state is validation-only and remains unchanged.
  raise notice
    'member code repair is validation-only; leaving state unchanged: allocator %/%, source %, reserved %',
    allocator_prefix,
    allocator_next_suffix,
    source_member_count,
    reserved_code_count;
end;
$$;

commit;
