import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const initialMigrationPath = join(
  process.cwd(),
  "supabase/migrations/202608010001_add_dashboard_page.sql",
);
const forwardMigrationPath = join(
  process.cwd(),
  "supabase/migrations/202608010002_exclude_president_from_dashboard_activity.sql",
);
const sql = existsSync(initialMigrationPath)
  ? readFileSync(initialMigrationPath, "utf8").toLowerCase()
  : "";
const forwardSql = existsSync(forwardMigrationPath)
  ? readFileSync(forwardMigrationPath, "utf8").toLowerCase()
  : "";

function functionBody(sqlText: string, functionName: string) {
  const start = sqlText.indexOf(
    `create or replace function public.${functionName}(`,
  );
  const end = sqlText.indexOf("$$;", start);

  expect(start, functionName).toBeGreaterThan(-1);
  expect(end, functionName).toBeGreaterThan(start);
  return sqlText.slice(start, end);
}

describe("dashboard page migration", () => {
  it("exposes only the secured privacy-safe dashboard aggregate", () => {
    expect(sql).toContain("function public.get_dashboard_page()\nreturns jsonb");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("profiles.id = auth.uid()");
    expect(sql).toContain("profiles.status = 'active'");
    expect(sql).toContain("public.build_monthly_settlement_snapshot(");
    expect(sql).toContain("closings.closing_kind = 'final'");
    expect(sql).toContain("closings.status = 'closed'");
    expect(sql).toContain("interval '5 months'");
    expect(sql).toContain("date '2026-07-01'");
    expect(sql).toContain(
      "revoke execute on function public.get_dashboard_page() from public, anon",
    );
    expect(sql).toContain(
      "grant execute on function public.get_dashboard_page() to authenticated",
    );
    expect(sql).not.toContain("members.name");
    expect(sql).not.toContain("phone_number");
    expect(sql).not.toContain("expense_rows");
    expect(sql).not.toContain("'closed_by'");
    expect(sql).not.toContain("closed_by_name");
  });

  it("locks every mutable aggregate source before dashboard reads", () => {
    const page = functionBody(sql, "get_dashboard_page");
    const sourceLock = page.indexOf(
      "lock table public.members, public.fee_payments, public.expenses, public.monthly_closings in share mode",
    );

    expect(sourceLock).toBeGreaterThan(-1);
    for (const aggregateRead of [
      "from public.members as members",
      "from public.monthly_closings as closings",
      "public.build_monthly_settlement_snapshot(",
    ]) {
      expect(page.indexOf(aggregateRead), aggregateRead).toBeGreaterThan(
        sourceLock,
      );
    }
  });

  it("excludes only the president from the active member total", () => {
    const forwardFunction = functionBody(forwardSql, "get_dashboard_page");

    expect(forwardSql).toContain("function public.get_dashboard_page()\nreturns jsonb");
    expect(forwardFunction).toMatch(
      /count\(\*\) filter \(\s*where members\.member_code <> '#0000'[\s\S]*?\) as active_count/,
    );
    expect(forwardFunction.match(/members\.member_code <> '#0000'/g)).toHaveLength(1);
    expect(forwardSql).toContain("set search_path = ''");
    expect(forwardSql).toContain(
      "revoke execute on function public.get_dashboard_page() from public, anon",
    );
    expect(forwardSql).toContain(
      "grant execute on function public.get_dashboard_page() to authenticated",
    );
  });
});
