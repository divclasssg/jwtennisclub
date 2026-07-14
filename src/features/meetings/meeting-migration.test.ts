import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202607130002_add_club_meetings.sql",
);
const migrationSql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").toLowerCase()
  : "";

const meetingTables = [
  "club_meetings",
  "meeting_month_rosters",
  "meeting_month_roster_members",
  "meeting_attendance",
  "meeting_lifecycle_events",
] as const;

describe("club meeting migration", () => {
  it("defines the bounded domain types and five persistent models", () => {
    for (const typeName of [
      "meeting_kind",
      "meeting_roster_status",
      "meeting_roster_origin",
      "meeting_rsvp_status",
      "meeting_attendance_status",
      "meeting_target_origin",
      "meeting_attendance_origin",
      "meeting_lifecycle_event_type",
    ]) {
      expect(migrationSql).toContain(`create type public.${typeName}`);
    }

    for (const tableName of meetingTables) {
      expect(migrationSql).toContain(`create table public.${tableName}`);
    }
  });

  it("prevents duplicate regular meetings and a second linked lightning meeting", () => {
    expect(migrationSql).toContain("club_meetings_regular_occurrence_unique");
    expect(migrationSql).toContain(
      "club_meetings_linked_regular_meeting_unique",
    );
    expect(migrationSql).toContain("where meeting_kind = 'regular'");
    expect(migrationSql).toContain("where meeting_kind = 'lightning'");
    expect(migrationSql).toContain("linked regular meeting must be cancelled");
    expect(migrationSql).toContain("linked regular meeting month mismatch");
    expect(migrationSql).toContain(
      "linked regular meeting cannot reference itself",
    );
  });

  it("protects monthly roster attendance from cross-member and cross-month links", () => {
    expect(migrationSql).toContain(
      "constraint meeting_month_roster_members_id_member_unique unique (id, member_id)",
    );
    expect(migrationSql).toContain(
      "foreign key (roster_member_id, member_id)",
    );
    expect(migrationSql).toContain(
      "references public.meeting_month_roster_members(id, member_id)",
    );
    expect(migrationSql).toContain("meeting_attendance_target_origin_link");
    expect(migrationSql).toContain("monthly roster month mismatch");
  });

  it("keeps bootstrap rosters out of statistics and preserves deletion history", () => {
    expect(migrationSql).toContain("meeting_month_rosters_statistics_origin");
    expect(migrationSql).toContain("roster_origin = 'bootstrap'");
    expect(migrationSql).toContain("statistics_eligible = false");
    expect(migrationSql).toContain(
      "member_id uuid not null references public.members(id) on delete restrict",
    );
    expect(migrationSql).toContain(
      "actor_profile_id uuid not null references public.profiles(id) on delete restrict",
    );
  });

  it("requires valid arrival state and independent non-null concurrency tokens", () => {
    expect(migrationSql).toContain("meeting_attendance_arrival_matches_status");
    expect(migrationSql).toContain("arrival time outside meeting window");
    expect(migrationSql).toContain(
      "rsvp_updated_at timestamptz not null default clock_timestamp()",
    );
    expect(migrationSql).toContain(
      "attendance_updated_at timestamptz not null default clock_timestamp()",
    );
  });

  it("makes lifecycle history append-only and denies authenticated direct writes", () => {
    expect(migrationSql).toContain(
      "meeting lifecycle events are append-only",
    );

    for (const tableName of meetingTables) {
      expect(migrationSql).toContain(
        `alter table public.${tableName} enable row level security`,
      );
      expect(migrationSql).toContain(
        `revoke insert, update, delete on table public.${tableName} from public, anon, authenticated`,
      );
      expect(migrationSql).toContain(
        `grant select on table public.${tableName} to authenticated`,
      );
    }

    expect(
      migrationSql.match(/create policy "meeting viewers can read/g),
    ).toHaveLength(5);
    expect(migrationSql).toContain(
      "using (public.has_permission('meetings.view'))",
    );
  });

  it("keeps every U1 trigger helper private with a fixed empty search path", () => {
    const helpers = [
      "validate_club_meeting_relationship",
      "prevent_club_meeting_period_month_change",
      "validate_meeting_attendance_invariants",
      "prevent_meeting_lifecycle_event_mutation",
    ];

    for (const helper of helpers) {
      const start = migrationSql.indexOf(
        `create or replace function public.${helper}()`,
      );
      const end = migrationSql.indexOf("$$;", start);
      const functionSql = migrationSql.slice(start, end);

      expect(start, helper).toBeGreaterThan(-1);
      expect(functionSql).toContain("set search_path = ''");
      expect(migrationSql).toMatch(
        new RegExp(
          String.raw`revoke execute on function public\.${helper}\(\)\s+from public, anon, authenticated`,
        ),
      );
    }
  });

  it("seeds all meeting permissions for both default operator roles", () => {
    for (const permission of [
      "meetings.view",
      "meetings.manage",
      "meetings.attendance.manage",
    ]) {
      expect(migrationSql).toContain(`('${permission}')`);
    }
    expect(migrationSql).toContain("where roles.name in ('admin', 'operator')");
  });
});
