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

import { mutateMeetingRow } from "./meeting-row-mutation";

const meetingId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const expectedUpdatedAt = "2026-07-14T09:00:00.000Z";
const savedAt = "2026-07-14T09:01:00.000Z";
const serverRow = {
  meetingId,
  memberId,
  rsvpStatus: "attending",
  attendanceStatus: "unchecked",
  arrivalTime: null,
  rsvpUpdatedAt: savedAt,
  attendanceUpdatedAt: expectedUpdatedAt,
};

describe("meeting row mutation", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "operator-id" } },
      error: null,
    });
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({
      data: { status: "saved", row: serverRow },
      error: null,
    });
    mocks.revalidatePath.mockReset();
  });

  it("rejects an invalid discriminated request before authentication", async () => {
    await expect(
      mutateMeetingRow({ kind: "rsvp", meetingId: "bad" }),
    ).resolves.toEqual({
      status: "error",
      message: "입력값을 확인해 주세요.",
    });

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires an authenticated user before calling the RPC", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(
      mutateMeetingRow({
        kind: "rsvp",
        meetingId,
        memberId,
        rsvpStatus: "attending",
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({ status: "error", message: "로그인이 필요합니다." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps RSVP and attendance requests to separate CAS RPC parameters", async () => {
    await mutateMeetingRow({
      kind: "rsvp",
      meetingId,
      memberId,
      rsvpStatus: "attending",
      expectedUpdatedAt,
    });

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "save_meeting_rsvp", {
      requested_meeting_id: meetingId,
      requested_member_id: memberId,
      requested_rsvp_status: "attending",
      expected_rsvp_updated_at: expectedUpdatedAt,
    });

    await mutateMeetingRow({
      kind: "attendance",
      meetingId,
      memberId,
      attendanceStatus: "present",
      arrivalTime: null,
      expectedUpdatedAt,
    });

    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "save_meeting_attendance", {
      requested_meeting_id: meetingId,
      requested_member_id: memberId,
      requested_attendance_status: "present",
      requested_arrival_time: null,
      expected_attendance_updated_at: expectedUpdatedAt,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/meetings");
  });

  it("returns only the safe confirmed row for saved and conflict responses", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        status: "saved",
        row: { ...serverRow, internalActorId: "must-not-leak" },
      },
      error: null,
    });

    await expect(
      mutateMeetingRow({
        kind: "rsvp",
        meetingId,
        memberId,
        rsvpStatus: "attending",
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({ status: "saved", row: serverRow });

    mocks.rpc.mockResolvedValueOnce({
      data: { status: "conflict", row: serverRow },
      error: null,
    });
    await expect(
      mutateMeetingRow({
        kind: "rsvp",
        meetingId,
        memberId,
        rsvpStatus: "late",
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({ status: "conflict", row: serverRow });
  });

  it("maps known domain failures and hides unknown database errors", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "meeting has not started" },
    });
    await expect(
      mutateMeetingRow({
        kind: "attendance",
        meetingId,
        memberId,
        attendanceStatus: "present",
        arrivalTime: null,
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "정모 시작 이후에 출석을 입력할 수 있습니다.",
    });

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "relation public.secret does not exist" },
    });
    await expect(
      mutateMeetingRow({
        kind: "rsvp",
        meetingId,
        memberId,
        rsvpStatus: "declined",
        expectedUpdatedAt,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
    });
  });
});
