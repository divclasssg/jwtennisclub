import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCurrentOperatorContext: vi.fn(),
  loadMeetingScheduleRecords: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({ deleteEvent: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/features/auth/operator-context", () => ({
  loadCurrentOperatorContext: mocks.loadCurrentOperatorContext,
}));
vi.mock("@/features/meetings/meeting-schedule", () => ({
  loadMeetingScheduleRecords: mocks.loadMeetingScheduleRecords,
}));

const events = [
  event("event-1", "2026-07-11", "11:00:00", "세 번째", "올림픽공원"),
  event("event-2", "2026-07-11", "09:00:00", "첫 번째", "올림픽공원"),
  event("event-3", "2026-07-11", "10:00:00", "두 번째", "올림픽공원"),
  event("event-4", "2026-07-11", "12:00:00", "네 번째", "올림픽공원"),
];

let eventResult: { data: typeof events | null; error: null | { message: string } };
const eventsQuery = {
  gte: vi.fn(() => eventsQuery),
  lt: vi.fn(() => eventsQuery),
  order: vi.fn(() => eventsQuery),
  select: vi.fn(() => eventsQuery),
  then: (resolve: (value: typeof eventResult) => void) =>
    Promise.resolve(resolve(eventResult)),
};
const from = vi.fn(() => eventsQuery);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from })),
}));

import SchedulePage from "./page";

describe("SchedulePage", () => {
  beforeEach(() => {
    cleanup();
    eventResult = { data: events, error: null };
    eventsQuery.gte.mockClear();
    eventsQuery.lt.mockClear();
    eventsQuery.order.mockClear();
    eventsQuery.select.mockClear();
    from.mockClear();
    mocks.notFound.mockClear();
    mocks.loadCurrentOperatorContext.mockReset();
    mocks.loadCurrentOperatorContext.mockResolvedValue({
      permissions: ["events.view", "meetings.view"],
    });
    mocks.loadMeetingScheduleRecords.mockReset();
    mocks.loadMeetingScheduleRecords.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders and queries the complete selected month from both sources", async () => {
    render(
      await SchedulePage({
        searchParams: Promise.resolve({
          month: "2026-07",
          selectedDate: "2026-07-11",
        }),
      }),
    );

    expect(screen.getByRole("heading", { name: "일정 관리" })).toBeInTheDocument();
    expect(screen.getByText("09:00 첫 번째")).toBeInTheDocument();
    expect(screen.getByText("+1개")).toBeInTheDocument();
    expect(eventsQuery.gte).toHaveBeenCalledWith("event_date", "2026-07-01");
    expect(eventsQuery.lt).toHaveBeenCalledWith("event_date", "2026-08-01");
    expect(mocks.loadMeetingScheduleRecords).toHaveBeenCalledWith({
      start: "2026-07-01",
      end: "2026-08-01",
    });
  });

  it("queries the actual cross-month week and links lightning by period month", async () => {
    mocks.loadMeetingScheduleRecords.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        meetingKind: "lightning",
        periodMonth: "2026-07-01",
        meetingDate: "2026-08-01",
        startTime: "18:00",
        title: "대체 번개",
        location: "센터 코트",
        status: "scheduled",
      },
    ]);

    render(
      await SchedulePage({
        searchParams: Promise.resolve({ view: "week", date: "2026-08-01" }),
      }),
    );

    expect(eventsQuery.gte).toHaveBeenCalledWith("event_date", "2026-07-26");
    expect(eventsQuery.lt).toHaveBeenCalledWith("event_date", "2026-08-02");
    const link = screen.getByRole("link", { name: /대체 번개/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("month=2026-07"));
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(
      "returnTo=/schedule?view=week&date=2026-08-01",
    );
  });

  it("keeps week view when moving to adjacent periods", async () => {
    render(
      await SchedulePage({
        searchParams: Promise.resolve({ view: "week", date: "2026-07-11" }),
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

  it("skips the meeting source for an events-only operator", async () => {
    mocks.loadCurrentOperatorContext.mockResolvedValue({
      permissions: ["events.view"],
    });
    mocks.loadMeetingScheduleRecords.mockRejectedValue(new Error("must skip"));

    render(await SchedulePage({ searchParams: Promise.resolve({ month: "2026-07" }) }));
    expect(screen.getByRole("heading", { name: "일정 관리" })).toBeInTheDocument();
    expect(mocks.loadMeetingScheduleRecords).not.toHaveBeenCalled();
  });

  it("fails the whole calendar when an authorized source fails", async () => {
    mocks.loadMeetingScheduleRecords.mockRejectedValue(new Error("meeting failed"));
    await expect(
      SchedulePage({ searchParams: Promise.resolve({ month: "2026-07" }) }),
    ).rejects.toThrow("일정 목록을 불러오지 못했습니다.");
  });

  it.each([
    ["meetings only", ["meetings.view"]],
    ["no permissions", []],
  ])("blocks schedule access with %s", async (_label, permissions) => {
    mocks.loadCurrentOperatorContext.mockResolvedValue({ permissions });
    await expect(
      SchedulePage({ searchParams: Promise.resolve({ month: "2026-07" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(from).not.toHaveBeenCalled();
  });

  it("uses the KST date when UTC is still on the previous day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T15:30:00.000Z"));
    render(await SchedulePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("2026년 8월")).toBeInTheDocument();
  });

  it("shows edit/delete only for ordinary events and a roster link for meetings", async () => {
    mocks.loadMeetingScheduleRecords.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        meetingKind: "regular",
        periodMonth: "2026-07-01",
        meetingDate: "2026-07-11",
        startTime: "18:00",
        title: "정모",
        location: null,
        status: "scheduled",
      },
    ]);
    render(
      await SchedulePage({
        searchParams: Promise.resolve({
          month: "2026-07",
          selectedDate: "2026-07-11",
        }),
      }),
    );
    const selected = screen.getByRole("region", { name: "선택한 날짜 일정" });
    expect(within(selected).getAllByRole("link", { name: "수정" })).toHaveLength(4);
    expect(within(selected).getAllByRole("button", { name: "삭제" })).toHaveLength(4);
    expect(within(selected).getByRole("link", { name: "명단" })).toHaveAttribute(
      "href",
      expect.stringContaining("/meetings?"),
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
