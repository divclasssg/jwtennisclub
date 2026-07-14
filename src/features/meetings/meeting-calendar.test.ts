import { describe, expect, it } from "vitest";
import {
  getKstDateKey,
  getKstPeriodMonth,
  getRegularMeetingDates,
  getRequiredMeetingMonths,
} from "./meeting-calendar";

describe("meeting calendar", () => {
  it("calculates the first and third Saturday for ordinary and leap-year months", () => {
    expect(getRegularMeetingDates("2026-07-01")).toEqual([
      { occurrence: 1, meetingDate: "2026-07-04" },
      { occurrence: 3, meetingDate: "2026-07-18" },
    ]);
    expect(getRegularMeetingDates("2028-02-01")).toEqual([
      { occurrence: 1, meetingDate: "2028-02-05" },
      { occurrence: 3, meetingDate: "2028-02-19" },
    ]);
  });

  it("returns the current month and next two months across a year boundary", () => {
    expect(getRequiredMeetingMonths("2026-12-01")).toEqual([
      "2026-12-01",
      "2027-01-01",
      "2027-02-01",
    ]);
  });

  it("derives date and month keys in Asia/Seoul instead of UTC", () => {
    const utcInstant = new Date("2026-07-31T15:30:00.000Z");

    expect(getKstDateKey(utcInstant)).toBe("2026-08-01");
    expect(getKstPeriodMonth(utcInstant)).toBe("2026-08-01");
  });
});
