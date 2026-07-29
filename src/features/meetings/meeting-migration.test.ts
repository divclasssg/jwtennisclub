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
const pauseMonthMigrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607290001_add_member_pause_start_month.sql",
  ),
  "utf8",
).toLowerCase();

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
    expect(migrationSql).toContain(
      "create trigger meeting_month_rosters_prevent_period_month_change",
    );
  });

  it("seeds the locked monthly roster into regular and same-month lightning meetings", () => {
    const start = migrationSql.indexOf(
      "create or replace function public.seed_monthly_meeting_attendance",
    );
    const end = migrationSql.indexOf("$$;", start);
    const functionSql = migrationSql.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(functionSql).toContain(
      "meetings.meeting_kind in ('regular', 'lightning')",
    );
    expect(functionSql).not.toContain("meetings.meeting_kind = 'regular'");
  });

  it("validates immutable attendance references without reversing automation locks", () => {
    const start = migrationSql.indexOf(
      "create or replace function public.validate_meeting_attendance_invariants()",
    );
    const end = migrationSql.indexOf("$$;", start);
    const functionSql = migrationSql.slice(start, end);

    expect(migrationSql).toContain(
      "create or replace function public.prevent_meeting_roster_period_month_change()",
    );
    expect(functionSql).not.toContain("for share");
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
      "prevent_meeting_roster_period_month_change",
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

  it("emits executable roster sync and regular-meeting bootstrap statements", () => {
    const bootstrapStart = migrationSql.indexOf(
      "create or replace function public.bootstrap_club_meeting_automation",
    );
    const bootstrapEnd = migrationSql.indexOf(
      "create or replace function public.prepare_meeting_rosters_before_member_change",
      bootstrapStart,
    );
    const bootstrapFunction = migrationSql.slice(bootstrapStart, bootstrapEnd);

    expect(migrationSql).not.toContain(
      "insert into public.meeting_month_roster_members (\n  insert into",
    );
    expect(bootstrapFunction).toMatch(
      /perform public\.ensure_regular_club_meetings\(\s*target_period_month,\s*actor_profile_id\s*\)/,
    );
  });

  it("keeps the normalized month variable distinct from conflict-target columns", () => {
    const start = migrationSql.indexOf(
      "create or replace function public.ensure_regular_club_meetings",
    );
    const end = migrationSql.indexOf("$$;", start);
    const functionSql = migrationSql.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(functionSql).toContain(
      "normalized_period_month date := pg_catalog.date_trunc",
    );
    expect(functionSql).not.toContain("\n  period_month date :=");
    expect(functionSql).toContain(
      "on conflict (period_month, regular_occurrence)",
    );
  });

  it("defines one authenticated RPC per meeting mutation with precise grants", () => {
    const rpcSignatures = [
      "update_club_meeting_location(uuid, text)",
      "add_meeting_ad_hoc_member(uuid, uuid)",
      "remove_meeting_ad_hoc_member(uuid, uuid)",
      "save_meeting_rsvp(uuid, uuid, meeting_rsvp_status, timestamptz)",
      "save_meeting_attendance(uuid, uuid, meeting_attendance_status, time, timestamptz)",
      "cancel_club_meeting(uuid, text)",
      "restore_club_meeting(uuid)",
      "close_club_meeting_attendance(uuid)",
      "reopen_club_meeting_attendance(uuid)",
      "create_lightning_club_meeting(uuid, date, time, time, text)",
    ];

    for (const signature of rpcSignatures) {
      expect(migrationSql).toContain(
        `revoke execute on function public.${signature} from public, anon`,
      );
      expect(migrationSql).toContain(
        `grant execute on function public.${signature} to authenticated`,
      );
    }
  });

  it("keeps RPC authentication, permission checks, locks and audit data inside the database", () => {
    expect(migrationSql).toMatch(
      /create or replace function public\.require_meeting_operator\(\s*required_permissions text\[\]\s*\)/,
    );
    expect(migrationSql).toContain("profiles.id = auth.uid()");
    expect(migrationSql).toContain("profiles.status = 'active'");
    expect(migrationSql).toContain("meetings.view permission required");
    expect(migrationSql).toContain("for update");
    expect(migrationSql).toContain("actor_profile_id");
    expect(migrationSql).toContain("pg_catalog.clock_timestamp()");

    for (const functionName of [
      "require_meeting_operator",
      "update_club_meeting_location",
      "add_meeting_ad_hoc_member",
      "remove_meeting_ad_hoc_member",
      "save_meeting_rsvp",
      "save_meeting_attendance",
      "cancel_club_meeting",
      "restore_club_meeting",
      "close_club_meeting_attendance",
      "reopen_club_meeting_attendance",
      "create_lightning_club_meeting",
    ]) {
      const start = migrationSql.indexOf(
        `create or replace function public.${functionName}`,
      );
      const end = migrationSql.indexOf("$$;", start);
      const functionSql = migrationSql.slice(start, end);
      expect(start, functionName).toBeGreaterThan(-1);
      expect(functionSql).toContain("security definer");
      expect(functionSql).toContain("set search_path = ''");
    }
  });

  it("requires the exact split permission combinations for every write boundary", () => {
    const functionBody = (functionName: string) => {
      const start = migrationSql.indexOf(
        `create or replace function public.${functionName}`,
      );
      const end = migrationSql.indexOf("$$;", start);
      return migrationSql.slice(start, end);
    };

    for (const functionName of [
      "update_club_meeting_location",
      "cancel_club_meeting",
      "restore_club_meeting",
      "create_lightning_club_meeting",
    ]) {
      expect(functionBody(functionName)).toContain("array['meetings.manage']");
    }

    for (const functionName of [
      "add_meeting_ad_hoc_member",
      "remove_meeting_ad_hoc_member",
      "save_meeting_rsvp",
      "save_meeting_attendance",
    ]) {
      expect(functionBody(functionName)).toContain(
        "array['meetings.attendance.manage']",
      );
    }

    for (const functionName of [
      "close_club_meeting_attendance",
      "reopen_club_meeting_attendance",
    ]) {
      expect(functionBody(functionName)).toContain(
        "array['meetings.manage', 'meetings.attendance.manage']",
      );
    }
  });

  it("locks the requested meeting before deriving row and lightning relationships", () => {
    for (const [functionName, lockClause] of [
      ["add_meeting_ad_hoc_member", "for update"],
      ["remove_meeting_ad_hoc_member", "for update"],
      ["save_meeting_rsvp", "for share"],
      ["save_meeting_attendance", "for share"],
      ["create_lightning_club_meeting", "for update"],
    ] as const) {
      const start = migrationSql.indexOf(
        `create or replace function public.${functionName}`,
      );
      const end = migrationSql.indexOf("$$;", start);
      const functionSql = migrationSql.slice(start, end);
      const lockAt = functionSql.indexOf("from public.club_meetings as meetings");
      const attendanceAt = functionSql.indexOf("from public.meeting_attendance");
      const memberAt = functionSql.indexOf("from public.members");

      expect(lockAt, functionName).toBeGreaterThan(-1);
      expect(functionSql.indexOf(lockClause, lockAt), functionName).toBeGreaterThan(
        lockAt,
      );
      if (attendanceAt >= 0) expect(lockAt, functionName).toBeLessThan(attendanceAt);
      if (memberAt >= 0) expect(lockAt, functionName).toBeLessThan(memberAt);
    }
  });

  it("implements independent optimistic concurrency without leaking unrelated rows", () => {
    expect(migrationSql).toContain(
      "rsvp_updated_at = expected_rsvp_updated_at",
    );
    expect(migrationSql).toContain(
      "attendance_updated_at = expected_attendance_updated_at",
    );
    expect(migrationSql).toContain("'status', 'saved'");
    expect(migrationSql).toContain("'status', 'conflict'");
    expect(migrationSql).toContain("'row', public.meeting_attendance_safe_json");
    expect(migrationSql).toContain("where attendance.meeting_id = locked_meeting.id");
    expect(migrationSql).toContain("and attendance.member_id = requested_member_id");
    expect(migrationSql).not.toContain("expected_updated_by");
    expect(migrationSql).not.toContain("requested_actor_profile_id");
    expect(migrationSql).not.toContain("requested_details");
  });

  it("enforces KST state windows, close-default reopen and lightning lifetime rules", () => {
    expect(migrationSql).toContain("at time zone 'asia/seoul'");
    expect(migrationSql).toContain("meeting has not started");
    expect(migrationSql).toContain("meeting has not ended");
    expect(migrationSql).toContain("attendance_origin = 'close_default'");
    expect(migrationSql).toContain("attendance_origin = 'manual'");
    expect(migrationSql).toContain("active lightning meeting blocks restore");
    expect(migrationSql).toContain("lightning meeting already exists");
    expect(migrationSql).toContain("ad hoc target has recorded state");
    expect(migrationSql).toContain("member is not active");
    expect(migrationSql).toContain("arrival time outside meeting window");
  });

  it("never removes an ad-hoc target after any RSVP or attendance write", () => {
    const functionBody = (functionName: string) => {
      const start = migrationSql.indexOf(
        `create or replace function public.${functionName}`,
      );
      const end = migrationSql.indexOf("$$;", start);
      return migrationSql.slice(start, end);
    };

    const removalFunction = functionBody("remove_meeting_ad_hoc_member");
    expect(removalFunction).toContain("target_attendance.rsvp_updated_by is not null");
    expect(removalFunction).toContain(
      "target_attendance.attendance_updated_by is not null",
    );
    expect(functionBody("save_meeting_rsvp")).toContain(
      "rsvp_updated_by = actor_profile_id",
    );
    expect(functionBody("save_meeting_attendance")).toContain(
      "attendance_updated_by = actor_profile_id",
    );
  });

  it("offers and adds ad-hoc targets only after the monthly roster is locked", () => {
    const functionBody = (functionName: string) => {
      const start = migrationSql.indexOf(
        `create or replace function public.${functionName}`,
      );
      const end = migrationSql.indexOf("$$;", start);
      return migrationSql.slice(start, end);
    };

    const addFunction = functionBody("add_meeting_ad_hoc_member");
    const directoryFunction = functionBody("get_club_meeting_directory_page");

    expect(addFunction).toContain("meeting roster is not locked");
    expect(addFunction).toContain("member already belongs to monthly roster");
    expect(addFunction).toContain(
      "from public.meeting_month_roster_members as roster_members",
    );
    expect(directoryFunction).toContain(
      "if can_manage_attendance and month_roster_status = 'locked' then",
    );
    expect(directoryFunction).toContain(
      "from public.meeting_month_roster_members as candidate_roster_members",
    );
  });

  it("authorizes an ad-hoc insertion against the selected meeting month", () => {
    const start = pauseMonthMigrationSql.indexOf(
      "create or replace function public.add_meeting_ad_hoc_member",
    );
    const end = pauseMonthMigrationSql.indexOf("$$;", start);
    const functionSql = pauseMonthMigrationSql.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(functionSql).toMatch(
      /and\s+\(\s*members\.status = 'active'\s+or\s+\(\s*members\.status = 'paused'\s+and members\.pause_start_month > locked_meeting\.period_month\s*\)\s*\)\s+for share of members/,
    );
    expect(functionSql).toContain(
      "where rosters.period_month = locked_meeting.period_month",
    );
  });

  it("evaluates attendance time windows after acquiring the meeting lock", () => {
    for (const [functionName, lockClause] of [
      ["save_meeting_attendance", "for share"],
      ["close_club_meeting_attendance", "for update"],
    ] as const) {
      const start = migrationSql.indexOf(
        `create or replace function public.${functionName}`,
      );
      const end = migrationSql.indexOf("$$;", start);
      const functionSql = migrationSql.slice(start, end);
      const lockPosition = functionSql.indexOf(lockClause);
      const timePosition = functionSql.indexOf("kst_now :=", lockPosition);

      expect(lockPosition, functionName).toBeGreaterThan(-1);
      expect(timePosition, functionName).toBeGreaterThan(lockPosition);
      expect(functionSql).toContain("kst_now timestamp;");
    }
  });

  it("allows independent row saves while lifecycle mutations keep exclusive locks", () => {
    const functionBody = (functionName: string) => {
      const start = migrationSql.indexOf(
        `create or replace function public.${functionName}`,
      );
      const end = migrationSql.indexOf("$$;", start);
      return migrationSql.slice(start, end);
    };

    expect(functionBody("save_meeting_rsvp")).toContain("for share");
    expect(functionBody("save_meeting_attendance")).toContain("for share");
    expect(functionBody("cancel_club_meeting")).toContain("for update");
    expect(functionBody("close_club_meeting_attendance")).toContain("for update");
  });

  it("does not append a location event for an unchanged value", () => {
    const start = migrationSql.indexOf(
      "create or replace function public.update_club_meeting_location",
    );
    const end = migrationSql.indexOf("$$;", start);
    const functionSql = migrationSql.slice(start, end);

    expect(functionSql).toContain(
      "normalized_location is not distinct from locked_meeting.location",
    );
    expect(functionSql.indexOf("is not distinct from")).toBeLessThan(
      functionSql.indexOf("insert into public.meeting_lifecycle_events"),
    );
  });
});
