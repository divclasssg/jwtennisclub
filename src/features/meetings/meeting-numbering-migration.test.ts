import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607150002_update_club_meeting_numbering.sql",
  ),
  "utf8",
).toLowerCase();

function functionSql(functionName: string) {
  const start = migrationSql.indexOf(
    `create or replace function public.${functionName}`,
  );
  const end = migrationSql.indexOf("$$;", start);

  expect(start, functionName).toBeGreaterThan(-1);
  expect(end, functionName).toBeGreaterThan(start);
  return migrationSql.slice(start, end);
}

describe("meeting numbering migration", () => {
  it("removes only the excluded launch meeting after rejecting linked lightning data", () => {
    expect(migrationSql).toContain(
      "meeting date 2026-07-04 has linked lightning meeting",
    );
    expect(migrationSql).toContain("delete from public.meeting_attendance");
    expect(migrationSql).toContain(
      "delete from public.meeting_lifecycle_events",
    );
    expect(migrationSql).toContain("delete from public.club_meetings");

    const linkedGuard = migrationSql.indexOf(
      "meeting date 2026-07-04 has linked lightning meeting",
    );
    const attendanceDelete = migrationSql.indexOf(
      "delete from public.meeting_attendance",
    );
    const lifecycleDelete = migrationSql.indexOf(
      "delete from public.meeting_lifecycle_events",
    );
    const meetingDelete = migrationSql.indexOf(
      "delete from public.club_meetings",
    );

    expect(linkedGuard).toBeLessThan(attendanceDelete);
    expect(attendanceDelete).toBeLessThan(lifecycleDelete);
    expect(lifecycleDelete).toBeLessThan(meetingDelete);
    expect(migrationSql).toContain(
      "where meeting_id = launch_excluded_meeting_id",
    );
    expect(migrationSql).toContain(
      "where id = launch_excluded_meeting_id",
    );
  });

  it("adds, backfills, and constrains persistent cumulative meeting numbers", () => {
    expect(migrationSql).toContain("add column meeting_number integer");
    expect(migrationSql).toContain("club_meetings_regular_number_unique");
    expect(migrationSql).toContain("meeting_number is null");
    expect(migrationSql).toContain(
      "create or replace function public.meeting_regular_number",
    );
    expect(migrationSql).toContain("date '2026-07-01'");

    const helperSql = functionSql("meeting_regular_number");
    expect(helperSql).toContain("returns integer");
    expect(helperSql).toContain("immutable");
    expect(helperSql).toContain("set search_path = ''");
    expect(migrationSql).toContain(
      "revoke execute on function public.meeting_regular_number(date, smallint)\nfrom public, anon, authenticated, service_role",
    );
  });

  it("generates only numbered regular meetings with cumulative titles", () => {
    const ensureSql = functionSql("ensure_regular_club_meetings");

    expect(ensureSql).toContain(
      "generated_meeting_number := public.meeting_regular_number",
    );
    expect(ensureSql).toContain(
      "continue when generated_meeting_number is null",
    );
    expect(ensureSql).toMatch(
      /regular_occurrence,\s*meeting_number,\s*meeting_date/,
    );
    expect(ensureSql).toContain(
      "generated_meeting_number::text || '차 정모'",
    );
    expect(ensureSql).toContain("security definer");
    expect(ensureSql).toContain("set search_path = ''");
    expect(ensureSql).toContain(
      "on conflict (period_month, regular_occurrence)",
    );
  });

  it("exposes regular and linked meeting numbers without changing RPC security", () => {
    expect(migrationSql).toContain("linked_regular_meeting_number");
    expect(migrationSql).toContain("locked_regular_meeting.meeting_number");

    for (const functionName of [
      "create_lightning_club_meeting",
      "get_club_meeting_directory_page",
    ]) {
      const sql = functionSql(functionName);
      expect(sql).toContain("security definer");
      expect(sql).toContain("set search_path = ''");
    }

    expect(migrationSql).toContain(
      "left join public.club_meetings as linked_regular_meetings\n    on linked_regular_meetings.id = meetings.linked_regular_meeting_id",
    );
    expect(migrationSql).toContain(
      "grant execute on function public.create_lightning_club_meeting(uuid, date, time, time, text) to authenticated",
    );
    expect(migrationSql).toContain(
      "grant execute on function public.get_club_meeting_directory_page(date, text) to authenticated",
    );
  });
});
