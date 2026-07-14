import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  buildMonthCalendar,
  buildWeekCalendar,
  createEventCalendarPreview,
  createMeetingCalendarPreview,
} from "./event-calendar";
import {
  MonthCalendarView,
  ScheduleScrollArea,
  ScheduleToolbar,
  SelectedEventList,
  WeekCalendarView,
} from "./ScheduleCalendar";
import type { EventRecord } from "./event-model";
import styles from "./ScheduleCalendar.module.scss";

const eventRecords: EventRecord[] = [
  event("event-1", "2026-07-11", "09:00", "첫 번째", "올림픽공원"),
  event("event-2", "2026-07-11", "10:00", "두 번째", "올림픽공원"),
  event("event-3", "2026-07-11", "11:00", "세 번째", "올림픽공원"),
  event("event-4", "2026-07-11", "12:00", "네 번째", "올림픽공원"),
];
const events = eventRecords.map(createEventCalendarPreview);

const buildHref = vi.fn((params: Record<string, string>) => {
  const searchParams = new URLSearchParams(params);
  return `/schedule?${searchParams.toString()}`;
});

describe("ScheduleCalendar components", () => {
  it("renders toolbar navigation and view tabs", () => {
    render(
      <ScheduleToolbar
        action={<a href="/schedule/new">일정 등록</a>}
        currentLabel="2026년 7월"
        nextHref="/schedule?month=2026-08"
        previousHref="/schedule?month=2026-06"
        todayHref="/schedule"
        view="month"
        monthHref="/schedule?view=month&month=2026-07"
        weekHref="/schedule?view=week&date=2026-07-11"
      />,
    );

    expect(screen.getByText("2026년 7월")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "월" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "다음" })).toHaveAttribute(
      "href",
      "/schedule?month=2026-08",
    );
    expect(screen.getByRole("link", { name: "일정 등록" })).toHaveAttribute(
      "href",
      "/schedule/new",
    );
  });

  it("renders month calendar overflow and selected events", () => {
    const monthCalendar = buildMonthCalendar("2026-07", events);

    render(
      <>
        <MonthCalendarView
          calendar={monthCalendar}
          buildHref={buildHref}
          selectedDate="2026-07-11"
        />
        <SelectedEventList
          events={events}
          formatDateLong={() => "2026.07.11"}
          month="2026-07"
          renderActions={(event) => <span>관리 {event.id}</span>}
          selectedDate="2026-07-11"
        />
      </>,
    );

    expect(screen.getByText("09:00 첫 번째")).toBeInTheDocument();
    expect(screen.getByText("+1개")).toBeInTheDocument();

    const selected = screen.getByRole("region", { name: "선택한 날짜 일정" });
    expect(within(selected).getByText("12:00")).toBeInTheDocument();
    expect(within(selected).getByText("관리 event-4")).toBeInTheDocument();
  });

  it("lets each month calendar day select that date from the whole day cell", () => {
    const monthCalendar = buildMonthCalendar("2026-07", events);

    render(
      <MonthCalendarView
        calendar={monthCalendar}
        buildHref={buildHref}
        selectedDate="2026-07-11"
      />,
    );

    const dayLink = screen.getByRole("link", {
      name: "2026년 7월 12일 일정 보기",
    });
    expect(dayLink).toHaveAttribute(
      "href",
      "/schedule?month=2026-07&selectedDate=2026-07-12",
    );
    expect(dayLink).toHaveClass(styles["schedule-day-cell-link"]);
  });

  it("groups the month calendar and selected-date list in a two-column layout", () => {
    const monthCalendar = buildMonthCalendar("2026-07", events);

    render(
      <ScheduleScrollArea layout="month">
        <MonthCalendarView
          calendar={monthCalendar}
          buildHref={buildHref}
          selectedDate="2026-07-11"
        />
        <SelectedEventList
          events={events}
          formatDateLong={() => "2026.07.11"}
          month="2026-07"
          renderActions={(event) => <span>관리 {event.id}</span>}
          selectedDate="2026-07-11"
        />
      </ScheduleScrollArea>,
    );

    const monthLayout = screen.getByRole("group", { name: "월간 일정과 선택 날짜 일정" });
    expect(monthLayout).toContainElement(
      screen.getByRole("region", { name: "월별 일정" }),
    );
    expect(monthLayout).toContainElement(
      screen.getByRole("region", { name: "선택한 날짜 일정" }),
    );
  });

  it("renders selected-date empty state through the shared empty pattern", () => {
    render(
      <SelectedEventList
        events={[]}
        formatDateLong={() => "2026.07.12"}
        month="2026-07"
        renderActions={(event) => <span>관리 {event.id}</span>}
        selectedDate="2026-07-12"
      />,
    );

    const selected = screen.getByRole("region", { name: "선택한 날짜 일정" });
    expect(
      within(selected).getByRole("heading", {
        name: "선택한 날짜에 등록된 일정이 없습니다.",
      }),
    ).toBeInTheDocument();
  });

  it("renders week calendar days with locations", () => {
    const weekCalendar = buildWeekCalendar("2026-07-11", events);

    render(<WeekCalendarView calendar={weekCalendar} />);

    const week = screen.getByRole("region", { name: "주별 일정" });
    expect(within(week).getByText("09:00 첫 번째")).toBeInTheDocument();
    expect(within(week).getAllByText("올림픽공원").length).toBeGreaterThan(0);
  });

  it("renders week calendar as a time-grid schedule", () => {
    const weekCalendar = buildWeekCalendar("2026-07-11", events);

    render(<WeekCalendarView calendar={weekCalendar} />);

    const timeGrid = screen.getByRole("grid", { name: "주간 시간표" });
    expect(within(timeGrid).getAllByRole("columnheader")).toHaveLength(7);
    expect(within(timeGrid).getByRole("columnheader", { name: "11일 (토)" })).toBeInTheDocument();
    expect(within(timeGrid).getByRole("rowheader", { name: "09:00" })).toBeInTheDocument();

    const eventCard = within(timeGrid).getByRole("listitem", { name: /첫 번째/ });
    expect(within(eventCard).getByRole("link", { name: "첫 번째" })).toHaveAttribute(
      "href",
      "/schedule/event-1/edit",
    );
    expect(eventCard).toHaveAttribute("style", expect.stringContaining("--week-event-day: 7"));
    expect(eventCard).toHaveAttribute("style", expect.stringContaining("--week-event-row: 4"));
    expect(eventCard).toHaveAttribute("style", expect.stringContaining("--week-event-offset: 0"));
  });

  it("uses each common preview source link and exposes meeting state badges", () => {
    const meeting = createMeetingCalendarPreview(
      {
        id: "meeting-1",
        meetingKind: "regular",
        periodMonth: "2026-07-01",
        meetingDate: "2026-07-11",
        startTime: "18:00",
        title: "취소 정모",
        location: null,
        status: "cancelled",
      },
      "/schedule?month=2026-07&selectedDate=2026-07-11",
    );
    const calendar = buildMonthCalendar("2026-07", [events[0], meeting]);

    render(
      <>
        <MonthCalendarView
          buildHref={buildHref}
          calendar={calendar}
          selectedDate="2026-07-11"
        />
        <SelectedEventList
          events={[events[0], meeting]}
          formatDateLong={() => "2026.07.11"}
          month="2026-07"
          renderActions={(event) =>
            event.canEdit ? <span>일정 관리</span> : <a href={event.href}>명단</a>
          }
          selectedDate="2026-07-11"
        />
      </>,
    );

    expect(screen.getAllByRole("link", { name: /취소 정모/ })[0]).toHaveAttribute(
      "href",
      meeting.href,
    );
    expect(screen.getAllByText("정모").length).toBeGreaterThan(0);
    expect(screen.getAllByText("취소").length).toBeGreaterThan(0);
    const selected = screen.getByRole("region", { name: "선택한 날짜 일정" });
    expect(within(selected).getByText("일정 관리")).toBeInTheDocument();
    expect(within(selected).getByRole("link", { name: "명단" })).toHaveAttribute(
      "href",
      meeting.href,
    );
  });
});

function event(
  id: string,
  eventDate: string,
  eventTime: string,
  title: string,
  location: string,
): EventRecord {
  return {
    id,
    eventDate,
    eventTime,
    title,
    location,
    createdBy: "operator-id",
    updatedBy: "operator-id",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
}
