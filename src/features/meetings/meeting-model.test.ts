import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_ORIGINS,
  ATTENDANCE_STATUSES,
  getMeetingStatus,
  LIFECYCLE_EVENT_TYPES,
  MEETING_KINDS,
  ROSTER_ORIGINS,
  ROSTER_STATUSES,
  RSVP_STATUSES,
  TARGET_ORIGINS,
  type ClubMeetingRecord,
  type MeetingAttendanceRecord,
  type MeetingDirectoryRow,
} from "./meeting-model";

describe("meeting model", () => {
  it("defines the persisted meeting state vocabularies", () => {
    expect(MEETING_KINDS).toEqual(["regular", "lightning"]);
    expect(ROSTER_STATUSES).toEqual(["preparing", "locked"]);
    expect(ROSTER_ORIGINS).toEqual(["automatic", "bootstrap"]);
    expect(RSVP_STATUSES).toEqual([
      "unanswered",
      "attending",
      "late",
      "declined",
    ]);
    expect(ATTENDANCE_STATUSES).toEqual([
      "unchecked",
      "present",
      "late",
      "absent",
    ]);
    expect(TARGET_ORIGINS).toEqual(["monthly_roster", "ad_hoc"]);
    expect(ATTENDANCE_ORIGINS).toEqual(["manual", "close_default"]);
    expect(LIFECYCLE_EVENT_TYPES).toEqual([
      "cancelled",
      "restored",
      "attendance_closed",
      "attendance_reopened",
      "location_updated",
      "lightning_created",
      "ad_hoc_added",
      "ad_hoc_removed",
    ]);
  });

  it("derives cancelled status before completed status", () => {
    const meeting = {
      cancelledAt: "2026-07-10T12:00:00Z",
      attendanceClosedAt: "2026-07-10T13:00:00Z",
    };

    expect(getMeetingStatus(meeting)).toBe("cancelled");
    expect(getMeetingStatus({ ...meeting, cancelledAt: null })).toBe(
      "completed",
    );
    expect(
      getMeetingStatus({ cancelledAt: null, attendanceClosedAt: null }),
    ).toBe("scheduled");
  });

  it("models independent RSVP and attendance concurrency tokens", () => {
    const attendance: MeetingAttendanceRecord = {
      meetingId: "meeting-id",
      memberId: "member-id",
      rosterMemberId: "roster-member-id",
      targetOrigin: "monthly_roster",
      memberCodeSnapshot: "A0001",
      memberNameSnapshot: "홍길동",
      groupCodeSnapshot: "A",
      rsvpStatus: "attending",
      attendanceStatus: "unchecked",
      arrivalTime: null,
      attendanceOrigin: null,
      rsvpUpdatedBy: "profile-id",
      rsvpUpdatedAt: "2026-07-14T09:00:00Z",
      attendanceUpdatedBy: null,
      attendanceUpdatedAt: "2026-07-14T08:00:00Z",
    };

    expect(attendance.rsvpUpdatedAt).not.toBe(attendance.attendanceUpdatedAt);
  });

  it("models the regular and lightning relationship without a mutable state field", () => {
    const meeting: ClubMeetingRecord = {
      id: "meeting-id",
      meetingKind: "regular",
      periodMonth: "2026-07-01",
      regularOccurrence: 1,
      meetingNumber: 1,
      meetingDate: "2026-07-04",
      startTime: "18:00",
      endTime: "22:00",
      title: "7월 첫째 정모",
      location: null,
      linkedRegularMeetingId: null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      attendanceClosedAt: null,
      attendanceClosedBy: null,
      createdBy: "profile-id",
      updatedBy: "profile-id",
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    };

    expect(meeting.regularOccurrence).toBe(1);
    expect(meeting).not.toHaveProperty("status");
  });

  it("models cumulative meeting numbers in directory rows", () => {
    const meeting: MeetingDirectoryRow = {
      id: "meeting-id",
      meetingKind: "regular",
      periodMonth: "2026-07-01",
      regularOccurrence: 3,
      meetingNumber: 1,
      meetingDate: "2026-07-18",
      startTime: "18:00",
      endTime: "22:00",
      title: "제1회 정모",
      location: null,
      linkedRegularMeetingId: null,
      linkedRegularMeetingNumber: null,
      status: "scheduled",
      counts: null,
    };

    expect(meeting.meetingNumber).toBe(1);
    expect(meeting.linkedRegularMeetingNumber).toBeNull();
  });
});
