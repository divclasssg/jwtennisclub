import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  ATTENDANCE_ORIGINS,
  ATTENDANCE_STATUSES,
  LIFECYCLE_EVENT_TYPES,
  MEETING_KINDS,
  ROSTER_ORIGINS,
  ROSTER_STATUSES,
  RSVP_STATUSES,
  TARGET_ORIGINS,
  type MeetingAdHocCandidate,
  type MeetingAttendanceCounts,
  type MeetingDirectoryRow,
  type MeetingDirectoryTarget,
  type MeetingLifecycleEventDisplay,
  type MeetingRosterOrigin,
  type MeetingRosterStatus,
} from "./meeting-model";

const uuidSchema = z.string().uuid();
const dateSchema = z.string().date();
const periodMonthSchema = dateSchema.refine(
  (value) => value.endsWith("-01"),
  "period month must be the first day",
);
const timestampSchema = z.string().datetime({ offset: true });
const databaseTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/);
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const prepareAcknowledgementSchema = z
  .object({ status: z.literal("prepared") })
  .passthrough();

const countsSchema = z
  .object({
    total: nonNegativeIntegerSchema,
    rsvp_unanswered: nonNegativeIntegerSchema,
    rsvp_attending: nonNegativeIntegerSchema,
    rsvp_late: nonNegativeIntegerSchema,
    rsvp_declined: nonNegativeIntegerSchema,
    attendance_unchecked: nonNegativeIntegerSchema,
    attendance_present: nonNegativeIntegerSchema,
    attendance_late: nonNegativeIntegerSchema,
    attendance_absent: nonNegativeIntegerSchema,
  })
  .strict();

const databaseMeetingSchema = z
  .object({
    id: uuidSchema,
    meeting_kind: z.enum(MEETING_KINDS),
    period_month: periodMonthSchema,
    regular_occurrence: z.union([z.literal(1), z.literal(3), z.null()]),
    meeting_number: z.number().int().positive().nullable(),
    linked_regular_meeting_number: z.number().int().positive().nullable(),
    meeting_date: dateSchema,
    start_time: databaseTimeSchema,
    end_time: databaseTimeSchema,
    title: z.string().min(1).max(200),
    location: z.string().min(1).max(200).nullable(),
    linked_regular_meeting_id: uuidSchema.nullable(),
    status: z.enum(["scheduled", "cancelled", "completed"]),
    counts: countsSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasValidNumbering =
      value.meeting_kind === "regular"
        ? value.meeting_number !== null &&
          value.linked_regular_meeting_number === null
        : value.meeting_number === null &&
          value.linked_regular_meeting_number !== null;

    if (!hasValidNumbering) {
      context.addIssue({
        code: "custom",
        message: "meeting numbering must match meeting kind",
      });
    }
  });

const databaseTargetSchema = z
  .object({
    member_id: uuidSchema,
    target_origin: z.enum(TARGET_ORIGINS),
    member_code_snapshot: z.string().min(1),
    member_name_snapshot: z.string().min(1),
    group_code_snapshot: z.string().min(1).nullable(),
    rsvp_status: z.enum(RSVP_STATUSES),
    attendance_status: z.enum(ATTENDANCE_STATUSES),
    arrival_time: databaseTimeSchema.nullable(),
    attendance_origin: z.enum(ATTENDANCE_ORIGINS).nullable(),
    has_recorded_state: z.boolean(),
    rsvp_updated_at: timestampSchema,
    attendance_updated_at: timestampSchema,
  })
  .strict();

const databaseCandidateSchema = z
  .object({
    id: uuidSchema,
    member_code: z.string().min(1),
    name: z.string().min(1),
    group_code: z.string().min(1).nullable(),
  })
  .strict();

const databaseLifecycleEventSchema = z
  .object({
    id: uuidSchema,
    event_type: z.enum(LIFECYCLE_EVENT_TYPES),
    actor_display_name: z.string().min(1),
    occurred_at: timestampSchema,
    reason: z.string().min(1).max(500).nullable(),
    details: z.record(z.string(), z.unknown()),
  })
  .strict();

const databaseSelectionSchema = z
  .object({
    meeting: databaseMeetingSchema,
    targets: z.array(databaseTargetSchema),
    ad_hoc_candidates: z.array(databaseCandidateSchema),
    lifecycle_events: z.array(databaseLifecycleEventSchema),
  })
  .strict();

const databasePageSchema = z
  .object({
    period_month: periodMonthSchema,
    can_manage_meeting: z.boolean(),
    can_manage_attendance: z.boolean(),
    roster: z
      .object({
        status: z.enum(ROSTER_STATUSES),
        roster_origin: z.enum(ROSTER_ORIGINS),
        statistics_eligible: z.boolean(),
      })
      .strict()
      .nullable(),
    summary: z
      .object({
        total: nonNegativeIntegerSchema,
        scheduled: nonNegativeIntegerSchema,
        completed: nonNegativeIntegerSchema,
        cancelled: nonNegativeIntegerSchema,
      })
      .strict(),
    meetings: z.array(databaseMeetingSchema),
    selected_meeting: databaseSelectionSchema.nullable(),
    modal_error: z.unknown().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.modal_error !== null && value.selected_meeting !== null) {
      context.addIssue({
        code: "custom",
        message: "modal error cannot include selection data",
      });
    }
  });

export type MeetingMonthRosterSummary = {
  status: MeetingRosterStatus;
  rosterOrigin: MeetingRosterOrigin;
  statisticsEligible: boolean;
};

export type MeetingDirectorySummary = {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
};

export type MeetingDirectorySelection = {
  meeting: MeetingDirectoryRow;
  targets: MeetingDirectoryTarget[];
  adHocCandidates: MeetingAdHocCandidate[];
  lifecycleEvents: MeetingLifecycleEventDisplay[];
};

export type MeetingDirectoryPage = {
  periodMonth: string;
  canManageMeeting: boolean;
  canManageAttendance: boolean;
  roster: MeetingMonthRosterSummary | null;
  summary: MeetingDirectorySummary;
  meetings: MeetingDirectoryRow[];
  selectedMeeting: MeetingDirectorySelection | null;
  modalError: string | null;
};

function mapCounts(value: z.infer<typeof countsSchema>): MeetingAttendanceCounts {
  return {
    total: value.total,
    rsvpUnanswered: value.rsvp_unanswered,
    rsvpAttending: value.rsvp_attending,
    rsvpLate: value.rsvp_late,
    rsvpDeclined: value.rsvp_declined,
    attendanceUnchecked: value.attendance_unchecked,
    attendancePresent: value.attendance_present,
    attendanceLate: value.attendance_late,
    attendanceAbsent: value.attendance_absent,
  };
}

function mapMeeting(
  value: z.infer<typeof databaseMeetingSchema>,
): MeetingDirectoryRow {
  return {
    id: value.id,
    meetingKind: value.meeting_kind,
    periodMonth: value.period_month,
    regularOccurrence: value.regular_occurrence,
    meetingNumber: value.meeting_number,
    linkedRegularMeetingNumber: value.linked_regular_meeting_number,
    meetingDate: value.meeting_date,
    startTime: value.start_time,
    endTime: value.end_time,
    title: value.title,
    location: value.location,
    linkedRegularMeetingId: value.linked_regular_meeting_id,
    status: value.status,
    counts: value.counts ? mapCounts(value.counts) : null,
  };
}

function mapTarget(
  value: z.infer<typeof databaseTargetSchema>,
): MeetingDirectoryTarget {
  return {
    memberId: value.member_id,
    targetOrigin: value.target_origin,
    memberCodeSnapshot: value.member_code_snapshot,
    memberNameSnapshot: value.member_name_snapshot,
    groupCodeSnapshot: value.group_code_snapshot,
    rsvpStatus: value.rsvp_status,
    attendanceStatus: value.attendance_status,
    arrivalTime: value.arrival_time,
    attendanceOrigin: value.attendance_origin,
    hasRecordedState: value.has_recorded_state,
    rsvpUpdatedAt: value.rsvp_updated_at,
    attendanceUpdatedAt: value.attendance_updated_at,
  };
}

function compareMeetings(left: MeetingDirectoryRow, right: MeetingDirectoryRow) {
  return left.meetingDate.localeCompare(right.meetingDate) ||
    left.startTime.localeCompare(right.startTime) ||
    left.id.localeCompare(right.id);
}

export function parseMeetingDirectoryPage(value: unknown): MeetingDirectoryPage {
  const parsed = databasePageSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("정모 목록 데이터 형식이 올바르지 않습니다.");
  }

  const selectedMeeting = parsed.data.selected_meeting
    ? {
        meeting: mapMeeting(parsed.data.selected_meeting.meeting),
        targets: parsed.data.selected_meeting.targets
          .map(mapTarget)
          .sort(
            (left, right) =>
              left.memberCodeSnapshot.localeCompare(right.memberCodeSnapshot) ||
              left.memberNameSnapshot.localeCompare(right.memberNameSnapshot) ||
              left.memberId.localeCompare(right.memberId),
          ),
        adHocCandidates: parsed.data.can_manage_attendance
          ? parsed.data.selected_meeting.ad_hoc_candidates
              .map((candidate) => ({
                id: candidate.id,
                memberCode: candidate.member_code,
                name: candidate.name,
                groupCode: candidate.group_code,
              }))
              .sort(
                (left, right) =>
                  left.memberCode.localeCompare(right.memberCode) ||
                  left.name.localeCompare(right.name) ||
                  left.id.localeCompare(right.id),
              )
          : [],
        lifecycleEvents: parsed.data.selected_meeting.lifecycle_events
          .map((event) => ({
            id: event.id,
            eventType: event.event_type,
            actorDisplayName: event.actor_display_name,
            occurredAt: event.occurred_at,
            reason: event.reason,
            details: event.details,
          }))
          .sort(
            (left, right) =>
              right.occurredAt.localeCompare(left.occurredAt) ||
              right.id.localeCompare(left.id),
          ),
      }
    : null;

  return {
    periodMonth: parsed.data.period_month,
    canManageMeeting: parsed.data.can_manage_meeting,
    canManageAttendance: parsed.data.can_manage_attendance,
    roster: parsed.data.roster
      ? {
          status: parsed.data.roster.status,
          rosterOrigin: parsed.data.roster.roster_origin,
          statisticsEligible: parsed.data.roster.statistics_eligible,
        }
      : null,
    summary: parsed.data.summary,
    meetings: parsed.data.meetings.map(mapMeeting).sort(compareMeetings),
    selectedMeeting,
    modalError:
      parsed.data.modal_error === null
        ? null
        : "선택한 정모를 열 수 없습니다.",
  };
}

function normalizePeriodMonth(value: string) {
  const parsed = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).safeParse(value);
  if (!parsed.success) {
    throw new Error("조회 월을 확인해 주세요.");
  }
  return `${parsed.data}-01`;
}

export async function loadMeetingDirectoryPage(input: {
  month: string;
  meetingId?: string | null;
}): Promise<MeetingDirectoryPage> {
  const periodMonth = normalizePeriodMonth(input.month);
  const supabase = await createClient();
  const prepareResult = await supabase.rpc("prepare_club_meeting_month", {
    requested_period_month: periodMonth,
  });

  if (
    prepareResult.error ||
    !prepareAcknowledgementSchema.safeParse(prepareResult.data).success
  ) {
    throw new Error("정모 월을 준비하지 못했습니다.");
  }

  const { data, error } = await supabase.rpc(
    "get_club_meeting_directory_page",
    {
      requested_period_month: periodMonth,
      requested_selected_meeting_id: input.meetingId?.trim() || null,
    },
  );

  if (error) {
    throw new Error("정모 목록을 불러오지 못했습니다.");
  }

  try {
    return parseMeetingDirectoryPage(data);
  } catch {
    throw new Error("정모 목록을 불러오지 못했습니다.");
  }
}
