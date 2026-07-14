import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MeetingAdHocCandidate,
  MeetingDirectoryRow,
  MeetingDirectoryTarget,
  MeetingLifecycleEventDisplay,
} from "./meeting-model";
import { MeetingRosterModal } from "./MeetingRosterModal";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), replace }),
}));

const meeting: MeetingDirectoryRow = {
  id: "11111111-1111-4111-8111-111111111111",
  meetingKind: "regular",
  periodMonth: "2026-07-01",
  regularOccurrence: 3,
  meetingDate: "2026-07-18",
  startTime: "18:00:00",
  endTime: "22:00:00",
  title: "7월 셋째 주 정모",
  location: "센터 코트",
  linkedRegularMeetingId: null,
  status: "scheduled",
  counts: null,
};

function target(
  memberId: string,
  name: string,
  overrides: Partial<MeetingDirectoryTarget> = {},
): MeetingDirectoryTarget {
  return {
    memberId,
    targetOrigin: "monthly_roster",
    memberCodeSnapshot: memberId.slice(0, 4),
    memberNameSnapshot: name,
    groupCodeSnapshot: "A",
    rsvpStatus: "unanswered",
    attendanceStatus: "unchecked",
    arrivalTime: null,
    attendanceOrigin: null,
    hasRecordedState: false,
    rsvpUpdatedAt: "2026-07-14T09:00:00.000Z",
    attendanceUpdatedAt: "2026-07-14T09:00:00.000Z",
    ...overrides,
  };
}

const targets = [
  target("22222222-2222-4222-8222-222222222222", "김하나"),
  target("33333333-3333-4333-8333-333333333333", "이둘"),
];

const candidates: MeetingAdHocCandidate[] = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    memberCode: "0044",
    name: "박후보",
    groupCode: "B",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    memberCode: "0055",
    name: "최지원",
    groupCode: null,
  },
];

const lifecycleEvents: MeetingLifecycleEventDisplay[] = [
  {
    id: "66666666-6666-4666-8666-666666666666",
    eventType: "location_updated",
    actorDisplayName: "운영자 김",
    occurredAt: "2026-07-14T09:00:00.000Z",
    reason: "코트 변경",
    details: { previous_location: "구 코트", location: "센터 코트" },
  },
];

function renderModal(
  overrides: Partial<Parameters<typeof MeetingRosterModal>[0]> = {},
) {
  return render(
    <MeetingRosterModal
      adHocCandidates={candidates}
      attendanceStarted
      canManageAttendance
      closeHref="/meetings?month=2026-07"
      lifecycleEvents={lifecycleEvents}
      meeting={meeting}
      targets={targets}
      {...overrides}
    />,
  );
}

describe("MeetingRosterModal", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders a large modal, meeting summary, and the explicit close destination", () => {
    renderModal();

    const dialog = screen.getByRole("dialog", { name: "7월 셋째 주 정모 명단" });
    expect(dialog.className).toContain("modal-panel-large");
    expect(within(dialog).getByText("2026-07-18")).toBeInTheDocument();
    expect(within(dialog).getByText("18:00–22:00")).toBeInTheDocument();
    expect(within(dialog).getByText("센터 코트")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(replace).toHaveBeenCalledWith("/meetings?month=2026-07");
  });

  it("connects ARIA tabs and moves selection and focus with arrow, Home, and End", () => {
    renderModal();

    const rsvpTab = screen.getByRole("tab", { name: "사전 참석" });
    const attendanceTab = screen.getByRole("tab", { name: "출석 체크" });
    expect(rsvpTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      rsvpTab.id,
    );

    fireEvent.keyDown(rsvpTab, { key: "ArrowRight" });
    expect(attendanceTab).toHaveFocus();
    expect(attendanceTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("김하나 실제 출석")).toBeInTheDocument();

    fireEvent.keyDown(attendanceTab, { key: "Home" });
    expect(rsvpTab).toHaveFocus();
    expect(rsvpTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(rsvpTab, { key: "End" });
    expect(attendanceTab).toHaveFocus();
    fireEvent.keyDown(attendanceTab, { key: "ArrowLeft" });
    expect(rsvpTab).toHaveFocus();
  });

  it("merges a confirmed row into local summary without losing saved feedback", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        status: "saved",
        row: {
          meetingId: meeting.id,
          memberId: targets[0].memberId,
          rsvpStatus: "attending",
          attendanceStatus: "unchecked",
          arrivalTime: null,
          rsvpUpdatedAt: "2026-07-14T09:05:00.000Z",
          attendanceUpdatedAt: targets[0].attendanceUpdatedAt,
        },
      }),
    );
    renderModal();

    const summary = screen.getByRole("region", { name: "사전 참석 요약" });
    expect(within(summary).getByRole("button", {
      name: "미응답 2명 필터",
    })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("김하나 사전 참석"), {
      target: { value: "attending" },
    });

    expect(await screen.findByText("김하나 저장됨")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(summary).getByRole("button", {
        name: "참석 1명 필터",
      })).toBeInTheDocument(),
    );
    expect(screen.getByText("김하나 저장됨")).toBeInTheDocument();
  });

  it("searches by name or member code and filters by the current-tab summary", () => {
    renderModal({
      targets: [
        targets[0],
        {
          ...targets[1],
          memberCodeSnapshot: "0099",
          rsvpStatus: "attending",
        },
      ],
    });

    const search = screen.getByRole("searchbox", { name: "명단 회원 검색" });
    fireEvent.change(search, { target: { value: "0099" } });
    expect(screen.queryByLabelText("김하나 사전 참석 행")).not.toBeInTheDocument();
    expect(screen.getByLabelText("이둘 사전 참석 행")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "김하나" } });
    expect(screen.getByLabelText("김하나 사전 참석 행")).toBeInTheDocument();
    expect(screen.queryByLabelText("이둘 사전 참석 행")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    const attendingFilter = screen.getByRole("button", {
      name: "참석 1명 필터",
    });
    fireEvent.click(attendingFilter);
    expect(attendingFilter).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("김하나 사전 참석 행")).not.toBeInTheDocument();
    expect(screen.getByLabelText("이둘 사전 참석 행")).toBeInTheDocument();
  });

  it("keeps the search query across tabs, resets status to all, and can clear a filtered empty state", () => {
    renderModal({
      targets: [
        targets[0],
        { ...targets[1], attendanceStatus: "present" },
      ],
    });

    const search = screen.getByRole("searchbox", { name: "명단 회원 검색" });
    fireEvent.change(search, { target: { value: "김하나" } });
    fireEvent.click(screen.getByRole("button", { name: "참석 0명 필터" }));
    expect(screen.getByText("조건에 맞는 회원이 없습니다.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "출석 체크" }));
    expect(search).toHaveValue("김하나");
    expect(screen.getByRole("button", { name: "전체 2명 필터" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("김하나 실제 출석 행")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "없는 회원" } });
    expect(screen.getByText("조건에 맞는 회원이 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(search).toHaveValue("");
    expect(screen.getByLabelText("김하나 실제 출석 행")).toBeInTheDocument();
    expect(screen.getByLabelText("이둘 실제 출석 행")).toBeInTheDocument();
  });

  it("keeps an actually empty roster distinct from filtered results", () => {
    renderModal({ targets: [] });

    expect(screen.getByText("대상 회원이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "필터 초기화" }))
      .not.toBeInTheDocument();
  });

  it("keeps ad-hoc controls closed after the member list and before history", () => {
    renderModal({ onAddAdHocMember: vi.fn() });

    const adHocSummary = screen.getByText("임시 대상 추가 0명");
    const historySummary = screen.getByText("변경 이력 1건");
    expect(adHocSummary.closest("details")).not.toHaveAttribute("open");
    expect(
      screen.getByLabelText("김하나 사전 참석 행").compareDocumentPosition(
        adHocSummary,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      adHocSummary.compareDocumentPosition(historySummary) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(adHocSummary);
    expect(screen.getByRole("searchbox", { name: "임시 대상 검색" }))
      .toBeInTheDocument();
  });

  it("searches, adds, and removes an eligible ad-hoc member through callbacks", async () => {
    const addedTarget = target(candidates[0].id, candidates[0].name, {
      targetOrigin: "ad_hoc",
      memberCodeSnapshot: candidates[0].memberCode,
      groupCodeSnapshot: candidates[0].groupCode,
    });
    const onAddAdHocMember = vi.fn().mockResolvedValue({
      status: "saved",
      target: addedTarget,
    });
    const onRemoveAdHocMember = vi.fn().mockResolvedValue({ status: "saved" });
    renderModal({ onAddAdHocMember, onRemoveAdHocMember });

    fireEvent.click(screen.getByText("임시 대상 추가 0명"));
    fireEvent.change(screen.getByLabelText("임시 대상 검색"), {
      target: { value: "후보" },
    });
    expect(screen.getByRole("option", { name: /박후보/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /최지원/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("임시 대상 후보"), {
      target: { value: candidates[0].id },
    });
    fireEvent.click(screen.getByRole("button", { name: "임시 대상 추가" }));

    await waitFor(() =>
      expect(onAddAdHocMember).toHaveBeenCalledWith(candidates[0].id),
    );
    expect(await screen.findByText("박후보 임시 대상을 추가했습니다.")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "박후보 임시 대상 제거" }),
    );
    await waitFor(() =>
      expect(onRemoveAdHocMember).toHaveBeenCalledWith(candidates[0].id),
    );
    expect(screen.queryByLabelText("박후보 사전 참석 행")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("임시 대상 후보"), {
      target: { value: candidates[0].id },
    });
    fireEvent.click(screen.getByRole("button", { name: "임시 대상 추가" }));
    await waitFor(() => expect(onAddAdHocMember).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("박후보 사전 참석 행")).toBeInTheDocument();
  });

  it("turns a rejected ad-hoc callback into a safe actionable error", async () => {
    const onAddAdHocMember = vi
      .fn()
      .mockRejectedValue(new Error("relation public.secret does not exist"));
    renderModal({ onAddAdHocMember });

    fireEvent.click(screen.getByText("임시 대상 추가 0명"));
    fireEvent.change(screen.getByLabelText("임시 대상 후보"), {
      target: { value: candidates[0].id },
    });
    fireEvent.click(screen.getByRole("button", { name: "임시 대상 추가" }));

    expect(
      await screen.findByText("요청을 처리하지 못했습니다. 다시 시도해 주세요."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
  });

  it("shows lifecycle history and prop-driven read-only guidance", () => {
    const { rerender } = renderModal({
      attendanceStarted: false,
      meeting: { ...meeting, status: "cancelled" },
    });

    expect(
      screen.getByText("취소된 회차로 명단을 조회만 할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("김하나 사전 참석")).toBeDisabled();

    fireEvent.click(screen.getByText("변경 이력 1건"));
    expect(screen.getByText("운영자 김")).toBeInTheDocument();
    expect(screen.getByText("코트 변경")).toBeInTheDocument();

    rerender(
      <MeetingRosterModal
        adHocCandidates={candidates}
        attendanceStarted={false}
        canManageAttendance
        closeHref="/meetings?month=2026-07"
        lifecycleEvents={lifecycleEvents}
        meeting={{ ...meeting, status: "scheduled" }}
        targets={targets}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "출석 체크" }));
    expect(
      screen.getByText("정모 시작 이후에 출석을 입력할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("김하나 실제 출석")).toBeDisabled();
  });
});
