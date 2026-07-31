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

function stripSqlComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

const executableSql = stripSqlComments(sql);

function functionBody(functionName: string) {
  const start = sql.indexOf(
    `create or replace function public.${functionName}(`,
  );
  const end = sql.indexOf("$$;", start);

  expect(start, functionName).toBeGreaterThan(-1);
  expect(end, functionName).toBeGreaterThan(start);
  return sql.slice(start, end);
}

function jsonObjectKeys(source: string) {
  return [...source.matchAll(/'([a-z_]+)'\s*,/g)].map((match) => match[1]);
}

describe("interim monthly settlement closing migration", () => {
  it("adds independently versioned interim and final closing kinds", () => {
    expect(sql).toContain(
      "create type public.monthly_closing_kind as enum ('interim', 'final')",
    );
    expect(sql).toContain(
      "add column closing_kind public.monthly_closing_kind not null default 'final'",
    );
    expect(executableSql).toMatch(
      /alter table public\.monthly_closings\s+drop constraint monthly_closings_period_month_version_key\s*;/,
    );
    expect(sql).toContain(
      "unique (period_month, closing_kind, version)",
    );
    expect(executableSql).toMatch(
      /drop index public\.monthly_closings_one_active_month_idx\s*;/,
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
    expect(interim).toMatch(
      /select coalesce\(max\(closings\.version\), 0\) \+ 1\s+into next_version\s+from public\.monthly_closings as closings\s+where closings\.period_month = normalized_period_month\s+and closings\.closing_kind = 'interim'\s*;/,
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
    expect(finalClose).toMatch(
      /select coalesce\(max\(closings\.version\), 0\) \+ 1\s+into next_version\s+from public\.monthly_closings as closings\s+where closings\.period_month = normalized_period_month\s+and closings\.closing_kind = 'final'\s*;/,
    );
    expect(finalClose).toContain(
      "return public.get_monthly_settlement_page_v2(normalized_period_month)",
    );
  });

  it("returns the v2 page payload from closing creation mutations", () => {
    for (const functionName of [
      "create_interim_monthly_settlement",
      "close_monthly_settlement",
    ]) {
      expect(functionBody(functionName)).toContain(
        "return public.get_monthly_settlement_page_v2(normalized_period_month)",
      );
    }

    const reopen = functionBody("reopen_monthly_settlement");
    expect(reopen).toContain("'closing_history'");
    expect(reopen).toContain("'can_create_interim'");
  });

  it("chains ledger balances only from the prior active final closing", () => {
    const snapshot = functionBody("build_monthly_settlement_snapshot");

    expect(snapshot).toContain(
      "prior_closing.closing_kind = 'final'",
    );
    expect(snapshot).toContain("prior_closing.status = 'closed'");
  });

  it("returns every interim and final version while selecting only an active final", () => {
    const page = functionBody("get_monthly_settlement_page_v2");
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

  it("returns the exact strict-compatible legacy page and closing DTO shapes", () => {
    const legacy = functionBody("get_monthly_settlement_page");
    const activeDtoStart = legacy.indexOf(
      "select pg_catalog.jsonb_build_object(",
    );
    const activeDtoEnd = legacy.indexOf(
      ")\n  into active_closing",
      activeDtoStart,
    );
    const returnDtoStart = legacy.lastIndexOf(
      "return pg_catalog.jsonb_build_object(",
    );
    const returnDtoEnd = legacy.indexOf(");\nend;", returnDtoStart);

    expect(activeDtoStart).toBeGreaterThan(-1);
    expect(activeDtoEnd).toBeGreaterThan(activeDtoStart);
    expect(returnDtoStart).toBeGreaterThan(activeDtoEnd);
    expect(returnDtoEnd).toBeGreaterThan(returnDtoStart);
    expect(
      jsonObjectKeys(legacy.slice(activeDtoStart, activeDtoEnd)),
    ).toEqual([
      "id",
      "period_month",
      "version",
      "status",
      "snapshot",
      "closed_at",
      "closed_by",
    ]);
    expect(
      jsonObjectKeys(legacy.slice(returnDtoStart, returnDtoEnd)),
    ).toEqual([
      "preview",
      "active_closing",
      "can_close",
      "can_reopen",
      "close_blocked_reason",
    ]);
  });

  it("keeps interim rows out of every legacy active and blocking lookup", () => {
    const legacy = functionBody("get_monthly_settlement_page");
    const activeLookupStart = legacy.indexOf(
      "from public.monthly_closings as closings",
    );
    const activeLookupEnd = legacy.indexOf(";", activeLookupStart);
    const laterLookupStart = legacy.indexOf(
      "from public.monthly_closings as later_closings",
    );
    const laterLookupEnd = legacy.indexOf(");", laterLookupStart);
    const activeLookup = legacy.slice(activeLookupStart, activeLookupEnd);
    const laterLookup = legacy.slice(laterLookupStart, laterLookupEnd);

    expect(activeLookup).toContain("closings.closing_kind = 'final'");
    expect(activeLookup).toContain("closings.status = 'closed'");
    expect(laterLookup).toContain(
      "later_closings.closing_kind = 'final'",
    );
    expect(laterLookup).toContain("later_closings.status = 'closed'");
  });

  it("keeps the v2 page RPC separate from the strict legacy contract", () => {
    const legacy = functionBody("get_monthly_settlement_page");
    const v2 = functionBody("get_monthly_settlement_page_v2");

    expect(legacy).not.toContain("'closing_history'");
    expect(legacy).not.toContain("'can_create_interim'");
    expect(v2).toContain("'closing_history'");
    expect(v2).toContain("'can_create_interim'");
    expect(executableSql).toMatch(
      /create or replace function public\.get_monthly_settlement_page\(\s*requested_period_month date\s*\)/,
    );
    expect(executableSql).toMatch(
      /create or replace function public\.get_monthly_settlement_page_v2\(\s*requested_period_month date\s*\)/,
    );
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
