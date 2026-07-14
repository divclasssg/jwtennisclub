import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const requestTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const databaseTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/);

const rowTargetSchema = z.strictObject({
  meetingId: uuidSchema,
  memberId: uuidSchema,
  expectedUpdatedAt: timestampSchema,
});

const rsvpMutationSchema = rowTargetSchema.extend({
  kind: z.literal("rsvp"),
  rsvpStatus: z.enum(["unanswered", "attending", "late", "declined"]),
});

const attendanceMutationSchema = rowTargetSchema
  .extend({
    kind: z.literal("attendance"),
    attendanceStatus: z.enum(["unchecked", "present", "late", "absent"]),
    arrivalTime: z.union([requestTimeSchema, z.null()]),
  })
  .superRefine((value, context) => {
    if (value.attendanceStatus === "late" && value.arrivalTime === null) {
      context.addIssue({ code: "custom", message: "arrival time required" });
    }
    if (value.attendanceStatus !== "late" && value.arrivalTime !== null) {
      context.addIssue({ code: "custom", message: "arrival time not allowed" });
    }
  });

export const meetingRowMutationRequestSchema = z.discriminatedUnion("kind", [
  rsvpMutationSchema,
  attendanceMutationSchema,
]);

const safeMeetingRowSchema = z
  .object({
    meetingId: uuidSchema,
    memberId: uuidSchema,
    rsvpStatus: z.enum(["unanswered", "attending", "late", "declined"]),
    attendanceStatus: z.enum(["unchecked", "present", "late", "absent"]),
    arrivalTime: z.union([databaseTimeSchema, z.null()]),
    rsvpUpdatedAt: timestampSchema,
    attendanceUpdatedAt: timestampSchema,
  })
  .strip();

export type MeetingRowMutationRequest = z.infer<
  typeof meetingRowMutationRequestSchema
>;
export type SafeMeetingRow = z.infer<typeof safeMeetingRowSchema>;
export type MeetingRowMutationResult =
  | { status: "saved"; row: SafeMeetingRow }
  | { status: "conflict"; row: SafeMeetingRow }
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
  if (!data || typeof data !== "object" || !("status" in data)) {
    return genericErrorResult;
  }

  const status = String(data.status);
  const row = "row" in data ? safeMeetingRowSchema.safeParse(data.row) : null;
  if (status === "saved" && row?.success) {
    return { status: "saved", row: row.data };
  }
  if (status === "conflict" && row?.success) {
    return { status: "conflict", row: row.data };
  }
  return genericErrorResult;
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
