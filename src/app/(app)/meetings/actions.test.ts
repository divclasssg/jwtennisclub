import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
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
  updateClubMeetingLocation,
} from "./actions";

const meetingId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

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

  it("passes a blank location to the database for canonical defaulting", async () => {
    await updateClubMeetingLocation({ meetingId, location: "   " });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_club_meeting_location",
      {
        requested_meeting_id: meetingId,
        requested_location: null,
      },
    );
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

  it.each([
    [
      "meeting roster is not locked",
      "월 명단 확정 후 임시 대상을 추가할 수 있습니다.",
    ],
    [
      "member already belongs to monthly roster",
      "월 명단 대상 회원은 임시 대상으로 추가할 수 없습니다.",
    ],
  ])("maps the ad-hoc domain error %s", async (databaseMessage, safeMessage) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: databaseMessage, code: "55000" },
    });

    await expect(addMeetingAdHocMember({ meetingId, memberId })).resolves.toEqual({
      status: "error",
      message: safeMessage,
    });
  });

});
