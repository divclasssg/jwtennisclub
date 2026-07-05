import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  buildMonthCalendar,
  buildWeekCalendar,
} from "./event-calendar";
import { MonthCalendarView, ScheduleToolbar, SelectedEventList, WeekCalendarView } from "./ScheduleCalendar";
import type { EventRecord } from "./event-model";

const events: EventRecord[] = [
  event("event-1", "2026-07-11", "09:00", "첫 번째", "올림픽공원"),
  event("event-2", "2026-07-11", "10:00", "두 번째", "올림픽공원"),
  event("event-3", "2026-07-11", "11:00", "세 번째", "올림픽공원"),
  event("event-4", "2026-07-11", "12:00", "네 번째", "올림픽공원"),
];

const buildHref = vi.fn((params: Record<string, string>) => {
  const searchParams = new URLSearchParams(params);
  return `/schedule?${searchParams.toString()}`;
});

describe("ScheduleCalendar components", () => {
  it("renders toolbar navigation and view tabs", () => {
    render(
      <ScheduleToolbar
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
