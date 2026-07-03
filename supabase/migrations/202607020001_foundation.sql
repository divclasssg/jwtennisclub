create extension if not exists pgcrypto;

create type public.operator_status as enum ('active', 'disabled');

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (role_id, permission)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  display_name text not null,
  email text not null,
  status public.operator_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop function if exists public.is_active_operator(uuid);

create or replace function public.is_active_operator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.status = 'active'
  );
$$;

revoke execute on function public.is_active_operator() from public, anon;
grant execute on function public.is_active_operator() to authenticated;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id),
  action text not null,
  table_name text not null,
  record_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.roles (name, label)
values
  ('admin', '관리자'),
  ('operator', '운영진')
on conflict (name) do nothing;

insert into public.role_permissions (role_id, permission)
select roles.id, permissions.permission
from public.roles
cross join (
  values
    ('members.view'),
    ('members.create'),
    ('members.update'),
    ('members.delete'),
    ('fees.payments.create'),
    ('fees.payments.update'),
    ('expenses.view'),
    ('expenses.create'),
    ('expenses.update'),
    ('expenses.delete'),
    ('events.create'),
    ('events.update'),
    ('settlements.close'),
    ('settlements.reopen'),
    ('operators.manage'),
    ('roles.manage')
) as permissions(permission)
where roles.name = 'admin'
on conflict (role_id, permission) do nothing;

insert into public.role_permissions (role_id, permission)
select roles.id, permissions.permission
from public.roles
cross join (
  values
    ('members.view'),
    ('fees.payments.create'),
    ('expenses.view'),
    ('expenses.create'),
    ('events.create')
) as permissions(permission)
where roles.name = 'operator'
on conflict (role_id, permission) do nothing;

alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

create policy "authenticated operators can read roles"
on public.roles for select
to authenticated
using (public.is_active_operator());

create policy "authenticated operators can read role permissions"
on public.role_permissions for select
to authenticated
using (public.is_active_operator());

create policy "operators can read active profiles"
on public.profiles for select
to authenticated
using (public.is_active_operator() and status = 'active');

create policy "operators can read audit logs"
on public.audit_logs for select
to authenticated
using (public.is_active_operator());

create policy "operators can create audit logs"
on public.audit_logs for insert
to authenticated
with check (public.is_active_operator() and actor_profile_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = false;

create policy "active operators can read receipts objects"
on storage.objects for select
to authenticated
using (bucket_id = 'receipts' and public.is_active_operator());

create policy "active operators can create receipts objects"
on storage.objects for insert
to authenticated
with check (bucket_id = 'receipts' and public.is_active_operator());

create policy "active operators can update receipts objects"
on storage.objects for update
to authenticated
using (bucket_id = 'receipts' and public.is_active_operator())
with check (bucket_id = 'receipts' and public.is_active_operator());

create policy "active operators can delete receipts objects"
on storage.objects for delete
to authenticated
using (bucket_id = 'receipts' and public.is_active_operator());
