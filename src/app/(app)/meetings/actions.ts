"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const dateSchema = z.string().date();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const meetingTargetSchema = z.object({ meetingId: uuidSchema });
const meetingMemberSchema = meetingTargetSchema.extend({ memberId: uuidSchema });
const locationSchema = meetingTargetSchema.extend({
  location: z.string().trim().max(200),
});
const cancellationSchema = meetingTargetSchema.extend({
  reason: z.string().trim().min(1).max(500),
});
const lightningSchema = z
  .object({
    linkedRegularMeetingId: uuidSchema,
    meetingDate: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    location: z.string().trim().max(200),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: "end time must be after start time",
  });

export type MeetingActionResult =
  | { status: "saved" }
  | { status: "error"; message: string };

const invalidInputResult = {
  status: "error",
  message: "입력값을 확인해 주세요.",
} as const;
const authenticationResult = {
  status: "error",
  message: "로그인이 필요합니다.",
} as const;
const genericErrorResult = {
  status: "error",
  message: "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
} as const;

const domainErrorMessages: Readonly<Record<string, string>> = {
  "meeting has not started": "정모 시작 이후에 출석을 입력할 수 있습니다.",
  "meeting has not ended": "정모 종료 이후에 마감할 수 있습니다.",
  "meeting is cancelled": "취소된 정모에서는 처리할 수 없습니다.",
  "meeting attendance is closed": "출석이 마감된 정모입니다.",
  "active lightning meeting blocks restore":
    "활성 번개가 있어 원 정모를 복구할 수 없습니다.",
  "lightning meeting already exists": "이 정모에는 이미 번개 이력이 있습니다.",
  "ad hoc target has recorded state":
    "응답이나 출석이 기록된 임시 대상은 제거할 수 없습니다.",
  "member is not active": "활동 중인 회원만 추가할 수 있습니다.",
  "meeting roster is not locked":
    "월 명단 확정 후 임시 대상을 추가할 수 있습니다.",
  "member already belongs to monthly roster":
    "월 명단 대상 회원은 임시 대상으로 추가할 수 없습니다.",
};

function safeErrorMessage(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return genericErrorResult.message;
  }

  const message = String(error.message).toLowerCase();
  for (const [knownMessage, safeMessage] of Object.entries(domainErrorMessages)) {
    if (message.includes(knownMessage)) return safeMessage;
  }
  return genericErrorResult.message;
}

function normalizeRpcResult(data: unknown): MeetingActionResult {
  if (!data || typeof data !== "object" || !("status" in data)) {
    return genericErrorResult;
  }

  const status = String(data.status);
  if (status === "saved") {
    return { status: "saved" };
  }
  return genericErrorResult;
}

async function invokeMeetingRpc(
  rpcName: string,
  params: Record<string, unknown>,
  options: { schedule?: boolean } = {},
): Promise<MeetingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authenticationError,
  } = await supabase.auth.getUser();

  if (authenticationError || !user) return authenticationResult;

  const { data, error } = await supabase.rpc(rpcName, params);
  if (error) return { status: "error", message: safeErrorMessage(error) };

  const result = normalizeRpcResult(data);
  if (result.status === "saved") {
    revalidatePath("/meetings");
    if (options.schedule) revalidatePath("/schedule");
  }
  return result;
}

export async function updateClubMeetingLocation(input: unknown) {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return invalidInputResult;
  return invokeMeetingRpc(
    "update_club_meeting_location",
    {
      requested_meeting_id: parsed.data.meetingId,
      requested_location: parsed.data.location || null,
    },
    { schedule: true },
  );
}

export async function addMeetingAdHocMember(input: unknown) {
  const parsed = meetingMemberSchema.safeParse(input);
  if (!parsed.success) return invalidInputResult;
  return invokeMeetingRpc("add_meeting_ad_hoc_member", {
    requested_meeting_id: parsed.data.meetingId,
    requested_member_id: parsed.data.memberId,
  });
}

export async function removeMeetingAdHocMember(input: unknown) {
  const parsed = meetingMemberSchema.safeParse(input);
  if (!parsed.success) return invalidInputResult;
  return invokeMeetingRpc("remove_meeting_ad_hoc_member", {
    requested_meeting_id: parsed.data.meetingId,
    requested_member_id: parsed.data.memberId,
  });
}

export async function cancelClubMeeting(input: unknown) {
  const parsed = cancellationSchema.safeParse(input);
  if (!parsed.success) return invalidInputResult;
  return invokeMeetingRpc(
    "cancel_club_meeting",
    {
      requested_meeting_id: parsed.data.meetingId,
      requested_reason: parsed.data.reason,
    },
    { schedule: true },
  );
}

export async function restoreClubMeeting(input: unknown) {
  const parsed = meetingTargetSchema.safeParse(input);
  if (!parsed.success) return invalidInputResult;
  return invokeMeetingRpc(
    "restore_club_meeting",
    { requested_meeting_id: parsed.data.meetingId },
    { schedule: true },
  );
}

export async function closeClubMeetingAttendance(input: unknown) {
  const parsed = meetingTargetSchema.safeParse(input);
  if (!parsed.success) return invalidInputResult;
  return invokeMeetingRpc(
    "close_club_meeting_attendance",
    { requested_meeting_id: parsed.data.meetingId },
    { schedule: true },
  );
}

export async function reopenClubMeetingAttendance(input: unknown) {
  const parsed = meetingTargetSchema.safeParse(input);
  if (!parsed.success) return invalidInputResult;
  return invokeMeetingRpc(
    "reopen_club_meeting_attendance",
    { requested_meeting_id: parsed.data.meetingId },
    { schedule: true },
  );
}

export async function createLightningClubMeeting(input: unknown) {
  const parsed = lightningSchema.safeParse(input);
  if (!parsed.success) return invalidInputResult;
  return invokeMeetingRpc(
    "create_lightning_club_meeting",
    {
      requested_linked_regular_meeting_id: parsed.data.linkedRegularMeetingId,
      requested_meeting_date: parsed.data.meetingDate,
      requested_start_time: parsed.data.startTime,
      requested_end_time: parsed.data.endTime,
      requested_location: parsed.data.location || null,
    },
    { schedule: true },
  );
}
