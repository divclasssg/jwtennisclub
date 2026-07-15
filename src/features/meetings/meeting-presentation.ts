import {
  ATTENDANCE_STATUSES,
  RSVP_STATUSES,
  type AttendanceStatus,
  type MeetingDirectoryRow,
  type MeetingKind,
  type MeetingStatus,
  type RsvpStatus,
} from "./meeting-model";

type MeetingTone = "danger" | "info" | "muted" | "success";

const meetingKindPresentation: Readonly<
  Record<MeetingKind, { label: string; tone: MeetingTone }>
> = {
  regular: { label: "정기", tone: "info" },
  lightning: { label: "번개", tone: "muted" },
};

const meetingStatusPresentation: Readonly<
  Record<MeetingStatus, { label: string; tone: MeetingTone }>
> = {
  scheduled: { label: "예정", tone: "info" },
  completed: { label: "완료", tone: "success" },
  cancelled: { label: "취소", tone: "danger" },
};

export const RSVP_STATUS_LABELS: Readonly<Record<RsvpStatus, string>> = {
  unanswered: "미응답",
  attending: "참석",
  late: "늦참",
  declined: "불참",
};

export const ATTENDANCE_STATUS_LABELS: Readonly<
  Record<AttendanceStatus, string>
> = {
  unchecked: "미체크",
  present: "출석",
  late: "지각",
  absent: "결석",
};

export const RSVP_STATUS_OPTIONS = RSVP_STATUSES.map((status) => ({
  status,
  label: RSVP_STATUS_LABELS[status],
}));

export const ATTENDANCE_STATUS_OPTIONS = ATTENDANCE_STATUSES.map((status) => ({
  status,
  label: ATTENDANCE_STATUS_LABELS[status],
}));

export function getMeetingKindPresentation(kind: MeetingKind) {
  return meetingKindPresentation[kind];
}

export function getMeetingStatusPresentation(status: MeetingStatus) {
  return meetingStatusPresentation[status];
}

export function getMeetingRowNumberLabel(meeting: MeetingDirectoryRow) {
  if (meeting.meetingNumber !== null) return String(meeting.meetingNumber);
  if (meeting.linkedRegularMeetingNumber !== null) {
    return `${meeting.linkedRegularMeetingNumber} 대체`;
  }
  return "-";
}

export function getMeetingCardNumberLabel(meeting: MeetingDirectoryRow) {
  if (meeting.meetingNumber !== null) return `${meeting.meetingNumber}회`;
  if (meeting.linkedRegularMeetingNumber !== null) {
    return `${meeting.linkedRegularMeetingNumber}회 대체`;
  }
  return "회차 없음";
}

export function formatMeetingTime(value: string) {
  return value.slice(0, 5);
}
