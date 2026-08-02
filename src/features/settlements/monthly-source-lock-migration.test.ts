import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202607310002_lock_finalized_month_sources.sql",
);
const rawSql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
const sql = rawSql.toLowerCase();

function functionBody(functionName: string) {
  const start = sql.indexOf(
    `create or replace function public.${functionName}`,
  );
  const end = sql.indexOf("$$;", start);

  expect(start, functionName).toBeGreaterThan(-1);
  expect(end, functionName).toBeGreaterThan(start);
  return sql.slice(start, end);
}

function rawFunctionBody(functionName: string) {
  const start = rawSql.indexOf(
    `create or replace function public.${functionName}`,
  );
  const end = rawSql.indexOf("$$;", start);

  expect(start, functionName).toBeGreaterThan(-1);
  expect(end, functionName).toBeGreaterThan(start);
  return rawSql.slice(start, end);
}

describe("monthly source lock migration", () => {
  it("locks fee and expense mutations only for active final closings", () => {
    expect(sql).toContain(
      "create or replace function public.assert_monthly_source_unlocked",
    );
    expect(sql).toContain("closing_kind = 'final'");
    expect(sql).toContain("status = 'closed'");
    expect(sql).toContain(
      "before insert or update or delete on public.fee_payments",
    );
    expect(sql).toContain(
      "before insert or update or delete on public.expenses",
    );
    expect(sql).toContain(
      "create or replace function public.get_monthly_source_lock_status",
    );
  });

  it("checks both old and new months when fee rows move between periods", () => {
    const feeGuard = functionBody("guard_fee_payment_monthly_source");

    expect(feeGuard).toContain(
      "public.assert_monthly_source_unlocked(old.period_month)",
    );
    expect(feeGuard).toContain(
      "public.assert_monthly_source_unlocked(new.period_month)",
    );
    expect(feeGuard).toMatch(
      /when 'update' then[\s\S]*old\.period_month is distinct from new\.period_month/,
    );
  });

  it("checks both old and new months when expense rows move between periods", () => {
    const expenseGuard = functionBody("guard_expense_monthly_source");

    expect(expenseGuard).toMatch(
      /public\.assert_monthly_source_unlocked\(\s*pg_catalog\.date_trunc\('month', old\.expense_date\)::date\s*\)/,
    );
    expect(expenseGuard).toMatch(
      /public\.assert_monthly_source_unlocked\(\s*pg_catalog\.date_trunc\('month', new\.expense_date\)::date\s*\)/,
    );
    expect(expenseGuard).toMatch(
      /when 'update' then[\s\S]*date_trunc\('month', old\.expense_date\)::date[\s\S]*is distinct from[\s\S]*date_trunc\('month', new\.expense_date\)::date/,
    );
  });

  it("matches PostgreSQL uppercase trigger operations and returns the affected row", () => {
    const feeGuard = rawFunctionBody("guard_fee_payment_monthly_source");
    const expenseGuard = rawFunctionBody("guard_expense_monthly_source");

    for (const guard of [feeGuard, expenseGuard]) {
      expect(guard).toMatch(
        /when 'DELETE' then[\s\S]*return OLD;[\s\S]*when 'INSERT' then[\s\S]*return NEW;[\s\S]*when 'UPDATE' then[\s\S]*return NEW;/,
      );
      expect(guard).toContain("else");
      expect(guard).toContain("TG_OP");
      expect(guard).not.toMatch(/(?:TG_OP =|when) '(?:delete|insert|update)'/);
    }

    expect(feeGuard).toContain(
      "raise exception 'unexpected fee payment source trigger operation: %', TG_OP",
    );
    expect(expenseGuard).toContain(
      "raise exception 'unexpected expense source trigger operation: %', TG_OP",
    );
  });

  it("uses fixed-search-path security definers and least-privilege grants", () => {
    for (const functionName of [
      "assert_monthly_source_unlocked",
      "guard_fee_payment_monthly_source",
      "guard_expense_monthly_source",
      "get_monthly_source_lock_status",
    ]) {
      const body = functionBody(functionName);

      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
    }

    for (const helperSignature of [
      "public.assert_monthly_source_unlocked(date)",
      "public.guard_fee_payment_monthly_source()",
      "public.guard_expense_monthly_source()",
    ]) {
      expect(sql).toContain(
        `revoke execute on function ${helperSignature}\nfrom public, anon, authenticated, service_role`,
      );
      expect(sql).not.toContain(
        `grant execute on function ${helperSignature}`,
      );
    }

    expect(sql).toContain(
      "revoke execute on function public.get_monthly_source_lock_status(date)\nfrom public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.get_monthly_source_lock_status(date)\nto authenticated",
    );
  });

  it("requires an active operator before exposing source lock state", () => {
    const statusRpc = functionBody("get_monthly_source_lock_status");

    expect(statusRpc).toContain("profiles.id = auth.uid()");
    expect(statusRpc).toContain("profiles.status = 'active'");
    expect(statusRpc).toContain("active operator required");
    expect(statusRpc).toContain("closing_kind = 'final'");
    expect(statusRpc).toContain("status = 'closed'");
  });
});
