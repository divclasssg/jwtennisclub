create type public.member_status as enum ('active', 'paused', 'withdrawn');

drop function if exists public.has_permission(text);

create or replace function public.has_permission(required_permission text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    inner join public.role_permissions
      on role_permissions.role_id = profiles.role_id
    where profiles.id = auth.uid()
      and profiles.status = 'active'
      and role_permissions.permission = required_permission
  );
$$;

revoke execute on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone_last_four text,
  status public.member_status not null default 'active',
  joined_date date not null,
  withdrawn_date date,
  withdrawal_reason text,
  memo text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_name_not_blank check (length(btrim(name)) > 0),
  constraint members_phone_last_four_digits check (
    phone_last_four is null or phone_last_four ~ '^[0-9]{4}$'
  ),
  constraint members_withdrawal_reason_not_blank check (
    withdrawal_reason is null or length(btrim(withdrawal_reason)) > 0
  ),
  constraint members_withdrawn_date_matches_status check (
    (status = 'withdrawn' and withdrawn_date is not null)
    or (status <> 'withdrawn' and withdrawn_date is null)
  ),
  constraint members_withdrawal_reason_matches_status check (
    status = 'withdrawn' or withdrawal_reason is null
  ),
  constraint members_withdrawn_after_joined check (
    withdrawn_date is null or withdrawn_date >= joined_date
  )
);

create index members_status_idx
on public.members(status);

create index members_joined_date_idx
on public.members(joined_date);

create index members_withdrawn_date_idx
on public.members(withdrawn_date)
where withdrawn_date is not null;

create index members_name_search_idx
on public.members(lower(name));

alter table public.members enable row level security;

create policy "operators with member view permission can read members"
on public.members for select
to authenticated
using (public.has_permission('members.view'));

create policy "operators with member create permission can create members"
on public.members for insert
to authenticated
with check (
  public.has_permission('members.create')
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy "operators with member update permission can update members"
on public.members for update
to authenticated
using (public.has_permission('members.update'))
with check (
  public.has_permission('members.update')
  and updated_by = auth.uid()
);

create policy "operators with member delete permission can delete members"
on public.members for delete
to authenticated
using (public.has_permission('members.delete'));
