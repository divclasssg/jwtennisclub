# Monthly Interim and Final Closing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow same-day middle closing PDFs and early final closing while preserving independent version histories and locking finalized fee and expense source data.

**Architecture:** Extend the existing immutable `monthly_closings` ledger with an `interim`/`final` kind and kind-scoped versions. Keep the existing settlement-named database and code identifiers, expose exact snapshot identities to the PDF route, and enforce final-month source locks with additive PostgreSQL triggers plus application preflight checks.

**Tech Stack:** Next.js 16.2.10 App Router and Server Actions, React 19, TypeScript, Supabase Postgres/RLS/RPC, Zod, React PDF, SCSS Modules, Vitest, Testing Library.

## Global Constraints

- User-visible Korean copy must use `결산`; internal database, RPC, route and TypeScript identifiers may retain `settlement`.
- Middle closing and final closing are allowed for the current or a past month; future months remain blocked.
- A created snapshot is downloadable on the same day.
- Middle closing never locks source data and has no reopen action.
- Final closing blocks fee-payment and expense mutations until closing reopen.
- Middle and final versions increment independently per month.
- Every snapshot remains immutable and every PDF reads one exact snapshot only.
- Existing rows must be backfilled as `final`; existing migrations must not be edited.
- PDF snapshots must continue excluding member names, member codes, individual payment rows, receipts and internal memos.
- Existing SCSS tokens and kebab-case CSS Module conventions remain mandatory if styling changes are needed.
- Before editing Next.js Server Actions or Route Handlers, follow `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`.

---

### Task 1: Add kind-scoped closing snapshots

**Files:**
- Create: `supabase/migrations/202607310001_add_interim_monthly_closings.sql`
- Create: `src/features/settlements/interim-closing-migration.test.ts`
- Reference: `supabase/migrations/202607300002_add_monthly_settlement_closings.sql`
- Reference: `src/features/settlements/settlement-closing-migration.test.ts`

**Interfaces:**
- Consumes: `public.build_monthly_settlement_snapshot(date)` and the existing permissions `settlements.close` / `settlements.reopen`.
- Produces: `public.monthly_closing_kind`, `public.create_interim_monthly_settlement(date)`, additive `public.get_monthly_settlement_page_v2(date)`, final-only `public.close_monthly_settlement(date)` / `public.reopen_monthly_settlement(date)`, and `public.record_monthly_report_generation(uuid)`.
- Preserves during staged rollout: legacy `public.get_monthly_settlement_page(date)` and `public.record_monthly_report_generation(uuid, date, integer)`, both authenticated-only.
- Produces page JSON keys: `preview`, `active_closing`, `closing_history`, `can_create_interim`, `can_close`, `can_reopen`, and `close_blocked_reason`.

- [ ] **Step 1: Write the failing additive-migration contract tests**

Create `src/features/settlements/interim-closing-migration.test.ts` with helpers that read only the new migration and extract complete function bodies. Require the following contracts:

```ts
expect(sql).toContain(
  "create type public.monthly_closing_kind as enum ('interim', 'final')",
);
expect(sql).toContain(
  "add column closing_kind public.monthly_closing_kind not null default 'final'",
);
expect(sql).toContain(
  "unique (period_month, closing_kind, version)",
);
expect(sql).toContain(
  "where closing_kind = 'final' and status = 'closed'",
);

const interim = functionBody("create_interim_monthly_settlement");
expect(interim).toContain("normalized_period_month > current_period_month");
expect(interim).toContain("settlements.close");
expect(interim).toContain("closing_kind = 'interim'");
expect(interim).toContain("public.build_monthly_settlement_snapshot");
expect(interim).toContain("monthly_settlement.interim_created");

const finalClose = functionBody("close_monthly_settlement");
expect(finalClose).toContain("normalized_period_month > current_period_month");
expect(finalClose).not.toContain(
  "normalized_period_month >= current_period_month",
);
expect(finalClose).toContain("closing_kind = 'final'");

const snapshot = functionBody("build_monthly_settlement_snapshot");
expect(snapshot).toContain("prior_closing.closing_kind = 'final'");
expect(snapshot).toContain("prior_closing.status = 'closed'");

const report = functionBody("record_monthly_report_generation");
expect(report).toContain("closings.id = requested_closing_id");
expect(report).toContain("'closing_kind', selected_closing.closing_kind");
expect(report).toContain("'version', selected_closing.version");
expect(report).not.toContain("requested_period_month");
```

Also require that the page payload orders `closing_history` by `closed_at desc`, returns every middle and final version, and identifies `active_closing` only from `closing_kind = 'final' and status = 'closed'`.

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
npm run test -- src/features/settlements/interim-closing-migration.test.ts
```

Expected: FAIL because `202607310001_add_interim_monthly_closings.sql` does not exist.

- [ ] **Step 3: Write the additive schema conversion**

Start the new migration with `begin;`. Add the kind and replace the old uniqueness rules without changing prior migrations:

```sql
create type public.monthly_closing_kind as enum ('interim', 'final');

alter table public.monthly_closings
add column closing_kind public.monthly_closing_kind not null default 'final';

alter table public.monthly_closings
drop constraint monthly_closings_period_month_version_key;

alter table public.monthly_closings
add constraint monthly_closings_period_kind_version_unique
unique (period_month, closing_kind, version);

drop index public.monthly_closings_one_active_month_idx;

create unique index monthly_closings_one_active_final_month_idx
on public.monthly_closings(period_month)
where closing_kind = 'final' and status = 'closed';

alter table public.monthly_closings
add constraint monthly_closings_interim_state_valid check (
  closing_kind = 'final'
  or (
    status = 'closed'
    and reopened_by is null
    and reopened_at is null
  )
);
```

Keep the default as `final` so existing rows are backfilled transactionally. Add an index on `(period_month, closing_kind, version desc)`.

- [ ] **Step 4: Replace the snapshot and page RPCs**

Copy the complete currently deployed bodies from `202607300002_add_monthly_settlement_closings.sql`; do not shorten security, arithmetic, privacy or invariant checks.

In `build_monthly_settlement_snapshot`, make the prior-balance lookup final-only:

```sql
where prior_closing.period_month = prior_period_month
  and prior_closing.closing_kind = 'final'
  and prior_closing.status = 'closed'
```

Redefine `get_monthly_settlement_page(date)` with the exact strict Task-1-era DTO shape, while making its active and later-closing lookups final-only. In `get_monthly_settlement_page_v2`, return:

```sql
return pg_catalog.jsonb_build_object(
  'preview', preview_snapshot,
  'active_closing', active_final_closing,
  'closing_history', closing_history,
  'can_create_interim', can_create_interim,
  'can_close', can_close,
  'can_reopen', can_reopen,
  'close_blocked_reason', close_blocked_reason
);
```

Set `can_create_interim` and `can_close` only when:

```sql
normalized_period_month <= current_period_month
and active_final_closing is null
and actor has settlements.close
```

Keep the prior-final requirement for August 2026 and later. Build every closing DTO with these exact keys:

```sql
pg_catalog.jsonb_build_object(
  'id', closings.id,
  'period_month', closings.period_month,
  'closing_kind', closings.closing_kind,
  'version', closings.version,
  'status', closings.status,
  'snapshot', closings.snapshot,
  'closed_at', closings.closed_at,
  'closed_by', closings.closed_by_name,
  'reopened_at', closings.reopened_at
)
```

- [ ] **Step 5: Add middle closing and revise final closing**

Implement `create_interim_monthly_settlement(date)` with the same actor validation, permission recheck, advisory locks and source-table share locks as final close. Reject only a future month or a month with an active final closing.

Allocate the version independently:

```sql
select coalesce(max(closings.version), 0) + 1
into next_version
from public.monthly_closings as closings
where closings.period_month = normalized_period_month
  and closings.closing_kind = 'interim';
```

Insert `closing_kind = 'interim'`, audit `monthly_settlement.interim_created`, and return the refreshed page payload.

Replace `close_monthly_settlement(date)` so it rejects:

```sql
if normalized_period_month > current_period_month then
  raise exception 'future month cannot be closed' using errcode = '55000';
end if;
```

Allocate final versions with `closing_kind = 'final'`, insert final kind explicitly, and keep the one-active-final guard.

Replace `reopen_monthly_settlement(date)` so every active/history lookup filters `closing_kind = 'final'`. Middle rows must never be reopened.

- [ ] **Step 6: Replace exact-snapshot PDF verification**

Change the signature to:

```sql
create or replace function public.record_monthly_report_generation(
  requested_closing_id uuid
)
returns jsonb
```

Validate an active operator, lock the exact row by ID, accept an immutable middle snapshot or either state of a final snapshot, write `monthly_report.generated`, and include `closing_kind`, `version` and `status` in audit details. Return the complete closing DTO, not a boolean.

Revoke the obsolete three-argument function before dropping it:

```sql
revoke execute on function public.record_monthly_report_generation(
  uuid, date, integer
) from public, anon, authenticated, service_role;
drop function public.record_monthly_report_generation(uuid, date, integer);
```

Grant only the page, middle, final, reopen and exact-report RPCs to `authenticated`. Finish with:

```sql
notify pgrst, 'reload schema';
commit;
```

- [ ] **Step 7: Run migration tests and verify GREEN**

Run:

```bash
npm run test -- \
  src/features/settlements/interim-closing-migration.test.ts \
  src/features/settlements/settlement-closing-migration.test.ts
```

Expected: PASS. Update the existing test only where the new additive migration intentionally supersedes old runtime signatures; retain all original arithmetic, permission and privacy assertions.

- [ ] **Step 8: Commit the database snapshot contract**

```bash
git add \
  supabase/migrations/202607310001_add_interim_monthly_closings.sql \
  src/features/settlements/interim-closing-migration.test.ts \
  src/features/settlements/settlement-closing-migration.test.ts
git commit -m "feat: add middle and final closing snapshots"
```

---

### Task 2: Parse kinded closing history

**Files:**
- Modify: `src/features/settlements/settlement-snapshot.ts`
- Modify: `src/features/settlements/settlement-snapshot.test.ts`

**Interfaces:**
- Consumes: Task 1 page JSON and closing DTO keys.
- Produces: `MonthlySettlementClosingKind`, `MonthlySettlementClosingStatus`, extended `MonthlySettlementClosing`, and extended `MonthlySettlementPage`.
- Removes: `canDownloadMonthlyReport(periodMonth, now)`.

- [ ] **Step 1: Write failing parser and invariant tests**

Add fixtures containing:

```ts
{
  active_closing: {
    id: "11111111-1111-4111-8111-111111111111",
    period_month: "2026-07-01",
    closing_kind: "final",
    version: 1,
    status: "closed",
    snapshot,
    closed_at: "2026-07-31T00:00:00.000Z",
    closed_by: "박세익",
    reopened_at: null,
  },
  closing_history: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      period_month: "2026-07-01",
      closing_kind: "interim",
      version: 2,
      status: "closed",
      snapshot,
      closed_at: "2026-07-30T00:00:00.000Z",
      closed_by: "박세익",
      reopened_at: null,
    },
  ],
  can_create_interim: false,
  can_close: false,
  can_reopen: true,
}
```

Require rejection for an interim row with `status: "reopened"`, a closing whose snapshot month differs, duplicate `(kind, version)` entries, an active closing that is not final/closed, and history not ordered newest-first.

Delete the old next-month PDF availability tests and add a test proving that download eligibility is represented by the existence of a valid closing identity rather than wall-clock time.

- [ ] **Step 2: Run the parser tests and verify RED**

```bash
npm run test -- src/features/settlements/settlement-snapshot.test.ts
```

Expected: FAIL because kind, history and `can_create_interim` are not parsed.

- [ ] **Step 3: Extend the Zod schemas and public types**

Define:

```ts
export type MonthlySettlementClosingKind = "interim" | "final";
export type MonthlySettlementClosingStatus = "closed" | "reopened";

export type MonthlySettlementClosing = {
  id: string;
  periodMonth: string;
  closingKind: MonthlySettlementClosingKind;
  version: number;
  status: MonthlySettlementClosingStatus;
  snapshot: MonthlySettlementSnapshot;
  closedAt: string;
  closedBy: string;
  reopenedAt: string | null;
};

export type MonthlySettlementPage = {
  preview: MonthlySettlementSnapshot;
  activeClosing: MonthlySettlementClosing | null;
  closingHistory: MonthlySettlementClosing[];
  canCreateInterim: boolean;
  canClose: boolean;
  canReopen: boolean;
  closeBlockedReason: string | null;
};
```

Use a schema refinement to require:

```ts
closing_kind === "interim"
  ? status === "closed" && reopened_at === null
  : true
```

Validate unique kind/version pairs and descending `closed_at`. Remove `canDownloadMonthlyReport`; snapshot existence is the same-day download gate.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
npm run test -- \
  src/features/settlements/settlement-snapshot.test.ts \
  src/features/settlements/settlement-summary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the domain contract**

```bash
git add \
  src/features/settlements/settlement-snapshot.ts \
  src/features/settlements/settlement-snapshot.test.ts
git commit -m "feat: model middle and final closing history"
```

---

### Task 3: Build the monthly closing workflow UI

**Files:**
- Modify: `src/app/(app)/settlements/actions.ts`
- Modify: `src/app/(app)/settlements/actions.test.ts`
- Modify: `src/app/(app)/settlements/page.tsx`
- Modify: `src/app/(app)/settlements/page.test.tsx`

**Interfaces:**
- Consumes: `MonthlySettlementPage` from Task 2.
- Produces: `createInterimMonthlySettlement`, `closeMonthlySettlement`, and `reopenMonthlySettlement` Server Actions.
- Produces PDF links shaped as `/reports/monthly?snapshot=<uuid>`.

- [ ] **Step 1: Write failing Server Action tests**

Require:

```ts
await expect(createInterimMonthlySettlement(formData)).rejects.toThrow(
  "redirect:/settlements?month=2026-07&status=interim-created",
);
expect(mocks.supabase.rpc).toHaveBeenCalledWith(
  "create_interim_monthly_settlement",
  { requested_period_month: "2026-07-01" },
);
```

Use separate success codes:

- `interim-created`
- `final-closed`
- `final-reopened`

Keep invalid-month and mutation-failed redirects. Verify `revalidatePath("/settlements")` runs before redirect, following the local Next.js Server Action documentation.

- [ ] **Step 2: Write failing page tests**

Add cases that require:

- `중간 결산 생성` and `최종 마감` on a current-month preview.
- No calendar-date download suppression.
- Independent labels `중간 결산 v2` and `최종 마감 v1`.
- Exact snapshot PDF links for every history row.
- `재개됨` on a reopened final row.
- `결산 재개` only for the active final row.
- User-facing `정산` absent from the rendered page.

Use accessible regions:

```ts
screen.getByRole("region", { name: "중간 결산 이력" });
screen.getByRole("region", { name: "최종 마감 이력" });
```

- [ ] **Step 3: Run action and page tests and verify RED**

```bash
npm run test -- \
  'src/app/(app)/settlements/actions.test.ts' \
  'src/app/(app)/settlements/page.test.tsx'
```

Expected: FAIL on the missing middle action, history and `결산` copy.

- [ ] **Step 4: Add the middle action and precise feedback**

Extend the RPC union:

```ts
type SettlementMutationRpc =
  | "create_interim_monthly_settlement"
  | "close_monthly_settlement"
  | "reopen_monthly_settlement";
```

Pass the success code into the shared mutation helper:

```ts
export async function createInterimMonthlySettlement(formData: FormData) {
  await runSettlementMutation(
    "create_interim_monthly_settlement",
    "interim-created",
    formData,
  );
}
```

Map every visible message to `결산`, including failure copy.

- [ ] **Step 5: Render controls and immutable history**

Use `canCreateInterim`, `canClose` and `canReopen` independently. Render:

```tsx
{settlementPage.canCreateInterim ? (
  <form action={createInterimMonthlySettlement}>
    {/* preserve month and sort state */}
    <Button size="compact" type="submit" variant="secondary">
      중간 결산 생성
    </Button>
  </form>
) : null}
```

Rename final controls to `최종 마감` and `결산 재개`.

Keep the live preview as the main summary when there is no active final closing; when final is active, show its immutable snapshot. Add two `DataPanel` history regions. Each history row must show kind label, kind-scoped version, processed date, processor, status, and:

```tsx
<ActionLink
  href={`/reports/monthly?snapshot=${closing.id}`}
  size="compact"
>
  PDF 다운로드
</ActionLink>
```

Do not use `new Date()` or `canDownloadMonthlyReport` in this page.

- [ ] **Step 6: Run focused tests and verify GREEN**

```bash
npm run test -- \
  'src/app/(app)/settlements/actions.test.ts' \
  'src/app/(app)/settlements/page.test.tsx' \
  src/features/settlements/settlement-snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the closing workflow UI**

```bash
git add \
  'src/app/(app)/settlements/actions.ts' \
  'src/app/(app)/settlements/actions.test.ts' \
  'src/app/(app)/settlements/page.tsx' \
  'src/app/(app)/settlements/page.test.tsx'
git commit -m "feat: add middle and final closing workflow"
```

---

### Task 4: Download exact snapshot PDFs immediately

**Files:**
- Modify: `src/app/(app)/reports/monthly/route.ts`
- Modify: `src/app/(app)/reports/monthly/route.test.ts`
- Modify: `src/features/reports/monthly-report.ts`
- Modify: `src/features/reports/monthly-report.test.ts`
- Modify: `src/features/reports/MonthlyReportPdf.tsx`
- Modify: `src/features/reports/MonthlyReportPdf.test.tsx`

**Interfaces:**
- Consumes: `record_monthly_report_generation(requested_closing_id uuid)` from Task 1.
- Produces: `normalizeReportSnapshotId`, `closingKind`, `closingStatus`, `closingLabel`, and `formatReportFileName(periodMonth, kind, version)`.

- [ ] **Step 1: Write failing report-domain tests**

Require:

```ts
expect(
  formatReportFileName("2026-07-01", "interim", 1),
).toBe("jw-tennis-club-2026-07-interim-v1.pdf");

expect(
  formatReportFileName("2026-07-01", "final", 2),
).toBe("jw-tennis-club-2026-07-final-v2.pdf");
```

Build report data from both an interim and a reopened final closing. Require:

```ts
expect(report.title).toContain("월간 결산 보고서");
expect(report.closingLabel).toBe("중간 결산 v1");
expect(reopenedReport.closingLabel).toBe("최종 마감 v2 · 재개됨");
```

Validate `snapshot` as one UUID search parameter; reject arrays, blank strings and invalid UUIDs.

- [ ] **Step 2: Write failing Route Handler tests**

Replace month-based mocks with:

```ts
expect(mocks.supabase.rpc).toHaveBeenCalledWith(
  "record_monthly_report_generation",
  { requested_closing_id: closingId },
);
```

Require same-day success without a date check, a 400 response for invalid snapshot ID, a 404 for a missing snapshot, a 500 for atomic audit failure, and filenames containing kind/version.

- [ ] **Step 3: Run report tests and verify RED**

```bash
npm run test -- \
  src/features/reports/monthly-report.test.ts \
  src/features/reports/MonthlyReportPdf.test.tsx \
  'src/app/(app)/reports/monthly/route.test.ts'
```

Expected: FAIL on missing exact-snapshot fields and old calendar gating.

- [ ] **Step 4: Update report data and filenames**

Extend `MonthlyReportData`:

```ts
closingKind: MonthlySettlementClosingKind;
closingStatus: MonthlySettlementClosingStatus;
closingLabel: string;
```

Use `결산` in the title. Format the closing label:

```ts
const kindLabel =
  closing.closingKind === "interim" ? "중간 결산" : "최종 마감";
const stateLabel =
  closing.status === "reopened" ? " · 재개됨" : "";
const closingLabel = `${kindLabel} v${closing.version}${stateLabel}`;
```

Change the filename signature:

```ts
export function formatReportFileName(
  periodMonth: string,
  kind: MonthlySettlementClosingKind,
  version: number,
) {
  return `jw-tennis-club-${periodMonth.slice(0, 7)}-${kind}-v${version}.pdf`;
}
```

- [ ] **Step 5: Make the route read and audit one snapshot**

Read `snapshot` from `request.nextUrl.searchParams`, validate one UUID, and call the exact-snapshot RPC. Parse its returned closing DTO through a dedicated exported `parseMonthlySettlementClosing(value)` that reuses Task 2’s schema.

Delete:

- `canDownloadMonthlyReport`
- the next-month date response
- the separate page lookup followed by a boolean audit RPC

The atomic RPC now returns the exact row it audited. Preserve controlled status codes and do not expose raw Supabase errors.

- [ ] **Step 6: Render type, version and state in the PDF**

Update `MonthlyReportPdf.tsx` metadata labels:

```tsx
<MetaItem label="결산 구분" value={report.closingLabel} />
<MetaItem label="결산일" value={report.closedAtLabel} />
<MetaItem label="결산 처리자" value={report.closedBy} />
```

Change all user-visible `정산` text to `결산`. Keep the existing Korean font, glyph checks, financial sections and privacy notice.

- [ ] **Step 7: Run report tests and verify GREEN**

```bash
npm run test -- \
  src/features/reports/monthly-report.test.ts \
  src/features/reports/MonthlyReportPdf.test.tsx \
  'src/app/(app)/reports/monthly/route.test.ts'
```

Expected: PASS, including rendered Korean glyph and extracted-text assertions.

- [ ] **Step 8: Commit exact snapshot reports**

```bash
git add \
  'src/app/(app)/reports/monthly/route.ts' \
  'src/app/(app)/reports/monthly/route.test.ts' \
  src/features/reports/monthly-report.ts \
  src/features/reports/monthly-report.test.ts \
  src/features/reports/MonthlyReportPdf.tsx \
  src/features/reports/MonthlyReportPdf.test.tsx
git commit -m "feat: download exact closing snapshot reports"
```

---

### Task 5: Lock finalized fee and expense sources

**Files:**
- Create: `supabase/migrations/202607310002_lock_finalized_month_sources.sql`
- Create: `src/features/settlements/monthly-source-lock-migration.test.ts`
- Create: `src/features/settlements/monthly-source-lock.ts`
- Create: `src/features/settlements/monthly-source-lock.test.ts`
- Modify: `src/app/(app)/fees/actions.ts`
- Modify: `src/app/(app)/fees/actions.test.ts`
- Modify: `src/app/(app)/fees/page.tsx`
- Modify: `src/app/(app)/fees/page.test.tsx`
- Modify: `src/features/fees/FeeMobileList.tsx`
- Modify: `src/features/fees/FeeMobileList.test.tsx`
- Modify: `src/app/(app)/expenses/actions.ts`
- Modify: `src/app/(app)/expenses/actions.test.ts`
- Modify: `src/app/(app)/expenses/page.tsx`
- Modify: `src/app/(app)/expenses/page.test.tsx`
- Modify: `src/app/(app)/expenses/new/page.tsx`
- Modify: `src/app/(app)/expenses/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: active final rows from Task 1.
- Produces: `public.get_monthly_source_lock_status(date) returns boolean`.
- Produces TypeScript helpers `getMonthlySourceLockStatus(periodMonth)` and `isMonthlySourceLockError(error)`.

- [ ] **Step 1: Write failing trigger contract tests**

Require a fixed-search-path security-definer assertion function and triggers on both source tables:

```ts
expect(sql).toContain(
  "create or replace function public.assert_monthly_source_unlocked",
);
expect(sql).toContain(
  "closing_kind = 'final'",
);
expect(sql).toContain("status = 'closed'");
expect(sql).toContain(
  "before insert or update or delete on public.fee_payments",
);
expect(sql).toContain(
  "before insert or update or delete on public.expenses",
);
expect(sql).toContain(
  "create or replace function public.get_monthly_source_lock_status",
);
```

Require update guards to check both `old` and `new` months so a row cannot be moved into or out of a finalized month.

- [ ] **Step 2: Run the migration test and verify RED**

```bash
npm run test -- \
  src/features/settlements/monthly-source-lock-migration.test.ts
```

Expected: FAIL because the second migration does not exist.

- [ ] **Step 3: Add database-enforced final locks**

Create:

```sql
create or replace function public.assert_monthly_source_unlocked(
  requested_period_month date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.monthly_closings as closings
    where closings.period_month = requested_period_month
      and closings.closing_kind = 'final'
      and closings.status = 'closed'
  ) then
    raise exception 'monthly closing source is locked'
      using errcode = '55000';
  end if;
end;
$$;
```

Add one trigger function for `fee_payments.period_month` and one for `date_trunc('month', expenses.expense_date)::date`. On update, validate both old and new months when they differ. On delete, validate old. On insert, validate new.

Add an authenticated read RPC:

```sql
create or replace function public.get_monthly_source_lock_status(
  requested_period_month date
)
returns boolean
language plpgsql
security definer
set search_path = ''
```

Require an active operator and return whether an active final exists. Revoke internal trigger helpers from every API role; grant only the read RPC to `authenticated`.

- [ ] **Step 4: Write failing application lock tests**

In `monthly-source-lock.test.ts`, require:

```ts
expect(await getMonthlySourceLockStatus("2026-07-01")).toBe(true);
expect(isMonthlySourceLockError({
  code: "55000",
  message: "monthly closing source is locked",
})).toBe(true);
```

In fee and expense action tests require `closing-locked` redirects before mutations. Cover inline fee create/cancel, CSV import with multiple months, expense create/update/delete, and an update that changes month.

In page/component tests require:

- Finalized fee month: no CSV registration, payment, cancellation actions; monthly notes remain editable because they are internal and absent from the snapshot.
- Finalized expense month: no create, edit or delete actions.
- Direct new/edit expense routes display a locked explanation or redirect back with `error=closing-locked`.

- [ ] **Step 5: Run application tests and verify RED**

```bash
npm run test -- \
  src/features/settlements/monthly-source-lock.test.ts \
  'src/app/(app)/fees/actions.test.ts' \
  'src/app/(app)/fees/page.test.tsx' \
  src/features/fees/FeeMobileList.test.tsx \
  'src/app/(app)/expenses/actions.test.ts' \
  'src/app/(app)/expenses/page.test.tsx' \
  'src/app/(app)/expenses/new/page.test.tsx' \
  'src/app/(app)/expenses/[id]/edit/page.test.tsx'
```

Expected: FAIL because no preflight helper or locked UI exists.

- [ ] **Step 6: Implement application preflight and error mapping**

Implement:

```ts
export async function getMonthlySourceLockStatus(periodMonth: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_monthly_source_lock_status",
    { requested_period_month: periodMonth },
  );
  if (error || typeof data !== "boolean") {
    throw new Error("월별 결산 잠금 상태를 확인하지 못했습니다.");
  }
  return data;
}

export function isMonthlySourceLockError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "55000" &&
      "message" in error &&
      String(error.message).includes("monthly closing source is locked"),
  );
}
```

Actions must preflight before any R2 upload or database mutation. The trigger remains authoritative for races. If a receipt upload succeeds and the database write loses a race to final closing, delete the newly uploaded object before redirecting.

CSV import must compute distinct `period_month` values and preflight all of them before one insert.

- [ ] **Step 7: Hide finalized-month mutation UI**

Load lock state once per fee/expense page and pass `isLocked` to mobile fee rows. Preserve read-only summaries, sorting, filters, receipts and fee-note editing.

Render a status message:

```tsx
{isLocked ? (
  <p role="status">
    최종 마감된 월입니다. 회비와 지출을 수정하려면 먼저 결산을 재개하세요.
  </p>
) : null}
```

Do not rely on UI suppression for security; keep trigger and action tests.

- [ ] **Step 8: Run lock and source workflow tests and verify GREEN**

Run the Step 5 command plus:

```bash
npm run test -- \
  src/features/settlements/monthly-source-lock-migration.test.ts \
  src/features/expenses \
  src/features/fees
```

Expected: PASS.

- [ ] **Step 9: Commit final source locks**

```bash
git add \
  supabase/migrations/202607310002_lock_finalized_month_sources.sql \
  src/features/settlements/monthly-source-lock-migration.test.ts \
  src/features/settlements/monthly-source-lock.ts \
  src/features/settlements/monthly-source-lock.test.ts \
  'src/app/(app)/fees/actions.ts' \
  'src/app/(app)/fees/actions.test.ts' \
  'src/app/(app)/fees/page.tsx' \
  'src/app/(app)/fees/page.test.tsx' \
  src/features/fees/FeeMobileList.tsx \
  src/features/fees/FeeMobileList.test.tsx \
  'src/app/(app)/expenses/actions.ts' \
  'src/app/(app)/expenses/actions.test.ts' \
  'src/app/(app)/expenses/page.tsx' \
  'src/app/(app)/expenses/page.test.tsx' \
  'src/app/(app)/expenses/new/page.tsx' \
  'src/app/(app)/expenses/new/page.test.tsx' \
  'src/app/(app)/expenses/[id]/edit/page.tsx' \
  'src/app/(app)/expenses/[id]/edit/page.test.tsx'
git commit -m "feat: lock finalized monthly sources"
```

---

### Task 6: Rename user-facing settlement copy

**Files:**
- Modify: `src/features/shell/AppShell.tsx`
- Modify: `src/features/shell/AppShell.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/dashboard/page.test.tsx`
- Modify: `src/features/settlements/settlement-snapshot.ts`
- Modify: `src/features/settlements/settlement-snapshot.test.ts`
- Create: `src/features/settlements/closing-copy.test.ts`
- Modify: user-facing files already touched in Tasks 3–5 where `정산` remains

**Interfaces:**
- Consumes: approved terminology mapping.
- Produces: `결산` across user-visible navigation, metadata, headings, actions, errors and report copy.

- [ ] **Step 1: Write failing terminology assertions**

Update shell and dashboard tests to expect:

```ts
{ href: "/settlements", label: "결산" }
```

Create `src/features/settlements/closing-copy.test.ts`. Recursively read `src/`, skip `*.test.*` and `*.spec.*`, and fail with the exact relative file paths and line numbers for every Korean `정산` occurrence. Do not scan:

- test fixture data such as a memo whose content happens to contain `정산`
- database/RPC identifiers using English `settlement`
- historical docs and migrations

- [ ] **Step 2: Run terminology tests and verify RED**

```bash
npm run test -- \
  src/features/shell/AppShell.test.tsx \
  'src/app/(app)/dashboard/page.test.tsx' \
  src/features/settlements/closing-copy.test.ts
```

Expected: FAIL on existing `정산` navigation and copy.

- [ ] **Step 3: Update all user-visible copy**

Apply these exact mappings:

```text
정산                    → 결산
월별 정산               → 월별 결산
정산 요약               → 결산 요약
정산 마감               → 최종 마감
정산 재개               → 결산 재개
월간 정산 보고서        → 월간 결산 보고서
```

Keep `/settlements`, `settlement-*`, `MonthlySettlement*`, SQL functions and permission names unchanged.

- [ ] **Step 4: Run the runtime copy sweep**

```bash
rg -n '정산' src \
  --glob '!**/*.test.*' \
  --glob '!**/*.spec.*'
```

Expected: no user-visible occurrence. Any remaining occurrence must be an internal non-rendered constant and documented in the task handoff; prefer renaming Korean error constants to `결산`.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
npm run test -- \
  src/features/shell/AppShell.test.tsx \
  'src/app/(app)/dashboard/page.test.tsx' \
  'src/app/(app)/settlements/page.test.tsx' \
  'src/app/(app)/reports/monthly/route.test.ts' \
  src/features/reports/MonthlyReportPdf.test.tsx \
  src/features/settlements/closing-copy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the terminology change**

```bash
git add \
  src/features/shell/AppShell.tsx \
  src/features/shell/AppShell.test.tsx \
  src/app/layout.tsx \
  'src/app/(app)/dashboard/page.tsx' \
  'src/app/(app)/dashboard/page.test.tsx' \
  src/features/settlements/closing-copy.test.ts
git commit -m "refactor: rename settlement copy to closing"
```

If the copy sweep changes a file not listed above, add that exact file path to this command. Stage only files changed by this task; do not restage files already clean from earlier commits.

---

### Task 7: Verify, document and deploy safely

**Files:**
- Modify: `docs/PROJECT_CHECKLIST.md`
- Modify: `docs/WORK_LOG.md`
- Reference: `docs/superpowers/specs/2026-07-31-interim-final-closing-design.md`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: verified local build, reviewed migration order, deployment evidence, and authenticated browser QA evidence.

- [ ] **Step 1: Run the full local quality gate**

Because this repository contains nested worktrees, exclude them explicitly:

```bash
npm run test -- --exclude '.worktrees/**'
npx eslint . --ignore-pattern '.worktrees/**'
npx tsc --noEmit
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Perform a security and migration review**

Review the diff against the design and verify:

- Existing migration `202607300002` is unchanged.
- New order is `202607310001` then `202607310002`.
- Existing rows become final without rewriting snapshots.
- Prior-month opening balances ignore middle snapshots.
- Exact-snapshot PDF RPC does not expose raw source tables.
- Trigger helpers are not executable by API roles.
- RLS and active-operator checks remain intact.
- Fee-note changes remain allowed because notes are excluded from snapshots.
- Receipt upload cleanup covers a lock race.

Run:

```bash
git diff --check
git status --short
```

Expected: no unrelated user files staged or modified by the implementation.

- [ ] **Step 3: Review the implementation**

Invoke `compound-engineering:ce-code-review` or the active workflow’s required review skill against the implementation base. Resolve all actionable findings, rerun focused tests for touched files, and commit fixes separately.

- [ ] **Step 4: Confirm remote migration state before applying**

Run:

```bash
supabase migration list --linked --output-format json
```

Expected: every migration through `202607300002` is local/remote matched, and only `202607310001` / `202607310002` are pending.

Do not use an unrestricted all-pending push if any unrelated migration appears.

- [ ] **Step 5: Apply the two additive migrations in order before the app deploy**

Apply `202607310001`, verify kind, RPC and existing-row backfill, then record its migration history. Apply `202607310002`, verify triggers and lock-status RPC, then record its history.

This is a staged compatibility rollout: keep the legacy page and three-argument report RPCs authenticated-only while old app traffic exists, and deploy the new app only after both database migrations pass their checks. After old app traffic is confirmed gone, create a separate future cleanup migration to remove those legacy RPCs. Do not create or apply that cleanup migration in this rollout.

Use the established Management API path:

```bash
supabase db query --linked \
  --file supabase/migrations/202607310001_add_interim_monthly_closings.sql
supabase migration repair --linked --status applied 202607310001

supabase db query --linked \
  --file supabase/migrations/202607310002_lock_finalized_month_sources.sql
supabase migration repair --linked --status applied 202607310002
```

After each file, run metadata-only SQL checks before repairing history. If SQL fails, do not mark it applied.

- [ ] **Step 6: Run authenticated browser QA before final production close**

Use the local app with production-like environment variables and an authenticated operator.

Verify:

1. Menu and headings say `결산`.
2. 2026-07 shows `중간 결산 생성` and `최종 마감` on July 31.
3. Create middle v1 and download its PDF the same day.
4. Confirm the PDF filename, label, processor, time, member count, unpaid amount, opening balance 0 and closing balance.
5. Modify one reversible July source row only if the operator explicitly chooses a safe real-data change; otherwise rely on automated middle-unlocked tests and do not fabricate production data.
6. Create another middle version only if operationally useful; do not generate audit noise solely for QA.
7. Final close July as final v1.
8. Download final v1 PDF the same day.
9. Confirm July fee and expense mutations are absent in UI and rejected by direct paths.
10. Confirm August fee and expense screens remain editable.
11. Confirm browser console and server logs have no application errors.

Do not reopen the desired production final solely to prove a test. Reopen/re-final v2 is covered by automated tests unless the operator has a real correction.

- [ ] **Step 7: Update project records**

In `docs/PROJECT_CHECKLIST.md`, mark the implemented middle/final closing and same-day PDF work complete. Keep production-only items unchecked until their evidence exists.

Add a dated `docs/WORK_LOG.md` entry recording:

- independent middle/final versions
- final source locks and reopen behavior
- same-day exact-snapshot PDFs
- `정산` → `결산` user-facing rename
- migration versions and remote application state
- test, lint, typecheck, build and browser evidence
- any skipped production mutation and why

- [ ] **Step 8: Run final verification after documentation**

```bash
npm run test -- --exclude '.worktrees/**'
npx eslint . --ignore-pattern '.worktrees/**'
npx tsc --noEmit
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 9: Commit documentation and verification records**

```bash
git add docs/PROJECT_CHECKLIST.md docs/WORK_LOG.md
git commit -m "docs: record monthly closing rollout"
```

- [ ] **Step 10: Hand off branch integration**

Use `superpowers:finishing-a-development-branch` after all tests and review pass. Preserve pre-existing user changes, and do not include unrelated untracked migrations or local Supabase link metadata in implementation commits.
