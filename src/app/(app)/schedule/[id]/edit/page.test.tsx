import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditEventPage from "./page";

vi.mock("../../actions", () => ({
  updateEvent: vi.fn(),
}));

const eventsQuery = {
  eq: vi.fn(() => eventsQuery),
  maybeSingle: vi.fn(async () => ({
    data: {
      id: "event-1",
      event_date: "2026-07-11",
      event_time: "09:30:00",
      title: "정기 모임",
      location: "올림픽공원",
      created_by: "operator-id",
      updated_by: "operator-id",
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
    },
    error: null,
  })),
  select: vi.fn(() => eventsQuery),
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

describe("EditEventPage", () => {
  beforeEach(() => {
    eventsQuery.eq.mockClear();
    eventsQuery.maybeSingle.mockClear();
    eventsQuery.select.mockClear();
  });

  it("renders the existing event form values", async () => {
    render(
      await EditEventPage({
        params: Promise.resolve({ id: "event-1" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "일정 관리" })).toBeInTheDocument();
    expect(screen.getByLabelText("일정 날짜")).toHaveValue("2026-07-11");
    expect(screen.getByLabelText("일정 시간")).toHaveValue("09:30");
    expect(screen.getByLabelText("일정 이름")).toHaveValue("정기 모임");
    expect(screen.getByLabelText("장소")).toHaveValue("올림픽공원");
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeInTheDocument();
    expect(eventsQuery.eq).toHaveBeenCalledWith("id", "event-1");
  });
});
