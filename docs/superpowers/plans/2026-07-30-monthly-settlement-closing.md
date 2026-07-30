# Monthly Settlement Closing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add member activity start months, authoritative monthly settlement closing snapshots, member-wise fee arrears, linked ledger balances, and snapshot-backed member-facing PDFs.

**Architecture:** PostgreSQL is the authoritative settlement calculator and closing boundary. One internal SQL snapshot builder powers both the live preview RPC and the transactional close RPC; the Next.js app maps the returned contract for presentation, while PDF generation reads only the latest active closing snapshot. Member activity eligibility is stored on `members.activity_start_month` and reused by fees, meeting rosters, and settlement closing.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Supabase Postgres/RLS/RPC, Vitest and Testing Library, `@react-pdf/renderer`, SCSS Modules.

## Global Constraints

- Before editing Next.js route handlers or Server Actions, read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`.
- Follow RED → GREEN → REFACTOR for every behavior change; no production code before its focused failing test.
- Preserve unrelated dirty-worktree changes in `docs/WORK_LOG.md`, `src/features/members/member-roster-migration.test.ts`, `.superpowers/`, and the existing untracked migration and plan files.
- Use SCSS Modules, meaningful kebab-case class names, existing tokens from `src/app/globals.scss`, and breakpoints from `src/app/_breakpoints.scss`.
- Do not put member names, member numbers, individual fee records, receipt metadata, or internal memos in closing snapshots or PDFs.
- Do not apply migrations to the production database from this implementation session.
- Existing member activity start months require operator-confirmed values; do not infer them from `joined_date`.
- PDFs are available only for an active closing and only from the first day of the next month in Asia/Seoul.
- July 2026 is the first ledger month and has an opening ledger balance of `0`.

---

## File Structure

### New files

- `supabase/migrations/202607300001_add_member_activity_start_month.sql` — nullable transition column, validation, member save/directory RPC changes, and meeting roster eligibility changes.
- `supabase/migrations/202607300002_add_monthly_settlement_closings.sql` — closing schema, snapshot builder, page/close/reopen RPCs, RLS, locking, ledger chaining, and audit logging.
- `supabase/migrations/202607300003_require_member_activity_start_month.sql` — guarded final `NOT NULL` constraint for use only after operator-confirmed backfill.
- `src/features/members/member-activity-start-migration.test.ts` — executable migration-contract tests for member, fee, and meeting boundaries.
- `src/features/settlements/settlement-snapshot.ts` — TypeScript snapshot/page contracts, parsers, date eligibility, and presentation formatters.
- `src/features/settlements/settlement-snapshot.test.ts` — parser, invariant, date eligibility, and presentation tests.
- `src/features/settlements/settlement-closing-migration.test.ts` — migration-contract tests for financial formulas, locking, versioning, permissions, balances, and privacy.
- `src/app/(app)/settlements/actions.ts` — close/reopen Server Actions.
- `src/app/(app)/settlements/actions.test.ts` — Server Action permission/result/redirect tests.

### Modified files

- Member domain, form, directory, list/mobile presentation, actions, and tests under `src/features/members` and `src/app/(app)/members`.
- Fee eligibility query and summary under `src/features/fees` and `src/app/(app)/fees`.
- Meeting migration contracts affected by the new activity start boundary.
- Settlement summary/page/tests under `src/features/settlements` and `src/app/(app)/settlements`.
- Monthly report data, PDF template, route, and tests under `src/features/reports` and `src/app/(app)/reports/monthly`.
- `docs/PROJECT_CHECKLIST.md` and `docs/WORK_LOG.md` after verification.

---

### Task 1: Add the activity-start domain contract

**Files:**
- Modify: `src/features/members/member-model.ts`
- Modify: `src/features/members/member-model.test.ts`
- Modify: `src/features/members/member-form.ts`
- Modify: `src/features/members/member-form.test.ts`
- Modify: `src/features/fees/fee-model.ts`
- Modify: `src/features/fees/fee-model.test.ts`

**Interfaces:**
- Produces: `activityStartMonth: string | null` on `MemberRecord`, `MemberLifecycleInput`, and `MemberFormInput`.
- Produces in `fee-model.ts`: `isMemberActiveForPeriod(member, periodMonth): boolean`.
- Produces in `fee-model.ts`: `isMemberFeeTargetForPeriod(member, periodMonth): boolean`.
- Preserves: `#0000` as fee-exempt but activity-count eligible.

- [ ] **Step 1: Write failing member lifecycle and fee eligibility tests**

Add cases equivalent to:

```ts
const startsInAugust = {
  status: "active" as const,
  joinedDate: "2026-07-20",
  withdrawnDate: null,
  pauseStartMonth: null,
  activityStartMonth: "2026-08-01",
};

expect(isMemberActiveForPeriod(startsInAugust, "2026-07-01")).toBe(false);
expect(isMemberActiveForPeriod(startsInAugust, "2026-08-01")).toBe(true);
expect(isMemberFeeTargetForPeriod(
  { ...startsInAugust, memberCode: "#0020" },
  "2026-08-01",
)).toBe(true);
expect(isMemberFeeTargetForPeriod(
  { ...startsInAugust, memberCode: "#0000" },
  "2026-08-01",
)).toBe(false);
```

Add validation tests proving:

- activity start month is required for new/edited members;
- it must be a valid first-of-month value;
- it cannot precede the joined month;
- a member paused in August remains eligible in July and becomes ineligible in August;
- a member whose withdrawal date is on or before month end is not active for that month;
- a member withdrawing after month end remains eligible.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm run test -- src/features/members/member-model.test.ts src/features/members/member-form.test.ts src/features/fees/fee-model.test.ts
```

Expected: FAIL because `activityStartMonth`, `isMemberActiveForPeriod`, and `isMemberFeeTargetForPeriod` do not exist.

- [ ] **Step 3: Implement the minimal shared eligibility helpers**

Use a single month comparison contract in `fee-model.ts`; import `MemberRecord` as a type only so `member-model.ts` does not depend on the fee feature:

```ts
export function isMemberActiveForPeriod(
  member: Pick<
    MemberRecord,
    "status" | "withdrawnDate" | "pauseStartMonth" | "activityStartMonth"
  >,
  periodMonth: string,
) {
  const periodEnd = getPeriodMonthEnd(periodMonth);
  if (!member.activityStartMonth || member.activityStartMonth > periodMonth) return false;
  if (member.withdrawnDate && member.withdrawnDate <= periodEnd) return false;
  if (
    member.status === "paused" &&
    member.pauseStartMonth &&
    member.pauseStartMonth <= periodMonth
  ) return false;
  return true;
}

export function isMemberFeeTargetForPeriod(
  member: Parameters<typeof isMemberActiveForPeriod>[0] & { memberCode: string },
  periodMonth: string,
) {
  return (
    member.memberCode !== FEE_EXEMPT_MEMBER_CODE &&
    isMemberActiveForPeriod(member, periodMonth)
  );
}
```

Normalize the form month input to `YYYY-MM-01`, include it in `toMemberDatabaseInput`, and validate it against `joinedDate.slice(0, 7)`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all focused tests pass with no warnings.

- [ ] **Step 5: Commit the domain contract**

```bash
git add src/features/members/member-model.ts src/features/members/member-model.test.ts src/features/members/member-form.ts src/features/members/member-form.test.ts src/features/fees/fee-model.ts src/features/fees/fee-model.test.ts
git commit -m "feat: define member activity start eligibility"
```

---

### Task 2: Wire activity start through member UI and directory data

**Files:**
- Modify: `src/features/members/MemberForm.tsx`
- Modify: `src/features/members/MemberForm.presentation.test.tsx`
- Modify: `src/features/members/MemberForm.confirmation.test.tsx`
- Modify: `src/features/members/member-directory.ts`
- Modify: `src/features/members/member-directory.test.ts`
- Modify: `src/features/members/member-list.ts`
- Modify: `src/features/members/MemberMobileList.tsx`
- Modify: `src/app/(app)/members/page.tsx`
- Modify: `src/app/(app)/members/page.test.tsx`
- Modify: `src/app/(app)/members/actions.ts`
- Modify: `src/app/(app)/members/actions.test.ts`

**Interfaces:**
- Consumes: normalized `activityStartMonth` from Task 1.
- Produces: member forms submit `activityStartMonth`.
- Produces: directory DTOs expose `activityStartMonth`.
- Produces: future-start members display derived label `활동 예정`.

- [ ] **Step 1: Write failing form, action, directory, and list tests**

Assert that:

```tsx
expect(screen.getByLabelText("활동 시작 월")).toHaveValue("2026-08");
```

and that the save RPC payload contains:

```ts
expect.objectContaining({
  member_data: expect.objectContaining({
    joined_date: "2026-07-20",
    activity_start_month: "2026-08-01",
  }),
})
```

Add a member-list case where a future activity month renders `활동 예정` without changing the persisted status enum.

- [ ] **Step 2: Run the affected member tests and verify RED**

```bash
npm run test -- src/features/members 'src/app/(app)/members'
```

Expected: FAIL on missing field, DTO mapping, and derived presentation.

- [ ] **Step 3: Add the field and derived presentation**

Add a required month input immediately after 가입일:

```tsx
<FormField label="활동 시작 월" labelVisible>
  <TextInput
    defaultValue={(candidate?.activityStartMonth ?? member?.activityStartMonth ?? "").slice(0, 7)}
    name="activityStartMonth"
    required
    type="month"
  />
</FormField>
```

Map `activity_start_month` through `MemberDirectoryPageDatabase`, `MemberDatabaseRow`, `MemberListRow`, `MemberEditRecord`, and every mapper. Derive `활동 예정` only when the activity month is after the current period month; do not add a new database status.

Update action validation routing so activity-start errors return `invalid-activity-start-month`.

- [ ] **Step 4: Run the affected member tests and verify GREEN**

Run the Step 2 command. Expected: all member tests pass.

- [ ] **Step 5: Commit the member surface**

```bash
git add src/features/members 'src/app/(app)/members'
git commit -m "feat: capture member activity start month"
```

---

### Task 3: Add the activity-start migration and apply it to fee and meeting eligibility

**Files:**
- Create: `supabase/migrations/202607300001_add_member_activity_start_month.sql`
- Create: `supabase/migrations/202607300003_require_member_activity_start_month.sql`
- Create: `src/features/members/member-activity-start-migration.test.ts`
- Modify: `src/app/(app)/fees/page.tsx`
- Modify: `src/app/(app)/fees/page.test.tsx`
- Modify: `src/app/(app)/fees/actions.ts`
- Modify: `src/app/(app)/fees/actions.test.ts`
- Modify: `src/features/meetings/meeting-migration.test.ts`
- Modify: `src/features/members/member-pause-month-migration.test.ts`

**Interfaces:**
- Produces: nullable transition column `members.activity_start_month date`.
- Produces: guarded final migration that refuses `NOT NULL` while any rows are missing.
- Updates: `save_member_with_contact`, `get_member_directory_page`, `sync_preparing_meeting_roster`, `ensure_locked_meeting_roster`, and `prepare_club_meeting_month`.
- Updates: fee page/action queries to require `activity_start_month <= period_month`.

- [ ] **Step 1: Write failing migration-contract tests**

Require the transition migration to contain:

```ts
expect(sql).toContain("add column activity_start_month date");
expect(sql).toContain("members_activity_start_month_is_month");
expect(sql).toContain("activity_start_month >= date_trunc('month', joined_date)::date");
expect(sql).toContain("'activity_start_month', members.activity_start_month");
expect(sql).toContain("(member_data->>'activity_start_month')::date");
expect(sql).toContain("members.activity_start_month <= requested_period_month");
```

Require the final migration to raise before `SET NOT NULL` when null rows exist. Add fee query tests for `.lte("activity_start_month", periodMonth)`.

- [ ] **Step 2: Run migration and fee tests and verify RED**

```bash
npm run test -- src/features/members/member-activity-start-migration.test.ts src/features/members/member-pause-month-migration.test.ts src/features/meetings/meeting-migration.test.ts 'src/app/(app)/fees'
```

Expected: FAIL because neither migration nor the activity-start filters exist.

- [ ] **Step 3: Write the transition migration**

Start with:

```sql
begin;

alter table public.members
  add column activity_start_month date;

alter table public.members
  add constraint members_activity_start_month_is_month
  check (
    activity_start_month is null
    or activity_start_month = date_trunc('month', activity_start_month)::date
  ),
  add constraint members_activity_start_month_not_before_join
  check (
    activity_start_month is null
    or activity_start_month >= date_trunc('month', joined_date)::date
  );
```

Copy the latest deployed definitions of the five affected functions from `202607290001_add_member_pause_start_month.sql`, preserving all permission, contact privacy, locking, and roster snapshot behavior. Make only these contract changes:

- insert/update `activity_start_month` in `save_member_with_contact`;
- emit `activity_start_month` from `get_member_directory_page`;
- add `members.activity_start_month is not null`;
- add `members.activity_start_month <= <requested roster month>` to every preparing/initial roster candidate query;
- do not rewrite already locked rosters or attendance rows.

End with:

```sql
notify pgrst, 'reload schema';
commit;
```

The final constraint migration must use a guarded block:

```sql
do $$
begin
  if exists (
    select 1 from public.members where activity_start_month is null
  ) then
    raise exception 'member activity start month backfill is incomplete';
  end if;
end;
$$;

alter table public.members
  alter column activity_start_month set not null;
```

- [ ] **Step 4: Update fee reads and writes**

Add `activity_start_month` to selected member columns. In page queries use:

```ts
.lte("activity_start_month", periodMonth)
```

In write paths, use `isMemberFeeTargetForPeriod` from Task 1 after mapping all lifecycle fields. Do not accept a CSV or inline payment for a member before their activity start month.

- [ ] **Step 5: Run the focused suite and verify GREEN**

Run the Step 2 command. Expected: all activity, fee, and meeting migration-contract tests pass.

- [ ] **Step 6: Commit the migration and eligibility wiring**

```bash
git add supabase/migrations/202607300001_add_member_activity_start_month.sql supabase/migrations/202607300003_require_member_activity_start_month.sql src/features/members/member-activity-start-migration.test.ts src/features/members/member-pause-month-migration.test.ts src/features/meetings/meeting-migration.test.ts 'src/app/(app)/fees' src/features/fees
git commit -m "feat: apply activity start month across operations"
```

---

### Task 4: Define the settlement snapshot contract and parser

**Files:**
- Create: `src/features/settlements/settlement-snapshot.ts`
- Create: `src/features/settlements/settlement-snapshot.test.ts`
- Modify: `src/features/settlements/settlement-summary.ts`
- Modify: `src/features/settlements/settlement-summary.test.ts`

**Interfaces:**
- Produces: `MonthlySettlementSnapshot`.
- Produces: `MonthlySettlementClosing`.
- Produces: `MonthlySettlementPage`.
- Produces: `parseMonthlySettlementPage(value): MonthlySettlementPage`.
- Produces: `canDownloadMonthlyReport(periodMonth, now): boolean` using Asia/Seoul.

- [ ] **Step 1: Write failing parser and invariant tests**

Define the wished-for contract in tests:

```ts
const snapshot: MonthlySettlementSnapshot = {
  schemaVersion: 1,
  periodMonth: "2026-07-01",
  monthlyFeeAmount: 30000,
  activityMemberCount: 21,
  feeTargetCount: 20,
  fullyPaidCount: 17,
  unpaidCount: 3,
  billedTotal: 600000,
  actualFeeIncome: 525000,
  recognizedPaidTotal: 510000,
  adjustmentIncome: 15000,
  unpaidTotal: 90000,
  expenseTotal: 130000,
  expenseCount: 2,
  attributedNet: 395000,
  openingLedgerBalance: 0,
  closingLedgerBalance: 395000,
  expenseCategoryRows: [
    { category: "court", count: 1, amount: 120000 },
    { category: "balls", count: 1, amount: 10000 },
  ],
  expenseRows: [
    {
      expenseDate: "2026-07-12",
      category: "court",
      description: "코트 대관",
      amount: 120000,
    },
  ],
};
```

Assert parser rejection for:

- wrong `schemaVersion`;
- negative counts or mismatched counts;
- `billedTotal !== recognizedPaidTotal + unpaidTotal`;
- `actualFeeIncome !== recognizedPaidTotal + adjustmentIncome`;
- `attributedNet !== actualFeeIncome - expenseTotal`;
- `closingLedgerBalance !== openingLedgerBalance + attributedNet`;
- expense category totals that do not match expense rows.

Add KST boundary tests for `2026-08-01T00:00:00+09:00`.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm run test -- src/features/settlements/settlement-snapshot.test.ts src/features/settlements/settlement-summary.test.ts
```

Expected: FAIL because the snapshot contract and parser do not exist.

- [ ] **Step 3: Implement strict mapping and presentation helpers**

Keep database names at the mapping boundary and camelCase inside the app. Return a discriminated page model:

```ts
export type MonthlySettlementPage = {
  preview: MonthlySettlementSnapshot;
  activeClosing: MonthlySettlementClosing | null;
  canClose: boolean;
  canReopen: boolean;
  closeBlockedReason: string | null;
};
```

Retain `formatSettlementBalance` but rename UI usage from `balance` to `attributedNet`. Do not retain a second independent fee calculator in TypeScript.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Step 2 command. Expected: all settlement contract tests pass.

- [ ] **Step 5: Commit the snapshot contract**

```bash
git add src/features/settlements
git commit -m "feat: define monthly settlement snapshot contract"
```

---

### Task 5: Implement transactional settlement closing in PostgreSQL

**Files:**
- Create: `supabase/migrations/202607300002_add_monthly_settlement_closings.sql`
- Create: `src/features/settlements/settlement-closing-migration.test.ts`

**Interfaces:**
- Produces: `monthly_closing_status` enum with `closed | reopened`.
- Produces: `monthly_closings`.
- Produces internal: `build_monthly_settlement_snapshot(requested_period_month date) returns jsonb`.
- Produces authenticated RPC: `get_monthly_settlement_page(requested_period_month date) returns jsonb`.
- Produces authenticated RPC: `close_monthly_settlement(requested_period_month date) returns jsonb`.
- Produces authenticated RPC: `reopen_monthly_settlement(requested_period_month date) returns jsonb`.

- [ ] **Step 1: Write failing migration-contract tests**

Require tests for these concrete SQL contracts:

```ts
expect(sql).toContain("pg_advisory_xact_lock");
expect(sql).toContain("greatest(monthly_fee_amount - coalesce");
expect(sql).toContain("least(coalesce");
expect(sql).toContain("date '2026-07-01'");
expect(sql).toContain("settlements.close");
expect(sql).toContain("settlements.reopen");
expect(sql).toContain("insert into public.audit_logs");
expect(sql).toContain("activity_start_month");
expect(sql).not.toContain("'member_name'");
expect(sql).not.toContain("'member_code'");
expect(sql).not.toContain("'memo'");
```

Also assert:

- unique `(period_month, version)`;
- a partial unique index for one `closed` row per month;
- no direct authenticated insert/update/delete grants;
- active operators can select closing snapshots;
- July opening balance is zero;
- later months require the prior active closing;
- a month cannot reopen while a later active closing exists;
- reclose increments version;
- current/future month close uses Seoul date;
- snapshot contains public expense rows but no receipt fields.

- [ ] **Step 2: Run the migration test and verify RED**

```bash
npm run test -- src/features/settlements/settlement-closing-migration.test.ts
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the closing table and RLS**

Use:

```sql
create type public.monthly_closing_status as enum ('closed', 'reopened');

create table public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  version integer not null check (version > 0),
  status public.monthly_closing_status not null default 'closed',
  snapshot jsonb not null,
  closed_by uuid not null references public.profiles(id),
  closed_at timestamptz not null default now(),
  reopened_by uuid references public.profiles(id),
  reopened_at timestamptz,
  unique (period_month, version),
  check (period_month = date_trunc('month', period_month)::date),
  check (
    (status = 'closed' and reopened_by is null and reopened_at is null)
    or
    (status = 'reopened' and reopened_by is not null and reopened_at is not null)
  )
);

create unique index monthly_closings_one_active_month_idx
on public.monthly_closings(period_month)
where status = 'closed';
```

Enable RLS and allow only active operators to select. Revoke direct writes from `authenticated`.

- [ ] **Step 4: Implement one authoritative internal snapshot builder**

The helper must:

1. reject months before July 2026;
2. reject relevant members with null activity start month;
3. select monthly activity and fee targets with activity, pause, withdrawal, and `#0000` rules;
4. aggregate each target member with `least(paid, fee)` and `greatest(fee - paid, 0)`;
5. include all period-month payments in actual fee income;
6. aggregate expense categories and sanitized expense rows;
7. derive the prior closing balance or July zero;
8. build JSON matching Task 4 exactly.

Core member-wise aggregation must have this shape:

```sql
select
  count(*) as fee_target_count,
  count(*) filter (where paid_amount >= monthly_fee_amount) as fully_paid_count,
  count(*) filter (where paid_amount < monthly_fee_amount) as unpaid_count,
  sum(monthly_fee_amount) as billed_total,
  sum(least(paid_amount, monthly_fee_amount)) as recognized_paid_total,
  sum(greatest(monthly_fee_amount - paid_amount, 0)) as unpaid_total
from target_member_payments;
```

Revoke public/authenticated execution on the internal builder.

- [ ] **Step 5: Implement preview, close, and reopen RPCs**

Every mutating RPC must:

- verify `auth.uid()` belongs to an active profile;
- verify the specific permission with `public.has_permission`;
- acquire an advisory transaction lock keyed by period month;
- write an audit row in the same transaction;
- return the updated page DTO.

`close_monthly_settlement` inserts `max(version) + 1`. `reopen_monthly_settlement` updates only the active closing and rejects the request when a later active closing exists.

- [ ] **Step 6: Run the migration test and verify GREEN**

Run the Step 2 command. Expected: migration contract passes.

- [ ] **Step 7: Commit the closing migration**

```bash
git add supabase/migrations/202607300002_add_monthly_settlement_closings.sql src/features/settlements/settlement-closing-migration.test.ts
git commit -m "feat: add transactional monthly settlement closing"
```

---

### Task 6: Add settlement close/reopen actions and snapshot-aware UI

**Files:**
- Create: `src/app/(app)/settlements/actions.ts`
- Create: `src/app/(app)/settlements/actions.test.ts`
- Modify: `src/app/(app)/settlements/page.tsx`
- Modify: `src/app/(app)/settlements/page.test.tsx`
- Modify: `src/app/(app)/settlements/page.module.scss`

**Interfaces:**
- Consumes: `get_monthly_settlement_page`.
- Produces Server Actions: `closeMonthlySettlement(formData)` and `reopenMonthlySettlement(formData)`.
- Preserves: month and category sort query state.

- [ ] **Step 1: Read the required local Next.js guides**

Read completely:

```bash
sed -n '1,260p' node_modules/next/dist/docs/01-app/02-guides/server-actions.md
sed -n '1,260p' node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
```

- [ ] **Step 2: Write failing action and page tests**

Test:

- normalized month is passed as `YYYY-MM-01`;
- close/reopen RPC errors redirect to stable Korean error codes;
- success revalidates `/settlements` and preserves `month`;
- preview values render before closing;
- closed values come from `activeClosing.snapshot`;
- close button depends on `canClose`;
- reopen button depends on `canReopen`;
- PDF link is absent before eligibility and present after it;
- closing version, date, and actor render;
- zero fee targets render the explicit empty notice.

- [ ] **Step 3: Run the action/page tests and verify RED**

```bash
npm run test -- 'src/app/(app)/settlements'
```

Expected: FAIL because the RPC loader and actions do not exist.

- [ ] **Step 4: Implement Server Actions**

Use one action helper:

```ts
async function runSettlementMutation(
  rpcName: "close_monthly_settlement" | "reopen_monthly_settlement",
  formData: FormData,
) {
  const periodMonth = normalizePeriodMonth(String(formData.get("month") ?? ""));
  if (!periodMonth) redirect("/settlements?error=invalid-month");

  const supabase = await createClient();
  const { error } = await supabase.rpc(rpcName, {
    requested_period_month: periodMonth,
  });
  if (error) redirect(`/settlements?month=${periodMonth.slice(0, 7)}&error=mutation-failed`);

  revalidatePath("/settlements");
  redirect(`/settlements?month=${periodMonth.slice(0, 7)}&status=updated`);
}
```

- [ ] **Step 5: Replace raw-table page reads with the page RPC**

Parse the RPC result through Task 4. Render:

- monthly activity and fee-target counts;
- fully paid/unpaid counts;
- billed, actual, recognized, adjustment, and unpaid totals;
- expenses, attributed net, opening and closing ledger balances;
- closing metadata and actions.

Use an SCSS grid only if existing `SummaryGrid` cannot express the count cleanly. Any new values must be tokens before use.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run the Step 3 command. Expected: all settlement action/page tests pass.

- [ ] **Step 7: Commit the settlement UI**

```bash
git add 'src/app/(app)/settlements'
git commit -m "feat: add settlement closing workflow"
```

---

### Task 7: Make monthly PDFs snapshot-only

**Files:**
- Modify: `src/features/reports/monthly-report.ts`
- Modify: `src/features/reports/monthly-report.test.ts`
- Modify: `src/features/reports/MonthlyReportPdf.tsx`
- Modify: `src/features/reports/MonthlyReportPdf.test.tsx`
- Modify: `src/app/(app)/reports/monthly/route.ts`
- Modify: `src/app/(app)/reports/monthly/route.test.ts`

**Interfaces:**
- Consumes: `MonthlySettlementClosing` and `MonthlySettlementSnapshot`.
- Produces: member-facing report DTO with closing metadata and no source-table identifiers.
- Preserves: `jw-tennis-club-YYYY-MM-report.pdf`.

- [ ] **Step 1: Write failing report-data tests**

Expect the DTO to include:

```ts
expect(report).toEqual(expect.objectContaining({
  closingVersion: 2,
  closedAtLabel: "2026.08.02",
  closedBy: "김마감",
  activityMemberCount: 21,
  feeTargetCount: 20,
  fullyPaidCount: 17,
  unpaidCount: 3,
  billedTotal: 600000,
  actualFeeIncome: 525000,
  recognizedPaidTotal: 510000,
  adjustmentIncome: 15000,
  unpaidTotal: 90000,
  attributedNet: 395000,
  openingLedgerBalance: 0,
  closingLedgerBalance: 395000,
}));
```

Assert that no field contains member name, member code, payment row, receipt, or memo data.

- [ ] **Step 2: Write failing route and PDF tests**

Route tests must prove:

- authentication is required;
- only an active `closed` row is selected;
- next-month KST eligibility is enforced;
- no `fee_payments`, `members`, or `expenses` table is queried;
- rendering uses the stored snapshot;
- successful generation adds an `audit_logs` row with month and closing version;
- reopened/missing closings return a controlled error;
- report filename is unchanged.

PDF tests must render all new public labels and rename `주요 지출 내역` to `지출 내역`.

- [ ] **Step 3: Run the report tests and verify RED**

```bash
npm run test -- src/features/reports 'src/app/(app)/reports/monthly'
```

Expected: FAIL because reports still rebuild from raw fee and expense tables.

- [ ] **Step 4: Map snapshot data into the report**

`buildMonthlyReportData` must accept closing metadata and the stored snapshot only:

```ts
export function buildMonthlyReportData(input: {
  closing: MonthlySettlementClosing;
  generatedAt: Date;
  generatedBy: string;
}): MonthlyReportData
```

Keep date formatting and filename helpers. Remove fee/expense calculation from the report layer.

- [ ] **Step 5: Update the PDF layout**

Render labeled sections in this reading order:

1. title;
2. closing version/date/actor;
3. generation date/actor;
4. member and fee counts;
5. billed/actual/recognized/adjustment/unpaid amounts;
6. expenses and attributed net;
7. opening and closing ledger balances;
8. category totals;
9. all sanitized expense rows;
10. accounting-basis and privacy notices.

When `adjustmentIncome === 0`, omit only that card; all other labels remain explicit. When `feeTargetCount === 0`, render the approved no-target notice.

- [ ] **Step 6: Update the route**

Authenticate, fetch the active closing plus closing actor display name, enforce KST eligibility, render, then add an audit row:

```ts
await supabase.from("audit_logs").insert({
  actor_profile_id: user.id,
  action: "monthly_report.generated",
  table_name: "monthly_closings",
  record_id: closing.id,
  details: {
    period_month: closing.periodMonth,
    version: closing.version,
  },
});
```

If audit insertion fails, do not return an unlogged PDF.

- [ ] **Step 7: Run report tests and verify GREEN**

Run the Step 3 command. Expected: all report tests pass and the rendered buffer starts with `%PDF`.

- [ ] **Step 8: Commit snapshot-backed reports**

```bash
git add src/features/reports 'src/app/(app)/reports/monthly'
git commit -m "feat: generate reports from settlement snapshots"
```

---

### Task 8: Validate cross-feature behavior and document deployment gates

**Files:**
- Modify: `docs/PROJECT_CHECKLIST.md`
- Modify: `docs/WORK_LOG.md`
- Verify all files changed in Tasks 1-7.

**Interfaces:**
- Produces: deployment-ready code and explicit operator backfill/application gates.

- [ ] **Step 1: Run focused cross-feature tests**

```bash
npm run test -- src/features/members src/features/fees src/features/meetings src/features/settlements src/features/reports 'src/app/(app)/members' 'src/app/(app)/fees' 'src/app/(app)/meetings' 'src/app/(app)/settlements' 'src/app/(app)/reports'
```

Expected: all focused tests pass.

- [ ] **Step 2: Run the complete test suite**

```bash
npm run test
```

Expected: all test files pass with zero failures.

- [ ] **Step 3: Run static verification**

```bash
npm run lint
npx tsc --noEmit
git diff --check
```

Expected: each command exits `0` with no errors or warnings.

- [ ] **Step 4: Run the production build**

```bash
npm run build
```

Expected: Next.js 16.2.10 production build succeeds and includes members, fees, meetings, settlements, and monthly report routes.

- [ ] **Step 5: Perform database migration review without applying production changes**

Verify:

- migration order is activity column → closing schema → guarded `NOT NULL`;
- `202607300003` is not applied before operator-confirmed backfill;
- closing RPC rejects null activity months;
- snapshot JSON contains no member or receipt identifiers;
- RLS allows active-operator reads and blocks direct writes;
- SQL functions retain a safe `search_path`, explicit grants, permission checks, and advisory locks.

- [ ] **Step 6: Update project records**

Document:

- implementation and verification evidence;
- the unapplied migration state;
- operator-confirmed activity-start backfill requirement;
- July 2026 first-close requirement;
- migration-first deployment order;
- authenticated browser QA still required after DB application.

- [ ] **Step 7: Commit verified implementation records**

```bash
git add docs/PROJECT_CHECKLIST.md docs/WORK_LOG.md
git commit -m "docs: record settlement closing verification"
```

---

## Definition of Done

- Member 가입일 and 활동 시작 월 are separate throughout create, edit, directory, fee, and meeting flows.
- Activity start is the common start boundary for fees, preparing meeting rosters, and monthly activity counts.
- Partial payments remain unpaid by count and amount; overpayment never offsets another member's arrears.
- Actual, recognized, adjustment, and unpaid amounts reconcile.
- July 2026 starts at zero and every later closing chains from the prior active closing balance.
- Closing and reopening are permission-checked, serialized, audited, versioned, and preserve old snapshots.
- The PDF is unavailable before close, while reopened, and before the next month in Seoul.
- The PDF reads only the active snapshot and excludes all prohibited personal/internal data.
- Focused tests, full tests, lint, TypeScript, production build, and `git diff --check` pass.
- Production migrations remain unapplied until the operator-confirmed activity-start backfill and deployment gate are ready.
