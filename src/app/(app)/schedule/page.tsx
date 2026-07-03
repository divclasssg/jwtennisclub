import Link from "next/link";
import { deleteEvent } from "./actions";
import {
  buildMonthCalendar,
  buildWeekCalendar,
  getMonthRange,
  getNextMonth,
  getPreviousMonth,
  type CalendarEventPreview,
} from "@/features/events/event-calendar";
import type { EventRecord } from "@/features/events/event-model";
import { createClient } from "@/lib/supabase/server";
import styles from "./page.module.scss";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

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

async function getEvents(periodMonth: string) {
  const { start, end } = getMonthRange(periodMonth);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, event_date, event_time, title, location, created_by, updated_by, created_at, updated_at",
    )
    .gte("event_date", start)
    .lt("event_date", end)
    .order("event_date", { ascending: true })
    .order("event_time", { ascending: true });

  if (error) {
    throw new Error("일정 목록을 불러오지 못했습니다.");
  }

  return (data ?? []).map(mapEventRow);
}

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const filters = normalizeScheduleFilters(await searchParams);
  const events = await getEvents(filters.periodMonth);
  const monthCalendar = buildMonthCalendar(filters.periodMonth, events);
  const weekCalendar = buildWeekCalendar(filters.selectedDate, events);
  const selectedEvents = events.filter(
    (event) => event.eventDate === filters.selectedDate,
  );

  return (
    <section className={styles["schedule-page"]}>
      <header className={styles["schedule-header"]}>
        <div>
          <p className={styles["schedule-kicker"]}>일정 관리</p>
          <h1>일정 관리</h1>
        </div>
        <div className={styles["schedule-header-side"]}>
          <p>월별 흐름과 주별 일정을 전환해서 확인합니다.</p>
          <Link href="/schedule/new">일정 등록</Link>
        </div>
      </header>

      <div className={styles["schedule-toolbar"]}>
        <nav aria-label="일정 기간 이동" className={styles["schedule-nav"]}>
          <Link href={buildScheduleHref({ month: getPreviousMonth(filters.periodMonth) })}>
            이전
          </Link>
          <Link href="/schedule">오늘</Link>
          <Link href={buildScheduleHref({ month: getNextMonth(filters.periodMonth) })}>
            다음
          </Link>
        </nav>

        <p className={styles["schedule-current-label"]}>{monthCalendar.label}</p>

        <nav aria-label="일정 보기 전환" className={styles["schedule-view-tabs"]}>
          <Link
            aria-current={filters.view === "month" ? "page" : undefined}
            href={buildScheduleHref({
              view: "month",
              month: filters.periodMonth,
            })}
          >
            월
          </Link>
          <Link
            aria-current={filters.view === "week" ? "page" : undefined}
            href={buildScheduleHref({
              view: "week",
              date: filters.selectedDate,
            })}
          >
            주
          </Link>
        </nav>
      </div>

      {filters.view === "week" ? (
        <section aria-label="주별 일정" className={styles["schedule-week"]}>
          {weekCalendar.days.map((day) => (
            <article className={styles["schedule-week-day"]} key={day.date}>
              <header>
                <span>{weekdays[new Date(`${day.date}T00:00:00Z`).getUTCDay()]}</span>
                <strong>{formatDateShort(day.date)}</strong>
              </header>
              {day.events.length > 0 ? (
                <ol>
                  {day.events.map((event) => (
                    <li key={event.id}>
                      <Link href={`/schedule/${event.id}/edit`}>
                        {formatEventTime(event.eventTime)} {event.title}
                      </Link>
                      <span>{event.location}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>일정 없음</p>
              )}
            </article>
          ))}
        </section>
      ) : (
        <>
          <section aria-label="월별 일정" className={styles["schedule-month"]}>
            <div className={styles["schedule-weekdays"]}>
              {weekdays.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className={styles["schedule-month-grid"]}>
              {monthCalendar.weeks.flat().map((day) => (
                <article
                  className={[
                    styles["schedule-day-cell"],
                    day.isCurrentMonth ? "" : styles["schedule-day-cell-muted"],
                    day.date === filters.selectedDate
                      ? styles["schedule-day-cell-selected"]
                      : "",
                  ].join(" ")}
                  key={day.date}
                >
                  <Link
                    className={styles["schedule-day-number"]}
                    href={buildScheduleHref({
                      month: filters.periodMonth,
                      selectedDate: day.date,
                    })}
                  >
                    {day.dayNumber}
                  </Link>
                  <ol className={styles["schedule-day-events"]}>
                    {day.visibleEvents.map((event) => (
                      <li key={event.id}>
                        <Link href={`/schedule/${event.id}/edit`}>
                          {formatEventTime(event.eventTime)} {event.title}
                        </Link>
                      </li>
                    ))}
                  </ol>
                  {day.hiddenCount > 0 ? (
                    <Link
                      className={styles["schedule-overflow-link"]}
                      href={buildScheduleHref({
                        month: filters.periodMonth,
                        selectedDate: day.date,
                      })}
                    >
                      +{day.hiddenCount}개
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section
            aria-label="선택한 날짜 일정"
            className={styles["schedule-selected-events"]}
          >
            <div className={styles["schedule-selected-header"]}>
              <h2>{formatDateLong(filters.selectedDate)}</h2>
              <p>{selectedEvents.length}건</p>
            </div>
            {selectedEvents.length > 0 ? (
              <ol>
                {selectedEvents.map((event) => (
                  <li key={event.id}>
                    <div>
                      <time>{formatEventTime(event.eventTime)}</time>
                      <strong>{event.title}</strong>
                      <span>{event.location}</span>
                    </div>
                    <EventActions event={event} month={filters.periodMonth} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles["schedule-empty-copy"]}>
                선택한 날짜에 등록된 일정이 없습니다.
              </p>
            )}
          </section>
        </>
      )}
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
  return (
    <div className={styles["schedule-event-actions"]}>
      <Link href={`/schedule/${event.id}/edit`}>수정</Link>
      <form action={deleteEvent}>
        <input name="eventId" type="hidden" value={event.id} />
        <input name="month" type="hidden" value={month} />
        <button type="submit">삭제</button>
      </form>
    </div>
  );
}

function normalizeScheduleFilters(params: ScheduleSearchParams): ScheduleFilters {
  const today = getTodayDateKey();
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

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeMonthKey(value: string | undefined) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : null;
}

function normalizeDateKey(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatEventTime(value: string) {
  return value.slice(0, 5);
}

function formatDateShort(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}.${Number(day)}`;
}

function formatDateLong(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
