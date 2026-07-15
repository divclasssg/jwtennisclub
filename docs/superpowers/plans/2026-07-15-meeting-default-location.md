# Meeting Default Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `용마테니스장` the persisted default location for existing and future regular and lightning meetings while keeping location edits available.

**Architecture:** Add a standalone `202607150004` migration after the pending directory-load optimization. The migration backfills null locations, makes the column defaulted and non-null, and replaces the two location-writing RPCs so blank input resolves to the canonical default. Application rendering remains unchanged and continues to display the database value with its existing null defenses for rollout compatibility.

**Tech Stack:** PostgreSQL/Supabase migrations, PL/pgSQL security-definer RPCs, TypeScript, React Server Components, Vitest, Testing Library

## Global Constraints

- The canonical default location is exactly `용마테니스장`.
- Existing `location is null` rows must be backfilled before `not null` is applied.
- Regular meetings and replacement lightning meetings must both persist a non-null location.
- Blank or whitespace-only location updates must persist `용마테니스장`; another valid 1–200 character location remains editable.
- Preserve existing RPC permission checks, `security definer`, `set search_path = ''`, and execute grants.
- Preserve existing UI null defenses during deployment; do not introduce unrelated rendering changes.
- Apply `202607150003_optimize_meeting_directory_load.sql` before `202607150004_default_meeting_location.sql`.

---

### Task 1: Enforce the canonical location in the database

**Files:**
- Create: `src/features/meetings/meeting-default-location-migration.test.ts`
- Create: `supabase/migrations/202607150004_default_meeting_location.sql`

**Interfaces:**
- Consumes: `public.club_meetings`, `public.update_club_meeting_location(uuid, text)`, `public.create_lightning_club_meeting(uuid, date, time, time, text)`
- Produces: `club_meetings.location text not null default '용마테니스장'` and both existing RPC signatures with blank-input normalization

- [ ] **Step 1: Write the failing migration contract tests**

Create `src/features/meetings/meeting-default-location-migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202607150004_default_meeting_location.sql",
  ),
  "utf8",
).toLowerCase();

function functionSql(functionName: string) {
  const start = migrationSql.indexOf(
    `create or replace function public.${functionName}`,
  );
  const end = migrationSql.indexOf("$$;", start);
  expect(start, functionName).toBeGreaterThan(-1);
  expect(end, functionName).toBeGreaterThan(start);
  return migrationSql.slice(start, end);
}

describe("meeting default location migration", () => {
  it("backfills nulls before setting the default and not-null constraint", () => {
    const backfill = migrationSql.indexOf(
      "update public.club_meetings\nset location = '용마테니스장'\nwhere location is null",
    );
    const setDefault = migrationSql.indexOf(
      "alter column location set default '용마테니스장'",
    );
    const setNotNull = migrationSql.indexOf(
      "alter column location set not null",
    );

    expect(backfill).toBeGreaterThan(-1);
    expect(setDefault).toBeGreaterThan(backfill);
    expect(setNotNull).toBeGreaterThan(setDefault);
  });

  it.each([
    "update_club_meeting_location",
    "create_lightning_club_meeting",
  ])("normalizes blank input in %s without weakening security", (name) => {
    const sql = functionSql(name);
    expect(sql).toContain(
      "coalesce(\n    nullif(pg_catalog.btrim(requested_location), ''),\n    '용마테니스장'\n  )",
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
  });

  it("preserves authenticated-only execute grants", () => {
    expect(migrationSql).toContain(
      "grant execute on function public.update_club_meeting_location(uuid, text) to authenticated",
    );
    expect(migrationSql).toContain(
      "grant execute on function public.create_lightning_club_meeting(uuid, date, time, time, text) to authenticated",
    );
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test -- src/features/meetings/meeting-default-location-migration.test.ts
```

Expected: FAIL with `ENOENT` because `202607150004_default_meeting_location.sql` does not exist.

- [ ] **Step 3: Add the migration with the data change and complete RPC definitions**

Create `supabase/migrations/202607150004_default_meeting_location.sql` exactly as follows:

```sql
update public.club_meetings
set location = '용마테니스장'
where location is null;

alter table public.club_meetings
alter column location set default '용마테니스장';

alter table public.club_meetings
alter column location set not null;

create or replace function public.update_club_meeting_location(
  requested_meeting_id uuid,
  requested_location text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid := public.require_meeting_operator(
    array['meetings.manage']
  );
  locked_meeting public.club_meetings%rowtype;
  normalized_location text := coalesce(
    nullif(pg_catalog.btrim(requested_location), ''),
    '용마테니스장'
  );
begin
  if pg_catalog.length(normalized_location) > 200 then
    raise exception 'invalid meeting location' using errcode = '22023';
  end if;

  select meetings.*
  into locked_meeting
  from public.club_meetings as meetings
  where meetings.id = requested_meeting_id
  for update;

  if not found then
    raise exception 'meeting not found' using errcode = 'P0002';
  end if;
  if locked_meeting.meeting_kind <> 'regular' then
    raise exception 'only regular meeting location can be updated'
      using errcode = '22023';
  end if;
  if locked_meeting.cancelled_at is not null then
    raise exception 'meeting is cancelled' using errcode = '55000';
  end if;
  if locked_meeting.attendance_closed_at is not null then
    raise exception 'meeting attendance is closed' using errcode = '55000';
  end if;
  if normalized_location is not distinct from locked_meeting.location then
    return pg_catalog.jsonb_build_object('status', 'saved');
  end if;

  update public.club_meetings as meetings
  set location = normalized_location,
      updated_by = actor_profile_id,
      updated_at = pg_catalog.clock_timestamp()
  where meetings.id = locked_meeting.id;

  insert into public.meeting_lifecycle_events (
    meeting_id,
    event_type,
    actor_profile_id,
    details
  )
  values (
    locked_meeting.id,
    'location_updated',
    actor_profile_id,
    pg_catalog.jsonb_build_object(
      'before', locked_meeting.location,
      'after', normalized_location
    )
  );

  return pg_catalog.jsonb_build_object('status', 'saved');
end;
$$;

revoke execute on function public.update_club_meeting_location(uuid, text) from public, anon;
grant execute on function public.update_club_meeting_location(uuid, text) to authenticated;

create or replace function public.create_lightning_club_meeting(
  requested_linked_regular_meeting_id uuid,
  requested_meeting_date date,
  requested_start_time time,
  requested_end_time time,
  requested_location text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid := public.require_meeting_operator(
    array['meetings.manage']
  );
  locked_regular_meeting public.club_meetings%rowtype;
  created_lightning_meeting_id uuid;
  normalized_location text := coalesce(
    nullif(pg_catalog.btrim(requested_location), ''),
    '용마테니스장'
  );
  derived_title text;
begin
  if requested_meeting_date is null
    or requested_start_time is null
    or requested_end_time is null
    or requested_end_time <= requested_start_time
  then
    raise exception 'invalid lightning meeting date or time' using errcode = '22023';
  end if;
  if pg_catalog.length(normalized_location) > 200 then
    raise exception 'invalid meeting location' using errcode = '22023';
  end if;

  select meetings.*
  into locked_regular_meeting
  from public.club_meetings as meetings
  where meetings.id = requested_linked_regular_meeting_id
  for update;

  if not found or locked_regular_meeting.meeting_kind <> 'regular' then
    raise exception 'regular meeting not found' using errcode = 'P0002';
  end if;
  if locked_regular_meeting.cancelled_at is null then
    raise exception 'linked regular meeting must be cancelled' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.club_meetings as lightning_meetings
    where lightning_meetings.linked_regular_meeting_id = locked_regular_meeting.id
  ) then
    raise exception 'lightning meeting already exists' using errcode = '23505';
  end if;

  derived_title := locked_regular_meeting.meeting_number::text
    || '차 정모 대체 번개';

  insert into public.club_meetings (
    meeting_kind, period_month, regular_occurrence, meeting_date,
    start_time, end_time, title, location, linked_regular_meeting_id,
    created_by, updated_by
  )
  values (
    'lightning', locked_regular_meeting.period_month, null,
    requested_meeting_date, requested_start_time, requested_end_time,
    derived_title, normalized_location, locked_regular_meeting.id,
    actor_profile_id, actor_profile_id
  )
  returning id into created_lightning_meeting_id;

  insert into public.meeting_attendance (
    meeting_id, member_id, roster_member_id, target_origin,
    member_code_snapshot, member_name_snapshot, group_code_snapshot
  )
  select
    created_lightning_meeting_id, source_attendance.member_id,
    source_attendance.roster_member_id, source_attendance.target_origin,
    source_attendance.member_code_snapshot,
    source_attendance.member_name_snapshot,
    source_attendance.group_code_snapshot
  from public.meeting_attendance as source_attendance
  where source_attendance.meeting_id = locked_regular_meeting.id;

  insert into public.meeting_lifecycle_events (
    meeting_id, event_type, actor_profile_id, details
  )
  values (
    created_lightning_meeting_id,
    'lightning_created',
    actor_profile_id,
    pg_catalog.jsonb_build_object(
      'linkedRegularMeetingId', locked_regular_meeting.id
    )
  );

  return pg_catalog.jsonb_build_object(
    'status', 'saved',
    'meetingId', created_lightning_meeting_id
  );
end;
$$;

revoke execute on function public.create_lightning_club_meeting(uuid, date, time, time, text) from public, anon;
grant execute on function public.create_lightning_club_meeting(uuid, date, time, time, text) to authenticated;
```

- [ ] **Step 4: Run focused migration tests and verify GREEN**

Run:

```bash
npm test -- src/features/meetings/meeting-default-location-migration.test.ts src/features/meetings/meeting-migration.test.ts src/features/meetings/meeting-numbering-migration.test.ts
```

Expected: all selected files pass, including the new backfill/default/security assertions and existing lifecycle/numbering contracts.

- [ ] **Step 5: Commit the database contract**

```bash
git add src/features/meetings/meeting-default-location-migration.test.ts supabase/migrations/202607150004_default_meeting_location.sql
git commit -m "feat(meetings): default locations to Yongma"
```

---

### Task 2: Align application fixtures with the non-null location contract

**Files:**
- Modify: `src/features/meetings/meeting-directory.test.ts`
- Modify: `src/features/meetings/MeetingMobileList.test.tsx`
- Modify: `src/features/meetings/meeting-schedule.test.ts`
- Test: `src/app/(app)/meetings/actions.test.ts`

**Interfaces:**
- Consumes: database responses whose `location` is normally `용마테니스장` or another non-empty string
- Produces: regression fixtures proving directory, mobile, modal, schedule, and action paths preserve the database location

- [ ] **Step 1: Update canonical response fixtures and assertions**

In `meeting-directory.test.ts`, replace the canonical regular meeting `location: null` values with:

```ts
location: "용마테니스장",
```

In `MeetingMobileList.test.tsx`, set the linked lightning fixture and expectation to:

```ts
location: "용마테니스장",
```

```ts
expect(within(items[1]).getByText("장소 용마테니스장")).toBeInTheDocument();
```

In `meeting-schedule.test.ts`, use `location: "용마테니스장"` in the valid database row and extend the mapped assertion:

```ts
expect.objectContaining({
  meetingKind: "lightning",
  periodMonth: "2026-07-01",
  meetingDate: "2026-08-01",
  startTime: "18:00",
  location: "용마테니스장",
  status: "scheduled",
})
```

Keep the malformed-row null fixture because it verifies parser rejection independently of the canonical database contract. Keep production null fallbacks unchanged for rollout compatibility.

Add this assertion to `src/app/(app)/meetings/actions.test.ts` to preserve the server-action-to-database normalization boundary:

```ts
it("passes a blank location to the database for canonical defaulting", async () => {
  await updateClubMeetingLocation({ meetingId, location: "   " });

  expect(mocks.rpc).toHaveBeenCalledWith(
    "update_club_meeting_location",
    {
      requested_meeting_id: meetingId,
      requested_location: null,
    },
  );
});
```

- [ ] **Step 2: Run application regression tests**

Run:

```bash
npm test -- src/features/meetings/meeting-directory.test.ts src/features/meetings/MeetingMobileList.test.tsx src/features/meetings/MeetingRosterModal.test.tsx src/features/meetings/meeting-schedule.test.ts 'src/app/(app)/meetings/actions.test.ts' 'src/app/(app)/meetings/page.test.tsx'
```

Expected: all selected tests pass; mobile and schedule assertions show `용마테니스장`, while location actions still pass blank input as `null` for database normalization.

- [ ] **Step 3: Commit the application contract fixtures**

```bash
git add 'src/app/(app)/meetings/actions.test.ts' src/features/meetings/meeting-directory.test.ts src/features/meetings/MeetingMobileList.test.tsx src/features/meetings/meeting-schedule.test.ts
git commit -m "test(meetings): reflect default location contract"
```

---

### Task 3: Apply, verify, and record the production contract

**Files:**
- Modify: `docs/WORK_LOG.md`

**Interfaces:**
- Consumes: `202607150003_optimize_meeting_directory_load.sql` followed by `202607150004_default_meeting_location.sql`
- Produces: an applied production schema with zero null meeting locations and recorded verification evidence

- [ ] **Step 1: Run the full local verification gate**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
git diff --check
```

Expected: every command exits `0`; the test summary includes the new migration test.

- [ ] **Step 2: Apply pending migrations in filename order**

In the Supabase SQL Editor, run the complete contents of:

1. `supabase/migrations/202607150003_optimize_meeting_directory_load.sql`
2. `supabase/migrations/202607150004_default_meeting_location.sql`

Do not combine or reorder them. Stop if either query reports an error; do not mark the later migration applied after an earlier failure.

- [ ] **Step 3: Verify the production schema and data**

Run this read-only SQL in Supabase SQL Editor:

```sql
select
  count(*) filter (where location is null) as null_location_count,
  count(*) filter (where location = '용마테니스장') as default_location_count,
  count(*) as total_meeting_count
from public.club_meetings;

select
  column_default,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'club_meetings'
  and column_name = 'location';

select meeting_date, meeting_number, title, location
from public.club_meetings
where meeting_kind = 'regular'
order by meeting_date;
```

Expected:

- `null_location_count = 0`
- `column_default` contains `'용마테니스장'::text`
- `is_nullable = 'NO'`
- Existing regular meetings with no custom venue now show `용마테니스장`

- [ ] **Step 4: Verify the authenticated application behavior**

Open `/meetings` as an admin and verify:

1. The list loads without the legacy RPC fallback error.
2. Existing regular and lightning rows display `용마테니스장` unless explicitly customized.
3. Submitting a blank regular-meeting location keeps `용마테니스장`.
4. The schedule view displays the same location.
5. Browser console and relevant network requests show no errors.

- [ ] **Step 5: Record exact production evidence**

Add to `docs/WORK_LOG.md` under `2026-07-15`:

```markdown
- `202607150003_optimize_meeting_directory_load.sql`과 `202607150004_default_meeting_location.sql`을 운영 Supabase에 순서대로 적용했다.
- 기존 장소 미정 정모를 `용마테니스장`으로 보정하고 정모 장소 컬럼에 기본값과 `NOT NULL` 계약을 적용했다.
- 운영 DB에서 장소 null 0건, 기본값 `용마테니스장`, `is_nullable = NO`를 확인했다.
- 인증된 정모 목록과 일정 화면에서 기본 장소 표시와 빈 장소 저장 시 기본값 복원을 확인했다.
```

Replace any sentence that still says `202607150003` is pending with the actual applied result. Do not claim browser verification unless Step 4 was completed with an authenticated session.

- [ ] **Step 6: Commit the verification record**

```bash
git add docs/WORK_LOG.md
git commit -m "docs: record meeting location rollout"
```

- [ ] **Step 7: Re-run final verification after documentation changes**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
git diff --check
git status --short --branch
```

Expected: all verification commands exit `0`; only known user-owned `.superpowers/` artifacts may remain untracked.
