alter table public.members
add column operator_profile_id uuid unique references public.profiles(id) on delete set null;

create index members_operator_profile_id_idx
on public.members(operator_profile_id)
where operator_profile_id is not null;

update public.members
set operator_profile_id = profiles.id,
    updated_at = now()
from public.profiles
where members.operator_profile_id is null
  and lower(btrim(members.name)) = lower(btrim(profiles.display_name))
  and not exists (
    select 1
    from public.members linked_members
    where linked_members.operator_profile_id = profiles.id
  );

insert into public.members (
  name,
  status,
  joined_date,
  memo,
  operator_profile_id
)
select
  profiles.display_name,
  'active',
  current_date,
  '운영자 계정 생성으로 자동 등록',
  profiles.id
from public.profiles
where not exists (
  select 1
  from public.members
  where members.operator_profile_id = profiles.id
);

create or replace function public.ensure_operator_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
    current_date,
    '운영자 계정 생성으로 자동 등록',
    new.id
  )
  on conflict (operator_profile_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.ensure_operator_member() from public, anon, authenticated;

drop trigger if exists profiles_auto_add_member on public.profiles;

create trigger profiles_auto_add_member
after insert on public.profiles
for each row
execute function public.ensure_operator_member();

create or replace function public.sync_operator_member_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.members
  set name = new.display_name,
      updated_at = now()
  where operator_profile_id = new.id
    and name <> new.display_name;

  return new;
end;
$$;

revoke execute on function public.sync_operator_member_name() from public, anon, authenticated;

drop trigger if exists profiles_sync_member_name on public.profiles;

create trigger profiles_sync_member_name
after update of display_name on public.profiles
for each row
when (old.display_name is distinct from new.display_name)
execute function public.sync_operator_member_name();
