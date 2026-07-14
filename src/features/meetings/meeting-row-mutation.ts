import "server-only";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  meetingRowMutationRequestSchema,
  meetingRowMutationResultSchema,
  type MeetingRowMutationResult,
} from "./meeting-row-contract";

export {
  meetingRowMutationRequestSchema,
  type MeetingRowMutationRequest,
  type MeetingRowMutationResult,
  type SafeMeetingRow,
} from "./meeting-row-contract";

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
  "meeting is cancelled": "취소된 정모에서는 처리할 수 없습니다.",
  "meeting attendance is closed": "출석이 마감된 정모입니다.",
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

function normalizeRpcResult(data: unknown): MeetingRowMutationResult {
  const parsed = meetingRowMutationResultSchema.safeParse(data);
  return parsed.success ? parsed.data : genericErrorResult;
}

export async function mutateMeetingRow(
  input: unknown,
): Promise<MeetingRowMutationResult> {
  const parsed = meetingRowMutationRequestSchema.safeParse(input);
  if (!parsed.success) return invalidInputResult;

  const supabase = await createClient();
  const {
    data: { user },
    error: authenticationError,
  } = await supabase.auth.getUser();
  if (authenticationError || !user) return authenticationResult;

  const request = parsed.data;
  const rpc =
    request.kind === "rsvp"
      ? {
          name: "save_meeting_rsvp",
          params: {
            requested_meeting_id: request.meetingId,
            requested_member_id: request.memberId,
            requested_rsvp_status: request.rsvpStatus,
            expected_rsvp_updated_at: request.expectedUpdatedAt,
          },
        }
      : {
          name: "save_meeting_attendance",
          params: {
            requested_meeting_id: request.meetingId,
            requested_member_id: request.memberId,
            requested_attendance_status: request.attendanceStatus,
            requested_arrival_time: request.arrivalTime,
            expected_attendance_updated_at: request.expectedUpdatedAt,
          },
        };

  const { data, error } = await supabase.rpc(rpc.name, rpc.params);
  if (error) return { status: "error", message: safeErrorMessage(error) };

  const result = normalizeRpcResult(data);
  if (result.status === "saved") {
    revalidatePath("/meetings");
  }
  return result;
}
