import type { EventRecord } from "./event-model";

export type CalendarEventPreview = Pick<
  EventRecord,
  "id" | "eventDate" | "eventTime" | "title" | "location"
> & {
  kind: "event" | "meeting";
  href: string;
  badge: "일정" | "정모" | "번개";
  cancelled: boolean;
  canEdit: boolean;
};

export type MeetingCalendarSource = {
  id: string;
  meetingKind: "regular" | "lightning";
  periodMonth: string;
  meetingDate: string;
  startTime: string;
  title: string;
  location: string | null;
  status: "scheduled" | "cancelled" | "completed";
};

export type MonthCalendarDay = {
  date: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  events: CalendarEventPreview[];
  visibleEvents: CalendarEventPreview[];
  hiddenCount: number;
};

export type WeekCalendarDay = {
  date: string;
  dayNumber: number;
  events: CalendarEventPreview[];
};

export function createEventCalendarPreview(
  event: EventRecord,
): CalendarEventPreview {
  return {
    id: event.id,
    eventDate: event.eventDate,
    eventTime: event.eventTime,
    title: event.title,
    location: event.location,
    kind: "event",
    href: `/schedule/${event.id}/edit`,
    badge: "일정",
    cancelled: false,
    canEdit: true,
  };
}

export function createMeetingCalendarPreview(
  meeting: MeetingCalendarSource,
  returnTo: string,
): CalendarEventPreview {
  const searchParams = new URLSearchParams({
    month: meeting.periodMonth.slice(0, 7),
    meeting: meeting.id,
    returnTo,
  });
  return {
    id: meeting.id,
    eventDate: meeting.meetingDate,
    eventTime: meeting.startTime,
    title: meeting.title,
    location: meeting.location ?? "장소 미정",
    kind: "meeting",
    href: `/meetings?${searchParams.toString()}`,
    badge: meeting.meetingKind === "lightning" ? "번개" : "정모",
    cancelled: meeting.status === "cancelled",
    canEdit: false,
  };
}

export function buildMonthCalendar(
  periodMonth: string,
  events: CalendarEventPreview[],
) {
  const [year, month] = periodMonth.split("-").map(Number);
  const firstDate = new Date(Date.UTC(year, month - 1, 1));
  const lastDate = new Date(Date.UTC(year, month, 0));
  const startDate = addDays(firstDate, -firstDate.getUTCDay());
  const endDate = addDays(lastDate, 6 - lastDate.getUTCDay());
  const grouped = groupEventsByDate(events);
  const days: MonthCalendarDay[] = [];

  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const dateKey = formatDateKey(date);
    const dayEvents = grouped.get(dateKey) ?? [];
    days.push({
      date: dateKey,
      dayNumber: date.getUTCDate(),
      isCurrentMonth: date.getUTCMonth() === month - 1,
      events: dayEvents,
      visibleEvents: dayEvents.slice(0, 3),
      hiddenCount: Math.max(dayEvents.length - 3, 0),
    });
  }

  return {
    periodMonth,
    label: `${year}년 ${month}월`,
    weeks: chunk(days, 7),
  };
}

export function buildWeekCalendar(
  selectedDate: string,
  events: CalendarEventPreview[],
) {
  const { start } = getWeekRange(selectedDate);
  const startDate = parseDateKey(start);
  const grouped = groupEventsByDate(events);

  return {
    selectedDate,
    days: Array.from({ length: 7 }, (_, index) => {
      const day = addDays(startDate, index);
      const dateKey = formatDateKey(day);
      return {
        date: dateKey,
        dayNumber: day.getUTCDate(),
        events: grouped.get(dateKey) ?? [],
      };
    }),
  };
}

export function getNextMonth(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  return formatMonthKey(new Date(Date.UTC(year, month, 1)));
}

export function getPreviousMonth(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  return formatMonthKey(new Date(Date.UTC(year, month - 2, 1)));
}

export function getMonthRange(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  return {
    start: formatDateKey(new Date(Date.UTC(year, month - 1, 1))),
    end: formatDateKey(new Date(Date.UTC(year, month, 1))),
  };
}

export function getWeekRange(selectedDate: string) {
  const selected = parseDateKey(selectedDate);
  const start = addDays(selected, -selected.getUTCDay());
  return {
    start: formatDateKey(start),
    end: formatDateKey(addDays(start, 7)),
  };
}

export function getKstTodayDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function groupEventsByDate(events: CalendarEventPreview[]) {
  const grouped = new Map<string, CalendarEventPreview[]>();
  for (const event of [...events].sort(compareEvents)) {
    const existing = grouped.get(event.eventDate) ?? [];
    existing.push(event);
    grouped.set(event.eventDate, existing);
  }
  return grouped;
}

function compareEvents(left: CalendarEventPreview, right: CalendarEventPreview) {
  return left.eventDate.localeCompare(right.eventDate) ||
    left.eventTime.localeCompare(right.eventTime) ||
    left.kind.localeCompare(right.kind) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}
