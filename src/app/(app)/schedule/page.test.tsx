import { cleanup, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SchedulePage from "./page";

vi.mock("./actions", () => ({
  deleteEvent: vi.fn(),
}));

const events = [
  event("event-1", "2026-07-11", "11:00:00", "세 번째", "올림픽공원"),
  event("event-2", "2026-07-11", "09:00:00", "첫 번째", "올림픽공원"),
  event("event-3", "2026-07-11", "10:00:00", "두 번째", "올림픽공원"),
  event("event-4", "2026-07-11", "12:00:00", "네 번째", "올림픽공원"),
];

const eventsQuery = {
  gte: vi.fn(() => eventsQuery),
  lt: vi.fn(() => eventsQuery),
  order: vi.fn(() => eventsQuery),
  select: vi.fn(() => eventsQuery),
  then: (resolve: (value: { data: typeof events; error: null }) => void) =>
    Promise.resolve(resolve({ data: events, error: null })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table !== "events") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return eventsQuery;
    }),
  })),
}));

describe("SchedulePage", () => {
  beforeEach(() => {
    cleanup();
    eventsQuery.gte.mockClear();
    eventsQuery.lt.mockClear();
    eventsQuery.order.mockClear();
    eventsQuery.select.mockClear();
  });

  it("renders month calendar with overflow count", async () => {
    render(
      await SchedulePage({
        searchParams: Promise.resolve({
          month: "2026-07",
          selectedDate: "2026-07-11",
        }),
      }),
    );

    expect(screen.getByRole("heading", { name: "일정 관리" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "일정 등록" })).toHaveAttribute(
      "href",
      "/schedule/new",
    );
    expect(screen.getByRole("link", { name: "월" })).toHaveAttribute(
      "href",
      "/schedule?view=month&month=2026-07",
    );
    expect(screen.getByRole("link", { name: "주" })).toHaveAttribute(
      "href",
      "/schedule?view=week&date=2026-07-11",
    );
    expect(screen.getByText("09:00 첫 번째")).toBeInTheDocument();
    expect(screen.getByText("+1개")).toBeInTheDocument();
    expect(screen.queryByText("12:00 네 번째")).not.toBeInTheDocument();

    const selectedEvents = screen.getByRole("region", {
      name: "선택한 날짜 일정",
    });
    expect(within(selectedEvents).getByText("12:00")).toBeInTheDocument();
    expect(within(selectedEvents).getByText("네 번째")).toBeInTheDocument();
  });

  it("renders week calendar with all events and locations", async () => {
    render(
      await SchedulePage({
        searchParams: Promise.resolve({
          view: "week",
          date: "2026-07-11",
        }),
      }),
    );

    const week = screen.getByRole("region", { name: "주별 일정" });
    expect(within(week).getByText("09:00 첫 번째")).toBeInTheDocument();
    expect(within(week).getByText("12:00 네 번째")).toBeInTheDocument();
    expect(within(week).getAllByText("올림픽공원").length).toBeGreaterThan(0);
  });

  it("keeps week view when moving to the previous or next period", async () => {
    render(
      await SchedulePage({
        searchParams: Promise.resolve({
          view: "week",
          date: "2026-07-11",
        }),
      }),
    );

    expect(screen.getByRole("link", { name: "이전" })).toHaveAttribute(
      "href",
      "/schedule?view=week&date=2026-07-04",
    );
    expect(screen.getByRole("link", { name: "다음" })).toHaveAttribute(
      "href",
      "/schedule?view=week&date=2026-07-18",
    );
  });
});

function event(
  id: string,
  eventDate: string,
  eventTime: string,
  title: string,
  location: string,
) {
  return {
    id,
    event_date: eventDate,
    event_time: eventTime,
    title,
    location,
    created_by: "operator-id",
    updated_by: "operator-id",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };
}
