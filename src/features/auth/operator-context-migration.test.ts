import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202607130001_optimize_navigation_queries.sql";
const migrationSql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").toLowerCase()
  : "";

const meetingMigrationPath =
  "supabase/migrations/202607130002_add_club_meetings.sql";
const meetingMigrationSql = existsSync(meetingMigrationPath)
  ? readFileSync(meetingMigrationPath, "utf8").toLowerCase()
  : "";

describe("navigation query optimization migration", () => {
  it("defines a request-safe current operator context function", () => {
    expect(migrationSql).toContain("function public.get_current_operator_context()");
    expect(migrationSql).toContain("security definer");
    expect(migrationSql).toContain("set search_path = ''");
    expect(migrationSql).toContain("auth.uid()");
    expect(migrationSql).toContain("profiles.status = 'active'");
    expect(migrationSql).toContain("jsonb_agg(role_permissions.permission");
  });

  it("exposes the function only to authenticated users", () => {
    expect(migrationSql).toContain("revoke execute on function public.get_current_operator_context() from public, anon");
    expect(migrationSql).toContain("grant execute on function public.get_current_operator_context() to authenticated");
  });

  it("defines an authenticated member directory function with server-side contact masking", () => {
    expect(migrationSql).toContain("function public.get_member_directory_page(");
    expect(migrationSql).toContain("auth.uid()");
    expect(migrationSql).toContain("members.contacts.manage");
    expect(migrationSql).toContain("public.mask_phone_number(member_contacts.phone_number)");
    expect(migrationSql).toContain("set search_path = ''");
    expect(migrationSql).toContain("grant execute on function public.get_member_directory_page(text, text) to authenticated");
  });
});

describe("meeting automation function security", () => {
  it("keeps internal meeting automation helpers private with fixed empty search paths", () => {
    const privateHelpers = [
      "meeting_kst_today",
      "meeting_regular_date",
      "lock_meeting_period_months",
      "lock_meeting_automation_rows",
      "ensure_regular_club_meetings",
      "sync_preparing_meeting_roster",
      "ensure_locked_meeting_roster",
      "seed_monthly_meeting_attendance",
      "prepare_meeting_rosters_before_member_change",
      "sync_meeting_rosters_after_member_change",
    ];

    for (const helper of privateHelpers) {
      const start = meetingMigrationSql.indexOf(
        `create or replace function public.${helper}`,
      );
      const end = meetingMigrationSql.indexOf("$$;", start);
      const functionSql = meetingMigrationSql.slice(start, end);

      expect(start, helper).toBeGreaterThan(-1);
      expect(functionSql).toContain("set search_path = ''");
      expect(meetingMigrationSql).toMatch(
        new RegExp(
          String.raw`revoke execute on function public\.${helper}\([^;]*?\)\s+from public, anon, authenticated`,
        ),
      );
    }
  });

  it("uses fully qualified auth and table references inside security-definer member functions", () => {
    for (const helper of [
      "save_member_with_contact",
      "ensure_operator_member",
      "sync_operator_member_name",
    ]) {
      const start = meetingMigrationSql.indexOf(
        `create or replace function public.${helper}`,
      );
      const end = meetingMigrationSql.indexOf("$$;", start);
      const functionSql = meetingMigrationSql.slice(start, end);

      expect(functionSql).toContain("set search_path = ''");
      expect(functionSql).toContain("public.members");
      expect(functionSql).not.toMatch(/(?<!public\.)\b(from|into|update|join)\s+members\b/);
    }

    const saveStart = meetingMigrationSql.indexOf(
      "create or replace function public.save_member_with_contact",
    );
    const saveEnd = meetingMigrationSql.indexOf("$$;", saveStart);
    expect(meetingMigrationSql.slice(saveStart, saveEnd)).toContain("auth.uid()");
  });
});
