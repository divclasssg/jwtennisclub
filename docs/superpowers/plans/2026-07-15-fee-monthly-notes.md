# Monthly Fee Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent member-and-month fee note that can be created before payment, edited after payment, and preserved across payment cancellation.

**Architecture:** Add `fee_monthly_notes` as the UI source of truth, with one row per member and month. Keep `fee_payments.memo` only for CSV compatibility and copy imported values into the new table atomically with a database trigger. Render one note action per desktop row and mobile card; open a URL-addressable `ModalDialog` and save through an authenticated, authorized Server Action.

**Tech Stack:** Next.js 16.2.10 App Router, React 19 Server Components and Server Actions, TypeScript, Supabase Postgres/RLS, SCSS Modules, Vitest, Testing Library.

## Global Constraints

- Follow the local Next.js 16.2.10 forms, Server Actions, mutation, and redirect documentation already reviewed for this task.
- Authenticate, authorize, and validate all Server Action input; revalidate before redirecting and never expose raw database errors.
- Store one trimmed 1–500 character note per `member_id + period_month`; blank input deletes the row.
- Show note actions for paid and unpaid members independently from payment create/cancel actions.
- Preserve `month`, `q`, `sort`, and `direction` through modal open, close, save, and retry.
- Continue accepting CSV `memo`/`메모` and copy it to monthly notes in the same database transaction.
- Use existing SCSS tokens and breakpoint variables; use kebab-case class names.
- Keep the pre-existing `.superpowers/` local state untouched and out of commits.

---

### Task 1: Persist independent monthly fee notes

**Files:**
- Create: `supabase/migrations/202607150001_add_fee_monthly_notes.sql`
- Create: `src/features/fees/fee-note-migration.test.ts`

**Interfaces:**
- Produces: `public.fee_monthly_notes` and trigger function `public.sync_fee_payment_memo_to_monthly_note()`.
- Consumes: `members`, `profiles`, `fee_payments`, `has_permission(text)`, and `fees.payments.view/create/update`.

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const path = join(process.cwd(), "supabase/migrations/202607150001_add_fee_monthly_notes.sql");
const sql = existsSync(path) ? readFileSync(path, "utf8").toLowerCase() : "";

describe("fee monthly notes migration", () => {
  it("creates one bounded note per member and month", () => {
    expect(sql).toContain("create table public.fee_monthly_notes");
    expect(sql).toContain("unique (member_id, period_month)");
    expect(sql).toContain("length(memo) between 1 and 500");
  });

  it("protects notes with existing fee permissions", () => {
    expect(sql).toContain("alter table public.fee_monthly_notes enable row level security");
    expect(sql).toContain("public.has_permission('fees.payments.view')");
    expect(sql).toContain("public.has_permission('fees.payments.create')");
    expect(sql).toContain("public.has_permission('fees.payments.update')");
  });

  it("backfills and atomically syncs CSV payment memos", () => {
    expect(sql).toContain("from public.fee_payments");
    expect(sql).toContain("on conflict (member_id, period_month) do nothing");
    expect(sql).toContain("create or replace function public.sync_fee_payment_memo_to_monthly_note()");
    expect(sql).toContain("after insert or update of memo on public.fee_payments");
    expect(sql).toContain("fee payment memo exceeds 500 characters");
  });
});
```

- [ ] **Step 2: Verify RED**

Run `npm run test -- src/features/fees/fee-note-migration.test.ts`.

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add the migration**

The migration must contain these complete contracts:

```sql
create table public.fee_monthly_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  period_month date not null,
  memo text not null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fee_monthly_notes_member_month_unique unique (member_id, period_month),
  constraint fee_monthly_notes_period_first_day check (
    period_month = date_trunc('month', period_month)::date
  ),
  constraint fee_monthly_notes_memo_length check (length(memo) between 1 and 500),
  constraint fee_monthly_notes_memo_trimmed check (memo = btrim(memo))
);

alter table public.fee_monthly_notes enable row level security;
revoke all on table public.fee_monthly_notes from public, anon;
grant select, insert, update, delete on table public.fee_monthly_notes to authenticated;

create policy "fee viewers can read monthly notes"
on public.fee_monthly_notes for select to authenticated
using (public.has_permission('fees.payments.view'));

create policy "fee managers can create monthly notes"
on public.fee_monthly_notes for insert to authenticated
with check (
  (public.has_permission('fees.payments.create') or public.has_permission('fees.payments.update'))
  and created_by = auth.uid() and updated_by = auth.uid()
);

create policy "fee managers can update monthly notes"
on public.fee_monthly_notes for update to authenticated
using (public.has_permission('fees.payments.create') or public.has_permission('fees.payments.update'))
with check (
  (public.has_permission('fees.payments.create') or public.has_permission('fees.payments.update'))
  and updated_by = auth.uid()
);

create policy "fee managers can delete monthly notes"
on public.fee_monthly_notes for delete to authenticated
using (public.has_permission('fees.payments.create') or public.has_permission('fees.payments.update'));

insert into public.fee_monthly_notes (
  member_id, period_month, memo, created_by, updated_by, created_at, updated_at
)
select member_id, period_month, btrim(memo), created_by, updated_by, created_at, updated_at
from public.fee_payments
where memo is not null and length(btrim(memo)) between 1 and 500
on conflict (member_id, period_month) do nothing;

create or replace function public.sync_fee_payment_memo_to_monthly_note()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.memo is not null and length(pg_catalog.btrim(new.memo)) > 0 then
    if length(pg_catalog.btrim(new.memo)) > 500 then
      raise exception 'fee payment memo exceeds 500 characters';
    end if;
    insert into public.fee_monthly_notes (
      member_id, period_month, memo, created_by, updated_by, created_at, updated_at
    ) values (
      new.member_id, new.period_month, pg_catalog.btrim(new.memo),
      new.created_by, new.updated_by, new.created_at, new.updated_at
    )
    on conflict (member_id, period_month) do update
    set memo = excluded.memo, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_fee_payment_memo_to_monthly_note()
from public, anon, authenticated;

create trigger fee_payments_sync_monthly_note
after insert or update of memo on public.fee_payments
for each row execute function public.sync_fee_payment_memo_to_monthly_note();
```

Keep the trigger function invoker-security so authenticated CSV imports remain subject to note RLS.

- [ ] **Step 4: Verify GREEN**

Run `npm run test -- src/features/fees/fee-note-migration.test.ts`.

Expected: 1 file, 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607150001_add_fee_monthly_notes.sql src/features/fees/fee-note-migration.test.ts
git commit -m "feat: add monthly fee note storage"
```

---

### Task 2: Model notes and join them to fee-board rows

**Files:**
- Create: `src/features/fees/fee-note.ts`
- Create: `src/features/fees/fee-note.test.ts`
- Modify: `src/features/fees/fee-list.ts`
- Modify: `src/features/fees/fee-list.test.ts`
- Modify: `src/features/fees/fee-form.ts`
- Modify: `src/features/fees/fee-form.test.ts`

**Interfaces:**
- Produces: `FeeMonthlyNoteRecord`, `mapFeeMonthlyNoteRow`, `normalizeFeeNoteInput`, `buildFeesHref`, `FeeBoardMemberRow.note`, and a shared 500-character CSV/form validation rule.
- Consumes: `normalizePeriodMonth`, existing fee-list search fields, and existing fee sort keys.

- [ ] **Step 1: Write failing domain tests**

```ts
it("normalizes note input", () => {
  expect(normalizeFeeNoteInput("  다음 달 합산  ")).toEqual({ ok: true, memo: "다음 달 합산" });
  expect(normalizeFeeNoteInput("   ")).toEqual({ ok: true, memo: null });
  expect(normalizeFeeNoteInput("가".repeat(501))).toEqual({ ok: false, error: "too-long" });
});

it("preserves valid list state in a note URL", () => {
  expect(buildFeesHref(
    { month: "2026-07", q: "김", sort: "memo", direction: "desc" },
    { note: "member-1" },
  )).toBe("/fees?month=2026-07&q=%EA%B9%80&sort=memo&direction=desc&note=member-1");
});
```

Extend `fee-list.test.ts` with paid and unpaid members that each receive a separate note through `buildFeeBoardRows({ members, payments, notes })`.

Extend `fee-form.test.ts` with a CSV row whose memo is 501 characters and assert parsing fails on that physical source line with `메모는 500자 이하로 입력하세요.`. Add a 500-character row and assert it remains valid.

- [ ] **Step 2: Verify RED**

Run `npm run test -- src/features/fees/fee-note.test.ts src/features/fees/fee-list.test.ts src/features/fees/fee-form.test.ts`.

Expected: FAIL because the note domain and row field do not exist.

- [ ] **Step 3: Implement the note domain**

```ts
export type FeeMonthlyNoteRecord = {
  id: string;
  memberId: string;
  periodMonth: string;
  memo: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function normalizeFeeNoteInput(value: FormDataEntryValue | string | null) {
  const memo = typeof value === "string" ? value.trim() : "";
  if (memo.length > 500) return { ok: false as const, error: "too-long" as const };
  return { ok: true as const, memo: memo || null };
}
```

Implement `mapFeeMonthlyNoteRow` with snake_case-to-camelCase mapping. Implement `buildFeesHref` with a `URLSearchParams` whitelist for `month`, `q`, valid fee sort keys, `asc|desc`, and overrides `note`, `noteError`, `status`. Add `note: FeeMonthlyNoteRecord | null` to `FeeBoardMemberRow`, map notes by `memberId`, and never fall back to `payment.memo`.

Add `validateFeeMemo(memo: string | null)` in `fee-form.ts`, reuse it from normal form and CSV validation, and return the exact error `메모는 500자 이하로 입력하세요.` when the normalized value exceeds 500 characters. This rejects the entire CSV insert before the database trigger and keeps the trigger constraint as defense in depth.

- [ ] **Step 4: Verify GREEN**

Run `npm run test -- src/features/fees/fee-note.test.ts src/features/fees/fee-list.test.ts src/features/fees/fee-form.test.ts`.

Expected: both files PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/fees/fee-note.ts src/features/fees/fee-note.test.ts src/features/fees/fee-list.ts src/features/fees/fee-list.test.ts src/features/fees/fee-form.ts src/features/fees/fee-form.test.ts
git commit -m "feat: model independent monthly fee notes"
```

---

### Task 3: Save, update, and delete notes securely

**Files:**
- Modify: `src/app/(app)/fees/actions.ts`
- Modify: `src/app/(app)/fees/actions.test.ts`

**Interfaces:**
- Produces: `saveFeeMonthlyNote(formData: FormData): Promise<never>`.
- Consumes: `normalizeFeeNoteInput`, `buildFeesHref`, `currentOperatorHasPermission`, `getPeriodMonthEnd`, and `fee_monthly_notes` RLS.

- [ ] **Step 1: Write failing action tests**

Add complete tests for these five cases:

```ts
it("creates a trimmed monthly note and preserves list state", async () => {
  const data = new FormData();
  data.set("memberId", "member-1");
  data.set("periodMonth", "2026-07");
  data.set("query", "김");
  data.set("sort", "memo");
  data.set("direction", "desc");
  data.set("memo", "  다음 달 합산  ");
  await expect(saveFeeMonthlyNote(data)).rejects.toThrow(
    "redirect:/fees?month=2026-07&q=%EA%B9%80&sort=memo&direction=desc&status=note-saved",
  );
  expect(noteTable.insert).toHaveBeenCalledWith({
    member_id: "member-1",
    period_month: "2026-07-01",
    memo: "다음 달 합산",
    created_by: "operator-id",
    updated_by: "operator-id",
  });
});
```

The other four tests must assert: an existing row uses `update({ memo, updated_by, updated_at })` without replacing `created_by`; blank input deletes by both member and month; 501 characters redirect with `noteError=too-long` without a write; missing permission or an invalid target member redirects with `forbidden`/`invalid-member` without a write.

- [ ] **Step 2: Verify RED**

Run `npm run test -- 'src/app/(app)/fees/actions.test.ts'`.

Expected: FAIL because `saveFeeMonthlyNote` does not exist.

- [ ] **Step 3: Implement the Server Action**

Implement this exact sequence:

1. Read `memberId`, normalized month, memo, query, sort, and direction.
2. Redirect invalid/overlong input back to the same note modal with a whitelisted error code.
3. Require `fees.payments.create` OR `fees.payments.update` through `currentOperatorHasPermission`.
4. Authenticate with `getAuthenticatedUserId`.
5. Re-read the member as active, non-`#0000`, and joined by month-end.
6. Read an existing note ID by member and month.
7. Insert, update, or delete with separate queries so `created_by` is never overwritten.
8. On database failure, redirect with `noteError=save-failed` and keep the modal open.
9. On success, call `revalidatePath("/fees")` before redirecting to `buildFeesHref(listState, { status: "note-saved" })`.

Use `redirect` outside `try/catch`, matching the local Next.js control-flow contract.

- [ ] **Step 4: Verify GREEN**

Run `npm run test -- 'src/app/(app)/fees/actions.test.ts'`.

Expected: all existing and new fee action tests PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(app)/fees/actions.ts' 'src/app/(app)/fees/actions.test.ts'
git commit -m "feat: save monthly fee notes"
```

---

### Task 4: Add per-member buttons and the shared modal

**Files:**
- Create: `src/features/fees/FeeNoteModal.tsx`
- Create: `src/features/fees/FeeNoteModal.test.tsx`
- Create: `src/features/fees/FeeNoteModal.module.scss`
- Modify: `src/app/(app)/fees/page.tsx`
- Modify: `src/app/(app)/fees/page.module.scss`
- Modify: `src/app/(app)/fees/page.test.tsx`
- Modify: `src/features/fees/FeeMobileList.tsx`
- Modify: `src/features/fees/FeeMobileList.module.scss`

**Interfaces:**
- Produces: `FeeNoteModal` and per-member `메모 입력`/`<회원명> 메모 수정` links.
- Consumes: `saveFeeMonthlyNote`, `currentOperatorHasPermission`, `ModalDialog`, atomic form components, `buildFeesHref`, and `FeeBoardMemberRow.note`.

- [ ] **Step 1: Write failing UI tests**

Extend the fee page mock with a distinct `fee_monthly_notes` query and assert:

```ts
expect(within(table).getByText("다음 달 합산")).toBeInTheDocument();
expect(within(table).getByRole("link", { name: "김민수 메모 수정" })).toHaveAttribute(
  "href",
  "/fees?month=2026-07&sort=memo&direction=desc&note=member-1",
);
expect(within(table).getByRole("link", { name: "이영희 메모 입력" })).toBeInTheDocument();
```

Add a selected-note test that expects dialog name `김민수 2026.07 회비 메모`, textarea value `다음 달 합산`, a 500-character maximum, an error message connected through `aria-describedby`, and a close URL without `note` or `noteError`. Extend the mobile test so both cards expose their own note actions.

Add a permission test that mocks both `fees.payments.create` and `fees.payments.update` as false. Existing memo text remains readable with `fees.payments.view`, but `메모 입력`, `메모 수정`, and a forged `note=<member-id>` modal are absent.

- [ ] **Step 2: Verify RED**

Run `npm run test -- src/features/fees/FeeNoteModal.test.tsx 'src/app/(app)/fees/page.test.tsx'`.

Expected: FAIL because the modal, query, and links do not exist.

- [ ] **Step 3: Implement `FeeNoteModal`**

```tsx
export function FeeNoteModal(props: FeeNoteModalProps) {
  return (
    <ModalDialog
      closeHref={props.closeHref}
      title={`${props.memberName} ${formatPeriodMonth(props.periodMonth)} 회비 메모`}
    >
      <form action={props.action} className={styles["fee-note-form"]}>
        <input name="memberId" type="hidden" value={props.memberId} />
        <input name="periodMonth" type="hidden" value={props.periodMonth.slice(0, 7)} />
        <input name="query" type="hidden" value={props.query} />
        <input name="sort" type="hidden" value={props.sort} />
        <input name="direction" type="hidden" value={props.direction} />
        <FormField label="메모">
          <textarea
            aria-describedby={getFeeNoteErrorMessage(props.errorCode) ? "fee-note-error" : undefined}
            defaultValue={props.memo}
            maxLength={500}
            name="memo"
            rows={6}
          />
        </FormField>
        {getFeeNoteErrorMessage(props.errorCode) ? (
          <div id="fee-note-error">
            <FormMessage>{getFeeNoteErrorMessage(props.errorCode)}</FormMessage>
          </div>
        ) : null}
        <FormActions>
          <ActionLink href={props.closeHref} variant="secondary">취소</ActionLink>
          <Button type="submit">저장</Button>
        </FormActions>
      </form>
    </ModalDialog>
  );
}
```

Map `too-long`, `forbidden`, `invalid-member`, and `save-failed` to concise Korean messages. Use existing form-control tokens and add only meaningful kebab-case layout classes.

- [ ] **Step 4: Integrate desktop and mobile**

In `page.tsx`, query `fee_monthly_notes` by selected month in the existing `Promise.all`, map the records, and pass them to `buildFeeBoardRows`. Resolve `canManageNotes` from `fees.payments.create OR fees.payments.update`. Sort memo by `row.note?.memo`. In each desktop cell and mobile card, keep note text readable but render the truncated-note `수정` action or empty-state `메모 입력` action only when `canManageNotes` is true; build each href with the current list state. Render `FeeNoteModal` only when `canManageNotes` is true and `note` matches a current board row, preventing unauthorized or forged query parameters from exposing the editor.

- [ ] **Step 5: Verify GREEN**

Run `npm run test -- src/features/fees/FeeNoteModal.test.tsx 'src/app/(app)/fees/page.test.tsx'`.

Expected: both files PASS.

- [ ] **Step 6: Run all fee tests**

Run `npm run test -- src/features/fees 'src/app/(app)/fees'`.

Expected: all fee tests PASS without warnings.

- [ ] **Step 7: Commit**

```bash
git add src/features/fees/FeeNoteModal.tsx src/features/fees/FeeNoteModal.test.tsx src/features/fees/FeeNoteModal.module.scss src/features/fees/FeeMobileList.tsx src/features/fees/FeeMobileList.module.scss 'src/app/(app)/fees/page.tsx' 'src/app/(app)/fees/page.module.scss' 'src/app/(app)/fees/page.test.tsx'
git commit -m "feat: edit notes from the monthly fee board"
```

---

### Task 5: Verify and document the feature

**Files:**
- Modify: `docs/PROJECT_CHECKLIST.md`
- Modify: `docs/WORK_LOG.md`

**Interfaces:**
- Consumes: all Task 1–4 deliverables.
- Produces: fresh automated/browser evidence and durable project context.

- [ ] **Step 1: Run focused gates**

```bash
git diff --check
npm run test -- src/features/fees/fee-note-migration.test.ts src/features/fees/fee-note.test.ts src/features/fees/fee-list.test.ts 'src/app/(app)/fees/actions.test.ts' src/features/fees/FeeNoteModal.test.tsx 'src/app/(app)/fees/page.test.tsx'
```

Expected: exit 0 and all focused tests PASS.

- [ ] **Step 2: Run the full automated gate**

```bash
npm run test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: every command exits 0. Record an incomplete gate honestly if a command times out or is interrupted.

- [ ] **Step 3: Apply and verify the Supabase migration**

Use the project's established Supabase Management API workflow. Verify table/policies/trigger and run a metadata-only duplicate check; never print memo contents. Confirm `(member_id, period_month)` duplicates equal zero.

- [ ] **Step 4: Browser-verify desktop and mobile**

At 1440×900 and 375×812, verify every paid/unpaid member has a note action; create a note before payment; process and cancel payment while the note persists; edit and clear the note; verify long-summary ellipsis, modal fit, zero horizontal overflow, no console errors, and no failed note requests. Restore any payment state changed by QA and delete unneeded QA notes.

- [ ] **Step 5: Update project docs**

Add this checklist item:

```markdown
- [x] 미납·납부 상태와 독립된 회원별 월간 회비 메모 입력·수정 구현
```

Add a `2026-07-15` work-log entry covering the table/CSV sync, per-member desktop/mobile modal, permissions, persistence across payment cancellation, migration status, and fresh verification counts.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/PROJECT_CHECKLIST.md docs/WORK_LOG.md
git commit -m "docs: record monthly fee note verification"
```

- [ ] **Step 7: Final audit**

```bash
git status --short --branch
git log -5 --oneline
```

Expected: only the pre-existing `.superpowers/` directory remains untracked; feature changes are committed locally and are not pushed without user authorization.
