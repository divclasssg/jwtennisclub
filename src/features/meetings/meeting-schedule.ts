import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getMeetingStatus,
  MEETING_KINDS,
  type MeetingKind,
  type MeetingStatus,
} from "./meeting-model";

const rowSchema = z.object({
  id: z.string().uuid(),
  meeting_kind: z.enum(MEETING_KINDS),
  period_month: z.string().date(),
  meeting_date: z.string().date(),
  start_time: z.string(),
  title: z.string().min(1),
  location: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  attendance_closed_at: z.string().nullable(),
});

export type MeetingScheduleRecord = {
  id: string;
  meetingKind: MeetingKind;
  periodMonth: string;
  meetingDate: string;
  startTime: string;
  title: string;
  location: string | null;
  status: MeetingStatus;
};

export async function loadMeetingScheduleRecords(input: {
  start: string;
  end: string;
}): Promise<MeetingScheduleRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("club_meetings")
    .select(
      "id, meeting_kind, period_month, meeting_date, start_time, title, location, cancelled_at, attendance_closed_at",
    )
    .gte("meeting_date", input.start)
    .lt("meeting_date", input.end)
    .order("meeting_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw new Error("정모 일정을 불러오지 못했습니다.");
  const parsed = z.array(rowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new Error("정모 일정을 불러오지 못했습니다.");

  return parsed.data.map((row) => ({
    id: row.id,
    meetingKind: row.meeting_kind,
    periodMonth: row.period_month,
    meetingDate: row.meeting_date,
    startTime: row.start_time.slice(0, 5),
    title: row.title,
    location: row.location,
    status: getMeetingStatus({
      cancelledAt: row.cancelled_at,
      attendanceClosedAt: row.attendance_closed_at,
    }),
  }));
}
