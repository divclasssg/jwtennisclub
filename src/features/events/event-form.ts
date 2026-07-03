import { isValidDateInput, isValidTimeInput } from "./event-model";

export type EventFormInput = {
  eventDate: string;
  eventTime: string;
  title: string;
  location: string;
};

export type EventDatabaseInput = {
  event_date: string;
  event_time: string;
  title: string;
  location: string;
};

export function parseEventFormData(formData: FormData): EventFormInput {
  return normalizeEventInput({
    eventDate: readFormString(formData, "eventDate"),
    eventTime: readFormString(formData, "eventTime"),
    title: readFormString(formData, "title"),
    location: readFormString(formData, "location"),
  });
}

export function normalizeEventInput(input: {
  eventDate?: string | null;
  eventTime?: string | null;
  title?: string | null;
  location?: string | null;
}): EventFormInput {
  return {
    eventDate: normalizeRequiredText(input.eventDate),
    eventTime: normalizeRequiredText(input.eventTime),
    title: normalizeRequiredText(input.title),
    location: normalizeRequiredText(input.location),
  };
}

export function validateEventForm(input: EventFormInput): string[] {
  const errors: string[] = [];

  if (!isValidDateInput(input.eventDate)) {
    errors.push("일정 날짜를 YYYY-MM-DD 형식으로 입력하세요.");
  }

  if (!isValidTimeInput(input.eventTime)) {
    errors.push("일정 시간을 HH:mm 형식으로 입력하세요.");
  }

  if (!input.title) {
    errors.push("일정 이름을 입력하세요.");
  }

  if (!input.location) {
    errors.push("장소를 입력하세요.");
  }

  return errors;
}

export function toEventDatabaseInput(input: EventFormInput): EventDatabaseInput {
  return {
    event_date: input.eventDate,
    event_time: input.eventTime,
    title: input.title,
    location: input.location,
  };
}

function readFormString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

function normalizeRequiredText(value: string | null | undefined) {
  return value?.trim() ?? "";
}
