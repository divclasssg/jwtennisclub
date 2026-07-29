import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607290001_add_member_pause_start_month.sql",
  ),
  "utf8",
).toLowerCase();

function migrationFunctionBody(functionName: string) {
  const start = migrationSql.indexOf(
    `create or replace function public.${functionName}`,
  );
  const end = migrationSql.indexOf("$$;", start);

  expect(start, functionName).toBeGreaterThan(-1);
  expect(end, functionName).toBeGreaterThan(start);
  return migrationSql.slice(start, end);
}

describe("member pause start month migration", () => {
  it("adds and backfills a month-aligned pause start date for every paused member", () => {
    expect(migrationSql).toContain("add column pause_start_month date");
    expect(migrationSql).toContain("where status = 'paused'");
    expect(migrationSql).toContain("date '2026-08-01'");
    expect(migrationSql).toContain(
      "pause_start_month = date_trunc('month', pause_start_month)::date",
    );
    expect(migrationSql).toMatch(
      /status = 'paused'[\s\S]*pause_start_month is not null/,
    );
  });

  it("persists and returns pause_start_month through the callable member RPCs", () => {
    expect(migrationSql).toContain(
      "(member_data->>'pause_start_month')::date",
    );
    expect(migrationSql).toContain(
      "'pause_start_month', members.pause_start_month",
    );
    expect(migrationSql).toContain(
      "function public.save_member_with_contact(uuid, jsonb, text)",
    );
    expect(migrationSql).toContain(
      "function public.get_member_directory_page(text, text)",
    );
    expect(migrationSql).not.toContain(
      "create or replace function public.admin_reset_member_roster",
    );
  });

  it("preserves a paused member's start month when rolling old clients omit the key", () => {
    const functionSql = migrationFunctionBody("save_member_with_contact");

    expect(functionSql).toMatch(
      /pause_start_month = case\s+when coalesce\(\s*\(member_data->>'status'\)::public\.member_status,\s*saved_members\.status\s*\) <> 'paused'\s+then null\s+when member_data \? 'pause_start_month'\s+then \(member_data->>'pause_start_month'\)::date\s+else saved_members\.pause_start_month\s+end/,
    );
  });

  it("keeps future-paused members in preparing meeting rosters for their eligible month", () => {
    const functionSql = migrationFunctionBody(
      "sync_preparing_meeting_roster",
    );
    const eligibilityCondition =
      /members\.status = 'active'\s+or\s+\(\s*members\.status = 'paused'\s+and members\.pause_start_month > requested_period_month\s*\)/g;

    expect(functionSql).toContain("and rosters.status = 'preparing'");
    expect(functionSql.match(eligibilityCondition)).toHaveLength(2);
    expect(functionSql).toMatch(
      /where\s+\(\s*members\.status = 'active'\s+or\s+\(\s*members\.status = 'paused'\s+and members\.pause_start_month > requested_period_month\s*\)\s*\)\s+on conflict/,
    );
  });

  it("uses the requested month when initially populating a locked meeting roster", () => {
    const functionSql = migrationFunctionBody(
      "ensure_locked_meeting_roster",
    );

    expect(functionSql).toMatch(
      /where\s+\(\s*members\.status = 'active'\s+or\s+\(\s*members\.status = 'paused'\s+and members\.pause_start_month > requested_period_month\s*\)\s*\)\s+on conflict/,
    );
    expect(functionSql).toContain("if roster_row.status = 'preparing' then");
  });

  it("does not target a named member or mutate historical financial and meeting data", () => {
    expect(migrationSql).not.toContain("엄다해");
    expect(migrationSql).not.toMatch(
      /(?:update|delete from)\s+public\.fee_payments/,
    );
    expect(migrationSql).not.toMatch(
      /(?:update|delete from)\s+public\.meeting_attendance/,
    );
    expect(migrationSql).not.toContain(
      "delete from public.meeting_month_rosters",
    );
    expect(
      migrationSql.match(
        /delete from public\.meeting_month_roster_members/g,
      ),
    ).toHaveLength(1);
  });
});
