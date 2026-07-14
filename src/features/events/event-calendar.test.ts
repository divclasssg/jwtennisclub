import { describe, expect, it } from "vitest";
import {
  buildMonthCalendar,
  buildWeekCalendar,
  createEventCalendarPreview,
  createMeetingCalendarPreview,
  getKstTodayDateKey,
  getMonthRange,
  getWeekRange,
} from "./event-calendar";
import type { EventRecord } from "./event-model";

const records: EventRecord[] = [
  event("1", "2026-07-11", "11:00", "세 번째"),
  event("2", "2026-07-11", "09:00", "첫 번째"),
  event("3", "2026-07-11", "10:00", "두 번째"),
  event("4", "2026-07-11", "12:00", "네 번째"),
];
const events = records.map(createEventCalendarPreview);

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

  it("returns the actual Sunday-to-Sunday range for a cross-month week", () => {
    expect(getWeekRange("2026-08-01")).toEqual({
      start: "2026-07-26",
      end: "2026-08-02",
    });
  });

  it("derives today in Asia/Seoul instead of slicing UTC", () => {
    expect(getKstTodayDateKey(new Date("2026-07-31T15:30:00.000Z"))).toBe(
      "2026-08-01",
    );
  });

  it("merges common previews with stable source links and meeting badges", () => {
    const ordinary = createEventCalendarPreview(
      event("event", "2026-08-01", "18:00", "일반 일정"),
    );
    const regular = createMeetingCalendarPreview(
      {
        id: "meeting",
        meetingKind: "regular",
        periodMonth: "2026-08-01",
        meetingDate: "2026-08-01",
        startTime: "18:00",
        title: "정모",
        location: null,
        status: "cancelled",
      },
      "/schedule?view=week&date=2026-08-01",
    );
    const lightning = createMeetingCalendarPreview(
      {
        id: "lightning",
        meetingKind: "lightning",
        periodMonth: "2026-07-01",
        meetingDate: "2026-08-01",
        startTime: "18:00",
        title: "대체 번개",
        location: "코트",
        status: "scheduled",
      },
      "/schedule?view=week&date=2026-08-01",
    );

    const day = buildMonthCalendar("2026-08", [lightning, regular, ordinary])
      .weeks.flat()
      .find((item) => item.date === "2026-08-01");

    expect(day?.events.map((item) => item.kind)).toEqual([
      "event",
      "meeting",
      "meeting",
    ]);
    expect(ordinary).toMatchObject({
      href: "/schedule/event/edit",
      badge: "일정",
      cancelled: false,
      canEdit: true,
    });
    expect(regular).toMatchObject({ badge: "정모", cancelled: true, canEdit: false });
    expect(lightning.href).toContain("month=2026-07");
    expect(lightning.href).toContain("meeting=lightning");
    expect(decodeURIComponent(lightning.href)).toContain(
      "returnTo=/schedule?view=week&date=2026-08-01",
    );
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
