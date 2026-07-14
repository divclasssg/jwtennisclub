const KST_TIME_ZONE = "Asia/Seoul";
const PERIOD_MONTH_PATTERN = /^(\d{4})-(\d{2})-01$/;

export type RegularMeetingDate = {
  occurrence: 1 | 3;
  meetingDate: string;
};

function parsePeriodMonth(periodMonth: string) {
  const match = PERIOD_MONTH_PATTERN.exec(periodMonth);
  if (!match) {
    throw new Error("Invalid period month");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error("Invalid period month");
  }

  return { year, month };
}

function formatDateKey(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addPeriodMonths(periodMonth: string, offset: number) {
  const { year, month } = parsePeriodMonth(periodMonth);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return formatDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

export function getRegularMeetingDates(
  periodMonth: string,
): RegularMeetingDate[] {
  const { year, month } = parsePeriodMonth(periodMonth);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstSaturdayDay = 1 + ((6 - firstDay.getUTCDay() + 7) % 7);

  return ([1, 3] as const).map((occurrence) => ({
    occurrence,
    meetingDate: formatDateKey(
      year,
      month,
      firstSaturdayDay + (occurrence - 1) * 7,
    ),
  }));
}

export function getRequiredMeetingMonths(periodMonth: string) {
  return [0, 1, 2].map((offset) => addPeriodMonths(periodMonth, offset));
}

export function getKstDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function getKstPeriodMonth(now = new Date()) {
  return `${getKstDateKey(now).slice(0, 7)}-01`;
}
