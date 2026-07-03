import { describe, expect, it } from "vitest";
import {
  normalizeEventInput,
  parseEventFormData,
  toEventDatabaseInput,
  validateEventForm,
} from "./event-form";

describe("event form", () => {
  it("normalizes event input", () => {
    expect(
      normalizeEventInput({
        eventDate: " 2026-07-11 ",
        eventTime: " 09:30 ",
        title: " 정기 모임 ",
        location: " 올림픽공원 ",
      }),
    ).toEqual({
      eventDate: "2026-07-11",
      eventTime: "09:30",
      title: "정기 모임",
      location: "올림픽공원",
    });
  });

  it("parses event form data", () => {
    const formData = new FormData();
    formData.set("eventDate", "2026-07-11");
    formData.set("eventTime", "09:30");
    formData.set("title", "정기 모임");
    formData.set("location", "올림픽공원");

    expect(parseEventFormData(formData)).toEqual({
      eventDate: "2026-07-11",
      eventTime: "09:30",
      title: "정기 모임",
      location: "올림픽공원",
    });
  });

  it("requires date, time, title, and location", () => {
    expect(
      validateEventForm({
        eventDate: "",
        eventTime: "",
        title: "",
        location: "",
      }),
    ).toEqual([
      "일정 날짜를 YYYY-MM-DD 형식으로 입력하세요.",
      "일정 시간을 HH:mm 형식으로 입력하세요.",
      "일정 이름을 입력하세요.",
      "장소를 입력하세요.",
    ]);
  });

  it("maps event form data to database input", () => {
    expect(
      toEventDatabaseInput({
        eventDate: "2026-07-11",
        eventTime: "09:30",
        title: "정기 모임",
        location: "올림픽공원",
      }),
    ).toEqual({
      event_date: "2026-07-11",
      event_time: "09:30",
      title: "정기 모임",
      location: "올림픽공원",
    });
  });
});
