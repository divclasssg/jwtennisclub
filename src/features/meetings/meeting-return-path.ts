const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const RETURN_TO_MAX_LENGTH = 2048;

function isDateKey(value: string | null) {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function canonicalizeScheduleReturnTo(value: string | undefined) {
  if (
    !value ||
    value.length > RETURN_TO_MAX_LENGTH ||
    /[\u0000-\u001f\u007f\\#]/.test(value) ||
    /%(?:2f|5c)/i.test(value) ||
    !value.startsWith("/schedule") ||
    value.startsWith("//")
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, "https://local.invalid");
  } catch {
    return null;
  }

  if (
    parsed.origin !== "https://local.invalid" ||
    parsed.pathname !== "/schedule" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    return null;
  }

  const canonical = new URLSearchParams();
  const view = parsed.searchParams.get("view");
  const month = parsed.searchParams.get("month");
  const date = parsed.searchParams.get("date");
  const selectedDate = parsed.searchParams.get("selectedDate");

  if (view === "month" || view === "week") canonical.set("view", view);
  if (month && MONTH_PATTERN.test(month)) canonical.set("month", month);
  if (isDateKey(date)) canonical.set("date", date!);
  if (isDateKey(selectedDate)) canonical.set("selectedDate", selectedDate!);

  const query = canonical.toString();
  return query ? `/schedule?${query}` : "/schedule";
}
