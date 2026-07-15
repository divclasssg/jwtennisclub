create table public.fee_monthly_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  period_month date not null,
  memo text not null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fee_monthly_notes_member_month_unique unique (member_id, period_month),
  constraint fee_monthly_notes_period_first_day check (
    period_month = date_trunc('month', period_month)::date
  ),
  constraint fee_monthly_notes_memo_length check (
    length(memo) between 1 and 500
  ),
  constraint fee_monthly_notes_memo_trimmed check (memo = btrim(memo))
);

create index fee_monthly_notes_period_month_idx
on public.fee_monthly_notes(period_month);

alter table public.fee_monthly_notes enable row level security;

revoke all on table public.fee_monthly_notes from public, anon;
grant select, insert, update, delete on table public.fee_monthly_notes
to authenticated;

create policy "fee viewers can read monthly notes"
on public.fee_monthly_notes for select
to authenticated
using (public.has_permission('fees.payments.view'));

create policy "fee managers can create monthly notes"
on public.fee_monthly_notes for insert
to authenticated
with check (
  (
    public.has_permission('fees.payments.create')
    or public.has_permission('fees.payments.update')
  )
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy "fee managers can update monthly notes"
on public.fee_monthly_notes for update
to authenticated
using (
  public.has_permission('fees.payments.create')
  or public.has_permission('fees.payments.update')
)
with check (
  (
    public.has_permission('fees.payments.create')
    or public.has_permission('fees.payments.update')
  )
  and updated_by = auth.uid()
);

create policy "fee managers can delete monthly notes"
on public.fee_monthly_notes for delete
to authenticated
using (
  public.has_permission('fees.payments.create')
  or public.has_permission('fees.payments.update')
);

insert into public.fee_monthly_notes (
  member_id,
  period_month,
  memo,
  created_by,
  updated_by,
  created_at,
  updated_at
)
select
  member_id,
  period_month,
  btrim(memo),
  created_by,
  updated_by,
  created_at,
  updated_at
from public.fee_payments
where memo is not null
  and length(btrim(memo)) between 1 and 500
on conflict (member_id, period_month) do nothing;

create or replace function public.sync_fee_payment_memo_to_monthly_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.memo is not null and length(pg_catalog.btrim(new.memo)) > 0 then
    if length(pg_catalog.btrim(new.memo)) > 500 then
      raise exception 'fee payment memo exceeds 500 characters';
    end if;

    insert into public.fee_monthly_notes (
      member_id,
      period_month,
      memo,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    values (
      new.member_id,
      new.period_month,
      pg_catalog.btrim(new.memo),
      new.created_by,
      new.updated_by,
      new.created_at,
      new.updated_at
    )
    on conflict (member_id, period_month) do update
    set
      memo = excluded.memo,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  end if;

  return new;
end;
$$;

revoke execute on function public.sync_fee_payment_memo_to_monthly_note()
from public, anon, authenticated;

create trigger fee_payments_sync_monthly_note
after insert or update of memo on public.fee_payments
for each row
execute function public.sync_fee_payment_memo_to_monthly_note();
