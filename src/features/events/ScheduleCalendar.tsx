import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState, RowActions } from "@/components/molecules";
import type {
  CalendarEventPreview,
  MonthCalendarDay,
  WeekCalendarDay,
} from "./event-calendar";
import styles from "./ScheduleCalendar.module.scss";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

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

export function ScheduleScrollArea({ children }: { children: ReactNode }) {
  return <div className={styles["schedule-scroll-area"]}>{children}</div>;
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
            className={[
              styles["schedule-day-cell"],
              day.isCurrentMonth ? "" : styles["schedule-day-cell-muted"],
              day.date === selectedDate ? styles["schedule-day-cell-selected"] : "",
            ].join(" ")}
            key={day.date}
          >
            <Link
              className={styles["schedule-day-number"]}
              href={buildHref({
                month: calendar.periodMonth,
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
  return (
    <section aria-label="주별 일정" className={styles["schedule-week"]}>
      {calendar.days.map((day) => (
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

function formatDateShort(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}.${Number(day)}`;
}
