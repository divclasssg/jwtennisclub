begin;

create or replace function public.assert_monthly_source_unlocked(
  requested_period_month date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.monthly_closings as closings
    where closings.period_month = requested_period_month
      and closings.closing_kind = 'final'
      and closings.status = 'closed'
  ) then
    raise exception 'monthly closing source is locked'
      using errcode = '55000';
  end if;
end;
$$;

create or replace function public.guard_fee_payment_monthly_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  case TG_OP
    when 'DELETE' then
      perform public.assert_monthly_source_unlocked(old.period_month);
      return OLD;
    when 'INSERT' then
      perform public.assert_monthly_source_unlocked(new.period_month);
      return NEW;
    when 'UPDATE' then
      perform public.assert_monthly_source_unlocked(old.period_month);

      if old.period_month is distinct from new.period_month then
        perform public.assert_monthly_source_unlocked(new.period_month);
      end if;

      return NEW;
    else
      raise exception 'unexpected fee payment source trigger operation: %', TG_OP
        using errcode = '55000';
  end case;
end;
$$;

create or replace function public.guard_expense_monthly_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  case TG_OP
    when 'DELETE' then
      perform public.assert_monthly_source_unlocked(
        pg_catalog.date_trunc('month', old.expense_date)::date
      );
      return OLD;
    when 'INSERT' then
      perform public.assert_monthly_source_unlocked(
        pg_catalog.date_trunc('month', new.expense_date)::date
      );
      return NEW;
    when 'UPDATE' then
      perform public.assert_monthly_source_unlocked(
        pg_catalog.date_trunc('month', old.expense_date)::date
      );

      if pg_catalog.date_trunc('month', old.expense_date)::date
        is distinct from pg_catalog.date_trunc('month', new.expense_date)::date
      then
        perform public.assert_monthly_source_unlocked(
          pg_catalog.date_trunc('month', new.expense_date)::date
        );
      end if;

      return NEW;
    else
      raise exception 'unexpected expense source trigger operation: %', TG_OP
        using errcode = '55000';
  end case;
end;
$$;

drop trigger if exists guard_fee_payment_monthly_source
on public.fee_payments;

create trigger guard_fee_payment_monthly_source
before insert or update or delete on public.fee_payments
for each row
execute function public.guard_fee_payment_monthly_source();

drop trigger if exists guard_expense_monthly_source
on public.expenses;

create trigger guard_expense_monthly_source
before insert or update or delete on public.expenses
for each row
execute function public.guard_expense_monthly_source();

create or replace function public.get_monthly_source_lock_status(
  requested_period_month date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid;
  source_is_locked boolean;
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

  select exists (
    select 1
    from public.monthly_closings as closings
    where closings.period_month = requested_period_month
      and closings.closing_kind = 'final'
      and closings.status = 'closed'
  )
  into source_is_locked;

  return source_is_locked;
end;
$$;

revoke execute on function public.assert_monthly_source_unlocked(date)
from public, anon, authenticated, service_role;

revoke execute on function public.guard_fee_payment_monthly_source()
from public, anon, authenticated, service_role;

revoke execute on function public.guard_expense_monthly_source()
from public, anon, authenticated, service_role;

revoke execute on function public.get_monthly_source_lock_status(date)
from public, anon, authenticated, service_role;
grant execute on function public.get_monthly_source_lock_status(date)
to authenticated;

notify pgrst, 'reload schema';

commit;
