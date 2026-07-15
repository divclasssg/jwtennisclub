import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingDirectoryRow } from "@/features/meetings/meeting-model";
import { MeetingLifecycleControls } from "./MeetingLifecycleControls";

const actions = vi.hoisted(() => ({
  cancelClubMeeting: vi.fn(),
  closeClubMeetingAttendance: vi.fn(),
  createLightningClubMeeting: vi.fn(),
  reopenClubMeetingAttendance: vi.fn(),
  restoreClubMeeting: vi.fn(),
  updateClubMeetingLocation: vi.fn(),
}));

vi.mock("./actions", () => actions);

const meeting: MeetingDirectoryRow = {
  id: "11111111-1111-4111-8111-111111111111",
  meetingKind: "regular",
  periodMonth: "2026-07-01",
  regularOccurrence: 3,
  meetingNumber: 1,
  linkedRegularMeetingNumber: null,
  meetingDate: "2026-07-18",
  startTime: "18:00:00",
  endTime: "22:00:00",
  title: "1차 정모",
  location: "센터 코트",
  linkedRegularMeetingId: null,
  status: "scheduled",
  counts: null,
};

describe("MeetingLifecycleControls", () => {
  beforeEach(() => {
    for (const action of Object.values(actions)) {
      action.mockReset();
      action.mockResolvedValue({ status: "saved" });
    }
  });

  it("shows no mutation controls without meeting management permission", () => {
    render(
      <MeetingLifecycleControls
        attendanceEnded
        canManageAttendance
        canManageMeeting={false}
        hasActiveLightning={false}
        hasLightningHistory={false}
        meeting={meeting}
      />,
    );

    expect(screen.getByText("조회 전용")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("updates location, cancels a scheduled meeting, and closes attendance only with both permissions after end", async () => {
    render(
      <MeetingLifecycleControls
        attendanceEnded
        canManageAttendance
        canManageMeeting
        hasActiveLightning={false}
        hasLightningHistory={false}
        meeting={meeting}
      />,
    );

    fireEvent.change(screen.getByLabelText("1차 정모 변경 장소"), {
      target: { value: "새 코트" },
    });
    fireEvent.click(screen.getByRole("button", { name: "1차 정모 장소 저장" }));
    await waitFor(() =>
      expect(actions.updateClubMeetingLocation).toHaveBeenCalledWith({
        meetingId: meeting.id,
        location: "새 코트",
      }),
    );
    await screen.findByText("장소를 변경했습니다.");

    fireEvent.change(screen.getByLabelText("1차 정모 취소 사유"), {
      target: { value: "우천" },
    });
    fireEvent.click(screen.getByRole("button", { name: "1차 정모 취소" }));
    await waitFor(() =>
      expect(actions.cancelClubMeeting).toHaveBeenCalledWith({
        meetingId: meeting.id,
        reason: "우천",
      }),
    );
    await screen.findByText("정모를 취소했습니다.");

    fireEvent.click(screen.getByRole("button", { name: "1차 정모 출석 마감" }));

    await waitFor(() => {
      expect(actions.closeClubMeetingAttendance).toHaveBeenCalledWith({ meetingId: meeting.id });
    });
  });

  it("recovers from a rejected lifecycle action with a safe error", async () => {
    actions.updateClubMeetingLocation.mockRejectedValueOnce(
      new Error("database detail"),
    );
    render(
      <MeetingLifecycleControls
        attendanceEnded
        canManageAttendance
        canManageMeeting
        hasActiveLightning={false}
        hasLightningHistory={false}
        meeting={meeting}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "1차 정모 장소 저장" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
    );
    expect(screen.queryByText("database detail")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "1차 정모 장소 저장" }),
    ).toBeEnabled();
  });

  it("hides close before end or without attendance permission", () => {
    const { rerender } = render(
      <MeetingLifecycleControls
        attendanceEnded={false}
        canManageAttendance
        canManageMeeting
        hasActiveLightning={false}
        hasLightningHistory={false}
        meeting={meeting}
      />,
    );
    expect(screen.queryByRole("button", { name: /출석 마감/ })).not.toBeInTheDocument();

    rerender(
      <MeetingLifecycleControls
        attendanceEnded
        canManageAttendance={false}
        canManageMeeting
        hasActiveLightning={false}
        hasLightningHistory={false}
        meeting={meeting}
      />,
    );
    expect(screen.queryByRole("button", { name: /출석 마감/ })).not.toBeInTheDocument();
  });

  it("keeps scheduled lightning cancellation and closing but hides the regular-only location form", () => {
    render(
      <MeetingLifecycleControls
        attendanceEnded
        canManageAttendance
        canManageMeeting
        hasActiveLightning={false}
        hasLightningHistory={false}
        meeting={{
          ...meeting,
          meetingKind: "lightning",
          regularOccurrence: null,
          meetingNumber: null,
          linkedRegularMeetingNumber: 1,
          linkedRegularMeetingId: meeting.id,
          title: "1차 정모 번개",
        }}
      />,
    );

    expect(screen.queryByLabelText("1차 정모 번개 변경 장소")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1차 정모 번개 취소" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1차 정모 번개 출석 마감" }))
      .toBeInTheDocument();
  });

  it("reopens completed attendance with both permissions", async () => {
    render(
      <MeetingLifecycleControls
        attendanceEnded
        canManageAttendance
        canManageMeeting
        hasActiveLightning={false}
        hasLightningHistory={false}
        meeting={{ ...meeting, status: "completed" }}
      />,
    );

    expect(screen.queryByLabelText(/변경 장소/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1차 정모 출석 재개" }));
    await waitFor(() =>
      expect(actions.reopenClubMeetingAttendance).toHaveBeenCalledWith({ meetingId: meeting.id }),
    );
  });

  it("restores a cancelled regular meeting only without an active lightning", async () => {
    const cancelled = { ...meeting, status: "cancelled" as const };
    const { rerender } = render(
      <MeetingLifecycleControls
        attendanceEnded
        canManageAttendance
        canManageMeeting
        hasActiveLightning
        hasLightningHistory
        meeting={cancelled}
      />,
    );
    expect(screen.queryByRole("button", { name: /취소 복구/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /번개 생성/ })).not.toBeInTheDocument();

    rerender(
      <MeetingLifecycleControls
        attendanceEnded
        canManageAttendance
        canManageMeeting
        hasActiveLightning={false}
        hasLightningHistory
        meeting={cancelled}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "1차 정모 취소 복구" }));
    await waitFor(() =>
      expect(actions.restoreClubMeeting).toHaveBeenCalledWith({ meetingId: meeting.id }),
    );
  });

  it("creates one replacement lightning for a cancelled regular meeting without history", async () => {
    render(
      <MeetingLifecycleControls
        attendanceEnded
        canManageAttendance
        canManageMeeting
        hasActiveLightning={false}
        hasLightningHistory={false}
        meeting={{ ...meeting, status: "cancelled" }}
      />,
    );

    fireEvent.change(screen.getByLabelText("1차 정모 번개 날짜"), {
      target: { value: "2026-07-05" },
    });
    fireEvent.change(screen.getByLabelText("1차 정모 번개 시작 시간"), {
      target: { value: "18:00" },
    });
    fireEvent.change(screen.getByLabelText("1차 정모 번개 종료 시간"), {
      target: { value: "20:00" },
    });
    fireEvent.change(screen.getByLabelText("1차 정모 번개 장소"), {
      target: { value: "보조 코트" },
    });
    fireEvent.click(screen.getByRole("button", { name: "1차 정모 번개 생성" }));

    await waitFor(() =>
      expect(actions.createLightningClubMeeting).toHaveBeenCalledWith({
        linkedRegularMeetingId: meeting.id,
        meetingDate: "2026-07-05",
        startTime: "18:00",
        endTime: "20:00",
        location: "보조 코트",
      }),
    );
  });

  it("shows a safe action error in the row", async () => {
    actions.cancelClubMeeting.mockResolvedValue({
      status: "error",
      message: "활성 번개가 있어 처리할 수 없습니다.",
    });
    render(
      <MeetingLifecycleControls
        attendanceEnded
        canManageAttendance
        canManageMeeting
        hasActiveLightning={false}
        hasLightningHistory={false}
        meeting={meeting}
      />,
    );

    fireEvent.change(screen.getByLabelText("1차 정모 취소 사유"), {
      target: { value: "우천" },
    });
    fireEvent.click(screen.getByRole("button", { name: "1차 정모 취소" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "활성 번개가 있어 처리할 수 없습니다.",
    );
  });
});
