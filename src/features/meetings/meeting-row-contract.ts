import { z } from "zod";
import { ATTENDANCE_STATUSES, RSVP_STATUSES } from "./meeting-model";

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
  rsvpStatus: z.enum(RSVP_STATUSES),
});

const attendanceMutationSchema = rowTargetSchema
  .extend({
    kind: z.literal("attendance"),
    attendanceStatus: z.enum(ATTENDANCE_STATUSES),
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

export const safeMeetingRowSchema = z
  .object({
    meetingId: uuidSchema,
    memberId: uuidSchema,
    rsvpStatus: z.enum(RSVP_STATUSES),
    attendanceStatus: z.enum(ATTENDANCE_STATUSES),
    arrivalTime: z.union([databaseTimeSchema, z.null()]),
    rsvpUpdatedAt: timestampSchema,
    attendanceUpdatedAt: timestampSchema,
  })
  .strip();

export const meetingRowMutationResultSchema = z.union([
  z.object({ status: z.literal("saved"), row: safeMeetingRowSchema }).strip(),
  z.object({ status: z.literal("conflict"), row: safeMeetingRowSchema }).strip(),
  z.object({ status: z.literal("error"), message: z.string() }).strip(),
]);

export type MeetingRowMutationRequest = z.infer<
  typeof meetingRowMutationRequestSchema
>;
export type SafeMeetingRow = z.infer<typeof safeMeetingRowSchema>;
export type MeetingRowMutationResult = z.infer<
  typeof meetingRowMutationResultSchema
>;
