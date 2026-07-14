import { deleteEvent } from "./actions";
import { notFound } from "next/navigation";
import { ActionLink, Button } from "@/components/atoms";
import { loadCurrentOperatorContext } from "@/features/auth/operator-context";
import { PageTitle } from "@/features/shell/PageTitleContext";
import {
  buildMonthCalendar,
  buildWeekCalendar,
  createEventCalendarPreview,
  createMeetingCalendarPreview,
  getKstTodayDateKey,
  getMonthRange,
  getNextMonth,
  getPreviousMonth,
  getWeekRange,
  type CalendarEventPreview,
} from "@/features/events/event-calendar";
import {
  MonthCalendarView,
  ScheduleEventActions,
  ScheduleScrollArea,
  ScheduleToolbar,
  SelectedEventList,
  WeekCalendarView,
} from "@/features/events/ScheduleCalendar";
import type { EventRecord } from "@/features/events/event-model";
import { loadMeetingScheduleRecords } from "@/features/meetings/meeting-schedule";
import { createClient } from "@/lib/supabase/server";
import styles from "./page.module.scss";

type SchedulePageProps = {
  searchParams: Promise<ScheduleSearchParams>;
};

type ScheduleSearchParams = {
  view?: string | string[];
  month?: string | string[];
  date?: string | string[];
  selectedDate?: string | string[];
};

type ScheduleFilters = {
  view: "month" | "week";
  periodMonth: string;
  selectedDate: string;
};

type EventDatabaseRow = {
  id: string;
  event_date: string;
  event_time: string;
  title: string;
  location: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

async function getEvents(range: { start: string; end: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, event_date, event_time, title, location, created_by, updated_by, created_at, updated_at",
    )
    .gte("event_date", range.start)
    .lt("event_date", range.end)
    .order("event_date", { ascending: true })
    .order("event_time", { ascending: true });

  if (error) {
    throw new Error("일정 목록을 불러오지 못했습니다.");
  }

  return (data ?? []).map(mapEventRow);
}

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const filters = normalizeScheduleFilters(await searchParams);
  const operator = await loadCurrentOperatorContext();

  if (!operator?.permissions.includes("events.view")) {
    notFound();
  }

  const range = filters.view === "week"
    ? getWeekRange(filters.selectedDate)
    : getMonthRange(filters.periodMonth);
  const returnTo = filters.view === "week"
    ? buildScheduleHref({ view: "week", date: filters.selectedDate })
    : buildScheduleHref({
        view: "month",
        month: filters.periodMonth,
        selectedDate: filters.selectedDate,
      });
  let events: CalendarEventPreview[];

  try {
    const [eventRecords, meetingRecords] = await Promise.all([
      getEvents(range),
      operator.permissions.includes("meetings.view")
        ? loadMeetingScheduleRecords(range)
        : Promise.resolve([]),
    ]);
    events = [
      ...eventRecords.map(createEventCalendarPreview),
      ...meetingRecords.map((meeting) =>
        createMeetingCalendarPreview(meeting, returnTo)
      ),
    ];
  } catch {
    throw new Error("일정 목록을 불러오지 못했습니다.");
  }

  const monthCalendar = buildMonthCalendar(filters.periodMonth, events);
  const weekCalendar = buildWeekCalendar(filters.selectedDate, events);
  const periodNavigation = buildPeriodNavigation(filters);
  const selectedEvents = events.filter(
    (event) => event.eventDate === filters.selectedDate,
  );

  return (
    <section className={styles["schedule-page"]}>
      <PageTitle title="일정 관리" />

      <ScheduleToolbar
        action={<ActionLink href="/schedule/new" size="compact">일정 등록</ActionLink>}
        currentLabel={monthCalendar.label}
        monthHref={buildScheduleHref({
          view: "month",
          month: filters.periodMonth,
        })}
        nextHref={periodNavigation.nextHref}
        previousHref={periodNavigation.previousHref}
        todayHref={periodNavigation.todayHref}
        view={filters.view}
        weekHref={buildScheduleHref({
          view: "week",
          date: filters.selectedDate,
        })}
      />

      <ScheduleScrollArea layout={filters.view === "month" ? "month" : "default"}>
        {filters.view === "week" ? (
          <WeekCalendarView calendar={weekCalendar} />
        ) : (
          <>
            <MonthCalendarView
              buildHref={buildScheduleHref}
              calendar={monthCalendar}
              selectedDate={filters.selectedDate}
            />

            <SelectedEventList
              events={selectedEvents}
              formatDateLong={formatDateLong}
              month={filters.periodMonth}
              renderActions={(event, month) => (
                <EventActions event={event} month={month} />
              )}
              selectedDate={filters.selectedDate}
            />
          </>
        )}
      </ScheduleScrollArea>
    </section>
  );
}

function EventActions({
  event,
  month,
}: {
  event: CalendarEventPreview;
  month: string;
}) {
  if (!event.canEdit) {
    return (
      <ScheduleEventActions>
        <ActionLink href={event.href} size="compact" variant="secondary">
          명단
        </ActionLink>
      </ScheduleEventActions>
    );
  }

  return (
    <ScheduleEventActions>
      <ActionLink href={event.href} size="compact" variant="secondary">
        수정
      </ActionLink>
      <form action={deleteEvent}>
        <input name="eventId" type="hidden" value={event.id} />
        <input name="month" type="hidden" value={month} />
        <Button size="compact" type="submit" variant="danger">
          삭제
        </Button>
      </form>
    </ScheduleEventActions>
  );
}

function normalizeScheduleFilters(params: ScheduleSearchParams): ScheduleFilters {
  const today = getKstTodayDateKey();
  const view = firstSearchParam(params.view) === "week" ? "week" : "month";
  const selectedDate =
    normalizeDateKey(firstSearchParam(params.date)) ||
    normalizeDateKey(firstSearchParam(params.selectedDate)) ||
    today;
  const periodMonth =
    normalizeMonthKey(firstSearchParam(params.month)) || selectedDate.slice(0, 7);

  return {
    view,
    periodMonth,
    selectedDate,
  };
}

function mapEventRow(row: EventDatabaseRow): EventRecord {
  return {
    id: row.id,
    eventDate: row.event_date,
    eventTime: row.event_time.slice(0, 5),
    title: row.title,
    location: row.location,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildScheduleHref(params: {
  view?: "month" | "week";
  month?: string;
  date?: string;
  selectedDate?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params.view) {
    searchParams.set("view", params.view);
  }

  if (params.month) {
    searchParams.set("month", params.month);
  }

  if (params.date) {
    searchParams.set("date", params.date);
  }

  if (params.selectedDate) {
    searchParams.set("selectedDate", params.selectedDate);
  }

  return `/schedule?${searchParams.toString()}`;
}

function buildPeriodNavigation(filters: ScheduleFilters) {
  if (filters.view === "week") {
    return {
      previousHref: buildScheduleHref({
        view: "week",
        date: addDaysToDateKey(filters.selectedDate, -7),
      }),
      todayHref: buildScheduleHref({
        view: "week",
        date: getKstTodayDateKey(),
      }),
      nextHref: buildScheduleHref({
        view: "week",
        date: addDaysToDateKey(filters.selectedDate, 7),
      }),
    };
  }

  return {
    previousHref: buildScheduleHref({
      month: getPreviousMonth(filters.periodMonth),
    }),
    todayHref: "/schedule",
    nextHref: buildScheduleHref({
      month: getNextMonth(filters.periodMonth),
    }),
  };
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeMonthKey(value: string | undefined) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : null;
}

function normalizeDateKey(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function addDaysToDateKey(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateLong(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
