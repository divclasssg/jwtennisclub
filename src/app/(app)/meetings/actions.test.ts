import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));

import {
  addMeetingAdHocMember,
  cancelClubMeeting,
  closeClubMeetingAttendance,
  createLightningClubMeeting,
  removeMeetingAdHocMember,
  reopenClubMeetingAttendance,
  restoreClubMeeting,
  saveMeetingAttendance,
  saveMeetingRsvp,
  updateClubMeetingLocation,
} from "./actions";

const meetingId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const expectedUpdatedAt = "2026-07-14T09:00:00.000Z";

describe("meeting server actions", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "operator-id" } },
      error: null,
    });
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: { status: "saved" }, error: null });
    mocks.revalidatePath.mockReset();
  });

  it("authenticates before invoking a meeting RPC", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(
      updateClubMeetingLocation({ meetingId, location: "센터 코트" }),
    ).resolves.toEqual({ status: "error", message: "로그인이 필요합니다." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed values without exposing database details", async () => {
    await expect(
      saveMeetingAttendance({
        meetingId: "not-a-uuid",
        memberId,
        attendanceStatus: "late",
        arrivalTime: "25:90",
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "입력값을 확인해 주세요.",
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends independent RSVP and attendance tokens and preserves safe row DTOs", async () => {
    const latestRow = {
      meetingId,
      memberId,
      rsvpStatus: "attending",
      attendanceStatus: "unchecked",
      arrivalTime: null,
      rsvpUpdatedAt: expectedUpdatedAt,
      attendanceUpdatedAt: expectedUpdatedAt,
    };
    mocks.rpc.mockResolvedValue({
      data: { status: "conflict", row: latestRow },
      error: null,
    });

    await expect(
      saveMeetingRsvp({
        meetingId,
        memberId,
        rsvpStatus: "late",
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({ status: "conflict", row: latestRow });
    expect(mocks.rpc).toHaveBeenCalledWith("save_meeting_rsvp", {
      requested_meeting_id: meetingId,
      requested_member_id: memberId,
      requested_rsvp_status: "late",
      expected_rsvp_updated_at: expectedUpdatedAt,
    });

    mocks.rpc.mockResolvedValue({ data: { status: "saved", row: latestRow }, error: null });
    await saveMeetingAttendance({
      meetingId,
      memberId,
      attendanceStatus: "present",
      arrivalTime: null,
      expectedUpdatedAt,
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith("save_meeting_attendance", {
      requested_meeting_id: meetingId,
      requested_member_id: memberId,
      requested_attendance_status: "present",
      requested_arrival_time: null,
      expected_attendance_updated_at: expectedUpdatedAt,
    });
  });

  it("maps lifecycle actions to dedicated RPCs and revalidates affected pages", async () => {
    await updateClubMeetingLocation({ meetingId, location: "  센터 코트  " });
    await addMeetingAdHocMember({ meetingId, memberId });
    await removeMeetingAdHocMember({ meetingId, memberId });
    await cancelClubMeeting({ meetingId, reason: "우천 취소" });
    await restoreClubMeeting({ meetingId });
    await closeClubMeetingAttendance({ meetingId });
    await reopenClubMeetingAttendance({ meetingId });
    await createLightningClubMeeting({
      linkedRegularMeetingId: meetingId,
      meetingDate: "2026-07-19",
      startTime: "18:00",
      endTime: "20:00",
      location: "센터 코트",
    });

    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "update_club_meeting_location",
      "add_meeting_ad_hoc_member",
      "remove_meeting_ad_hoc_member",
      "cancel_club_meeting",
      "restore_club_meeting",
      "close_club_meeting_attendance",
      "reopen_club_meeting_attendance",
      "create_lightning_club_meeting",
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/meetings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/schedule");
  });

  it("returns a stable Korean error instead of a Supabase error payload", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "relation public.secret_table does not exist", code: "42P01" },
    });

    await expect(
      cancelClubMeeting({ meetingId, reason: "우천 취소" }),
    ).resolves.toEqual({
      status: "error",
      message: "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
    });
  });

  it("rejects a row save response that omits the confirmed server row", async () => {
    await expect(
      saveMeetingRsvp({
        meetingId,
        memberId,
        rsvpStatus: "attending",
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
    });
  });
});
