import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPaths = [
  "supabase/migrations/202607300002_add_monthly_settlement_closings.sql",
  "supabase/migrations/202607310001_add_interim_monthly_closings.sql",
].map((path) => join(process.cwd(), path));
const additiveMigrationSql = existsSync(migrationPaths[1])
  ? readFileSync(migrationPaths[1], "utf8").toLowerCase()
  : "";
const executableAdditiveMigrationSql = additiveMigrationSql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--.*$/gm, "");
const migrationSql = migrationPaths
  .filter((path) => existsSync(path))
  .map((path) => readFileSync(path, "utf8").toLowerCase())
  .join("\n");

function migrationFunctionBody(functionName: string) {
  const start = migrationSql.lastIndexOf(
    `create or replace function public.${functionName}`,
  );
  const end = migrationSql.indexOf("$$;", start);

  expect(start, functionName).toBeGreaterThan(-1);
  expect(end, functionName).toBeGreaterThan(start);
  return migrationSql.slice(start, end);
}

function sourceReadStatements(functionName: string) {
  return migrationFunctionBody(functionName)
    .split(";")
    .filter((statement) =>
      /public\.(members|fee_payments|expenses|monthly_closings)/.test(statement),
    );
}

describe("monthly settlement closing migration", () => {
  it("evolves immutable closings to kind-scoped versions and one active final per month", () => {
    expect(migrationSql).toContain(
      "create type public.monthly_closing_status as enum ('closed', 'reopened')",
    );
    expect(migrationSql).toContain("create table public.monthly_closings");
    expect(executableAdditiveMigrationSql).toMatch(
      /alter table public\.monthly_closings\s+drop constraint monthly_closings_period_month_version_key\s*;/,
    );
    expect(additiveMigrationSql).toContain(
      "unique (period_month, closing_kind, version)",
    );
    expect(executableAdditiveMigrationSql).toMatch(
      /drop index public\.monthly_closings_one_active_month_idx\s*;/,
    );
    expect(additiveMigrationSql).toMatch(
      /create unique index monthly_closings_one_active_final_month_idx\s+on public\.monthly_closings\s*\(period_month\)\s*where closing_kind = 'final' and status = 'closed'/,
    );
    expect(migrationSql).toContain(
      "period_month = date_trunc('month', period_month)::date",
    );
    expect(migrationSql).toContain("closed_by_name text not null");
    expect(migrationSql).toContain(
      "monthly_closings_closed_by_name_valid",
    );
    expect(migrationSql).toMatch(
      /status = 'closed'[\s\S]*reopened_by is null[\s\S]*reopened_at is null/,
    );
  });

  it("allows active operators to read snapshots but forbids every direct authenticated write", () => {
    expect(migrationSql).toContain(
      "alter table public.monthly_closings enable row level security",
    );
    expect(migrationSql).toContain(
      "create policy \"active operators can read monthly closings\"",
    );
    expect(migrationSql).toContain(
      "using (public.is_active_operator())",
    );
    expect(migrationSql).toContain(
      "revoke insert, update, delete on table public.monthly_closings from public, anon, authenticated",
    );
    expect(migrationSql).toContain(
      "grant select on table public.monthly_closings to authenticated",
    );
    expect(migrationSql).not.toMatch(
      /grant\s+(?:insert|update|delete|all)[^;]*monthly_closings[^;]*authenticated/,
    );
  });

  it("keeps the one authoritative calculator private with a fixed search path", () => {
    const builder = migrationFunctionBody("build_monthly_settlement_snapshot");

    expect(builder).toContain("security definer");
    expect(builder).toContain("set search_path = ''");
    expect(migrationSql).toContain(
      "revoke execute on function public.build_monthly_settlement_snapshot(date)\nfrom public, anon, authenticated, service_role",
    );
    expect(migrationSql).not.toContain(
      "grant execute on function public.build_monthly_settlement_snapshot(date)",
    );
  });

  it("calculates activity and fee targets member by member at the requested month", () => {
    const builder = migrationFunctionBody("build_monthly_settlement_snapshot");

    expect(builder).toContain("activity_start_month");
    expect(builder).toContain("member activity start month required");
    expect(builder).toContain(
      "members.activity_start_month <= normalized_period_month",
    );
    expect(builder).toContain(
      "members.withdrawn_date > period_month_end",
    );
    expect(builder).toContain(
      "members.pause_start_month <= normalized_period_month",
    );
    expect(builder).toContain("members.member_code <> '#0000'");
    expect(builder).toContain(
      "greatest(monthly_fee_amount - coalesce",
    );
    expect(builder).toContain("least(coalesce");
    expect(builder).toMatch(
      /count\(\*\) filter \(\s*where paid_amount >= monthly_fee_amount\s*\)/,
    );
    expect(builder).toMatch(
      /count\(\*\) filter \(\s*where paid_amount < monthly_fee_amount\s*\)/,
    );
  });

  it("rejects a relevant transition member whose activity start month is still unconfirmed", () => {
    const builder = migrationFunctionBody("build_monthly_settlement_snapshot");

    expect(builder).toMatch(
      /with relevant_members as materialized \([\s\S]*members\.joined_date <= period_month_end[\s\S]*members\.withdrawn_date >= normalized_period_month/,
    );
    expect(builder).toMatch(
      /select count\(\*\)\s+from relevant_members\s+where relevant_members\.activity_start_month is null/,
    );
    expect(builder).toMatch(
      /if missing_activity_start_count > 0 then\s+raise exception 'member activity start month required'/,
    );
  });

  it("keeps actual income independent from capped recognized payments", () => {
    const builder = migrationFunctionBody("build_monthly_settlement_snapshot");

    expect(builder).toMatch(
      /from public\.fee_payments as fee_payments[\s\S]*fee_payments\.period_month = normalized_period_month/,
    );
    expect(builder).toContain(
      "actual_fee_income - recognized_paid_total",
    );
    expect(builder).toContain(
      "actual_fee_income - expense_total",
    );
    expect(builder).toContain(
      "opening_ledger_balance + attributed_net",
    );
  });

  it("reads every snapshot source through one CTE statement and one MVCC command snapshot", () => {
    const builder = migrationFunctionBody("build_monthly_settlement_snapshot");
    const sourceStatements = sourceReadStatements(
      "build_monthly_settlement_snapshot",
    );

    expect(sourceStatements).toHaveLength(1);
    expect(sourceStatements[0]).toMatch(/with\s+relevant_members as/);
    expect(sourceStatements[0]).toContain("activity_members as");
    expect(sourceStatements[0]).toContain("target_member_payments as");
    expect(sourceStatements[0]).toContain("actual_income as");
    expect(sourceStatements[0]).toContain("period_expenses as materialized");
    expect(sourceStatements[0]).toContain("prior_closing as");
    expect(builder).not.toMatch(
      /;\s*(?:select|if exists)[\s\S]*from public\.(members|fee_payments|expenses|monthly_closings)/,
    );
  });

  it("starts the ledger at zero in July and chains every later month to an active prior closing", () => {
    const builder = migrationFunctionBody("build_monthly_settlement_snapshot");

    expect(builder).toContain("date '2026-07-01'");
    expect(builder).toMatch(
      /when normalized_period_month = date '2026-07-01' then 0::bigint/,
    );
    expect(builder).toContain(
      "prior_closing.status = 'closed'",
    );
    expect(builder).toContain(
      "prior monthly settlement closing required",
    );
    expect(builder).toContain(
      "prior_closing.snapshot->>'closing_ledger_balance'",
    );
  });

  it("includes reconciled public expense data and excludes private fields", () => {
    const builder = migrationFunctionBody("build_monthly_settlement_snapshot");

    for (const key of [
      "'expense_total'",
      "'expense_count'",
      "'expense_category_rows'",
      "'expense_rows'",
      "'expense_date'",
      "'category'",
      "'description'",
      "'amount'",
    ]) {
      expect(builder).toContain(key);
    }

    for (const prohibitedKey of [
      "'member_name'",
      "'member_code'",
      "'member_id'",
      "'memo'",
      "'receipt_file_key'",
      "'receipt_file_name'",
      "'receipt_content_type'",
      "'receipt_size'",
    ]) {
      expect(builder).not.toContain(prohibitedKey);
    }
  });

  it("emits the exact versioned snapshot keys consumed by the runtime parser", () => {
    const builder = migrationFunctionBody("build_monthly_settlement_snapshot");

    for (const key of [
      "'schema_version'",
      "'period_month'",
      "'monthly_fee_amount'",
      "'activity_member_count'",
      "'fee_target_count'",
      "'fully_paid_count'",
      "'unpaid_count'",
      "'billed_total'",
      "'actual_fee_income'",
      "'recognized_paid_total'",
      "'adjustment_income'",
      "'unpaid_total'",
      "'expense_total'",
      "'expense_count'",
      "'attributed_net'",
      "'opening_ledger_balance'",
      "'closing_ledger_balance'",
      "'expense_category_rows'",
      "'expense_rows'",
    ]) {
      expect(builder).toContain(key);
    }
  });

  it("requires an active profile for preview and returns the complete page DTO", () => {
    const page = migrationFunctionBody("get_monthly_settlement_page");

    expect(page).toContain("profiles.id = auth.uid()");
    expect(page).toContain("profiles.status = 'active'");
    expect(page).toContain("active operator required");
    expect(page).toMatch(
      /public\.build_monthly_settlement_snapshot\(\s*normalized_period_month\s*\)/,
    );
    for (const key of [
      "'preview'",
      "'active_closing'",
      "'can_close'",
      "'can_reopen'",
      "'close_blocked_reason'",
      "'closed_by'",
    ]) {
      expect(page).toContain(key);
    }
    expect(page).toContain("'closed_by', closings.closed_by_name");
  });

  it("returns an active stored snapshot without evaluating the live builder", () => {
    const page = migrationFunctionBody("get_monthly_settlement_page");
    const activeClosingQuery = page.indexOf(
      "from public.monthly_closings as closings",
    );
    const builderCall = page.indexOf(
      "public.build_monthly_settlement_snapshot(",
    );

    expect(activeClosingQuery).toBeGreaterThan(-1);
    expect(builderCall).toBeGreaterThan(activeClosingQuery);
    expect(page).toMatch(
      /if active_final_closing is null then\s+preview_snapshot := public\.build_monthly_settlement_snapshot\([\s\S]*?\);\s+else\s+preview_snapshot := active_final_closing->'snapshot';\s+end if/,
    );
  });

  it("closes current or past Seoul months under the exact permission and serializes the final ledger chain", () => {
    const close = migrationFunctionBody("close_monthly_settlement");

    expect(close).toContain("public.has_permission('settlements.close')");
    expect(close).toContain("settlements.close permission required");
    expect(close).toContain("profiles.display_name");
    expect(close).toContain("closed_by_name");
    expect(close).toContain("at time zone 'asia/seoul'");
    expect(close).toContain("future month cannot be closed");
    expect(close).toContain(
      "normalized_period_month > current_period_month",
    );
    expect(close).toContain("pg_advisory_xact_lock");
    expect(close).toContain("'monthly-settlement-chain'");
    expect(close).toContain(
      "'monthly-settlement:' || normalized_period_month::text",
    );
    expect(close).toContain(
      "lock table public.members, public.fee_payments, public.expenses in share mode",
    );
    expect(close).toMatch(
      /public\.build_monthly_settlement_snapshot\(\s*normalized_period_month\s*\)/,
    );
    expect(close).toMatch(
      /select coalesce\(max\(closings\.version\), 0\) \+ 1\s+into next_version\s+from public\.monthly_closings as closings\s+where closings\.period_month = normalized_period_month\s+and closings\.closing_kind = 'final'\s*;/,
    );
  });

  it("rechecks and locks close authorization after every advisory and source-table wait", () => {
    const close = migrationFunctionBody("close_monthly_settlement");
    const sourceLock = close.indexOf(
      "lock table public.members, public.fee_payments, public.expenses in share mode",
    );
    const postLockProfileCheck = close.indexOf(
      "from public.profiles as profiles",
      sourceLock,
    );
    const insert = close.indexOf("insert into public.monthly_closings");

    expect(sourceLock).toBeGreaterThan(-1);
    expect(postLockProfileCheck).toBeGreaterThan(sourceLock);
    expect(insert).toBeGreaterThan(postLockProfileCheck);
    expect(close.slice(postLockProfileCheck, insert)).toContain(
      "role_permissions.permission = 'settlements.close'",
    );
    expect(close.slice(postLockProfileCheck, insert)).toContain(
      "for share of profiles, role_permissions",
    );
  });

  it("reopens only the active closing, blocks later active months, and preserves history", () => {
    const reopen = migrationFunctionBody("reopen_monthly_settlement");

    expect(reopen).toContain("public.has_permission('settlements.reopen')");
    expect(reopen).toContain("settlements.reopen permission required");
    expect(reopen).toContain("pg_advisory_xact_lock");
    expect(reopen).toContain("'monthly-settlement-chain'");
    expect(reopen).toContain("closings.status = 'closed'");
    expect(reopen).toContain(
      "later monthly settlement closing blocks reopen",
    );
    expect(reopen).toMatch(
      /later_closings\.period_month > normalized_period_month[\s\S]*later_closings\.status = 'closed'/,
    );
    expect(reopen).toMatch(
      /update public\.monthly_closings[\s\S]*status = 'reopened'/,
    );
    expect(reopen).not.toMatch(/delete from public\.monthly_closings/);
  });

  it("rechecks and locks reopen authorization after advisory waits", () => {
    const reopen = migrationFunctionBody("reopen_monthly_settlement");
    const lastAdvisoryLock = reopen.lastIndexOf("pg_advisory_xact_lock");
    const postLockProfileCheck = reopen.indexOf(
      "from public.profiles as profiles",
      lastAdvisoryLock,
    );
    const update = reopen.indexOf("update public.monthly_closings");

    expect(lastAdvisoryLock).toBeGreaterThan(-1);
    expect(postLockProfileCheck).toBeGreaterThan(lastAdvisoryLock);
    expect(update).toBeGreaterThan(postLockProfileCheck);
    expect(reopen.slice(postLockProfileCheck, update)).toContain(
      "role_permissions.permission = 'settlements.reopen'",
    );
    expect(reopen.slice(postLockProfileCheck, update)).toContain(
      "for share of profiles, role_permissions",
    );
  });

  it("captures mutation timestamps after waits and immediately before writes", () => {
    for (const [functionName, assignment, mutation] of [
      [
        "close_monthly_settlement",
        "closing_occurred_at := pg_catalog.clock_timestamp()",
        "insert into public.monthly_closings",
      ],
      [
        "reopen_monthly_settlement",
        "reopen_occurred_at := pg_catalog.clock_timestamp()",
        "update public.monthly_closings",
      ],
    ] as const) {
      const body = migrationFunctionBody(functionName);
      const lastAdvisoryLock = body.lastIndexOf("pg_advisory_xact_lock");
      const timestampAssignment = body.indexOf(assignment);
      const mutationIndex = body.indexOf(mutation);

      expect(body).not.toMatch(
        new RegExp(
          `${assignment.split(" := ")[0]} timestamptz := pg_catalog\\.clock_timestamp`,
        ),
      );
      expect(timestampAssignment).toBeGreaterThan(lastAdvisoryLock);
      expect(mutationIndex).toBeGreaterThan(timestampAssignment);
    }
  });

  it("returns a coherent stored snapshot DTO after reopen without a fallible live rebuild", () => {
    const reopen = migrationFunctionBody("reopen_monthly_settlement");
    const update = reopen.indexOf("update public.monthly_closings");
    const afterUpdate = reopen.slice(update);

    expect(afterUpdate).not.toContain(
      "public.get_monthly_settlement_page(normalized_period_month)",
    );
    expect(afterUpdate).not.toContain(
      "public.build_monthly_settlement_snapshot(",
    );
    expect(afterUpdate).toContain("'preview', active_closing.snapshot");
    expect(afterUpdate).toContain("'active_closing', null");
    expect(afterUpdate).toContain("'can_reopen', false");
  });

  it("writes close and reopen audit rows atomically with period and version details", () => {
    for (const [functionName, action] of [
      ["close_monthly_settlement", "monthly_settlement.closed"],
      ["reopen_monthly_settlement", "monthly_settlement.reopened"],
    ] as const) {
      const body = migrationFunctionBody(functionName);

      expect(body).toContain("insert into public.audit_logs");
      expect(body).toContain(`'${action}'`);
      expect(body).toContain("'monthly_closings'");
      expect(body).toContain("'period_month'");
      expect(body).toContain("'version'");
      expect(body).toContain("actor_profile_id");
    }
  });

  it("atomically locks the exact immutable closing and audits PDF generation before returning its DTO", () => {
    const reportAudit = migrationFunctionBody("record_monthly_report_generation");

    expect(reportAudit).toContain("security definer");
    expect(reportAudit).toContain("set search_path = ''");
    expect(reportAudit).toContain("profiles.id = auth.uid()");
    expect(reportAudit).toContain("profiles.status = 'active'");
    expect(reportAudit).toContain("closings.id = requested_closing_id");
    expect(reportAudit).toContain("closings.closing_kind = 'interim'");
    expect(reportAudit).toContain("closings.closing_kind = 'final'");
    expect(reportAudit).toContain(
      "closings.status in ('closed', 'reopened')",
    );
    expect(reportAudit).toContain("for update");
    expect(reportAudit).toContain("insert into public.audit_logs");
    expect(reportAudit).toContain("'monthly_report.generated'");
    expect(reportAudit).toContain("'period_month'");
    expect(reportAudit).toContain("'closing_kind'");
    expect(reportAudit).toContain("'version'");
    expect(reportAudit).toContain("'status'");
    expect(reportAudit).toContain("'snapshot'");
    expect(reportAudit).not.toContain("return true");
  });

  it("keeps legacy compatibility RPCs and exposes every rollout RPC only to authenticated users", () => {
    const normalizedMigrationSql = additiveMigrationSql.replace(/\s+/g, " ");
    for (const signature of [
      "get_monthly_settlement_page(date)",
      "get_monthly_settlement_page_v2(date)",
      "create_interim_monthly_settlement(date)",
      "close_monthly_settlement(date)",
      "reopen_monthly_settlement(date)",
      "record_monthly_report_generation(uuid)",
      "record_monthly_report_generation( uuid, date, integer )",
    ]) {
      expect(normalizedMigrationSql).toContain(
        `revoke execute on function public.${signature} from public, anon`,
      );
      expect(normalizedMigrationSql).toContain(
        `grant execute on function public.${signature} to authenticated`,
      );
    }
    expect(additiveMigrationSql).not.toContain(
      "drop function public.record_monthly_report_generation(uuid, date, integer)",
    );
    expect(additiveMigrationSql).not.toMatch(
      /revoke execute on function public\.record_monthly_report_generation\(\s*uuid, date, integer\s*\)\s+from public, anon, authenticated, service_role\s*;\s*(?:drop function|$)/,
    );
  });
});
