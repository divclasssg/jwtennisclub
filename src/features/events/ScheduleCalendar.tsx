import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { EmptyState, RowActions } from "@/components/molecules";
import { classNames } from "@/components/ui/class-names";
import type {
  CalendarEventPreview,
  MonthCalendarDay,
  WeekCalendarDay,
} from "./event-calendar";
import styles from "./ScheduleCalendar.module.scss";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const weekStartHour = 6;
const weekEndHour = 24;
const weekHours = Array.from(
  { length: weekEndHour - weekStartHour },
  (_, index) => weekStartHour + index,
);
const weekEventTones = ["blue", "rose", "warm"] as const;

type ScheduleHrefParams = {
  view?: "month" | "week";
  month?: string;
  date?: string;
  selectedDate?: string;
};

type MonthCalendar = {
  label: string;
  periodMonth: string;
  weeks: MonthCalendarDay[][];
};

type WeekCalendar = {
  selectedDate: string;
  days: WeekCalendarDay[];
};

type ScheduleToolbarProps = {
  action?: ReactNode;
  currentLabel: string;
  monthHref: string;
  nextHref: string;
  previousHref: string;
  todayHref: string;
  view: "month" | "week";
  weekHref: string;
};

type MonthCalendarViewProps = {
  buildHref: (params: ScheduleHrefParams) => string;
  calendar: MonthCalendar;
  selectedDate: string;
};

type WeekCalendarViewProps = {
  calendar: WeekCalendar;
};

type WeekEventStyle = CSSProperties & {
  "--week-event-day": string;
  "--week-event-offset": string;
  "--week-event-row": string;
};

type SelectedEventListProps = {
  events: CalendarEventPreview[];
  formatDateLong: (value: string) => string;
  month: string;
  renderActions: (event: CalendarEventPreview, month: string) => ReactNode;
  selectedDate: string;
};

export function ScheduleToolbar({
  action,
  currentLabel,
  monthHref,
  nextHref,
  previousHref,
  todayHref,
  view,
  weekHref,
}: ScheduleToolbarProps) {
  return (
    <div className={styles["schedule-toolbar"]}>
      <nav aria-label="일정 기간 이동" className={styles["schedule-nav"]}>
        <Link href={previousHref}>이전</Link>
        <Link href={todayHref}>오늘</Link>
        <Link href={nextHref}>다음</Link>
      </nav>

      <p className={styles["schedule-current-label"]}>{currentLabel}</p>

      <nav aria-label="일정 보기 전환" className={styles["schedule-view-tabs"]}>
        <Link aria-current={view === "month" ? "page" : undefined} href={monthHref}>
          월
        </Link>
        <Link aria-current={view === "week" ? "page" : undefined} href={weekHref}>
          주
        </Link>
      </nav>

      {action ? <div className={styles["schedule-toolbar-action"]}>{action}</div> : null}
    </div>
  );
}

export function ScheduleScrollArea({
  children,
  layout = "default",
}: {
  children: ReactNode;
  layout?: "default" | "month";
}) {
  return (
    <div
      aria-label={layout === "month" ? "월간 일정과 선택 날짜 일정" : undefined}
      className={classNames(
        styles["schedule-scroll-area"],
        layout === "month" ? styles["schedule-scroll-area-month"] : undefined,
      )}
      role={layout === "month" ? "group" : undefined}
    >
      {children}
    </div>
  );
}

export function MonthCalendarView({
  buildHref,
  calendar,
  selectedDate,
}: MonthCalendarViewProps) {
  return (
    <section aria-label="월별 일정" className={styles["schedule-month"]}>
      <div className={styles["schedule-weekdays"]}>
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className={styles["schedule-month-grid"]}>
        {calendar.weeks.flat().map((day) => (
          <article
            className={classNames(
              styles["schedule-day-cell"],
              day.isCurrentMonth ? undefined : styles["schedule-day-cell-muted"],
              day.date === selectedDate ? styles["schedule-day-cell-selected"] : undefined,
            )}
            key={day.date}
          >
            <Link
              aria-label={`${formatDateLong(day.date)} 일정 보기`}
              className={styles["schedule-day-cell-link"]}
              href={buildHref({
                month: calendar.periodMonth,
                selectedDate: day.date,
              })}
            />
            <span className={styles["schedule-day-number"]}>{day.dayNumber}</span>
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
                href={buildHref({
                  month: calendar.periodMonth,
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
  );
}

export function WeekCalendarView({ calendar }: WeekCalendarViewProps) {
  const events = calendar.days.flatMap((day, dayIndex) =>
    day.events.map((event) => ({
      dayIndex,
      event,
      style: getWeekEventStyle(dayIndex, event.eventTime),
    })),
  );

  return (
    <section aria-label="주별 일정" className={styles["schedule-week"]}>
      <div
        aria-label="주간 시간표"
        className={styles["schedule-week-timeboard"]}
        role="grid"
      >
        <div className={styles["schedule-week-header-row"]} role="row">
          <span aria-hidden="true" className={styles["schedule-week-time-gutter"]} />
          {calendar.days.map((day) => (
            <div
              className={classNames(
                styles["schedule-week-day-header"],
                day.date === calendar.selectedDate
                  ? styles["schedule-week-day-header-selected"]
                  : undefined,
              )}
              key={day.date}
              role="columnheader"
            >
              {formatWeekDayHeader(day.date)}
            </div>
          ))}
        </div>

        <div className={styles["schedule-week-body"]}>
          <div className={styles["schedule-week-time-column"]}>
            <span role="rowheader">하루 종일</span>
            {weekHours.map((hour) => (
              <span key={hour} role="rowheader">
                {formatHourLabel(hour)}
              </span>
            ))}
          </div>

          <div aria-hidden="true" className={styles["schedule-week-grid-lines"]}>
            {calendar.days.flatMap((day) =>
              weekHours.map((hour) => (
                <span key={`${day.date}-${hour}`} />
              )),
            )}
          </div>

          <ol className={styles["schedule-week-event-layer"]}>
            {events.map(({ event, style }) => (
              <li
                aria-label={`${event.title} ${formatEventTime(event.eventTime)} ${event.location}`}
                data-tone={getWeekEventTone(event.id)}
                key={event.id}
                style={style}
              >
                <Link aria-label={event.title} href={`/schedule/${event.id}/edit`}>
                  {formatEventTime(event.eventTime)} {event.title}
                </Link>
                <span>{event.location}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function SelectedEventList({
  events,
  formatDateLong,
  month,
  renderActions,
  selectedDate,
}: SelectedEventListProps) {
  return (
    <section
      aria-label="선택한 날짜 일정"
      className={styles["schedule-selected-events"]}
    >
      <div className={styles["schedule-selected-header"]}>
        <h2>{formatDateLong(selectedDate)}</h2>
        <p>{events.length}건</p>
      </div>
      {events.length > 0 ? (
        <ol>
          {events.map((event) => (
            <li key={event.id}>
              <div>
                <time>{formatEventTime(event.eventTime)}</time>
                <strong>{event.title}</strong>
                <span>{event.location}</span>
              </div>
              {renderActions(event, month)}
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="선택한 날짜에 등록된 일정이 없습니다." />
      )}
    </section>
  );
}

export function ScheduleEventActions({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RowActions className={styles["schedule-event-actions"]}>
      {children}
    </RowActions>
  );
}

function formatEventTime(value: string) {
  return value.slice(0, 5);
}

function formatDateLong(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function formatWeekDayHeader(value: string) {
  const [, , day] = value.split("-");
  const weekday = weekdays[new Date(`${value}T00:00:00Z`).getUTCDay()];
  return `${Number(day)}일 (${weekday})`;
}

function formatHourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function getWeekEventStyle(dayIndex: number, eventTime: string): WeekEventStyle {
  const [rawHour, rawMinute] = eventTime.split(":").map(Number);
  const hour = Math.min(Math.max(rawHour, weekStartHour), weekEndHour - 1);
  const minute = Math.min(Math.max(rawMinute, 0), 55);

  return {
    "--week-event-day": String(dayIndex + 1),
    "--week-event-offset": String(minute),
    "--week-event-row": String(hour - weekStartHour + 1),
  };
}

function getWeekEventTone(id: string) {
  const toneIndex = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    weekEventTones.length;
  return weekEventTones[toneIndex];
}
