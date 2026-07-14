import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingDirectoryPage } from "@/features/meetings/meeting-directory";
import type { MeetingDirectoryRow } from "@/features/meetings/meeting-model";
import MeetingsPage, { canonicalizeScheduleReturnTo } from "./page";

const mocks = vi.hoisted(() => ({
  addMeetingAdHocMember: vi.fn(),
  currentOperatorHasPermission: vi.fn(),
  loadMeetingDirectoryPage: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  removeMeetingAdHocMember: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/features/auth/operator-context", () => ({
  currentOperatorHasPermission: mocks.currentOperatorHasPermission,
}));
vi.mock("@/features/meetings/meeting-directory", () => ({
  loadMeetingDirectoryPage: mocks.loadMeetingDirectoryPage,
}));
vi.mock("./actions", () => ({
  addMeetingAdHocMember: mocks.addMeetingAdHocMember,
  removeMeetingAdHocMember: mocks.removeMeetingAdHocMember,
  cancelClubMeeting: vi.fn(),
  closeClubMeetingAttendance: vi.fn(),
  createLightningClubMeeting: vi.fn(),
  reopenClubMeetingAttendance: vi.fn(),
  restoreClubMeeting: vi.fn(),
  updateClubMeetingLocation: vi.fn(),
}));
vi.mock("@/features/meetings/MeetingRosterModal", () => ({
  MeetingRosterModal: (props: {
    attendanceStarted: boolean;
    closeHref: string;
    meeting: MeetingDirectoryRow;
    onAddAdHocMember?: (memberId: string) => Promise<unknown>;
    onRemoveAdHocMember?: (memberId: string) => Promise<unknown>;
  }) => (
    <aside aria-label={`${props.meeting.title} 테스트 명단`}>
      <span>닫기 경로 {props.closeHref}</span>
      <span>출석 시작 {String(props.attendanceStarted)}</span>
      {props.onAddAdHocMember ? (
        <button onClick={() => void props.onAddAdHocMember?.("member-1")} type="button">
          테스트 임시 추가
        </button>
      ) : null}
      {props.onRemoveAdHocMember ? (
        <button onClick={() => void props.onRemoveAdHocMember?.("member-1")} type="button">
          테스트 임시 제거
        </button>
      ) : null}
    </aside>
  ),
}));

const regularMeeting: MeetingDirectoryRow = {
  id: "11111111-1111-4111-8111-111111111111",
  meetingKind: "regular",
  periodMonth: "2026-07-01",
  regularOccurrence: 1,
  meetingDate: "2026-07-04",
  startTime: "18:00:00",
  endTime: "22:00:00",
  title: "7월 첫째 주 정모",
  location: "센터 코트",
  linkedRegularMeetingId: null,
  status: "scheduled",
  counts: {
    total: 7,
    rsvpUnanswered: 1,
    rsvpAttending: 3,
    rsvpLate: 1,
    rsvpDeclined: 2,
    attendanceUnchecked: 3,
    attendancePresent: 2,
    attendanceLate: 1,
    attendanceAbsent: 1,
  },
};

const cancelledMeeting: MeetingDirectoryRow = {
  ...regularMeeting,
  id: "22222222-2222-4222-8222-222222222222",
  regularOccurrence: 3,
  meetingDate: "2026-07-18",
  title: "7월 셋째 주 정모",
  status: "cancelled",
};

const completedLightning: MeetingDirectoryRow = {
  ...regularMeeting,
  id: "33333333-3333-4333-8333-333333333333",
  meetingKind: "lightning",
  regularOccurrence: null,
  meetingDate: "2026-07-19",
  title: "대체 번개",
  linkedRegularMeetingId: cancelledMeeting.id,
  status: "completed",
};

const directoryPage: MeetingDirectoryPage = {
  periodMonth: "2026-07-01",
  canManageMeeting: true,
  canManageAttendance: true,
  roster: {
    status: "locked",
    rosterOrigin: "bootstrap",
    statisticsEligible: false,
  },
  summary: { total: 3, scheduled: 1, completed: 1, cancelled: 1 },
  meetings: [regularMeeting, cancelledMeeting, completedLightning],
  selectedMeeting: null,
  modalError: null,
};

function cloneDirectoryPage(
  overrides: Partial<MeetingDirectoryPage> = {},
): MeetingDirectoryPage {
  return {
    ...directoryPage,
    summary: { ...directoryPage.summary },
    meetings: [...directoryPage.meetings],
    ...overrides,
  };
}

describe("MeetingsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T15:30:00.000Z"));
    mocks.currentOperatorHasPermission.mockReset();
    mocks.currentOperatorHasPermission.mockResolvedValue(true);
    mocks.loadMeetingDirectoryPage.mockReset();
    mocks.loadMeetingDirectoryPage.mockResolvedValue(cloneDirectoryPage());
    mocks.notFound.mockClear();
    mocks.addMeetingAdHocMember.mockReset();
    mocks.addMeetingAdHocMember.mockResolvedValue({ status: "saved" });
    mocks.removeMeetingAdHocMember.mockReset();
    mocks.removeMeetingAdHocMember.mockResolvedValue({ status: "saved" });
  });

  afterEach(() => vi.useRealTimers());

  it("blocks direct access before loading directory data without meetings.view", async () => {
    mocks.currentOperatorHasPermission.mockResolvedValue(false);

    await expect(
      MeetingsPage({ searchParams: Promise.resolve({ month: "2026-07" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.currentOperatorHasPermission).toHaveBeenCalledWith("meetings.view");
    expect(mocks.loadMeetingDirectoryPage).not.toHaveBeenCalled();
  });

  it("uses the KST current month, shares ordered rows across table and mobile, and shows summary and bootstrap state", async () => {
    render(await MeetingsPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.loadMeetingDirectoryPage).toHaveBeenCalledWith({
      meetingId: null,
      month: "2026-07",
    });
    expect(screen.getByRole("heading", { name: "정모 관리" })).toBeInTheDocument();
    expect(screen.getByLabelText("조회 월")).toHaveValue("2026-07");
    const summary = screen.getByRole("region", { name: "정모 요약" });
    expect(within(summary).getByText("전체").nextSibling).toHaveTextContent("3회");
    expect(within(summary).getByText("예정").nextSibling).toHaveTextContent("1회");
    expect(within(summary).getByText("완료").nextSibling).toHaveTextContent("1회");
    expect(within(summary).getByText("취소").nextSibling).toHaveTextContent("1회");
    expect(screen.getByText("최초 배포 월 · 통계 제외")).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual([
      "7월 첫째 주 정모",
      "7월 셋째 주 정모",
      "대체 번개",
    ]);
    const mobileList = screen.getByRole("list", { name: "모바일 정모 목록" });
    expect(within(mobileList).getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "7월 첫째 주 정모",
      "7월 셋째 주 정모",
      "대체 번개",
    ]);
    const mobileManagementToggle = within(mobileList).getByRole("button", {
      name: "7월 첫째 주 정모 관리 열기",
    });
    expect(mobileManagementToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(mobileList).queryByRole("region", {
      name: "7월 첫째 주 정모 회차 관리",
    })).not.toBeInTheDocument();

    fireEvent.click(mobileManagementToggle);

    expect(mobileManagementToggle).toHaveAttribute("aria-expanded", "true");
    expect(within(mobileList).getByRole("region", {
      name: "7월 첫째 주 정모 회차 관리",
    })).toBeInTheDocument();
    expect(
      within(table).getByRole("link", { name: "7월 첫째 주 정모 명단 보기" }),
    ).toHaveAttribute(
      "href",
      `/meetings?month=2026-07&meeting=${regularMeeting.id}`,
    );
    expect(within(table).getAllByText("참석 3 · 늦참 1 · 불참 2 · 미응답 1"))
      .toHaveLength(3);
  });

  it("keeps roster access but omits management disclosures without meeting permission", async () => {
    mocks.loadMeetingDirectoryPage.mockResolvedValueOnce(
      cloneDirectoryPage({ canManageMeeting: false }),
    );

    render(await MeetingsPage({ searchParams: Promise.resolve({ month: "2026-07" }) }));

    const table = screen.getByRole("table");
    const mobileList = screen.getByRole("list", { name: "모바일 정모 목록" });
    expect(within(table).getByRole("link", {
      name: "7월 첫째 주 정모 명단 보기",
    })).toBeInTheDocument();
    expect(within(mobileList).getByRole("link", {
      name: "7월 첫째 주 정모 명단 보기",
    })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /관리 열기/ })).not.toBeInTheDocument();
    expect(screen.queryByText("조회 전용")).not.toBeInTheDocument();
  });

  it("falls back from an invalid month and exposes preparing and unavailable roster states", async () => {
    mocks.loadMeetingDirectoryPage.mockResolvedValueOnce(
      cloneDirectoryPage({
        roster: {
          status: "preparing",
          rosterOrigin: "automatic",
          statisticsEligible: true,
        },
      }),
    );
    const { unmount } = render(
      await MeetingsPage({ searchParams: Promise.resolve({ month: "2026-13" }) }),
    );

    expect(mocks.loadMeetingDirectoryPage).toHaveBeenLastCalledWith({
      meetingId: null,
      month: "2026-07",
    });
    expect(screen.getByText("다음 달 명단 준비 중")).toBeInTheDocument();

    unmount();
    mocks.loadMeetingDirectoryPage.mockResolvedValueOnce(
      cloneDirectoryPage({ roster: null }),
    );
    render(await MeetingsPage({ searchParams: Promise.resolve({ month: ["2026-07", "2026-08"] }) }));
    expect(screen.getByText("명단 준비 전")).toBeInTheDocument();
  });

  it("opens a selected roster with a canonical schedule close path and wires ad-hoc actions", async () => {
    mocks.loadMeetingDirectoryPage.mockResolvedValue(
      cloneDirectoryPage({
        selectedMeeting: {
          meeting: regularMeeting,
          targets: [],
          adHocCandidates: [],
          lifecycleEvents: [],
        },
      }),
    );

    render(
      await MeetingsPage({
        searchParams: Promise.resolve({
          meeting: regularMeeting.id,
          month: "2026-07",
          returnTo:
            "/schedule?selectedDate=2026-07-04&evil=drop&view=month&month=2026-07",
        }),
      }),
    );

    expect(mocks.loadMeetingDirectoryPage).toHaveBeenCalledWith({
      meetingId: regularMeeting.id,
      month: "2026-07",
    });
    expect(screen.getByText(
      "닫기 경로 /schedule?view=month&month=2026-07&selectedDate=2026-07-04",
    )).toBeInTheDocument();
    expect(screen.getByText("출석 시작 false")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "테스트 임시 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 임시 제거" }));
    expect(mocks.addMeetingAdHocMember).toHaveBeenCalledWith({
      meetingId: regularMeeting.id,
      memberId: "member-1",
    });
    expect(mocks.removeMeetingAdHocMember).toHaveBeenCalledWith({
      meetingId: regularMeeting.id,
      memberId: "member-1",
    });
  });

  it("uses the selected period month list as the direct-entry close fallback", async () => {
    mocks.loadMeetingDirectoryPage.mockResolvedValue(
      cloneDirectoryPage({
        selectedMeeting: {
          meeting: regularMeeting,
          targets: [],
          adHocCandidates: [],
          lifecycleEvents: [],
        },
      }),
    );

    render(
      await MeetingsPage({
        searchParams: Promise.resolve({
          meeting: regularMeeting.id,
          month: "2026-07",
          returnTo: "/schedule/",
        }),
      }),
    );

    expect(screen.getByText("닫기 경로 /meetings?month=2026-07"))
      .toBeInTheDocument();
  });

  it("shows a safe modal error and falls back to the month list for malformed meeting and returnTo", async () => {
    render(
      await MeetingsPage({
        searchParams: Promise.resolve({
          meeting: "not-a-uuid",
          month: "2026-07",
          returnTo: "https://evil.example/schedule?view=week",
        }),
      }),
    );

    expect(mocks.loadMeetingDirectoryPage).toHaveBeenCalledWith({
      meetingId: null,
      month: "2026-07",
    });
    expect(screen.getByRole("alert")).toHaveTextContent("선택한 정모를 열 수 없습니다.");
    expect(screen.queryByLabelText(/테스트 명단/)).not.toBeInTheDocument();
  });
});

describe("canonicalizeScheduleReturnTo", () => {
  it("keeps only normalized schedule parameters in canonical order", () => {
    expect(
      canonicalizeScheduleReturnTo(
        "/schedule?selectedDate=2026-07-18&unused=x&date=2026-07-12&view=week&month=2026-07",
      ),
    ).toBe(
      "/schedule?view=week&month=2026-07&date=2026-07-12&selectedDate=2026-07-18",
    );
    expect(canonicalizeScheduleReturnTo("/schedule?view=grid&month=2026-99"))
      .toBe("/schedule");
  });

  it.each([
    "https://example.com/schedule?view=week",
    "//example.com/schedule?view=week",
    "/\\example.com/schedule",
    "/schedule%2Fevil?view=week",
    "/schedule%5Cevil?view=week",
    "https://user:pass@example.com/schedule",
    "/schedule?view=week#fragment",
    "/schedule?view=week\u0000",
    `/schedule?view=week&date=${"1".repeat(2100)}`,
  ])("rejects unsafe returnTo %s", (value) => {
    expect(canonicalizeScheduleReturnTo(value)).toBeNull();
  });
});
