import { describe, expect, it } from "vitest";
import { buildMonthCalendar, buildWeekCalendar, getMonthRange } from "./event-calendar";
import type { EventRecord } from "./event-model";

const events: EventRecord[] = [
  event("1", "2026-07-11", "11:00", "세 번째"),
  event("2", "2026-07-11", "09:00", "첫 번째"),
  event("3", "2026-07-11", "10:00", "두 번째"),
  event("4", "2026-07-11", "12:00", "네 번째"),
];

describe("event calendar", () => {
  it("builds complete month weeks and caps visible events at three", () => {
    const calendar = buildMonthCalendar("2026-07", events);
    const targetDay = calendar.weeks.flat().find((day) => day.date === "2026-07-11");

    expect(calendar.label).toBe("2026년 7월");
    expect(calendar.weeks.length).toBe(5);
    expect(calendar.weeks.every((week) => week.length === 7)).toBe(true);
    expect(targetDay?.visibleEvents.map((item) => item.title)).toEqual([
      "첫 번째",
      "두 번째",
      "세 번째",
    ]);
    expect(targetDay?.hiddenCount).toBe(1);
  });

  it("builds seven days for the selected week", () => {
    const calendar = buildWeekCalendar("2026-07-11", events);

    expect(calendar.days).toHaveLength(7);
    expect(calendar.days[0]?.date).toBe("2026-07-05");
    expect(calendar.days[6]?.date).toBe("2026-07-11");
    expect(calendar.days[6]?.events.map((item) => item.title)).toEqual([
      "첫 번째",
      "두 번째",
      "세 번째",
      "네 번째",
    ]);
  });

  it("returns the selected month range", () => {
    expect(getMonthRange("2026-07")).toEqual({
      start: "2026-07-01",
      end: "2026-08-01",
    });
  });
});

function event(
  id: string,
  eventDate: string,
  eventTime: string,
  title: string,
): EventRecord {
  return {
    id,
    eventDate,
    eventTime,
    title,
    location: "코트",
    createdBy: "operator-id",
    updatedBy: "operator-id",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
}
