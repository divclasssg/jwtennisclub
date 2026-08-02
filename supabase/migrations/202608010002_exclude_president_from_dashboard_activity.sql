begin;

create or replace function public.get_dashboard_page()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  as_of timestamptz := pg_catalog.statement_timestamp();
  current_date_seoul date := (as_of at time zone 'Asia/Seoul')::date;
  current_period_month date := pg_catalog.date_trunc(
    'month', current_date_seoul
  )::date;
  period_month_end date := (
    current_period_month + interval '1 month - 1 day'
  )::date;
  actor_profile_id uuid;
  members_summary jsonb;
  current_snapshot jsonb;
  current_summary jsonb;
  active_final jsonb;
  latest_interim jsonb;
  current_finance jsonb;
  current_blocked_reason text;
  latest_final jsonb;
  trend_rows jsonb := '[]'::jsonb;
begin
  select profiles.id
  into actor_profile_id
  from public.profiles as profiles
  where profiles.id = auth.uid()
    and profiles.status = 'active';

  if actor_profile_id is null then
    raise exception 'active operator required'
      using errcode = '42501';
  end if;

  lock table public.members, public.fee_payments, public.expenses, public.monthly_closings in share mode;

  select pg_catalog.jsonb_build_object(
    'active_count', member_counts.active_count,
    'upcoming_count', member_counts.upcoming_count,
    'paused_count', member_counts.paused_count,
    'joined_this_month_count', member_counts.joined_this_month_count,
    'paused_this_month_count', member_counts.paused_this_month_count,
    'withdrawn_this_month_count', member_counts.withdrawn_this_month_count
  )
  into members_summary
  from (
    select
      count(*) filter (
        where members.member_code <> '#0000'
          and members.activity_start_month <= current_period_month
          and (
            members.withdrawn_date is null
            or members.withdrawn_date > period_month_end
          )
          and not (
            members.status = 'paused'
            and members.pause_start_month <= current_period_month
          )
      ) as active_count,
      count(*) filter (
        where members.activity_start_month > current_period_month
          and members.status <> 'withdrawn'
      ) as upcoming_count,
      count(*) filter (
        where members.status = 'paused'
          and members.pause_start_month <= current_period_month
      ) as paused_count,
      count(*) filter (
        where members.joined_date between current_period_month
          and current_date_seoul
      ) as joined_this_month_count,
      count(*) filter (
        where members.pause_start_month = current_period_month
      ) as paused_this_month_count,
      count(*) filter (
        where members.withdrawn_date between current_period_month
          and current_date_seoul
      ) as withdrawn_this_month_count
    from public.members as members
  ) as member_counts;

  select
    closings.snapshot,
    pg_catalog.jsonb_build_object(
      'id', closings.id,
      'closing_kind', closings.closing_kind,
      'version', closings.version,
      'status', closings.status
    )
  into current_snapshot, active_final
  from public.monthly_closings as closings
  where closings.period_month = current_period_month
    and closings.closing_kind = 'final'
    and closings.status = 'closed'
  order by closings.closed_at desc, closings.version desc
  limit 1;

  select pg_catalog.jsonb_build_object(
    'id', closings.id,
    'closing_kind', closings.closing_kind,
    'version', closings.version,
    'status', closings.status
  )
  into latest_interim
  from public.monthly_closings as closings
  where closings.period_month = current_period_month
    and closings.closing_kind = 'interim'
    and closings.status = 'closed'
  order by closings.closed_at desc, closings.version desc
  limit 1;

  if current_snapshot is null then
    begin
      current_snapshot := public.build_monthly_settlement_snapshot(
        current_period_month
      );
    exception
      when others then
        case sqlerrm
          when 'member activity start month required' then
            current_blocked_reason := 'member-activity-start-required';
          when 'prior monthly settlement closing required' then
            current_blocked_reason := 'prior-final-closing-required';
          when 'invalid public expense description' then
            current_blocked_reason := 'invalid-public-expense-description';
          else
            raise;
        end case;
    end;
  end if;

  if current_blocked_reason is not null then
    current_finance := pg_catalog.jsonb_build_object(
      'status', 'blocked',
      'blocked_reason', current_blocked_reason,
      'source', null,
      'summary', null,
      'active_final', null,
      'latest_interim', latest_interim
    );
  else
    current_summary := pg_catalog.jsonb_build_object(
      'billed_total', (current_snapshot->>'billed_total')::bigint,
      'actual_fee_income', (current_snapshot->>'actual_fee_income')::bigint,
      'expense_total', (current_snapshot->>'expense_total')::bigint,
      'attributed_net', (current_snapshot->>'attributed_net')::bigint,
      'fully_paid_count', (current_snapshot->>'fully_paid_count')::bigint,
      'fee_target_count', (current_snapshot->>'fee_target_count')::bigint,
      'unpaid_count', (current_snapshot->>'unpaid_count')::bigint,
      'unpaid_total', (current_snapshot->>'unpaid_total')::bigint,
      'opening_ledger_balance',
        (current_snapshot->>'opening_ledger_balance')::bigint,
      'closing_ledger_balance',
        (current_snapshot->>'closing_ledger_balance')::bigint
    );

    current_finance := pg_catalog.jsonb_build_object(
      'status', 'available',
      'blocked_reason', null,
      'source', case when active_final is null then 'current' else 'final' end,
      'summary', current_summary,
      'active_final', active_final,
      'latest_interim', latest_interim
    );
  end if;

  select pg_catalog.jsonb_build_object(
    'id', closings.id,
    'closing_kind', closings.closing_kind,
    'version', closings.version,
    'status', closings.status,
    'period_month', closings.period_month,
    'closed_at', closings.closed_at,
    'billed_total', (closings.snapshot->>'billed_total')::bigint,
    'actual_fee_income', (closings.snapshot->>'actual_fee_income')::bigint,
    'expense_total', (closings.snapshot->>'expense_total')::bigint,
    'attributed_net', (closings.snapshot->>'attributed_net')::bigint,
    'fully_paid_count', (closings.snapshot->>'fully_paid_count')::bigint,
    'fee_target_count', (closings.snapshot->>'fee_target_count')::bigint,
    'unpaid_count', (closings.snapshot->>'unpaid_count')::bigint,
    'unpaid_total', (closings.snapshot->>'unpaid_total')::bigint,
    'opening_ledger_balance',
      (closings.snapshot->>'opening_ledger_balance')::bigint,
    'closing_ledger_balance',
      (closings.snapshot->>'closing_ledger_balance')::bigint
  )
  into latest_final
  from public.monthly_closings as closings
  where closings.closing_kind = 'final'
    and closings.status = 'closed'
  order by closings.period_month desc
  limit 1;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'period_month', trend_month,
        'source', trend_source,
        'actual_fee_income', (trend_snapshot->>'actual_fee_income')::bigint,
        'expense_total', (trend_snapshot->>'expense_total')::bigint,
        'closing_ledger_balance',
          (trend_snapshot->>'closing_ledger_balance')::bigint
      )
      order by trend_month
    ),
    '[]'::jsonb
  )
  into trend_rows
  from (
    select
      closings.period_month as trend_month,
      'final'::text as trend_source,
      closings.snapshot as trend_snapshot
    from public.monthly_closings as closings
    where closings.period_month between
        greatest(
          date '2026-07-01',
          current_period_month - interval '5 months'
        )
        and current_period_month
      and closings.period_month < current_period_month
      and closings.closing_kind = 'final'
      and closings.status = 'closed'

    union all

    select
      current_period_month as trend_month,
      case when active_final is null then 'current' else 'final' end
        as trend_source,
      current_snapshot as trend_snapshot
    where current_blocked_reason is null
  ) as trend_points;

  return pg_catalog.jsonb_build_object(
    'as_of', as_of,
    'period_month', current_period_month,
    'members', members_summary,
    'current_finance', current_finance,
    'latest_final', latest_final,
    'trends', trend_rows
  );
end;
$$;

revoke execute on function public.get_dashboard_page() from public, anon;
grant execute on function public.get_dashboard_page() to authenticated;

notify pgrst, 'reload schema';

commit;
