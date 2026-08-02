begin;

create type public.monthly_closing_status as enum ('closed', 'reopened');

create table public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  version integer not null check (version > 0),
  status public.monthly_closing_status not null default 'closed',
  snapshot jsonb not null,
  closed_by uuid not null references public.profiles(id),
  closed_by_name text not null,
  closed_at timestamptz not null default now(),
  reopened_by uuid references public.profiles(id),
  reopened_at timestamptz,
  unique (period_month, version),
  constraint monthly_closings_period_month_is_month check (
    period_month = date_trunc('month', period_month)::date
  ),
  constraint monthly_closings_closed_by_name_valid check (
    length(btrim(closed_by_name)) between 1 and 100
  ),
  constraint monthly_closings_reopen_state_consistent check (
    (
      status = 'closed'
      and reopened_by is null
      and reopened_at is null
    )
    or
    (
      status = 'reopened'
      and reopened_by is not null
      and reopened_at is not null
    )
  )
);

create unique index monthly_closings_one_active_month_idx
on public.monthly_closings(period_month)
where status = 'closed';

create index monthly_closings_period_history_idx
on public.monthly_closings(period_month, version desc);

alter table public.monthly_closings enable row level security;

create policy "active operators can read monthly closings"
on public.monthly_closings for select
to authenticated
using (public.is_active_operator());

revoke insert, update, delete on table public.monthly_closings from public, anon, authenticated;
grant select on table public.monthly_closings to authenticated;

create or replace function public.build_monthly_settlement_snapshot(
  requested_period_month date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_period_month date := pg_catalog.date_trunc(
    'month', requested_period_month
  )::date;
  period_month_end date := (
    normalized_period_month + interval '1 month - 1 day'
  )::date;
  prior_period_month date := (
    normalized_period_month - interval '1 month'
  )::date;
  configured_monthly_fee_amount bigint := 30000;
  missing_activity_start_count bigint := 0;
  prior_closing_count bigint := 0;
  invalid_expense_description_count bigint := 0;
  activity_member_count bigint := 0;
  fee_target_count bigint := 0;
  fully_paid_count bigint := 0;
  unpaid_count bigint := 0;
  billed_total bigint := 0;
  actual_fee_income bigint := 0;
  recognized_paid_total bigint := 0;
  adjustment_income bigint := 0;
  unpaid_total bigint := 0;
  expense_total bigint := 0;
  expense_count bigint := 0;
  attributed_net bigint := 0;
  opening_ledger_balance bigint;
  closing_ledger_balance bigint := 0;
  expense_category_rows jsonb := '[]'::jsonb;
  expense_rows jsonb := '[]'::jsonb;
begin
  if requested_period_month is null
    or requested_period_month <> normalized_period_month
  then
    raise exception 'period month must be the first day'
      using errcode = '22023';
  end if;

  if normalized_period_month < date '2026-07-01' then
    raise exception 'monthly settlement ledger starts at 2026-07-01'
      using errcode = '22023';
  end if;

  -- Keep every source relation in this one SQL command. PostgreSQL gives the
  -- command one MVCC snapshot even when READ COMMITTED is in use.
  with relevant_members as materialized (
    select members.activity_start_month
    from public.members as members
    where members.joined_date <= period_month_end
      and (
        members.withdrawn_date is null
        or members.withdrawn_date >= normalized_period_month
      )
  ),
  activity_members as materialized (
    select members.id, members.member_code
    from public.members as members
    where members.activity_start_month is not null
      and members.activity_start_month <= normalized_period_month
      and (
        members.withdrawn_date is null
        or members.withdrawn_date > period_month_end
      )
      and not (
        members.status = 'paused'
        and members.pause_start_month is not null
        and members.pause_start_month <= normalized_period_month
      )
  ),
  fee_targets as (
    select
      activity_members.id,
      configured_monthly_fee_amount as monthly_fee_amount
    from activity_members
    where activity_members.member_code <> '#0000'
  ),
  target_member_payments as (
    select
      fee_targets.id,
      fee_targets.monthly_fee_amount,
      coalesce(pg_catalog.sum(fee_payments.amount), 0)::bigint as paid_amount
    from fee_targets
    left join public.fee_payments as fee_payments
      on fee_payments.member_id = fee_targets.id
      and fee_payments.period_month = normalized_period_month
    group by fee_targets.id, fee_targets.monthly_fee_amount
  ),
  fee_totals as (
    select
      count(*) as fee_target_count,
      count(*) filter (
        where paid_amount >= monthly_fee_amount
      ) as fully_paid_count,
      count(*) filter (
        where paid_amount < monthly_fee_amount
      ) as unpaid_count,
      coalesce(pg_catalog.sum(monthly_fee_amount), 0)::bigint as billed_total,
      coalesce(
        pg_catalog.sum(
          least(coalesce(paid_amount, 0), monthly_fee_amount)
        ),
        0
      )::bigint as recognized_paid_total,
      coalesce(
        pg_catalog.sum(
          greatest(monthly_fee_amount - coalesce(paid_amount, 0), 0)
        ),
        0
      )::bigint as unpaid_total
    from target_member_payments
  ),
  actual_income as (
    select coalesce(pg_catalog.sum(fee_payments.amount), 0)::bigint as amount
    from public.fee_payments as fee_payments
    where fee_payments.period_month = normalized_period_month
  ),
  period_expenses as materialized (
    select
      expenses.id,
      expenses.expense_date,
      expenses.category,
      pg_catalog.btrim(expenses.description) as description,
      expenses.amount,
      (
        pg_catalog.length(pg_catalog.btrim(expenses.description)) < 1
        or pg_catalog.length(pg_catalog.btrim(expenses.description)) > 500
      ) as description_is_invalid
    from public.expenses as expenses
    where expenses.expense_date between normalized_period_month and period_month_end
  ),
  expense_totals as (
    select
      coalesce(pg_catalog.sum(period_expenses.amount), 0)::bigint as amount,
      count(*) as count,
      count(*) filter (
        where period_expenses.description_is_invalid
      ) as invalid_description_count
    from period_expenses
  ),
  category_totals as (
    select
      period_expenses.category,
      count(*) as count,
      pg_catalog.sum(period_expenses.amount)::bigint as amount
    from period_expenses
    group by period_expenses.category
  ),
  expense_category_aggregate as (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'category', category_totals.category,
          'count', category_totals.count,
          'amount', category_totals.amount
        )
        order by category_totals.category
      ),
      '[]'::jsonb
    ) as rows
    from category_totals
  ),
  expense_row_aggregate as (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'expense_date', period_expenses.expense_date,
          'category', period_expenses.category,
          'description', period_expenses.description,
          'amount', period_expenses.amount
        )
        order by
          period_expenses.expense_date,
          period_expenses.category,
          period_expenses.description,
          period_expenses.id
      ),
      '[]'::jsonb
    ) as rows
    from period_expenses
  ),
  prior_closing as (
    select
      (
        prior_closing.snapshot->>'closing_ledger_balance'
      )::bigint as closing_ledger_balance
    from public.monthly_closings as prior_closing
    where normalized_period_month <> date '2026-07-01'
      and prior_closing.period_month = prior_period_month
      and prior_closing.status = 'closed'
  ),
  ledger_context as (
    select
      case
        when normalized_period_month = date '2026-07-01' then 0::bigint
        else pg_catalog.max(prior_closing.closing_ledger_balance)
      end as opening_ledger_balance,
      count(*) as prior_closing_count
    from prior_closing
  )
  select
    (
      select count(*)
      from relevant_members
      where relevant_members.activity_start_month is null
    ),
    (select count(*) from activity_members),
    fee_totals.fee_target_count,
    fee_totals.fully_paid_count,
    fee_totals.unpaid_count,
    fee_totals.billed_total,
    actual_income.amount,
    fee_totals.recognized_paid_total,
    fee_totals.unpaid_total,
    expense_totals.amount,
    expense_totals.count,
    expense_totals.invalid_description_count,
    expense_category_aggregate.rows,
    expense_row_aggregate.rows,
    ledger_context.opening_ledger_balance,
    ledger_context.prior_closing_count
  into
    missing_activity_start_count,
    activity_member_count,
    fee_target_count,
    fully_paid_count,
    unpaid_count,
    billed_total,
    actual_fee_income,
    recognized_paid_total,
    unpaid_total,
    expense_total,
    expense_count,
    invalid_expense_description_count,
    expense_category_rows,
    expense_rows,
    opening_ledger_balance,
    prior_closing_count
  from fee_totals
  cross join actual_income
  cross join expense_totals
  cross join expense_category_aggregate
  cross join expense_row_aggregate
  cross join ledger_context;

  if missing_activity_start_count > 0 then
    raise exception 'member activity start month required'
      using errcode = '23514';
  end if;

  if normalized_period_month <> date '2026-07-01'
    and (
      prior_closing_count <> 1
      or opening_ledger_balance is null
    )
  then
    raise exception 'prior monthly settlement closing required'
      using errcode = '55000';
  end if;

  if invalid_expense_description_count > 0 then
    raise exception 'invalid public expense description'
      using errcode = '23514';
  end if;

  adjustment_income := actual_fee_income - recognized_paid_total;
  attributed_net := actual_fee_income - expense_total;
  closing_ledger_balance := opening_ledger_balance + attributed_net;

  if billed_total <> recognized_paid_total + unpaid_total then
    raise exception 'monthly fee totals do not reconcile'
      using errcode = '23514';
  end if;

  if actual_fee_income <> recognized_paid_total + adjustment_income then
    raise exception 'monthly income totals do not reconcile'
      using errcode = '23514';
  end if;

  if attributed_net <> actual_fee_income - expense_total
    or closing_ledger_balance <> opening_ledger_balance + attributed_net
  then
    raise exception 'monthly ledger totals do not reconcile'
      using errcode = '23514';
  end if;

  if greatest(
    pg_catalog.abs(billed_total),
    pg_catalog.abs(actual_fee_income),
    pg_catalog.abs(recognized_paid_total),
    pg_catalog.abs(adjustment_income),
    pg_catalog.abs(unpaid_total),
    pg_catalog.abs(expense_total),
    pg_catalog.abs(attributed_net),
    pg_catalog.abs(opening_ledger_balance),
    pg_catalog.abs(closing_ledger_balance)
  ) > 9007199254740991 then
    raise exception 'monthly settlement total exceeds safe integer range'
      using errcode = '22003';
  end if;

  return pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'period_month', normalized_period_month,
    'monthly_fee_amount', configured_monthly_fee_amount,
    'activity_member_count', activity_member_count,
    'fee_target_count', fee_target_count,
    'fully_paid_count', fully_paid_count,
    'unpaid_count', unpaid_count,
    'billed_total', billed_total,
    'actual_fee_income', actual_fee_income,
    'recognized_paid_total', recognized_paid_total,
    'adjustment_income', adjustment_income,
    'unpaid_total', unpaid_total,
    'expense_total', expense_total,
    'expense_count', expense_count,
    'attributed_net', attributed_net,
    'opening_ledger_balance', opening_ledger_balance,
    'closing_ledger_balance', closing_ledger_balance,
    'expense_category_rows', expense_category_rows,
    'expense_rows', expense_rows
  );
end;
$$;

create or replace function public.get_monthly_settlement_page(
  requested_period_month date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_period_month date := pg_catalog.date_trunc(
    'month', requested_period_month
  )::date;
  current_period_month date := pg_catalog.date_trunc(
    'month',
    (pg_catalog.statement_timestamp() at time zone 'Asia/Seoul')::date
  )::date;
  actor_profile_id uuid;
  preview_snapshot jsonb;
  active_closing jsonb;
  can_close boolean := false;
  can_reopen boolean := false;
  close_blocked_reason text;
begin
  if requested_period_month is null
    or requested_period_month <> normalized_period_month
  then
    raise exception 'period month must be the first day'
      using errcode = '22023';
  end if;

  select profiles.id
  into actor_profile_id
  from public.profiles as profiles
  where profiles.id = auth.uid()
    and profiles.status = 'active';

  if actor_profile_id is null then
    raise exception 'active operator required'
      using errcode = '42501';
  end if;

  select pg_catalog.jsonb_build_object(
    'id', closings.id,
    'period_month', closings.period_month,
    'version', closings.version,
    'status', closings.status,
    'snapshot', closings.snapshot,
    'closed_at', closings.closed_at,
    'closed_by', closings.closed_by_name
  )
  into active_closing
  from public.monthly_closings as closings
  where closings.period_month = normalized_period_month
    and closings.status = 'closed';

  if active_closing is null then
    preview_snapshot := public.build_monthly_settlement_snapshot(
      normalized_period_month
    );
  else
    preview_snapshot := active_closing->'snapshot';
  end if;

  can_close := active_closing is null
    and normalized_period_month < current_period_month
    and public.has_permission('settlements.close');

  can_reopen := active_closing is not null
    and public.has_permission('settlements.reopen')
    and not exists (
      select 1
      from public.monthly_closings as later_closings
      where later_closings.period_month > normalized_period_month
        and later_closings.status = 'closed'
    );

  close_blocked_reason := case
    when active_closing is not null then 'already-closed'
    when normalized_period_month >= current_period_month then 'period-not-ended'
    when not public.has_permission('settlements.close') then 'permission-required'
    else null
  end;

  return pg_catalog.jsonb_build_object(
    'preview', preview_snapshot,
    'active_closing', active_closing,
    'can_close', can_close,
    'can_reopen', can_reopen,
    'close_blocked_reason', close_blocked_reason
  );
end;
$$;

create or replace function public.close_monthly_settlement(
  requested_period_month date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_period_month date := pg_catalog.date_trunc(
    'month', requested_period_month
  )::date;
  current_period_month date := pg_catalog.date_trunc(
    'month',
    (pg_catalog.statement_timestamp() at time zone 'Asia/Seoul')::date
  )::date;
  actor_profile_id uuid;
  actor_display_name text;
  snapshot_to_close jsonb;
  next_version integer;
  closing_id uuid;
  closing_occurred_at timestamptz;
begin
  if requested_period_month is null
    or requested_period_month <> normalized_period_month
  then
    raise exception 'period month must be the first day'
      using errcode = '22023';
  end if;

  if normalized_period_month < date '2026-07-01' then
    raise exception 'monthly settlement ledger starts at 2026-07-01'
      using errcode = '22023';
  end if;

  select profiles.id, pg_catalog.btrim(profiles.display_name)
  into actor_profile_id, actor_display_name
  from public.profiles as profiles
  where profiles.id = auth.uid()
    and profiles.status = 'active';

  if actor_profile_id is null then
    raise exception 'active operator required'
      using errcode = '42501';
  end if;

  if actor_display_name is null
    or pg_catalog.length(actor_display_name) not between 1 and 100
  then
    raise exception 'active operator display name invalid'
      using errcode = '23514';
  end if;

  if not public.has_permission('settlements.close') then
    raise exception 'settlements.close permission required'
      using errcode = '42501';
  end if;

  if normalized_period_month >= current_period_month then
    raise exception 'current or future month cannot be closed'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('monthly-settlement-chain', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'monthly-settlement:' || normalized_period_month::text,
      0
    )
  );

  if exists (
    select 1
    from public.monthly_closings as active_closings
    where active_closings.period_month = normalized_period_month
      and active_closings.status = 'closed'
  ) then
    raise exception 'monthly settlement is already closed'
      using errcode = '55000';
  end if;

  lock table public.members, public.fee_payments, public.expenses in share mode;

  actor_profile_id := null;
  actor_display_name := null;

  select profiles.id, pg_catalog.btrim(profiles.display_name)
  into actor_profile_id, actor_display_name
  from public.profiles as profiles
  inner join public.role_permissions as role_permissions
    on role_permissions.role_id = profiles.role_id
  where profiles.id = auth.uid()
    and profiles.status = 'active'
    and role_permissions.permission = 'settlements.close'
  for share of profiles, role_permissions;

  if actor_profile_id is null then
    raise exception 'active operator with settlements.close permission required'
      using errcode = '42501';
  end if;

  if actor_display_name is null
    or pg_catalog.length(actor_display_name) not between 1 and 100
  then
    raise exception 'active operator display name invalid'
      using errcode = '23514';
  end if;

  snapshot_to_close := public.build_monthly_settlement_snapshot(
    normalized_period_month
  );

  select coalesce(max(closings.version), 0) + 1
  into next_version
  from public.monthly_closings as closings
  where closings.period_month = normalized_period_month;

  closing_occurred_at := pg_catalog.clock_timestamp();

  insert into public.monthly_closings (
    period_month,
    version,
    status,
    snapshot,
    closed_by,
    closed_by_name,
    closed_at
  )
  values (
    normalized_period_month,
    next_version,
    'closed',
    snapshot_to_close,
    actor_profile_id,
    actor_display_name,
    closing_occurred_at
  )
  returning id into closing_id;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    table_name,
    record_id,
    details,
    created_at
  )
  values (
    actor_profile_id,
    'monthly_settlement.closed',
    'monthly_closings',
    closing_id::text,
    pg_catalog.jsonb_build_object(
      'period_month', normalized_period_month,
      'version', next_version
    ),
    closing_occurred_at
  );

  return public.get_monthly_settlement_page(normalized_period_month);
end;
$$;

create or replace function public.reopen_monthly_settlement(
  requested_period_month date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_period_month date := pg_catalog.date_trunc(
    'month', requested_period_month
  )::date;
  actor_profile_id uuid;
  active_closing public.monthly_closings%rowtype;
  reopen_occurred_at timestamptz;
begin
  if requested_period_month is null
    or requested_period_month <> normalized_period_month
  then
    raise exception 'period month must be the first day'
      using errcode = '22023';
  end if;

  if normalized_period_month < date '2026-07-01' then
    raise exception 'monthly settlement ledger starts at 2026-07-01'
      using errcode = '22023';
  end if;

  select profiles.id
  into actor_profile_id
  from public.profiles as profiles
  where profiles.id = auth.uid()
    and profiles.status = 'active';

  if actor_profile_id is null then
    raise exception 'active operator required'
      using errcode = '42501';
  end if;

  if not public.has_permission('settlements.reopen') then
    raise exception 'settlements.reopen permission required'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('monthly-settlement-chain', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'monthly-settlement:' || normalized_period_month::text,
      0
    )
  );

  actor_profile_id := null;

  select profiles.id
  into actor_profile_id
  from public.profiles as profiles
  inner join public.role_permissions as role_permissions
    on role_permissions.role_id = profiles.role_id
  where profiles.id = auth.uid()
    and profiles.status = 'active'
    and role_permissions.permission = 'settlements.reopen'
  for share of profiles, role_permissions;

  if actor_profile_id is null then
    raise exception 'active operator with settlements.reopen permission required'
      using errcode = '42501';
  end if;

  select closings.*
  into active_closing
  from public.monthly_closings as closings
  where closings.period_month = normalized_period_month
    and closings.status = 'closed'
  for update;

  if not found then
    raise exception 'active monthly settlement closing not found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.monthly_closings as later_closings
    where later_closings.period_month > normalized_period_month
      and later_closings.status = 'closed'
  ) then
    raise exception 'later monthly settlement closing blocks reopen'
      using errcode = '55000';
  end if;

  reopen_occurred_at := pg_catalog.clock_timestamp();

  update public.monthly_closings as closings
  set status = 'reopened',
      reopened_by = actor_profile_id,
      reopened_at = reopen_occurred_at
  where closings.id = active_closing.id;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    table_name,
    record_id,
    details,
    created_at
  )
  values (
    actor_profile_id,
    'monthly_settlement.reopened',
    'monthly_closings',
    active_closing.id::text,
    pg_catalog.jsonb_build_object(
      'period_month', normalized_period_month,
      'version', active_closing.version
    ),
    reopen_occurred_at
  );

  return pg_catalog.jsonb_build_object(
    'preview', active_closing.snapshot,
    'active_closing', null,
    'can_close', false,
    'can_reopen', false,
    'close_blocked_reason', 'refresh-required'
  );
end;
$$;

create or replace function public.record_monthly_report_generation(
  requested_closing_id uuid,
  requested_period_month date,
  requested_version integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid;
  active_closing public.monthly_closings%rowtype;
begin
  if requested_closing_id is null
    or requested_period_month is null
    or requested_period_month <> pg_catalog.date_trunc(
      'month', requested_period_month
    )::date
    or requested_version is null
    or requested_version < 1
  then
    raise exception 'monthly report closing identity invalid'
      using errcode = '22023';
  end if;

  select profiles.id
  into actor_profile_id
  from public.profiles as profiles
  where profiles.id = auth.uid()
    and profiles.status = 'active'
  for share;

  if actor_profile_id is null then
    raise exception 'active operator required'
      using errcode = '42501';
  end if;

  select closings.*
  into active_closing
  from public.monthly_closings as closings
  where closings.id = requested_closing_id
    and closings.period_month = requested_period_month
    and closings.version = requested_version
    and closings.status = 'closed'
  for update;

  if not found then
    raise exception 'active monthly settlement closing not found'
      using errcode = 'P0002';
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    table_name,
    record_id,
    details,
    created_at
  )
  values (
    actor_profile_id,
    'monthly_report.generated',
    'monthly_closings',
    active_closing.id::text,
    pg_catalog.jsonb_build_object(
      'period_month', active_closing.period_month,
      'version', active_closing.version
    ),
    pg_catalog.clock_timestamp()
  );

  return true;
end;
$$;

revoke execute on function public.build_monthly_settlement_snapshot(date)
from public, anon, authenticated, service_role;

revoke execute on function public.get_monthly_settlement_page(date) from public, anon;
grant execute on function public.get_monthly_settlement_page(date) to authenticated;
revoke execute on function public.close_monthly_settlement(date) from public, anon;
grant execute on function public.close_monthly_settlement(date) to authenticated;
revoke execute on function public.reopen_monthly_settlement(date) from public, anon;
grant execute on function public.reopen_monthly_settlement(date) to authenticated;
revoke execute on function public.record_monthly_report_generation(uuid, date, integer)
from public, anon, authenticated, service_role;
grant execute on function public.record_monthly_report_generation(uuid, date, integer)
to authenticated;

notify pgrst, 'reload schema';
commit;
