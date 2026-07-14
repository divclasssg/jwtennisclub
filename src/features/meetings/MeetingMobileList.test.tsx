import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MeetingDirectoryRow } from "./meeting-model";
import { MeetingMobileList } from "./MeetingMobileList";

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

const linkedLightningMeeting: MeetingDirectoryRow = {
  ...regularMeeting,
  id: "22222222-2222-4222-8222-222222222222",
  meetingKind: "lightning",
  regularOccurrence: null,
  meetingDate: "2026-07-18",
  title: "복식 번개",
  location: null,
  linkedRegularMeetingId: regularMeeting.id,
  status: "completed",
  counts: null,
};

const independentLightningMeeting: MeetingDirectoryRow = {
  ...linkedLightningMeeting,
  id: "33333333-3333-4333-8333-333333333333",
  periodMonth: "2026-08-01",
  meetingDate: "2026-08-02",
  title: "일요일 번개",
  linkedRegularMeetingId: null,
  status: "cancelled",
};

describe("MeetingMobileList", () => {
  it("renders meetings in the sorted input order and preserves the available roster href", () => {
    render(
      <MeetingMobileList
        meetings={[
          linkedLightningMeeting,
          regularMeeting,
          independentLightningMeeting,
        ]}
      />,
    );

    const list = screen.getByRole("list", { name: "모바일 정모 목록" });
    const items = within(list).getAllByRole("listitem");

    expect(items.map((item) => within(item).getByRole("heading").textContent)).toEqual([
      "복식 번개",
      "7월 첫째 주 정모",
      "일요일 번개",
    ]);
    expect(within(items[1]).getByRole("link", {
      name: "7월 첫째 주 정모 명단 보기",
    })).toHaveAttribute(
      "href",
      `/meetings?month=2026-07&meeting=${regularMeeting.id}`,
    );
    expect(within(items[0]).queryByRole("link", { name: /명단 보기/ }))
      .not.toBeInTheDocument();
    expect(within(items[2]).queryByRole("link", { name: /명단 보기/ }))
      .not.toBeInTheDocument();
  });

  it("shows kind, lifecycle status, schedule, location, and lightning linkage", () => {
    render(
      <MeetingMobileList
        meetings={[
          regularMeeting,
          linkedLightningMeeting,
          independentLightningMeeting,
        ]}
      />,
    );

    const items = screen.getAllByRole("listitem");

    expect(within(items[0]).getByText("정기")).toBeInTheDocument();
    expect(within(items[0]).getByText("예정")).toBeInTheDocument();
    expect(within(items[0]).getByText("날짜 2026-07-04")).toBeInTheDocument();
    expect(within(items[0]).getByText("시간 18:00–22:00")).toBeInTheDocument();
    expect(within(items[0]).getByText("장소 센터 코트")).toBeInTheDocument();

    expect(within(items[1]).getByText("번개")).toBeInTheDocument();
    expect(within(items[1]).getByText("완료")).toBeInTheDocument();
    expect(within(items[1]).getByText("정기 정모 연결됨")).toBeInTheDocument();
    expect(within(items[1]).getByText("장소 미정")).toBeInTheDocument();

    expect(within(items[2]).getByText("취소")).toBeInTheDocument();
    expect(within(items[2]).getByText("독립 번개")).toBeInTheDocument();
  });

  it("shows RSVP and attendance counts or a preparation state", () => {
    render(
      <MeetingMobileList meetings={[regularMeeting, linkedLightningMeeting]} />,
    );

    const items = screen.getAllByRole("listitem");

    expect(within(items[0]).getByText("대상 7명")).toBeInTheDocument();
    expect(
      within(items[0]).getByText("사전 참석 3명 · 늦참 1명 · 불참 2명 · 미응답 1명"),
    ).toBeInTheDocument();
    expect(
      within(items[0]).getByText("출석 2명 · 지각 1명 · 결석 1명 · 미확인 3명"),
    ).toBeInTheDocument();
    expect(within(items[1]).getByText("명단 준비 전")).toBeInTheDocument();
    expect(within(items[1]).getByText("전월 마지막 7일에 명단이 준비됩니다."))
      .toBeInTheDocument();
    expect(within(items[1]).queryByRole("link", { name: /명단 보기/ }))
      .not.toBeInTheDocument();
  });

  it("renders server-composed lifecycle actions inside each mobile card", () => {
    render(
      <MeetingMobileList
        meetings={[regularMeeting, linkedLightningMeeting]}
        renderActions={(meeting) => (
          <div aria-label={`${meeting.title} 모바일 작업`} role="group">
            회차 작업
          </div>
        )}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(
      within(items[0]).getByRole("group", {
        name: "7월 첫째 주 정모 모바일 작업",
      }),
    ).toBeInTheDocument();
    expect(
      within(items[1]).getByRole("group", { name: "복식 번개 모바일 작업" }),
    ).toBeInTheDocument();
  });
});
