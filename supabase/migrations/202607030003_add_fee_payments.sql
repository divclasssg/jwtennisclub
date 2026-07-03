insert into public.role_permissions (role_id, permission)
select roles.id, permissions.permission
from public.roles
cross join (
  values
    ('fees.payments.view'),
    ('fees.payments.delete')
) as permissions(permission)
where roles.name = 'admin'
on conflict (role_id, permission) do nothing;

insert into public.role_permissions (role_id, permission)
select roles.id, permissions.permission
from public.roles
cross join (
  values
    ('fees.payments.view')
) as permissions(permission)
where roles.name in ('admin', 'operator')
on conflict (role_id, permission) do nothing;

create table if not exists public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  period_month date not null,
  amount integer not null,
  paid_date date not null,
  memo text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fee_payments_period_month_first_day check (
    period_month = date_trunc('month', period_month)::date
  ),
  constraint fee_payments_amount_positive check (amount > 0),
  constraint fee_payments_memo_not_blank check (
    memo is null or length(btrim(memo)) > 0
  ),
  constraint fee_payments_member_month_unique unique (member_id, period_month)
);

create index if not exists fee_payments_period_month_idx
on public.fee_payments(period_month);

create index if not exists fee_payments_member_id_idx
on public.fee_payments(member_id);

create index if not exists fee_payments_paid_date_idx
on public.fee_payments(paid_date);

alter table public.fee_payments enable row level security;

drop policy if exists "operators with fee payment view permission can read fee payments"
on public.fee_payments;

create policy "operators with fee payment view permission can read fee payments"
on public.fee_payments for select
to authenticated
using (public.has_permission('fees.payments.view'));

drop policy if exists "operators with fee payment create permission can create fee payments"
on public.fee_payments;

create policy "operators with fee payment create permission can create fee payments"
on public.fee_payments for insert
to authenticated
with check (
  public.has_permission('fees.payments.create')
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists "operators with fee payment update permission can update fee payments"
on public.fee_payments;

create policy "operators with fee payment update permission can update fee payments"
on public.fee_payments for update
to authenticated
using (public.has_permission('fees.payments.update'))
with check (
  public.has_permission('fees.payments.update')
  and updated_by = auth.uid()
);

drop policy if exists "operators with fee payment delete permission can delete fee payments"
on public.fee_payments;

create policy "operators with fee payment delete permission can delete fee payments"
on public.fee_payments for delete
to authenticated
using (public.has_permission('fees.payments.delete'));
