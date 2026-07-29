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

  it("does not target a named member or mutate historical financial and meeting data", () => {
    expect(migrationSql).not.toContain("엄다해");
    expect(migrationSql).not.toMatch(
      /(?:update|delete from)\s+public\.fee_payments/,
    );
    expect(migrationSql).not.toMatch(
      /(?:update|delete from)\s+public\.meeting_month_rosters/,
    );
    expect(migrationSql).not.toMatch(
      /(?:update|delete from)\s+public\.meeting_month_roster_members/,
    );
    expect(migrationSql).not.toMatch(
      /(?:update|delete from)\s+public\.meeting_attendance/,
    );
  });
});
