import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingDirectoryTarget } from "./meeting-model";
import { MeetingRosterRow } from "./MeetingRosterRow";

const meetingId = "11111111-1111-4111-8111-111111111111";
const initialUpdatedAt = "2026-07-14T09:00:00.000Z";

function createTarget(
  memberId: string,
  memberNameSnapshot: string,
  overrides: Partial<MeetingDirectoryTarget> = {},
): MeetingDirectoryTarget {
  return {
    memberId,
    targetOrigin: "monthly_roster",
    memberCodeSnapshot: memberId.slice(0, 4),
    memberNameSnapshot,
    groupCodeSnapshot: "A",
    rsvpStatus: "unanswered",
    attendanceStatus: "unchecked",
    arrivalTime: null,
    attendanceOrigin: null,
    hasRecordedState: false,
    rsvpUpdatedAt: initialUpdatedAt,
    attendanceUpdatedAt: initialUpdatedAt,
    ...overrides,
  };
}

function createServerRow(
  target: MeetingDirectoryTarget,
  overrides: Record<string, unknown> = {},
) {
  return {
    meetingId,
    memberId: target.memberId,
    rsvpStatus: target.rsvpStatus,
    attendanceStatus: target.attendanceStatus,
    arrivalTime: target.arrivalTime,
    rsvpUpdatedAt: target.rsvpUpdatedAt,
    attendanceUpdatedAt: target.attendanceUpdatedAt,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function response(result: unknown) {
  return Response.json(result);
}

describe("MeetingRosterRow", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("lets a second member start saving while the first request is unresolved", async () => {
    const first = createTarget(
      "22222222-2222-4222-8222-222222222222",
      "김하나",
    );
    const second = createTarget(
      "33333333-3333-4333-8333-333333333333",
      "이둘",
    );
    const firstRequest = deferred<Response>();
    const secondRequest = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    render(
      <>
        <MeetingRosterRow
          canManage
          meetingId={meetingId}
          meetingStatus="scheduled"
          mode="rsvp"
          target={first}
        />
        <MeetingRosterRow
          canManage
          meetingId={meetingId}
          meetingStatus="scheduled"
          mode="rsvp"
          target={second}
        />
      </>,
    );

    fireEvent.change(screen.getByLabelText("김하나 사전 참석"), {
      target: { value: "attending" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("김하나 사전 참석")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "김하나 사전 참석 저장" }))
      .not.toBeInTheDocument();
    expect(screen.getByLabelText("이둘 사전 참석")).toBeEnabled();

    fireEvent.change(screen.getByLabelText("이둘 사전 참석"), {
      target: { value: "declined" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondRequest.resolve(
        response({
          status: "saved",
          row: createServerRow(second, {
            rsvpStatus: "declined",
            rsvpUpdatedAt: "2026-07-14T09:02:00.000Z",
          }),
        }),
      );
    });
    expect(await screen.findByText("이둘 저장됨")).toBeInTheDocument();
    expect(screen.getByText("김하나 저장 중")).toBeInTheDocument();

    await act(async () => {
      firstRequest.resolve(
        response({
          status: "saved",
          row: createServerRow(first, {
            rsvpStatus: "attending",
            rsvpUpdatedAt: "2026-07-14T09:03:00.000Z",
          }),
        }),
      );
    });
    expect(await screen.findByText("김하나 저장됨")).toBeInTheDocument();
  });

  it("allows RSVP and attendance requests for the same member to overlap", () => {
    const target = createTarget(
      "22222222-2222-4222-8222-222222222222",
      "김하나",
    );
    fetchMock
      .mockReturnValueOnce(new Promise<Response>(() => undefined))
      .mockReturnValueOnce(new Promise<Response>(() => undefined));

    render(
      <>
        <MeetingRosterRow
          canManage
          meetingId={meetingId}
          meetingStatus="scheduled"
          mode="rsvp"
          target={target}
        />
        <MeetingRosterRow
          attendanceStarted
          canManage
          meetingId={meetingId}
          meetingStatus="scheduled"
          mode="attendance"
          target={target}
        />
      </>,
    );

    fireEvent.change(screen.getByLabelText("김하나 사전 참석"), {
      target: { value: "attending" },
    });
    expect(screen.getByLabelText("김하나 실제 출석")).toBeEnabled();

    fireEvent.change(screen.getByLabelText("김하나 실제 출석"), {
      target: { value: "present" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("auto-saves a non-late attendance selection", async () => {
    const target = createTarget(
      "22222222-2222-4222-8222-222222222222",
      "김하나",
    );
    fetchMock.mockResolvedValue(
      response({
        status: "saved",
        row: createServerRow(target, {
          attendanceStatus: "present",
          attendanceUpdatedAt: "2026-07-14T09:08:00.000Z",
        }),
      }),
    );

    render(
      <MeetingRosterRow
        attendanceStarted
        canManage
        meetingId={meetingId}
        meetingStatus="scheduled"
        mode="attendance"
        target={target}
      />,
    );

    fireEvent.change(screen.getByLabelText("김하나 실제 출석"), {
      target: { value: "present" },
    });

    expect(await screen.findByText("김하나 저장됨")).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      kind: "attendance",
      attendanceStatus: "present",
      arrivalTime: null,
    });
    expect(screen.queryByRole("button", { name: "김하나 실제 출석 저장" }))
      .not.toBeInTheDocument();
  });

  it("restores a conflict row and retries the attempted value with its new token", async () => {
    const target = createTarget(
      "22222222-2222-4222-8222-222222222222",
      "김하나",
    );
    fetchMock
      .mockResolvedValueOnce(
        response({
          status: "conflict",
          row: createServerRow(target, {
            rsvpStatus: "late",
            rsvpUpdatedAt: "2026-07-14T09:04:00.000Z",
          }),
        }),
      )
      .mockResolvedValueOnce(
        response({
          status: "saved",
          row: createServerRow(target, {
            rsvpStatus: "attending",
            rsvpUpdatedAt: "2026-07-14T09:05:00.000Z",
          }),
        }),
      );

    render(
      <MeetingRosterRow
        canManage
        meetingId={meetingId}
        meetingStatus="scheduled"
        mode="rsvp"
        target={target}
      />,
    );
    fireEvent.change(screen.getByLabelText("김하나 사전 참석"), {
      target: { value: "attending" },
    });

    expect(await screen.findByText(/다른 운영진이 먼저 변경/)).toBeInTheDocument();
    expect(screen.getByLabelText("김하나 사전 참석")).toHaveValue("late");

    fireEvent.click(screen.getByRole("button", { name: "김하나 사전 참석 재시도" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondRequest = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body),
    );
    expect(secondRequest).toMatchObject({
      rsvpStatus: "attending",
      expectedUpdatedAt: "2026-07-14T09:04:00.000Z",
    });
    expect(await screen.findByText("김하나 저장됨")).toBeInTheDocument();
  });

  it("preserves conflict feedback when the parent accepts the confirmed row", async () => {
    const target = createTarget(
      "22222222-2222-4222-8222-222222222222",
      "김하나",
    );
    fetchMock.mockResolvedValue(
      response({
        status: "conflict",
        row: createServerRow(target, {
          rsvpStatus: "late",
          rsvpUpdatedAt: "2026-07-14T09:07:00.000Z",
        }),
      }),
    );

    function ControlledRow() {
      const [currentTarget, setCurrentTarget] = useState(target);
      return (
        <MeetingRosterRow
          canManage
          meetingId={meetingId}
          meetingStatus="scheduled"
          mode="rsvp"
          onRowConfirmed={(row) =>
            setCurrentTarget((current) => ({
              ...current,
              rsvpStatus: row.rsvpStatus,
              attendanceStatus: row.attendanceStatus,
              arrivalTime: row.arrivalTime,
              rsvpUpdatedAt: row.rsvpUpdatedAt,
              attendanceUpdatedAt: row.attendanceUpdatedAt,
              hasRecordedState: true,
            }))
          }
          target={currentTarget}
        />
      );
    }

    render(<ControlledRow />);
    fireEvent.change(screen.getByLabelText("김하나 사전 참석"), {
      target: { value: "attending" },
    });

    expect(await screen.findByText(/다른 운영진이 먼저 변경/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "김하나 사전 참석 재시도" }),
    ).toBeEnabled();
  });

  it("restores the last confirmed value after an error and offers retry", async () => {
    const target = createTarget(
      "22222222-2222-4222-8222-222222222222",
      "김하나",
    );
    fetchMock.mockResolvedValueOnce(
      response({ status: "error", message: "다시 시도해 주세요." }),
    );

    render(
      <MeetingRosterRow
        canManage
        meetingId={meetingId}
        meetingStatus="scheduled"
        mode="rsvp"
        target={target}
      />,
    );
    fireEvent.change(screen.getByLabelText("김하나 사전 참석"), {
      target: { value: "declined" },
    });

    expect(await screen.findByText("다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.getByLabelText("김하나 사전 참석")).toHaveValue(
      "unanswered",
    );
    expect(
      screen.getByRole("button", { name: "김하나 사전 참석 재시도" }),
    ).toBeEnabled();
  });

  it("restores the last confirmed value after a network failure", async () => {
    const target = createTarget(
      "22222222-2222-4222-8222-222222222222",
      "김하나",
    );
    fetchMock.mockRejectedValueOnce(new Error("network detail"));

    render(
      <MeetingRosterRow
        canManage
        meetingId={meetingId}
        meetingStatus="scheduled"
        mode="rsvp"
        target={target}
      />,
    );
    fireEvent.change(screen.getByLabelText("김하나 사전 참석"), {
      target: { value: "declined" },
    });

    expect(
      await screen.findByText("요청을 처리하지 못했습니다. 다시 시도해 주세요."),
    ).toBeInTheDocument();
    expect(screen.queryByText("network detail")).not.toBeInTheDocument();
    expect(screen.getByLabelText("김하나 사전 참석")).toHaveValue(
      "unanswered",
    );
    expect(
      screen.getByRole("button", { name: "김하나 사전 참석 재시도" }),
    ).toBeEnabled();
  });

  it("requires and describes the named member arrival time only for actual late", async () => {
    const target = createTarget(
      "22222222-2222-4222-8222-222222222222",
      "김하나",
    );
    fetchMock.mockResolvedValue(
      response({
        status: "saved",
        row: createServerRow(target, {
          attendanceStatus: "late",
          arrivalTime: "18:30:00",
          attendanceUpdatedAt: "2026-07-14T09:06:00.000Z",
        }),
      }),
    );

    render(
      <MeetingRosterRow
        attendanceStarted
        canManage
        meetingEndTime="22:00"
        meetingId={meetingId}
        meetingStartTime="18:00"
        meetingStatus="scheduled"
        mode="attendance"
        target={target}
      />,
    );
    fireEvent.change(screen.getByLabelText("김하나 실제 출석"), {
      target: { value: "late" },
    });

    const arrivalInput = screen.getByLabelText("김하나 실제 도착 시간");
    const error = screen.getByText("김하나 회원의 실제 도착 시간을 입력해 주세요.");
    expect(arrivalInput).toHaveAttribute("aria-describedby", error.id);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(arrivalInput, { target: { value: "18:00" } });
    expect(
      screen.getByText("김하나 회원의 실제 도착 시간은 시작 후 종료 이내여야 합니다."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(arrivalInput, { target: { value: "18:30" } });
    expect(await screen.findByText("김하나 저장됨")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("expresses permission, lifecycle, start-time, and ad-hoc removal rules", () => {
    const target = createTarget(
      "22222222-2222-4222-8222-222222222222",
      "김하나",
      { targetOrigin: "ad_hoc" },
    );
    const onRemove = vi.fn();
    const { rerender } = render(
      <MeetingRosterRow
        canManage={false}
        meetingId={meetingId}
        meetingStatus="scheduled"
        mode="rsvp"
        onRemove={onRemove}
        target={target}
      />,
    );
    expect(screen.getByLabelText("김하나 사전 참석")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "김하나 임시 대상 제거" })).not.toBeInTheDocument();

    rerender(
      <MeetingRosterRow
        canManage
        meetingId={meetingId}
        meetingStatus="cancelled"
        mode="rsvp"
        onRemove={onRemove}
        target={target}
      />,
    );
    expect(screen.getByLabelText("김하나 사전 참석")).toBeDisabled();

    rerender(
      <MeetingRosterRow
        canManage
        meetingId={meetingId}
        meetingStatus="scheduled"
        mode="attendance"
        onRemove={onRemove}
        target={target}
      />,
    );
    expect(screen.getByLabelText("김하나 실제 출석")).toBeDisabled();

    rerender(
      <MeetingRosterRow
        canManage
        meetingId={meetingId}
        meetingStatus="scheduled"
        mode="rsvp"
        onRemove={onRemove}
        target={target}
      />,
    );
    expect(
      screen.getByRole("button", { name: "김하나 임시 대상 제거" }),
    ).toBeEnabled();

    rerender(
      <MeetingRosterRow
        canManage
        meetingId={meetingId}
        meetingStatus="scheduled"
        mode="rsvp"
        onRemove={onRemove}
        target={{ ...target, hasRecordedState: true }}
      />,
    );
    expect(screen.getByText("기록이 있어 제거할 수 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "김하나 임시 대상 제거" })).not.toBeInTheDocument();
  });

  it("disables ad-hoc removal while the row save is in flight", () => {
    const target = createTarget(
      "22222222-2222-4222-8222-222222222222",
      "김하나",
      { targetOrigin: "ad_hoc" },
    );
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined));

    render(
      <MeetingRosterRow
        canManage
        meetingId={meetingId}
        meetingStatus="scheduled"
        mode="rsvp"
        onRemove={vi.fn()}
        target={target}
      />,
    );
    fireEvent.change(screen.getByLabelText("김하나 사전 참석"), {
      target: { value: "attending" },
    });

    expect(
      screen.getByRole("button", { name: "김하나 임시 대상 제거" }),
    ).toBeDisabled();
  });
});
