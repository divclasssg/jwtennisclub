# Schedule Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/schedule` month/week calendar with required-time event CRUD backed by Supabase.

**Architecture:** Follow the existing app route plus feature-module pattern used by members, fees, and expenses. Keep event form parsing, calendar layout generation, and route actions in separate units so the calendar rules can be tested without rendering pages.

**Tech Stack:** Next.js App Router Server Components, React Server Actions, Supabase Postgres/RLS, SCSS Modules, Vitest, React Testing Library.

---

## File Structure

- Create: `supabase/migrations/202607040001_add_events.sql`
  - Adds event permissions, `events` table, indexes, and RLS policies.
- Modify: `src/features/admin/permissions.ts`
  - Adds `events.view`, `events.create`, `events.update`, and `events.delete`.
- Modify: `src/features/admin/permissions.test.ts`
  - Verifies operator/admin event permissions.
- Create: `src/features/events/event-model.ts`
  - Defines event types and date/time validation helpers.
- Create: `src/features/events/event-model.test.ts`
  - Tests validation helpers and date range utilities.
- Create: `src/features/events/event-form.ts`
  - Parses and validates schedule create/edit form data.
- Create: `src/features/events/event-form.test.ts`
  - Tests parser, validation, and database input mapping.
- Create: `src/features/events/event-calendar.ts`
  - Builds month/week calendar data from event records.
- Create: `src/features/events/event-calendar.test.ts`
  - Tests month rows, week days, event grouping, sorting, and `+N개`.
- Create: `src/features/events/EventForm.tsx`
  - Shared create/edit form component.
- Create: `src/features/events/EventForm.module.scss`
  - Form styles using existing tokens and breakpoints.
- Create: `src/app/(app)/schedule/actions.ts`
  - Server actions for create, update, and delete.
- Create: `src/app/(app)/schedule/actions.test.ts`
  - Tests action redirects and Supabase mutations with mocked dependencies.
- Create: `src/app/(app)/schedule/page.tsx`
  - Month/week calendar page.
- Create: `src/app/(app)/schedule/page.module.scss`
  - Calendar layout styles.
- Create: `src/app/(app)/schedule/page.test.tsx`
  - Tests default month rendering, week rendering, overflow display, and links.
- Create: `src/app/(app)/schedule/new/page.tsx`
  - Event create page.
- Create: `src/app/(app)/schedule/new/page.module.scss`
  - Create page wrapper styles.
- Create: `src/app/(app)/schedule/new/page.test.tsx`
  - Tests create form rendering and error messages.
- Create: `src/app/(app)/schedule/[id]/edit/page.tsx`
  - Event edit page.
- Create: `src/app/(app)/schedule/[id]/edit/page.module.scss`
  - Edit page wrapper styles.
- Create: `src/app/(app)/schedule/[id]/edit/page.test.tsx`
  - Tests edit form rendering from Supabase data.
- Modify: `docs/PROJECT_CHECKLIST.md`
  - Marks schedule management complete after verification.
- Modify: `docs/WORK_LOG.md`
  - Adds implementation and verification evidence.

## References Already Checked

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
  - `params` and `searchParams` are promises.
- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
  - Server Actions use `"use server"` and must verify authentication.
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`
  - Use `next/link` for app route navigation.

## Task 1: Event Permissions And Migration

**Files:**
- Create: `supabase/migrations/202607040001_add_events.sql`
- Modify: `src/features/admin/permissions.ts`
- Modify: `src/features/admin/permissions.test.ts`

- [ ] **Step 1: Write the failing permission test**

Add this case to `src/features/admin/permissions.test.ts`:

```ts
it("allows operators to manage schedule events", () => {
  expect(hasPermission("operator", "events.view")).toBe(true);
  expect(hasPermission("operator", "events.create")).toBe(true);
  expect(hasPermission("operator", "events.update")).toBe(true);
  expect(hasPermission("operator", "events.delete")).toBe(true);
});
```

- [ ] **Step 2: Run the permission test and verify RED**

Run:

```bash
npm run test -- src/features/admin/permissions.test.ts
```

Expected: FAIL because `events.view` is not assignable to the `Permission` type or is not in the default permissions list.

- [ ] **Step 3: Add event permissions**

In `src/features/admin/permissions.ts`, extend the permission union/list with:

```ts
"events.view",
"events.create",
"events.update",
"events.delete",
```

Add the four event permissions to the default `admin` and `operator` permission sets.

- [ ] **Step 4: Run the permission test and verify GREEN**

Run:

```bash
npm run test -- src/features/admin/permissions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add the Supabase migration**

Create `supabase/migrations/202607040001_add_events.sql`:

```sql
insert into public.role_permissions (role_id, permission)
select roles.id, permissions.permission
from public.roles
cross join (
  values
    ('events.view'),
    ('events.create'),
    ('events.update'),
    ('events.delete')
) as permissions(permission)
where roles.name in ('admin', 'operator')
on conflict (role_id, permission) do nothing;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  event_time time not null,
  title text not null,
  location text not null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_not_blank check (length(btrim(title)) > 0),
  constraint events_location_not_blank check (length(btrim(location)) > 0)
);

create index if not exists events_event_date_time_idx
on public.events(event_date, event_time);

alter table public.events enable row level security;

drop policy if exists "operators with event view permission can read events"
on public.events;

create policy "operators with event view permission can read events"
on public.events for select
to authenticated
using (public.has_permission('events.view'));

drop policy if exists "operators with event create permission can create events"
on public.events;

create policy "operators with event create permission can create events"
on public.events for insert
to authenticated
with check (
  public.has_permission('events.create')
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists "operators with event update permission can update events"
on public.events;

create policy "operators with event update permission can update events"
on public.events for update
to authenticated
using (public.has_permission('events.update'))
with check (
  public.has_permission('events.update')
  and updated_by = auth.uid()
);

drop policy if exists "operators with event delete permission can delete events"
on public.events;

create policy "operators with event delete permission can delete events"
on public.events for delete
to authenticated
using (public.has_permission('events.delete'));
```

- [ ] **Step 6: Commit Task 1**

```bash
git add src/features/admin/permissions.ts src/features/admin/permissions.test.ts supabase/migrations/202607040001_add_events.sql
git commit -m "Add schedule event permissions"
```

## Task 2: Event Form Model

**Files:**
- Create: `src/features/events/event-model.ts`
- Create: `src/features/events/event-model.test.ts`
- Create: `src/features/events/event-form.ts`
- Create: `src/features/events/event-form.test.ts`

- [ ] **Step 1: Write failing event form tests**

Create `src/features/events/event-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeEventInput,
  toEventDatabaseInput,
  validateEventForm,
} from "./event-form";

describe("event form", () => {
  it("normalizes event input", () => {
    expect(
      normalizeEventInput({
        eventDate: " 2026-07-11 ",
        eventTime: " 09:30 ",
        title: " 정기 모임 ",
        location: " 올림픽공원 ",
      }),
    ).toEqual({
      eventDate: "2026-07-11",
      eventTime: "09:30",
      title: "정기 모임",
      location: "올림픽공원",
    });
  });

  it("requires date, time, title, and location", () => {
    expect(
      validateEventForm({
        eventDate: "",
        eventTime: "",
        title: "",
        location: "",
      }),
    ).toEqual([
      "일정 날짜를 YYYY-MM-DD 형식으로 입력하세요.",
      "일정 시간을 HH:mm 형식으로 입력하세요.",
      "일정 이름을 입력하세요.",
      "장소를 입력하세요.",
    ]);
  });

  it("maps event form data to database input", () => {
    expect(
      toEventDatabaseInput({
        eventDate: "2026-07-11",
        eventTime: "09:30",
        title: "정기 모임",
        location: "올림픽공원",
      }),
    ).toEqual({
      event_date: "2026-07-11",
      event_time: "09:30",
      title: "정기 모임",
      location: "올림픽공원",
    });
  });
});
```

- [ ] **Step 2: Run event form tests and verify RED**

```bash
npm run test -- src/features/events/event-form.test.ts
```

Expected: FAIL because `src/features/events/event-form.ts` does not exist.

- [ ] **Step 3: Implement event model and form helpers**

Create `src/features/events/event-model.ts`:

```ts
export type EventRecord = {
  id: string;
  eventDate: string;
  eventTime: string;
  title: string;
  location: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isValidTimeInput(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
```

Create `src/features/events/event-form.ts`:

```ts
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
```

- [ ] **Step 4: Run event form tests and verify GREEN**

```bash
npm run test -- src/features/events/event-form.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/features/events/event-model.ts src/features/events/event-form.ts src/features/events/event-form.test.ts
git commit -m "Add schedule event form model"
```

## Task 3: Calendar Data Builders

**Files:**
- Create: `src/features/events/event-calendar.ts`
- Create: `src/features/events/event-calendar.test.ts`

- [ ] **Step 1: Write failing calendar tests**

Create `src/features/events/event-calendar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildMonthCalendar, buildWeekCalendar } from "./event-calendar";
import type { EventRecord } from "./event-model";

const events: EventRecord[] = [
  event("1", "2026-07-11", "11:00", "세 번째"),
  event("2", "2026-07-11", "09:00", "첫 번째"),
  event("3", "2026-07-11", "10:00", "두 번째"),
  event("4", "2026-07-11", "12:00", "네 번째"),
];

describe("event calendar", () => {
  it("builds complete month weeks and caps visible events at three", () => {
    const calendar = buildMonthCalendar("2026-07", events);
    const targetDay = calendar.weeks.flat().find((day) => day.date === "2026-07-11");

    expect(calendar.label).toBe("2026년 7월");
    expect(calendar.weeks.length).toBe(5);
    expect(calendar.weeks.every((week) => week.length === 7)).toBe(true);
    expect(targetDay?.visibleEvents.map((item) => item.title)).toEqual([
      "첫 번째",
      "두 번째",
      "세 번째",
    ]);
    expect(targetDay?.hiddenCount).toBe(1);
  });

  it("builds seven days for the selected week", () => {
    const calendar = buildWeekCalendar("2026-07-11", events);

    expect(calendar.days).toHaveLength(7);
    expect(calendar.days[0]?.date).toBe("2026-07-05");
    expect(calendar.days[6]?.date).toBe("2026-07-11");
    expect(calendar.days[6]?.events.map((item) => item.title)).toEqual([
      "첫 번째",
      "두 번째",
      "세 번째",
      "네 번째",
    ]);
  });
});

function event(
  id: string,
  eventDate: string,
  eventTime: string,
  title: string,
): EventRecord {
  return {
    id,
    eventDate,
    eventTime,
    title,
    location: "코트",
    createdBy: "operator-id",
    updatedBy: "operator-id",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
}
```

- [ ] **Step 2: Run calendar tests and verify RED**

```bash
npm run test -- src/features/events/event-calendar.test.ts
```

Expected: FAIL because `event-calendar.ts` does not exist.

- [ ] **Step 3: Implement calendar builders**

Create `src/features/events/event-calendar.ts` with pure helpers:

```ts
import type { EventRecord } from "./event-model";

export type CalendarEventPreview = Pick<
  EventRecord,
  "id" | "eventDate" | "eventTime" | "title" | "location"
>;

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

export function buildMonthCalendar(
  periodMonth: string,
  events: EventRecord[],
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

export function buildWeekCalendar(selectedDate: string, events: EventRecord[]) {
  const date = parseDateKey(selectedDate);
  const startDate = addDays(date, -date.getUTCDay());
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

function groupEventsByDate(events: EventRecord[]) {
  const grouped = new Map<string, CalendarEventPreview[]>();

  for (const event of [...events].sort(compareEvents)) {
    const existing = grouped.get(event.eventDate) ?? [];
    existing.push({
      id: event.id,
      eventDate: event.eventDate,
      eventTime: event.eventTime,
      title: event.title,
      location: event.location,
    });
    grouped.set(event.eventDate, existing);
  }

  return grouped;
}

function compareEvents(left: EventRecord, right: EventRecord) {
  return (
    left.eventDate.localeCompare(right.eventDate) ||
    left.eventTime.localeCompare(right.eventTime) ||
    left.title.localeCompare(right.title)
  );
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
```

- [ ] **Step 4: Run calendar tests and verify GREEN**

```bash
npm run test -- src/features/events/event-calendar.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/features/events/event-calendar.ts src/features/events/event-calendar.test.ts
git commit -m "Add schedule calendar builders"
```

## Task 4: Schedule Server Actions

**Files:**
- Create: `src/app/(app)/schedule/actions.ts`
- Create: `src/app/(app)/schedule/actions.test.ts`

- [ ] **Step 1: Write failing action tests**

Create tests that mock `@/lib/supabase/server`, `next/navigation`, and `next/cache`, matching the existing expenses action test pattern. Cover:

```ts
it("creates an event with authenticated audit fields", async () => {
  const formData = new FormData();
  formData.set("eventDate", "2026-07-11");
  formData.set("eventTime", "09:30");
  formData.set("title", "정기 모임");
  formData.set("location", "올림픽공원");

  await createEvent(formData);

  expect(insert).toHaveBeenCalledWith({
    event_date: "2026-07-11",
    event_time: "09:30",
    title: "정기 모임",
    location: "올림픽공원",
    created_by: "operator-id",
    updated_by: "operator-id",
  });
  expect(redirect).toHaveBeenCalledWith("/schedule?month=2026-07&status=created");
});
```

Also cover update and delete:

```ts
expect(update).toHaveBeenCalledWith({
  event_date: "2026-07-12",
  event_time: "10:00",
  title: "친선 경기",
  location: "실내 코트",
  updated_by: "operator-id",
});
expect(deleteAction).toHaveBeenCalled();
```

- [ ] **Step 2: Run action tests and verify RED**

```bash
npm run test -- src/app/\(app\)/schedule/actions.test.ts
```

Expected: FAIL because the actions file does not exist.

- [ ] **Step 3: Implement actions**

Create `src/app/(app)/schedule/actions.ts` with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseEventFormData,
  toEventDatabaseInput,
  validateEventForm,
} from "@/features/events/event-form";
import { createClient } from "@/lib/supabase/server";

const schedulePath = "/schedule";
const eventCreatePath = "/schedule/new";

function buildRedirect(path: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return `${path}?${searchParams.toString()}`;
}

function firstValidationCode(errors: string[]) {
  if (errors.some((error) => error.includes("날짜"))) return "invalid-date";
  if (errors.some((error) => error.includes("시간"))) return "invalid-time";
  if (errors.some((error) => error.includes("이름"))) return "invalid-title";
  if (errors.some((error) => error.includes("장소"))) return "invalid-location";
  return "invalid-event";
}

async function getAuthenticatedUserId() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, userId: user.id };
}

export async function createEvent(formData: FormData) {
  const event = parseEventFormData(formData);
  const errors = validateEventForm(event);

  if (errors.length > 0) {
    redirect(buildRedirect(eventCreatePath, { error: firstValidationCode(errors) }));
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  const { error } = await supabase.from("events").insert({
    ...toEventDatabaseInput(event),
    created_by: userId,
    updated_by: userId,
  });

  if (error) {
    redirect(buildRedirect(eventCreatePath, { error: "save-failed" }));
  }

  revalidatePath(schedulePath);
  redirect(buildRedirect(schedulePath, { month: event.eventDate.slice(0, 7), status: "created" }));
}

export async function updateEvent(formData: FormData) {
  const eventId = String(formData.get("id") ?? "");
  const event = parseEventFormData(formData);
  const errors = validateEventForm(event);
  const editPath = `${schedulePath}/${eventId}/edit`;

  if (!eventId) {
    redirect(buildRedirect(schedulePath, { error: "missing-event" }));
  }

  if (errors.length > 0) {
    redirect(buildRedirect(editPath, { error: firstValidationCode(errors) }));
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  const { error } = await supabase
    .from("events")
    .update({ ...toEventDatabaseInput(event), updated_by: userId })
    .eq("id", eventId);

  if (error) {
    redirect(buildRedirect(editPath, { error: "save-failed" }));
  }

  revalidatePath(schedulePath);
  revalidatePath(editPath);
  redirect(buildRedirect(schedulePath, { month: event.eventDate.slice(0, 7), status: "updated" }));
}

export async function deleteEvent(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const month = String(formData.get("month") ?? "");

  if (!eventId) {
    redirect(buildRedirect(schedulePath, { error: "missing-event" }));
  }

  const { supabase } = await getAuthenticatedUserId();
  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) {
    redirect(buildRedirect(schedulePath, { error: "delete-failed" }));
  }

  revalidatePath(schedulePath);
  redirect(buildRedirect(schedulePath, { month, status: "deleted" }));
}
```

- [ ] **Step 4: Run action tests and verify GREEN**

```bash
npm run test -- src/app/\(app\)/schedule/actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/app/\(app\)/schedule/actions.ts src/app/\(app\)/schedule/actions.test.ts
git commit -m "Add schedule event actions"
```

## Task 5: Event Form Pages

**Files:**
- Create: `src/features/events/EventForm.tsx`
- Create: `src/features/events/EventForm.module.scss`
- Create: `src/app/(app)/schedule/new/page.tsx`
- Create: `src/app/(app)/schedule/new/page.module.scss`
- Create: `src/app/(app)/schedule/new/page.test.tsx`
- Create: `src/app/(app)/schedule/[id]/edit/page.tsx`
- Create: `src/app/(app)/schedule/[id]/edit/page.module.scss`
- Create: `src/app/(app)/schedule/[id]/edit/page.test.tsx`

- [ ] **Step 1: Write failing page tests**

Create tests that assert:

```ts
expect(screen.getByRole("heading", { name: "일정 등록" })).toBeInTheDocument();
expect(screen.getByLabelText("일정 날짜")).toHaveAttribute("type", "date");
expect(screen.getByLabelText("일정 시간")).toHaveAttribute("type", "time");
expect(screen.getByLabelText("일정 이름")).toBeInTheDocument();
expect(screen.getByLabelText("장소")).toBeInTheDocument();
```

For edit page:

```ts
expect(screen.getByRole("heading", { name: "일정 수정" })).toBeInTheDocument();
expect(screen.getByLabelText("일정 날짜")).toHaveValue("2026-07-11");
expect(screen.getByLabelText("일정 시간")).toHaveValue("09:30");
expect(screen.getByLabelText("일정 이름")).toHaveValue("정기 모임");
expect(screen.getByLabelText("장소")).toHaveValue("올림픽공원");
```

- [ ] **Step 2: Run form page tests and verify RED**

```bash
npm run test -- src/app/\(app\)/schedule/new/page.test.tsx src/app/\(app\)/schedule/\[id\]/edit/page.test.tsx
```

Expected: FAIL because pages and form component do not exist.

- [ ] **Step 3: Implement `EventForm` and pages**

Create `EventForm` with props:

```ts
type EventFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  event?: {
    id: string;
    eventDate: string;
    eventTime: string;
    title: string;
    location: string;
  };
  submitLabel: string;
};
```

Render labels `일정 날짜`, `일정 시간`, `일정 이름`, `장소` with matching `name` attributes `eventDate`, `eventTime`, `title`, `location`; include a hidden `id` field when editing.

Create `/schedule/new/page.tsx` using `createEvent`.

Create `/schedule/[id]/edit/page.tsx` that awaits `params`, loads one event from Supabase, maps database columns to form values, and passes `updateEvent` to `EventForm`.

- [ ] **Step 4: Run form page tests and verify GREEN**

```bash
npm run test -- src/app/\(app\)/schedule/new/page.test.tsx src/app/\(app\)/schedule/\[id\]/edit/page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/features/events/EventForm.tsx src/features/events/EventForm.module.scss src/app/\(app\)/schedule/new src/app/\(app\)/schedule/\[id\]/edit
git commit -m "Add schedule event form pages"
```

## Task 6: Calendar Page UI

**Files:**
- Create: `src/app/(app)/schedule/page.tsx`
- Create: `src/app/(app)/schedule/page.module.scss`
- Create: `src/app/(app)/schedule/page.test.tsx`

- [ ] **Step 1: Write failing schedule page tests**

Create `src/app/(app)/schedule/page.test.tsx` and mock Supabase like the expenses page test. Assert:

```ts
expect(screen.getByRole("heading", { name: "일정 관리" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "일정 등록" })).toHaveAttribute("href", "/schedule/new");
expect(screen.getByRole("link", { name: "월" })).toHaveAttribute("href", "/schedule?view=month&month=2026-07");
expect(screen.getByRole("link", { name: "주" })).toHaveAttribute("href", "/schedule?view=week&date=2026-07-11");
expect(screen.getByText("09:00 첫 번째")).toBeInTheDocument();
expect(screen.getByText("+1개")).toBeInTheDocument();
```

Add a second test for week view:

```ts
expect(screen.getByRole("region", { name: "주별 일정" })).toBeInTheDocument();
expect(screen.getByText("올림픽공원")).toBeInTheDocument();
```

- [ ] **Step 2: Run schedule page tests and verify RED**

```bash
npm run test -- src/app/\(app\)/schedule/page.test.tsx
```

Expected: FAIL because schedule page does not exist.

- [ ] **Step 3: Implement schedule page**

Implement `searchParams` as a promise:

```ts
type SchedulePageProps = {
  searchParams: Promise<{
    view?: string | string[];
    month?: string | string[];
    date?: string | string[];
    selectedDate?: string | string[];
  }>;
};
```

Fetch events from Supabase with a date range:

```ts
const { start, end } = getMonthRange(filters.periodMonth);
const { data, error } = await supabase
  .from("events")
  .select("id, event_date, event_time, title, location, created_by, updated_by, created_at, updated_at")
  .gte("event_date", start)
  .lt("event_date", end)
  .order("event_date", { ascending: true })
  .order("event_time", { ascending: true });
```

Render:

- Header with `일정 관리` and `일정 등록`.
- Navigation links for previous, today, next.
- View links for `월` and `주`.
- Month calendar grid with weekday headers.
- Each month event as `HH:mm title`.
- Overflow as `+N개`.
- Week columns with all events.
- Delete form using `deleteEvent`.
- Edit links to `/schedule/${event.id}/edit`.

- [ ] **Step 4: Run schedule page tests and verify GREEN**

```bash
npm run test -- src/app/\(app\)/schedule/page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/app/\(app\)/schedule/page.tsx src/app/\(app\)/schedule/page.module.scss src/app/\(app\)/schedule/page.test.tsx
git commit -m "Add schedule calendar page"
```

## Task 7: Final Verification And Documentation

**Files:**
- Modify: `docs/PROJECT_CHECKLIST.md`
- Modify: `docs/WORK_LOG.md`

- [ ] **Step 1: Run focused tests**

```bash
npm run test -- src/features/events src/app/\(app\)/schedule
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

```bash
npm run test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all commands pass.

- [ ] **Step 3: Start dev server**

```bash
npm run dev
```

Expected: local Next server starts and prints a localhost URL.

- [ ] **Step 4: Browser verification**

Verify:

- `/schedule` renders month view.
- Creating an event with date, time, title, and location succeeds.
- Month view shows only time and title.
- A date with four events shows three event previews plus `+1개`.
- Week view shows all events for the selected week.
- Editing an event updates the calendar.
- Deleting an event removes it from the calendar.

- [ ] **Step 5: Update docs**

In `docs/PROJECT_CHECKLIST.md`, mark:

```md
- [x] Schedule management feature implemented
```

In `docs/WORK_LOG.md`, add a `2026-07-04` entry with completed implementation and verification evidence.

- [ ] **Step 6: Commit Task 7**

```bash
git add docs/PROJECT_CHECKLIST.md docs/WORK_LOG.md
git commit -m "Document schedule management completion"
```

## Self-Review

- Spec coverage: month view, week view, event CRUD, required time, max-three month previews, `+N개`, Supabase storage, permissions, RLS, and verification are covered.
- Placeholder scan: no `TBD`, `TODO`, or unresolved placeholders are intentionally left in this plan.
- Type consistency: the plan consistently uses `EventRecord`, `EventFormInput`, `eventDate`, `eventTime`, `title`, `location`, and Supabase columns `event_date`, `event_time`, `created_by`, `updated_by`.
