# Schedule Management Design

## Goal

Build an operator-facing schedule management feature for tennis club operations.
Operators should be able to scan the club calendar by month or week, create
events with required time and location details, and edit or delete existing
events.

This feature completes the schedule management item before monthly settlement
and PDF reporting work begins.

## Product Scope

Included:

- Month calendar view at `/schedule`.
- Week calendar view at `/schedule`.
- Month navigation with previous month, today, and next month controls.
- Week navigation with previous week, today, and next week controls.
- View switch between month and week.
- Event creation, editing, and deletion.
- Required event date, time, title/content, and location.
- Event ordering by date and time.
- Permission-backed Supabase storage.

Excluded from MVP:

- Attendance tracking.
- Repeating events.
- Notifications or reminders.
- External calendar sync.
- Drag-and-drop editing.
- Day view.
- Multiple calendar colors or categories.

## User Experience

The default `/schedule` screen opens in month view for the current month.

Month view:

- Shows a seven-column calendar grid.
- Includes leading and trailing days as muted cells so each week row is complete.
- Each date cell shows the day number.
- Each event preview shows only time and event title.
- A date cell displays at most three event previews.
- If more than three events exist on a date, the remaining count is shown as
  `+N개`.
- Selecting a date or the `+N개` control shows the full event list for that date
  in a detail panel below or beside the calendar, depending on viewport width.

Week view:

- Shows seven day columns for the selected week.
- Each day column lists all events for that date, ordered by time.
- Event previews show time and title, with location available in the selected
  event detail or edit screen.
- Week view is the preferred way to inspect dense schedule periods without
  opening every date.

Create and edit flows:

- `/schedule/new` creates an event.
- `/schedule/[id]/edit` edits an event.
- The form fields are event date, event time, title/content, and location.
- All fields are required.
- Successful create redirects back to `/schedule` for the event month.
- Successful update redirects back to `/schedule` for the updated event month.

Deletion:

- Events can be deleted from the list/detail area or edit screen.
- Deletion returns to the relevant schedule view.

## Data Model

Add an `events` table through a Supabase migration:

- `id uuid primary key default gen_random_uuid()`
- `event_date date not null`
- `event_time time not null`
- `title text not null`
- `location text not null`
- `created_by uuid references public.profiles(id) on delete set null`
- `updated_by uuid references public.profiles(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- `title` must not be blank.
- `location` must not be blank.

Indexes:

- `(event_date, event_time)` for calendar range queries.

Permissions:

- Add `events.view`, `events.create`, `events.update`, and `events.delete`.
- Admin and operator roles receive view/create/update/delete permissions for
  this MVP, matching the current operational feature pattern.

RLS:

- Authenticated users with `events.view` can read events.
- Authenticated users with `events.create` can insert events when `created_by`
  and `updated_by` match `auth.uid()`.
- Authenticated users with `events.update` can update events when `updated_by`
  matches `auth.uid()`.
- Authenticated users with `events.delete` can delete events.

## Application Structure

Use the established feature and route pattern:

- `src/features/events/event-model.ts`
- `src/features/events/event-form.ts`
- `src/features/events/event-calendar.ts`
- `src/features/events/EventForm.tsx`
- `src/app/(app)/schedule/page.tsx`
- `src/app/(app)/schedule/new/page.tsx`
- `src/app/(app)/schedule/[id]/edit/page.tsx`
- `src/app/(app)/schedule/actions.ts`

SCSS modules should follow the project naming rules:

- Meaningful kebab-case class names.
- Existing global design tokens first.
- Existing breakpoint variables first.

## Calendar Logic

Calendar helpers should be pure and tested separately.

Month helper responsibilities:

- Normalize the selected month from `YYYY-MM`.
- Build complete week rows including leading and trailing days.
- Attach events to their date.
- Sort events by `event_time`, then title.
- Return the first three visible events for each day.
- Return the hidden event count for `+N개`.

Week helper responsibilities:

- Normalize the selected week from a date.
- Build a seven-day range.
- Attach and sort events for each day.

Date handling:

- Store dates as `YYYY-MM-DD`.
- Store times as `HH:mm`.
- Avoid timezone conversion in calendar display. The app treats schedule dates
  and times as local club operations values.

## Error Handling

Validation errors redirect back to the relevant create or edit page with a
specific error code.

Validation messages should be action-oriented:

- "일정 날짜를 입력하세요."
- "일정 시간을 입력하세요."
- "일정 이름을 입력하세요."
- "장소를 입력하세요."

Database failures should redirect with a generic save failure code and render a
clear message:

- "일정을 저장하지 못했습니다. 잠시 후 다시 시도하세요."

Missing or unreadable edit targets should return the user to `/schedule` with an
error state.

## Testing Criteria

Required tests:

- Event form parser reads date, time, title, and location.
- Event validation rejects missing date.
- Event validation rejects missing time.
- Event validation rejects blank title.
- Event validation rejects blank location.
- Event database input maps form data to Supabase columns.
- Month calendar helper builds complete week rows for a month.
- Month calendar helper shows at most three event previews per date.
- Month calendar helper returns the correct hidden count for `+N개`.
- Month calendar helper sorts same-day events by time.
- Week calendar helper builds seven days and groups events by date.
- Schedule page renders month view by default.
- Schedule page supports week view from search params.
- Create action inserts the authenticated user's `created_by` and `updated_by`.
- Update action writes `updated_by`.
- Delete action deletes the target event.

Full verification before marking complete:

- `npm run test`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- Browser verification for month view, week view, create, edit, and delete.

## Open Decisions Resolved

- Time is required for all events.
- Month view intentionally shows only time and title to keep dense calendar
  cells readable.
- Month view caps visible events at three per date and uses `+N개` for overflow.
- Week view is included in MVP because operators need a focused way to inspect
  busy periods.
