import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202607310001_add_interim_monthly_closings.sql",
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").toLowerCase()
  : "";

function functionBody(functionName: string) {
  const start = sql.indexOf(
    `create or replace function public.${functionName}`,
  );
  const end = sql.indexOf("$$;", start);

  expect(start, functionName).toBeGreaterThan(-1);
  expect(end, functionName).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("interim monthly settlement closing migration", () => {
  it("adds independently versioned interim and final closing kinds", () => {
    expect(sql).toContain(
      "create type public.monthly_closing_kind as enum ('interim', 'final')",
    );
    expect(sql).toContain(
      "add column closing_kind public.monthly_closing_kind not null default 'final'",
    );
    expect(sql).toContain(
      "unique (period_month, closing_kind, version)",
    );
    expect(sql).toContain(
      "where closing_kind = 'final' and status = 'closed'",
    );
  });

  it("creates immutable interim snapshots under the close permission", () => {
    const interim = functionBody("create_interim_monthly_settlement");
    const sourceLock = interim.indexOf(
      "lock table public.members, public.fee_payments, public.expenses in share mode",
    );
    const permissionRecheck = interim.indexOf(
      "role_permissions.permission = 'settlements.close'",
      sourceLock,
    );
    const insert = interim.indexOf(
      "insert into public.monthly_closings",
    );

    expect(interim).toContain(
      "normalized_period_month > current_period_month",
    );
    expect(interim).toContain("settlements.close");
    expect(interim).toContain("closing_kind = 'interim'");
    expect(interim).toContain(
      "public.build_monthly_settlement_snapshot",
    );
    expect(interim).toContain(
      "monthly_settlement.interim_created",
    );
    expect(interim).toContain("profiles.status = 'active'");
    expect(interim).toContain("pg_advisory_xact_lock");
    expect(interim).toContain("'monthly-settlement-chain'");
    expect(interim).toContain(
      "'monthly-settlement:' || normalized_period_month::text",
    );
    expect(sourceLock).toBeGreaterThan(-1);
    expect(permissionRecheck).toBeGreaterThan(sourceLock);
    expect(insert).toBeGreaterThan(permissionRecheck);
    expect(interim.slice(permissionRecheck, insert)).toContain(
      "for share of profiles, role_permissions",
    );
    expect(interim).toMatch(
      /insert into public\.monthly_closings \([\s\S]*closing_kind[\s\S]*values \(\s*normalized_period_month,\s*'interim'/,
    );
  });

  it("allows current-month final closings and versions them independently", () => {
    const finalClose = functionBody("close_monthly_settlement");

    expect(finalClose).toContain(
      "normalized_period_month > current_period_month",
    );
    expect(finalClose).not.toContain(
      "normalized_period_month >= current_period_month",
    );
    expect(finalClose).toContain("closing_kind = 'final'");
  });

  it("chains ledger balances only from the prior active final closing", () => {
    const snapshot = functionBody("build_monthly_settlement_snapshot");

    expect(snapshot).toContain(
      "prior_closing.closing_kind = 'final'",
    );
    expect(snapshot).toContain("prior_closing.status = 'closed'");
  });

  it("returns every interim and final version while selecting only an active final", () => {
    const page = functionBody("get_monthly_settlement_page");
    const historyStart = page.indexOf("select coalesce(");
    const historyEnd = page.indexOf(") as closing_rows;", historyStart);
    const historyQuery = page.slice(historyStart, historyEnd);

    expect(page).toMatch(
      /where closings\.period_month = normalized_period_month\s+and closings\.closing_kind = 'final'\s+and closings\.status = 'closed'/,
    );
    expect(historyQuery).toMatch(
      /from public\.monthly_closings as closings\s+where closings\.period_month = normalized_period_month/,
    );
    expect(historyEnd).toBeGreaterThan(historyStart);
    expect(historyQuery).not.toContain("closings.closing_kind =");
    expect(historyQuery).toContain(
      "order by closing_rows.closed_at desc",
    );
    for (const key of [
      "'id'",
      "'period_month'",
      "'closing_kind'",
      "'version'",
      "'status'",
      "'snapshot'",
      "'closed_at'",
      "'closed_by'",
      "'reopened_at'",
      "'preview'",
      "'active_closing'",
      "'closing_history'",
      "'can_create_interim'",
      "'can_close'",
      "'can_reopen'",
      "'close_blocked_reason'",
    ]) {
      expect(page).toContain(key);
    }
  });

  it("audits and returns the exact requested immutable snapshot", () => {
    const report = functionBody("record_monthly_report_generation");

    expect(report).toContain("closings.id = requested_closing_id");
    expect(report).toContain(
      "'closing_kind', selected_closing.closing_kind",
    );
    expect(report).toContain("'version', selected_closing.version");
    expect(report).not.toContain("requested_period_month");
  });
});
