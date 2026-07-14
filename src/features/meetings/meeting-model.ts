export const MEETING_KINDS = ["regular", "lightning"] as const;
export const ROSTER_STATUSES = ["preparing", "locked"] as const;
export const ROSTER_ORIGINS = ["automatic", "bootstrap"] as const;
export const RSVP_STATUSES = [
  "unanswered",
  "attending",
  "late",
  "declined",
] as const;
export const ATTENDANCE_STATUSES = [
  "unchecked",
  "present",
  "late",
  "absent",
] as const;
export const TARGET_ORIGINS = ["monthly_roster", "ad_hoc"] as const;
export const ATTENDANCE_ORIGINS = ["manual", "close_default"] as const;
export const LIFECYCLE_EVENT_TYPES = [
  "cancelled",
  "restored",
  "attendance_closed",
  "attendance_reopened",
  "location_updated",
  "lightning_created",
  "ad_hoc_added",
  "ad_hoc_removed",
] as const;

export type MeetingKind = (typeof MEETING_KINDS)[number];
export type MeetingRosterStatus = (typeof ROSTER_STATUSES)[number];
export type MeetingRosterOrigin = (typeof ROSTER_ORIGINS)[number];
export type RsvpStatus = (typeof RSVP_STATUSES)[number];
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type MeetingTargetOrigin = (typeof TARGET_ORIGINS)[number];
export type AttendanceOrigin = (typeof ATTENDANCE_ORIGINS)[number];
export type MeetingLifecycleEventType =
  (typeof LIFECYCLE_EVENT_TYPES)[number];
export type MeetingStatus = "scheduled" | "cancelled" | "completed";

export type ClubMeetingRecord = {
  id: string;
  meetingKind: MeetingKind;
  periodMonth: string;
  regularOccurrence: 1 | 3 | null;
  meetingDate: string;
  startTime: string;
  endTime: string;
  title: string;
  location: string | null;
  linkedRegularMeetingId: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  attendanceClosedAt: string | null;
  attendanceClosedBy: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type MeetingMonthRosterRecord = {
  id: string;
  periodMonth: string;
  status: MeetingRosterStatus;
  rosterOrigin: MeetingRosterOrigin;
  statisticsEligible: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MeetingMonthRosterMemberRecord = {
  id: string;
  rosterId: string;
  memberId: string;
  memberCodeSnapshot: string;
  memberNameSnapshot: string;
  groupCodeSnapshot: string | null;
  createdAt: string;
};

export type MeetingAttendanceRecord = {
  meetingId: string;
  memberId: string;
  rosterMemberId: string | null;
  targetOrigin: MeetingTargetOrigin;
  memberCodeSnapshot: string;
  memberNameSnapshot: string;
  groupCodeSnapshot: string | null;
  rsvpStatus: RsvpStatus;
  attendanceStatus: AttendanceStatus;
  arrivalTime: string | null;
  attendanceOrigin: AttendanceOrigin | null;
  rsvpUpdatedBy: string | null;
  rsvpUpdatedAt: string;
  attendanceUpdatedBy: string | null;
  attendanceUpdatedAt: string;
};

export type MeetingLifecycleEventRecord = {
  id: string;
  meetingId: string;
  eventType: MeetingLifecycleEventType;
  actorProfileId: string;
  occurredAt: string;
  reason: string | null;
  details: Readonly<Record<string, unknown>>;
};

export function getMeetingStatus(
  meeting: Pick<ClubMeetingRecord, "cancelledAt" | "attendanceClosedAt">,
): MeetingStatus {
  if (meeting.cancelledAt) {
    return "cancelled";
  }

  return meeting.attendanceClosedAt ? "completed" : "scheduled";
}
