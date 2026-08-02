import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607300001_add_member_activity_start_month.sql",
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

describe("member activity start month migration", () => {
  it("adds a nullable month-aligned start date that cannot precede joining", () => {
    expect(migrationSql).toContain("add column activity_start_month date");
    expect(migrationSql).toContain("members_activity_start_month_is_month");
    expect(migrationSql).toContain(
      "activity_start_month >= date_trunc('month', joined_date)::date",
    );
    expect(migrationSql).not.toContain(
      "alter column activity_start_month set not null",
    );
  });

  it("persists activity start month and emits it from the member directory", () => {
    const saveMember = migrationFunctionBody("save_member_with_contact");
    const directory = migrationFunctionBody("get_member_directory_page");

    expect(saveMember).toContain("(member_data->>'activity_start_month')::date");
    expect(directory).toContain(
      "'activity_start_month', members.activity_start_month",
    );
  });

  it("creates operator-linked members with an explicitly unconfirmed activity month", () => {
    const ensureOperatorMember = migrationFunctionBody(
      "ensure_operator_member",
    );

    expect(ensureOperatorMember).toContain("security definer");
    expect(ensureOperatorMember).toContain("set search_path = ''");
    expect(ensureOperatorMember).toContain(
      "perform public.prepare_meeting_rosters_before_member_change(",
    );
    expect(ensureOperatorMember).toContain(
      "perform public.sync_meeting_rosters_after_member_change(kst_today)",
    );
    expect(ensureOperatorMember).toMatch(
      /insert into public\.members \(\s*name,\s*status,\s*joined_date,\s*activity_start_month,\s*memo,\s*operator_profile_id\s*\)[\s\S]*values \(\s*new\.display_name,\s*'active',\s*kst_today,\s*null,/,
    );
    expect(migrationSql).toContain(
      "revoke execute on function public.ensure_operator_member()\nfrom public, anon, authenticated, service_role",
    );
  });

  it("requires a non-null eligible activity month when preparing or first locking a roster", () => {
    for (const functionName of [
      "sync_preparing_meeting_roster",
      "ensure_locked_meeting_roster",
    ]) {
      const functionSql = migrationFunctionBody(functionName);

      expect(functionSql).toContain("members.activity_start_month is not null");
      expect(functionSql).toContain(
        "members.activity_start_month <= requested_period_month",
      );
    }
  });

  it("preserves the existing monthly meeting preparation boundary", () => {
    const prepare = migrationFunctionBody("prepare_club_meeting_month");

    expect(prepare).toContain(
      "perform public.bootstrap_club_meeting_automation(",
    );
    expect(prepare).toContain("perform public.ensure_regular_club_meetings(");
  });

  it("keeps internal roster helpers private while retaining the authenticated preparation RPC", () => {
    for (const signature of [
      "sync_preparing_meeting_roster(date)",
      "ensure_locked_meeting_roster(date, uuid, boolean)",
    ]) {
      expect(migrationSql).toContain(
        `revoke execute on function public.${signature}\nfrom public, anon, authenticated, service_role`,
      );
      expect(migrationSql).not.toContain(
        `grant execute on function public.${signature} to authenticated`,
      );
    }

    expect(migrationSql).toContain(
      "grant execute on function public.prepare_club_meeting_month(date)\nto authenticated",
    );
  });
});
