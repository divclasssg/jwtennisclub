import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import {
  loadMeetingDirectoryPage,
  parseMeetingDirectoryPage,
} from "./meeting-directory";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607130002_add_club_meetings.sql",
  ),
  "utf8",
).toLowerCase();

const regularMeetingId = "11111111-1111-4111-8111-111111111111";
const memberOneId = "22222222-2222-4222-8222-222222222222";
const memberTwoId = "33333333-3333-4333-8333-333333333333";
const lifecycleEventId = "44444444-4444-4444-8444-444444444444";

function validDatabasePage(overrides: Record<string, unknown> = {}) {
  return {
    period_month: "2026-07-01",
    can_manage_meeting: true,
    can_manage_attendance: false,
    roster: {
      status: "locked",
      roster_origin: "bootstrap",
      statistics_eligible: false,
    },
    summary: {
      total: 1,
      scheduled: 1,
      completed: 0,
      cancelled: 0,
    },
    meetings: [
      {
        id: regularMeetingId,
        meeting_kind: "regular",
        period_month: "2026-07-01",
        regular_occurrence: 3,
        meeting_number: 1,
        linked_regular_meeting_number: null,
        meeting_date: "2026-07-18",
        start_time: "18:00:00",
        end_time: "22:00:00",
        title: "1차 정모",
        location: null,
        linked_regular_meeting_id: null,
        status: "scheduled",
        counts: {
          total: 2,
          rsvp_unanswered: 1,
          rsvp_attending: 1,
          rsvp_late: 0,
          rsvp_declined: 0,
          attendance_unchecked: 2,
          attendance_present: 0,
          attendance_late: 0,
          attendance_absent: 0,
        },
      },
    ],
    selected_meeting: {
      meeting: {
        id: regularMeetingId,
        meeting_kind: "regular",
        period_month: "2026-07-01",
        regular_occurrence: 3,
        meeting_number: 1,
        linked_regular_meeting_number: null,
        meeting_date: "2026-07-18",
        start_time: "18:00:00",
        end_time: "22:00:00",
        title: "1차 정모",
        location: null,
        linked_regular_meeting_id: null,
        status: "scheduled",
        counts: {
          total: 2,
          rsvp_unanswered: 1,
          rsvp_attending: 1,
          rsvp_late: 0,
          rsvp_declined: 0,
          attendance_unchecked: 2,
          attendance_present: 0,
          attendance_late: 0,
          attendance_absent: 0,
        },
      },
      targets: [
        {
          member_id: memberTwoId,
          target_origin: "ad_hoc",
          member_code_snapshot: "JW-000002",
          member_name_snapshot: "김민수",
          group_code_snapshot: null,
          rsvp_status: "unanswered",
          attendance_status: "unchecked",
          arrival_time: null,
          attendance_origin: null,
          has_recorded_state: false,
          rsvp_updated_at: "2026-07-14T01:00:00+00:00",
          attendance_updated_at: "2026-07-14T01:00:00+00:00",
        },
        {
          member_id: memberOneId,
          target_origin: "monthly_roster",
          member_code_snapshot: "JW-000001",
          member_name_snapshot: "박지수",
          group_code_snapshot: "A",
          rsvp_status: "attending",
          attendance_status: "unchecked",
          arrival_time: null,
          attendance_origin: null,
          has_recorded_state: true,
          rsvp_updated_at: "2026-07-14T02:00:00+00:00",
          attendance_updated_at: "2026-07-14T02:00:00+00:00",
        },
      ],
      ad_hoc_candidates: [
        {
          id: memberTwoId,
          member_code: "JW-000010",
          name: "최후보",
          group_code: "B",
        },
      ],
      lifecycle_events: [
        {
          id: lifecycleEventId,
          event_type: "location_updated",
          actor_display_name: "운영자",
          occurred_at: "2026-07-14T03:00:00+00:00",
          reason: null,
          details: { before: null, after: "1번 코트" },
        },
      ],
    },
    modal_error: null,
    ...overrides,
  };
}

describe("meeting directory DTO parser", () => {
  it("maps a valid RPC response to sorted, bounded camelCase DTOs", () => {
    const page = parseMeetingDirectoryPage(validDatabasePage());

    expect(page).toMatchObject({
      periodMonth: "2026-07-01",
      canManageMeeting: true,
      canManageAttendance: false,
      roster: {
        status: "locked",
        rosterOrigin: "bootstrap",
        statisticsEligible: false,
      },
      summary: { total: 1, scheduled: 1, completed: 0, cancelled: 0 },
      modalError: null,
    });
    expect(page.meetings.map((meeting) => meeting.id)).toEqual([
      regularMeetingId,
    ]);
    expect(page.meetings[0]).toMatchObject({
      regularOccurrence: 3,
      meetingNumber: 1,
      linkedRegularMeetingNumber: null,
    });
    expect(
      page.selectedMeeting?.targets.map((target) => target.memberCodeSnapshot),
    ).toEqual(["JW-000001", "JW-000002"]);
    expect(page.selectedMeeting?.lifecycleEvents[0]).toMatchObject({
      eventType: "location_updated",
      actorDisplayName: "운영자",
    });
    expect(page.selectedMeeting?.targets.map((target) => target.hasRecordedState)).toEqual([
      true,
      false,
    ]);
    expect(JSON.stringify(page)).not.toContain("actor_profile_id");
  });

  it.each([
    ["missing field", { summary: undefined }],
    ["invalid enum", { roster: { status: "open", roster_origin: "automatic", statistics_eligible: true } }],
    ["invalid number", { summary: { total: -1, scheduled: 1, completed: 0, cancelled: 0 } }],
    ["invalid date", { period_month: "2026-07-14" }],
  ])("rejects %s without including the raw database value", (_, override) => {
    expect(() => parseMeetingDirectoryPage(validDatabasePage(override))).toThrow(
      "정모 목록 데이터 형식이 올바르지 않습니다.",
    );

    try {
      parseMeetingDirectoryPage(validDatabasePage(override));
    } catch (error) {
      expect(String(error)).not.toContain(JSON.stringify(override));
      expect(String(error)).not.toContain("open");
    }
  });

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    "preserves split manage permissions (meeting=%s, attendance=%s)",
    (canManageMeeting, canManageAttendance) => {
      const page = parseMeetingDirectoryPage(
        validDatabasePage({
          can_manage_meeting: canManageMeeting,
          can_manage_attendance: canManageAttendance,
        }),
      );

      expect(page.canManageMeeting).toBe(canManageMeeting);
      expect(page.canManageAttendance).toBe(canManageAttendance);
    },
  );

  it("does not expose ad-hoc candidates to an attendance read-only viewer", () => {
    const page = parseMeetingDirectoryPage(
      validDatabasePage({ can_manage_attendance: false }),
    );

    expect(page.selectedMeeting?.adHocCandidates).toEqual([]);
  });

  it("keeps the month list but replaces a database modal error with a safe message", () => {
    const page = parseMeetingDirectoryPage(
      validDatabasePage({
        selected_meeting: null,
        modal_error: "relation public.secret_table failed",
      }),
    );

    expect(page.meetings).toHaveLength(1);
    expect(page.selectedMeeting).toBeNull();
    expect(page.modalError).toBe("선택한 정모를 열 수 없습니다.");
    expect(JSON.stringify(page)).not.toContain("secret_table");
  });

  it("rejects a contradictory response that includes selection data with a modal error", () => {
    expect(() =>
      parseMeetingDirectoryPage(
        validDatabasePage({ modal_error: "selected meeting unavailable" }),
      ),
    ).toThrow("정모 목록 데이터 형식이 올바르지 않습니다.");
  });

  it("rejects a regular row with a zero meeting number", () => {
    const value = validDatabasePage();
    value.meetings[0].meeting_number = 0;

    expect(() => parseMeetingDirectoryPage(value)).toThrow(
      "정모 목록 데이터 형식이 올바르지 않습니다.",
    );
  });

  it("rejects a lightning row without its linked regular meeting number", () => {
    const value = validDatabasePage();
    Object.assign(value.meetings[0] as Record<string, unknown>, {
      meeting_kind: "lightning",
      regular_occurrence: null,
      meeting_number: null,
      linked_regular_meeting_number: null,
      linked_regular_meeting_id: regularMeetingId,
      title: "1차 정모 번개",
    });

    expect(() => parseMeetingDirectoryPage(value)).toThrow(
      "정모 목록 데이터 형식이 올바르지 않습니다.",
    );
  });
});

describe("meeting directory command/query boundary", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
  });

  it("loads the prepared directory through one database round trip", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: validDatabasePage(),
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(
      loadMeetingDirectoryPage({
        month: "2026-07",
        meetingId: regularMeetingId,
      }),
    ).resolves.toMatchObject({ periodMonth: "2026-07-01" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("load_club_meeting_directory_page", {
      requested_period_month: "2026-07-01",
      requested_selected_meeting_id: regularMeetingId,
    });
  });

  it("returns one stable page error when the combined RPC fails", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("internal bootstrap table leaked"),
    });
    mocks.createClient.mockResolvedValue({ rpc });

    const error = await loadMeetingDirectoryPage({ month: "2026-07" }).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toEqual(new Error("정모 목록을 불러오지 못했습니다."));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(String(error)).not.toContain("bootstrap table");
  });

  it("temporarily falls back to the two legacy RPCs until the migration is applied", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202", message: "function not found" },
      })
      .mockResolvedValueOnce({ data: { status: "prepared" }, error: null })
      .mockResolvedValueOnce({ data: validDatabasePage(), error: null });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(
      loadMeetingDirectoryPage({ month: "2026-07" }),
    ).resolves.toMatchObject({ periodMonth: "2026-07-01" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "load_club_meeting_directory_page",
      "prepare_club_meeting_month",
      "get_club_meeting_directory_page",
    ]);
  });

  it("returns one stable page error when the combined response is invalid", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { raw: "private database payload" },
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(
      loadMeetingDirectoryPage({ month: "2026-07" }),
    ).rejects.toThrow("정모 목록을 불러오지 못했습니다.");
  });
});

describe("meeting directory SQL boundary", () => {
  it("freezes every U1-U4 function with an empty search path and an explicit execute boundary", () => {
    const definitions = [
      ...migrationSql.matchAll(
        /create or replace function public\.(\w+)[\s\S]*?\$\$;/g,
      ),
    ];
    const authenticatedFunctions = new Set([
      "add_meeting_ad_hoc_member",
      "cancel_club_meeting",
      "close_club_meeting_attendance",
      "create_lightning_club_meeting",
      "get_club_meeting_directory_page",
      "prepare_club_meeting_month",
      "remove_meeting_ad_hoc_member",
      "reopen_club_meeting_attendance",
      "restore_club_meeting",
      "save_meeting_attendance",
      "save_meeting_rsvp",
      "save_member_with_contact",
      "update_club_meeting_location",
    ]);

    expect(definitions.length).toBeGreaterThan(0);
    for (const definition of definitions) {
      const functionName = definition[1];
      expect(definition[0], functionName).toContain("set search_path = ''");
      if (authenticatedFunctions.has(functionName)) {
        expect(migrationSql, functionName).toMatch(
          new RegExp(
            String.raw`grant execute on function public\.${functionName}\([\s\S]*?\)\s+to authenticated`,
          ),
        );
      } else {
        expect(migrationSql, functionName).toMatch(
          new RegExp(
            String.raw`revoke execute on function public\.${functionName}\([\s\S]*?\)\s+from public, anon, authenticated`,
          ),
        );
      }
    }
  });

  it("defines precise external RPC grants and fixed empty search paths", () => {
    for (const [name, signature] of [
      ["prepare_club_meeting_month", "date"],
      ["get_club_meeting_directory_page", "date, text"],
    ]) {
      const start = migrationSql.indexOf(
        `create or replace function public.${name}`,
      );
      const end = migrationSql.indexOf("$$;", start);
      const body = migrationSql.slice(start, end);

      expect(start, name).toBeGreaterThan(-1);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
      expect(migrationSql).toContain(
        `revoke execute on function public.${name}(${signature}) from public, anon`,
      );
      expect(migrationSql).toContain(
        `grant execute on function public.${name}(${signature}) to authenticated`,
      );
    }
  });

  it("keeps prepare idempotent and the directory query read-only", () => {
    const prepareStart = migrationSql.indexOf(
      "create or replace function public.prepare_club_meeting_month",
    );
    const readStart = migrationSql.indexOf(
      "create or replace function public.get_club_meeting_directory_page",
    );
    const readEnd = migrationSql.indexOf("$$;", readStart);
    const prepareBody = migrationSql.slice(prepareStart, readStart);
    const readBody = migrationSql.slice(readStart, readEnd);

    expect(prepareBody).toContain("public.require_meeting_operator(array[]::text[])");
    expect(prepareBody).toContain("public.bootstrap_club_meeting_automation");
    expect(prepareBody).toContain(
      "public.lock_meeting_period_months(array[normalized_period_month])",
    );
    expect(prepareBody).toContain(
      "public.ensure_regular_club_meetings(\n      normalized_period_month,\n      actor_profile_id",
    );
    expect(prepareBody).toContain("last_automatic_period_month");
    expect(prepareBody).toContain(
      "normalized_period_month between current_period_month\n    and last_automatic_period_month",
    );
    expect(readBody).toContain("stable");
    expect(readBody).toContain("public.require_meeting_operator(array[]::text[])");
    expect(readBody).not.toMatch(/\b(insert|update|delete)\s+(into|public|from)\b/);
  });

  it("returns set-based counts, selected targets, candidates and lifecycle history", () => {
    expect(migrationSql).toContain("'can_manage_meeting'");
    expect(migrationSql).toContain("'can_manage_attendance'");
    expect(migrationSql).toContain("'rsvp_unanswered'");
    expect(migrationSql).toContain("'attendance_unchecked'");
    expect(migrationSql).toContain("'ad_hoc_candidates'");
    expect(migrationSql).toContain("'lifecycle_events'");
    expect(migrationSql).toContain(
      "if can_manage_attendance and month_roster_status = 'locked' then",
    );
    expect(migrationSql).toContain("requested_meeting.id::text = requested_selected_meeting_id");
    expect(migrationSql).toContain("requested_meeting.period_month = normalized_period_month");
  });
});
