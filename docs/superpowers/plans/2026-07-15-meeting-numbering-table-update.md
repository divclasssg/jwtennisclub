# Meeting Numbering and Directory Table Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the pre-launch July 4 meeting, assign stable cumulative meeting numbers starting with July 18 as meeting 1, split the desktop directory into grouped detail columns, and replace meeting chips with semantic text colors.

**Architecture:** Preserve `regular_occurrence` as the first/third-Saturday scheduling key and add a separate nullable database `meeting_number` whose value is deterministic from the July 18, 2026 anchor. A follow-up Supabase migration performs the destructive cleanup, backfill, constraints, and RPC/function replacements. The server DTO exposes both the meeting's own number and a linked regular meeting number, then desktop and mobile presentations consume the same fields.

**Tech Stack:** Next.js 16.2.10 App Router, React 19, TypeScript, SCSS Modules, Supabase PostgreSQL/PLpgSQL, Zod, Vitest, Testing Library.

## Global Constraints

- Read the relevant local Next.js guides in `node_modules/next/dist/docs/` before editing App Router or accessibility-sensitive table code.
- Style files remain SCSS Modules with meaningful kebab-case class names.
- Reuse tokens from `src/app/globals.scss` and breakpoints from `src/app/_breakpoints.scss`; do not add hardcoded design values.
- `regular_occurrence` continues to mean first or third Saturday and is never repurposed as the user-facing cumulative number.
- 2026-07-18 is cumulative meeting 1; 2026-08-01 is 2; 2026-08-15 is 3.
- The July 4 deletion must fail and roll back if a linked lightning meeting unexpectedly exists.
- Do not mutate or apply the production Supabase database during implementation; applying the verified migration is a separate operational step.
- Preserve the uncommitted prior change that visually hides the `조회 월` label.

---

### Task 1: Define the cumulative meeting-number domain

**Files:**
- Modify: `src/features/meetings/meeting-calendar.ts`
- Modify: `src/features/meetings/meeting-calendar.test.ts`
- Modify: `src/features/meetings/meeting-model.ts`
- Modify: `src/features/meetings/meeting-model.test.ts`

**Interfaces:**
- Produces: `getRegularMeetingNumber(periodMonth: string, occurrence: 1 | 3): number | null`
- Produces: `RegularMeetingDate` with `meetingNumber: number`
- Produces: `ClubMeetingRecord.meetingNumber: number | null` plus `MeetingDirectoryRow.linkedRegularMeetingNumber: number | null`
- Consumes: the existing `parsePeriodMonth`, `formatDateKey`, and first/third-Saturday calculation.

- [ ] **Step 1: Strengthen the calendar tests with the launch boundary and cumulative sequence**

Replace the ordinary-date expectation with launch-aware expectations and add the year-boundary assertion:

```ts
expect(getRegularMeetingDates("2026-06-01")).toEqual([]);
expect(getRegularMeetingDates("2026-07-01")).toEqual([
  { occurrence: 3, meetingDate: "2026-07-18", meetingNumber: 1 },
]);
expect(getRegularMeetingDates("2026-08-01")).toEqual([
  { occurrence: 1, meetingDate: "2026-08-01", meetingNumber: 2 },
  { occurrence: 3, meetingDate: "2026-08-15", meetingNumber: 3 },
]);
expect(getRegularMeetingNumber("2027-01-01", 1)).toBe(12);
expect(getRegularMeetingNumber("2027-01-01", 3)).toBe(13);
```

Update the imports to include `getRegularMeetingNumber`.

- [ ] **Step 2: Run the calendar test and observe the old contract fail**

Run: `npm test -- src/features/meetings/meeting-calendar.test.ts`

Expected: FAIL because June/July still return two entries and `getRegularMeetingNumber` is not exported.

- [ ] **Step 3: Implement the deterministic anchor formula**

Add the launch constants and helper, then filter `getRegularMeetingDates`:

```ts
const REGULAR_MEETING_START_MONTH = "2026-07-01";

export function getRegularMeetingNumber(
  periodMonth: string,
  occurrence: 1 | 3,
) {
  const { year, month } = parsePeriodMonth(periodMonth);
  const start = parsePeriodMonth(REGULAR_MEETING_START_MONTH);
  const monthOffset = (year - start.year) * 12 + (month - start.month);

  if (monthOffset < 0 || (monthOffset === 0 && occurrence === 1)) {
    return null;
  }

  return monthOffset * 2 + (occurrence === 1 ? 0 : 1);
}

export function getRegularMeetingDates(periodMonth: string): RegularMeetingDate[] {
  const { year, month } = parsePeriodMonth(periodMonth);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstSaturdayDay = 1 + ((6 - firstDay.getUTCDay() + 7) % 7);

  return ([1, 3] as const).flatMap((occurrence) => {
    const meetingNumber = getRegularMeetingNumber(periodMonth, occurrence);
    return meetingNumber === null
      ? []
      : [{
          occurrence,
          meetingDate: formatDateKey(
            year,
            month,
            firstSaturdayDay + (occurrence - 1) * 7,
          ),
          meetingNumber,
        }];
  });
}
```

Change the exported type to:

```ts
export type RegularMeetingDate = {
  occurrence: 1 | 3;
  meetingDate: string;
  meetingNumber: number;
};
```

- [ ] **Step 4: Add the DTO fields to the meeting model and its fixture**

Extend `ClubMeetingRecord` with the persisted field:

```ts
meetingNumber: number | null;
```

Include `meetingNumber` in `MeetingDirectoryRow`'s `Pick` list and add the joined field to its intersection:

```ts
export type MeetingDirectoryRow = Pick<
  ClubMeetingRecord,
  | "id"
  | "meetingKind"
  | "periodMonth"
  | "regularOccurrence"
  | "meetingNumber"
  | "meetingDate"
  | "startTime"
  | "endTime"
  | "title"
  | "location"
  | "linkedRegularMeetingId"
> & {
  linkedRegularMeetingNumber: number | null;
  status: MeetingStatus;
  counts: MeetingAttendanceCounts | null;
};
```

Update the valid directory-row fixture with `meetingNumber: 1` and `linkedRegularMeetingNumber: null`, then assert both values.

- [ ] **Step 5: Run focused model tests**

Run: `npm test -- src/features/meetings/meeting-calendar.test.ts src/features/meetings/meeting-model.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the domain unit**

```bash
git add src/features/meetings/meeting-calendar.ts src/features/meetings/meeting-calendar.test.ts src/features/meetings/meeting-model.ts src/features/meetings/meeting-model.test.ts
git commit -m "feat(meetings): define cumulative meeting numbers"
```

### Task 2: Add the launch cleanup and persistent numbering migration

**Files:**
- Create: `supabase/migrations/202607150002_update_club_meeting_numbering.sql`
- Create: `src/features/meetings/meeting-numbering-migration.test.ts`

**Interfaces:**
- Produces: `public.meeting_regular_number(date, smallint) returns integer`
- Produces: `club_meetings.meeting_number integer`
- Produces: updated `ensure_regular_club_meetings(date, uuid)`, `create_lightning_club_meeting(uuid, date, time, time, text)`, and `get_club_meeting_directory_page(date, text)` database contracts.
- Consumes: the existing tables, triggers, permission helpers, and RPC signatures from `202607130002_add_club_meetings.sql`.

- [ ] **Step 1: Create a focused migration contract test**

Read the new SQL file and assert the safety and numbering contract:

```ts
expect(migrationSql).toContain("meeting date 2026-07-04 has linked lightning meeting");
expect(migrationSql).toContain("delete from public.meeting_attendance");
expect(migrationSql).toContain("delete from public.meeting_lifecycle_events");
expect(migrationSql).toContain("add column meeting_number integer");
expect(migrationSql).toContain("club_meetings_regular_number_unique");
expect(migrationSql).toContain("meeting_number is null");
expect(migrationSql).toContain("create or replace function public.meeting_regular_number");
expect(migrationSql).toContain("date '2026-07-01'");
expect(migrationSql).toContain("linked_regular_meeting_number");
expect(migrationSql).toContain("locked_regular_meeting.meeting_number");
```

Extract the `ensure_regular_club_meetings` body and assert it skips null meeting numbers, inserts `meeting_number`, and creates the title from `meeting_number::text || '차 정모'`.

- [ ] **Step 2: Run the migration contract test and observe the missing file fail**

Run: `npm test -- src/features/meetings/meeting-numbering-migration.test.ts`

Expected: FAIL because the new migration does not exist.

- [ ] **Step 3: Write the transactional cleanup, helper, backfill, and constraints**

Create the migration with this complete ordering:

```sql
do $$
declare
  launch_excluded_meeting_id uuid;
begin
  select meetings.id into launch_excluded_meeting_id
  from public.club_meetings as meetings
  where meetings.meeting_kind = 'regular'
    and meetings.meeting_date = date '2026-07-04';

  if launch_excluded_meeting_id is null then
    return;
  end if;

  if exists (
    select 1 from public.club_meetings as lightning
    where lightning.linked_regular_meeting_id = launch_excluded_meeting_id
  ) then
    raise exception 'meeting date 2026-07-04 has linked lightning meeting';
  end if;

  delete from public.meeting_attendance
  where meeting_id = launch_excluded_meeting_id;
  delete from public.meeting_lifecycle_events
  where meeting_id = launch_excluded_meeting_id;
  delete from public.club_meetings
  where id = launch_excluded_meeting_id;
end;
$$;

alter table public.club_meetings
add column meeting_number integer;

create or replace function public.meeting_regular_number(
  requested_period_month date,
  occurrence smallint
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized_month date := pg_catalog.date_trunc('month', requested_period_month)::date;
  month_offset integer;
begin
  if requested_period_month <> normalized_month or occurrence not in (1, 3) then
    raise exception 'invalid regular meeting month or occurrence' using errcode = '22023';
  end if;

  month_offset := (
    extract(year from normalized_month)::integer - 2026
  ) * 12 + extract(month from normalized_month)::integer - 7;

  if month_offset < 0 or (month_offset = 0 and occurrence = 1) then
    return null;
  end if;

  return month_offset * 2 + case when occurrence = 1 then 0 else 1 end;
end;
$$;

update public.club_meetings as meetings
set meeting_number = public.meeting_regular_number(
  meetings.period_month,
  meetings.regular_occurrence
)
where meetings.meeting_kind = 'regular';

update public.club_meetings as meetings
set title = meetings.meeting_number::text || '차 정모'
where meetings.meeting_kind = 'regular';

alter table public.club_meetings
add constraint club_meetings_number_shape check (
  (meeting_kind = 'regular' and meeting_number is not null and meeting_number > 0)
  or (meeting_kind = 'lightning' and meeting_number is null)
);

create unique index club_meetings_regular_number_unique
on public.club_meetings(meeting_number)
where meeting_kind = 'regular';

revoke execute on function public.meeting_regular_number(date, smallint)
from public, anon, authenticated, service_role;
```

- [ ] **Step 4: Replace the affected functions in the same migration**

Append full `CREATE OR REPLACE` definitions for these exact existing functions from `202607130002_add_club_meetings.sql`: `create_lightning_club_meeting` (starts at line 1185), `ensure_regular_club_meetings` (starts at line 1426), and `get_club_meeting_directory_page` (starts at line 2188). Preserve every existing statement and apply only the following replacements:

```sql
-- ensure_regular_club_meetings declaration and loop
generated_meeting_number integer;
generated_meeting_number := public.meeting_regular_number(
  normalized_period_month,
  occurrence
);
continue when generated_meeting_number is null;

insert into public.club_meetings (
  meeting_kind,
  period_month,
  regular_occurrence,
  meeting_number,
  meeting_date,
  start_time,
  end_time,
  title,
  created_by,
  updated_by
)
values (
  'regular',
  normalized_period_month,
  occurrence,
  generated_meeting_number,
  public.meeting_regular_date(normalized_period_month, occurrence),
  '18:00'::time,
  '22:00'::time,
  generated_meeting_number::text || '차 정모',
  actor_profile_id,
  actor_profile_id
)
on conflict (period_month, regular_occurrence)
  where meeting_kind = 'regular'
do nothing;
```

In `create_lightning_club_meeting`, replace the occurrence-based title with:

```sql
locked_regular_meeting.meeting_number::text || '차 정모 대체 번개'
```

In both directory JSON meeting builders, add:

```sql
'meeting_number', meetings.meeting_number,
'linked_regular_meeting_number', linked_regular_meetings.meeting_number,
```

and join:

```sql
left join public.club_meetings as linked_regular_meetings
  on linked_regular_meetings.id = meetings.linked_regular_meeting_id
```

Keep the existing permissions, `security definer`, empty `search_path`, sorting, selected-meeting behavior, and RPC grants unchanged.

- [ ] **Step 5: Run migration and existing SQL contract tests**

Run: `npm test -- src/features/meetings/meeting-numbering-migration.test.ts src/features/meetings/meeting-migration.test.ts src/features/members/member-roster-migration.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the migration unit**

```bash
git add supabase/migrations/202607150002_update_club_meeting_numbering.sql src/features/meetings/meeting-numbering-migration.test.ts
git commit -m "feat(meetings): migrate cumulative meeting numbers"
```

### Task 3: Parse and expose numbered directory rows

**Files:**
- Modify: `src/features/meetings/meeting-directory.ts`
- Modify: `src/features/meetings/meeting-directory.test.ts`
- Modify: `src/app/(app)/meetings/page.test.tsx`
- Modify: `src/features/meetings/MeetingMobileList.test.tsx`
- Modify: meeting fixtures in `src/app/(app)/meetings/MeetingLifecycleControls.test.tsx` and `src/features/meetings/MeetingRosterModal.test.tsx`

**Interfaces:**
- Consumes: database JSON keys `meeting_number` and `linked_regular_meeting_number` from Task 2.
- Produces: parsed `meetingNumber` and `linkedRegularMeetingNumber` fields for every `MeetingDirectoryRow` consumer.

- [ ] **Step 1: Update the DTO parser test first**

Change the July fixture to the launch meeting:

```ts
regular_occurrence: 3,
meeting_number: 1,
linked_regular_meeting_number: null,
meeting_date: "2026-07-18",
title: "1차 정모",
```

Assert:

```ts
expect(page.meetings[0]).toMatchObject({
  regularOccurrence: 3,
  meetingNumber: 1,
  linkedRegularMeetingNumber: null,
});
```

Add invalid cases for a zero regular number and a lightning row without its linked number.

- [ ] **Step 2: Run the directory parser test and observe schema rejection**

Run: `npm test -- src/features/meetings/meeting-directory.test.ts`

Expected: FAIL because the Zod schema does not accept the new strict keys.

- [ ] **Step 3: Extend the strict database schema and mapper**

Add:

```ts
meeting_number: z.number().int().positive().nullable(),
linked_regular_meeting_number: z.number().int().positive().nullable(),
```

Add a `superRefine` rule requiring a regular row to have `meeting_number` and no linked number, and a lightning row to have no own number and a linked number. Map the fields as:

```ts
meetingNumber: value.meeting_number,
linkedRegularMeetingNumber: value.linked_regular_meeting_number,
```

- [ ] **Step 4: Update every typed fixture to the new contract**

Use `meetingNumber: 1, linkedRegularMeetingNumber: null` for regular rows. Use `meetingNumber: null, linkedRegularMeetingNumber: 1` for linked lightning rows. Remove the obsolete independent-lightning fixture because the database shape requires a linked regular meeting.

- [ ] **Step 5: Run the directory and consumer tests**

Run: `npm test -- src/features/meetings/meeting-directory.test.ts src/app/'(app)'/meetings/page.test.tsx src/features/meetings/MeetingMobileList.test.tsx src/app/'(app)'/meetings/MeetingLifecycleControls.test.tsx src/features/meetings/MeetingRosterModal.test.tsx`

Expected: PASS after updating fixture titles, dates, and accessible names to the launch-aware values while leaving the old table presentation intact.

- [ ] **Step 6: Commit the DTO unit**

```bash
git add src/features/meetings/meeting-directory.ts src/features/meetings/meeting-directory.test.ts src/app/'(app)'/meetings/page.test.tsx src/features/meetings/MeetingMobileList.test.tsx src/app/'(app)'/meetings/MeetingLifecycleControls.test.tsx src/features/meetings/MeetingRosterModal.test.tsx
git commit -m "feat(meetings): expose numbered directory rows"
```

### Task 4: Implement the grouped desktop table and text statuses

**Files:**
- Modify: `src/app/(app)/meetings/page.tsx`
- Modify: `src/app/(app)/meetings/page.module.scss`
- Modify: `src/app/(app)/meetings/page.test.tsx`
- Modify: `src/app/globals.scss`
- Modify: `src/components/organisms/Organisms.module.scss`
- Modify: `src/features/meetings/meeting-presentation.ts`
- Modify: `src/features/meetings/meeting-presentation.test.ts`

**Interfaces:**
- Consumes: `MeetingDirectoryRow.meetingNumber`, `linkedRegularMeetingNumber`, and counts from Tasks 1–3.
- Produces: `getMeetingRowNumberLabel(meeting): string`, `getMeetingCardNumberLabel(meeting): string`, and semantic `data-tone` values used by desktop and mobile.

- [ ] **Step 1: Replace the page expectations with the B-layout contract**

Assert two header rows and the flattened accessible header sequence:

```ts
expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent))
  .toEqual([
    "회차", "구분", "날짜", "시간", "장소", "상태",
    "사전 참석", "출석", "명단", "관리",
    "참석", "늦참", "불참", "미응답",
    "출석", "지각", "결석", "미확인",
  ]);
expect(within(table).getByRole("rowheader", { name: "1" })).toBeInTheDocument();
expect(within(table).getByText("2026-07-18")).toBeInTheDocument();
expect(within(table).getByText("18:00–22:00")).toBeInTheDocument();
expect(within(table).getAllByText("3").length).toBeGreaterThan(0);
expect(within(table).queryByTestId("meeting-badge")).not.toBeInTheDocument();
```

Use real `Badge` role-independent detection by asserting the `정기` and `예정` elements have the semantic text class/data tone rather than a badge class.

- [ ] **Step 2: Run the page test and observe the old eight-column table fail**

Run: `npm test -- src/app/'(app)'/meetings/page.test.tsx`

Expected: FAIL on the old header list and combined count strings.

- [ ] **Step 3: Add the row-number presentation helper**

In `meeting-presentation.ts` add:

```ts
export function getMeetingRowNumberLabel(meeting: MeetingDirectoryRow) {
  if (meeting.meetingNumber !== null) return String(meeting.meetingNumber);
  if (meeting.linkedRegularMeetingNumber !== null) {
    return `${meeting.linkedRegularMeetingNumber} 대체`;
  }
  return "-";
}

export function getMeetingCardNumberLabel(meeting: MeetingDirectoryRow) {
  if (meeting.meetingNumber !== null) return `${meeting.meetingNumber}회`;
  if (meeting.linkedRegularMeetingNumber !== null) {
    return `${meeting.linkedRegularMeetingNumber}회 대체`;
  }
  return "회차 없음";
}
```

Import `MeetingDirectoryRow` as a type. Keep kind/status labels and tones, but rename the internal `BadgeTone` type to `MeetingTone` because consumers no longer render badges.

- [ ] **Step 4: Replace the table markup with grouped headers and scalar cells**

Use two header rows:

```tsx
<thead>
  <tr>
    <th rowSpan={2} scope="col">회차</th>
    <th rowSpan={2} scope="col">구분</th>
    <th rowSpan={2} scope="col">날짜</th>
    <th rowSpan={2} scope="col">시간</th>
    <th rowSpan={2} scope="col">장소</th>
    <th rowSpan={2} scope="col">상태</th>
    <th colSpan={4} scope="colgroup">사전 참석</th>
    <th colSpan={4} scope="colgroup">출석</th>
    <th rowSpan={2} scope="col">명단</th>
    <th rowSpan={2} scope="col">관리</th>
  </tr>
  <tr>
    <th scope="col">참석</th><th scope="col">늦참</th>
    <th scope="col">불참</th><th scope="col">미응답</th>
    <th scope="col">출석</th><th scope="col">지각</th>
    <th scope="col">결석</th><th scope="col">미확인</th>
  </tr>
</thead>
```

For each row, render the number as the row header, kind/status as spans, date and time separately, and each count in its own cell. When `counts` is null, render `명단 준비 전` in the first RSVP cell and use `-` in the remaining seven count cells so every row retains the same 16-column grid.

Remove the `Badge` import from the page. Render presentation spans as:

```tsx
<span className={styles["meeting-presentation-text"]} data-tone={presentation.tone}>
  {presentation.label}
</span>
```

- [ ] **Step 5: Style the two sticky header rows and semantic text with tokens**

Add `--table-header-row-height: 48px;` beside the existing table tokens in `src/app/globals.scss`, replace the existing `height: 48px` in `Organisms.module.scss` with `height: var(--table-header-row-height)`, and add a table-specific class to `DataTable`. In `page.module.scss`, set the second header row's sticky offset to `top: var(--table-header-row-height)`. Add:

```scss
.meeting-presentation-text {
  font-weight: var(--font-weight-semibold);
}

.meeting-presentation-text[data-tone="info"] { color: var(--action-blue); }
.meeting-presentation-text[data-tone="success"] { color: var(--success-text); }
.meeting-presentation-text[data-tone="danger"] { color: var(--error-text); }
.meeting-presentation-text[data-tone="muted"] { color: var(--ink-muted-48); }
```

Use only existing spacing, type, border, and color tokens. Confirm the `TableScrollArea` remains the horizontal scroll container.

- [ ] **Step 6: Run presentation and page tests**

Run: `npm test -- src/features/meetings/meeting-presentation.test.ts src/app/'(app)'/meetings/page.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the desktop UI unit**

```bash
git add src/app/'(app)'/meetings/page.tsx src/app/'(app)'/meetings/page.module.scss src/app/'(app)'/meetings/page.test.tsx src/app/globals.scss src/components/organisms/Organisms.module.scss src/features/meetings/meeting-presentation.ts src/features/meetings/meeting-presentation.test.ts
git commit -m "feat(meetings): split directory table columns"
```

### Task 5: Replace mobile meeting chips with semantic text

**Files:**
- Modify: `src/features/meetings/MeetingMobileList.tsx`
- Modify: `src/features/meetings/MeetingMobileList.module.scss`
- Modify: `src/features/meetings/MeetingMobileList.test.tsx`

**Interfaces:**
- Consumes: presentation labels/tones and `getMeetingCardNumberLabel` from Task 4.
- Produces: chip-free mobile meeting metadata with visible number, kind, status, and linkage text.

- [ ] **Step 1: Write the chip-free mobile assertions**

Assert the first card contains `1회`, `정기`, and `예정`; the linked lightning card contains `1회 대체`, `번개`, `완료`, and `정기 정모 연결됨`. Assert each presentation element uses `data-tone`, and assert no element class contains `badge`.

```ts
expect(within(items[0]).getByText("1회")).toBeInTheDocument();
expect(within(items[1]).getByText("1회 대체")).toBeInTheDocument();
for (const element of within(list).getAllByText(/정기|번개|예정|완료/)) {
  expect(element.className).not.toContain("badge");
}
```

- [ ] **Step 2: Run the mobile test and observe the Badge implementation fail**

Run: `npm test -- src/features/meetings/MeetingMobileList.test.tsx`

Expected: FAIL because the current component imports and renders `Badge` and does not show the cumulative row number.

- [ ] **Step 3: Replace badges with a metadata row**

Remove the `Badge` import. Render:

```tsx
<div className={styles["meeting-mobile-meta"]}>
  <span className={styles["meeting-mobile-number"]}>
    {getMeetingCardNumberLabel(meeting)}
  </span>
  <span className={styles["meeting-mobile-presentation"]} data-tone={kind.tone}>
    {kind.label}
  </span>
  <span className={styles["meeting-mobile-presentation"]} data-tone={status.tone}>
    {status.label}
  </span>
  {meeting.meetingKind === "lightning" ? (
    <span className={styles["meeting-mobile-linkage"]}>정기 정모 연결됨</span>
  ) : null}
</div>
```

Compute `kind` and `status` once per row before returning JSX.

- [ ] **Step 4: Replace badge layout styles with text styles**

Rename `meeting-mobile-badges` to `meeting-mobile-meta`, retain flex wrapping and tokenized gaps, and apply the same four `data-tone` color mappings used by the desktop table. Use the existing caption type tokens for number, presentation, and linkage text.

- [ ] **Step 5: Run mobile tests**

Run: `npm test -- src/features/meetings/MeetingMobileList.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the mobile UI unit**

```bash
git add src/features/meetings/MeetingMobileList.tsx src/features/meetings/MeetingMobileList.module.scss src/features/meetings/MeetingMobileList.test.tsx
git commit -m "feat(meetings): replace meeting chips with text"
```

### Task 6: Verify the integrated change and record project context

**Files:**
- Modify: `docs/WORK_LOG.md`
- Verify: all files changed in Tasks 1–5 plus the pre-existing month-label change.

**Interfaces:**
- Consumes: the complete migration, DTO, desktop, and mobile implementation.
- Produces: verification evidence and an explicit note that production migration application remains pending.

- [ ] **Step 1: Run all focused meeting tests**

Run:

```bash
npm test -- src/features/meetings src/app/'(app)'/meetings
```

Expected: all meeting feature and route tests PASS.

- [ ] **Step 2: Run the complete quality suite**

Run each command separately:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

Expected: all commands exit 0. The build should report Next.js 16.2.10 and complete all application routes.

- [ ] **Step 3: Perform browser validation without mutating attendance state**

Using an authenticated local admin session, validate at 1440×900:

- July shows only July 18 as meeting 1.
- The table uses two header rows and scalar RSVP/attendance columns.
- Kind and status are colored text, not chips.
- The table scrolls inside its panel without expanding the document width.

Validate at 375×812:

- Cards show cumulative meeting numbers and chip-free metadata.
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`.
- No console errors or failed meeting-directory requests.

Do not save RSVP, attendance, location, cancellation, or lifecycle changes.

- [ ] **Step 4: Update the work log**

Add a 2026-07-15 Completed entry covering the four user-visible changes and a Verification Evidence entry with exact test counts, build result, desktop/mobile observations, and `Supabase migration application pending`.

- [ ] **Step 5: Review the final diff for scope and migration safety**

Confirm:

- no unrelated `.superpowers/` files are staged;
- the prior hidden month label remains intact;
- no production database command was executed;
- July 4 deletion is date- and kind-scoped and linked-lightning guarded;
- all meeting Badge imports are removed only from the directory table/mobile cards, not unrelated controls.

- [ ] **Step 6: Commit documentation if it is not already part of the final implementation commit**

```bash
git add docs/WORK_LOG.md
git commit -m "docs: record meeting directory verification"
```
