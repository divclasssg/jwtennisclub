insert into public.role_permissions (role_id, permission)
select roles.id, permissions.permission
from public.roles
cross join (
  values
    ('expenses.view')
) as permissions(permission)
where roles.name in ('admin', 'operator')
on conflict (role_id, permission) do nothing;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null,
  description text not null,
  amount integer not null,
  has_receipt boolean not null default false,
  memo text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_category_valid check (
    category in ('court', 'balls', 'meal', 'event', 'maintenance', 'other')
  ),
  constraint expenses_description_not_blank check (length(btrim(description)) > 0),
  constraint expenses_amount_positive check (amount > 0),
  constraint expenses_memo_not_blank check (
    memo is null or length(btrim(memo)) > 0
  )
);

create index if not exists expenses_expense_date_idx
on public.expenses(expense_date);

create index if not exists expenses_category_idx
on public.expenses(category);

alter table public.expenses enable row level security;

drop policy if exists "operators with expense view permission can read expenses"
on public.expenses;

create policy "operators with expense view permission can read expenses"
on public.expenses for select
to authenticated
using (public.has_permission('expenses.view'));

drop policy if exists "operators with expense create permission can create expenses"
on public.expenses;

create policy "operators with expense create permission can create expenses"
on public.expenses for insert
to authenticated
with check (
  public.has_permission('expenses.create')
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists "operators with expense update permission can update expenses"
on public.expenses;

create policy "operators with expense update permission can update expenses"
on public.expenses for update
to authenticated
using (public.has_permission('expenses.update'))
with check (
  public.has_permission('expenses.update')
  and updated_by = auth.uid()
);

drop policy if exists "operators with expense delete permission can delete expenses"
on public.expenses;

create policy "operators with expense delete permission can delete expenses"
on public.expenses for delete
to authenticated
using (public.has_permission('expenses.delete'));
