import { describe, expect, it } from "vitest";
import type { MeetingDirectoryRow } from "./meeting-model";
import {
  getMeetingCardNumberLabel,
  getMeetingRowNumberLabel,
} from "./meeting-presentation";

const meeting = {
  meetingNumber: 3,
  linkedRegularMeetingNumber: null,
} as MeetingDirectoryRow;

describe("meeting number presentation", () => {
  it.each([
    [meeting, "3"],
    [{ ...meeting, meetingNumber: null, linkedRegularMeetingNumber: 2 }, "2 대체"],
    [{ ...meeting, meetingNumber: null }, "-"],
  ])("formats the desktop row number", (value, expected) => {
    expect(getMeetingRowNumberLabel(value)).toBe(expected);
  });

  it.each([
    [meeting, "3회"],
    [{ ...meeting, meetingNumber: null, linkedRegularMeetingNumber: 2 }, "2회 대체"],
    [{ ...meeting, meetingNumber: null }, "회차 없음"],
  ])("formats the mobile card number", (value, expected) => {
    expect(getMeetingCardNumberLabel(value)).toBe(expected);
  });
});
