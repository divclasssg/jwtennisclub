# Financial Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static dashboard with a finance-led operational dashboard showing compact member scale, live ledger state, current-month finances, two six-month charts, and the latest final closing.

**Architecture:** Add one authenticated `get_dashboard_page()` PostgreSQL RPC that reuses the monthly-closing snapshot calculator and returns one consistent JSON payload. Parse it at the server boundary with Zod, render the route as a Next.js Server Component, and use two small server-rendered SVG charts without adding a chart dependency.

**Tech Stack:** Next.js 16.2.10 App Router, React 19 Server Components, TypeScript, Supabase Postgres/RLS/RPC, Zod 4, SCSS Modules, SVG, Vitest, Testing Library.

## Global Constraints

- Complete `docs/superpowers/plans/2026-07-31-interim-final-closing.md` first; this dashboard consumes its `closing_kind`, active final closing, closing history, and exact PDF identity.
- User-visible copy uses `결산`; internal `settlement` identifiers may remain.
- Refresh on navigation or browser reload only; do not add polling or Supabase Realtime.
- Render in this order: club summary, current-month finance, two finance charts, latest final closing.
- Finance is visually primary; member data stays compact.
- Exclude meetings, schedules, work queues, quick links, member rows, PII, individual payments, receipts, memos, operating scores, forecasts, and month-over-month percentages.
- Charts are monthly actual fee income versus operating expense, and ledger balance. Do not combine them or add an expense-category chart.
- Show at most six months. Never synthesize zero for a missing month and never chart an interim closing.
- Use current source data for an open month and the active final snapshot for a finalized month.
- Do not add a chart library, client chart JavaScript, or animation.
- Use SCSS, kebab-case CSS Module names, existing `globals.scss` tokens, and `_breakpoints.scss` breakpoints. Add a meaningful token before using a new style value.
- Before route work, read the local Next.js fetching, error handling, error file convention, and accessibility guides named in Task 4.
- Preserve unrelated dirty-worktree files and stage only files listed by each task.

## File Map

- `supabase/migrations/202608010001_add_dashboard_page.sql`: privacy-safe aggregate RPC.
- `src/features/dashboard/dashboard-migration.test.ts`: SQL contract tests.
- `src/features/dashboard/dashboard-page.ts`: Zod payload parser and application types.
- `src/features/dashboard/dashboard-data.ts`: server-only RPC loader.
- `src/features/dashboard/FinancialCharts.tsx`: accessible SVG charts and scale helpers.
- `src/features/dashboard/DashboardSections.tsx`: overview, current finance, and latest-final sections.
- `src/app/(app)/dashboard/page.tsx`: one-load route composition.
- `src/app/(app)/dashboard/error.tsx`: retryable route error boundary.
- Adjacent `.test.ts(x)` and `.module.scss` files own tests and styles for each unit.

---

### Task 1: Add the Atomic Dashboard Aggregate RPC

**Files:**
- Create: `supabase/migrations/202608010001_add_dashboard_page.sql`
- Create: `src/features/dashboard/dashboard-migration.test.ts`
- Reference: `supabase/migrations/202607300002_add_monthly_settlement_closings.sql`
- Reference: `supabase/migrations/202607310001_add_interim_monthly_closings.sql`

**Interfaces:**
- Consumes: `public.build_monthly_settlement_snapshot(date)`, `public.monthly_closings.closing_kind`, and active operator profiles.
- Produces: `public.get_dashboard_page() returns jsonb`, granted only to `authenticated`.
- Produces keys: `as_of`, `period_month`, `members`, `current_finance`, `latest_final`, `trends`.

- [ ] **Step 1: Write the failing SQL contract test**

Create a test that reads only the new migration and requires:

```ts
expect(sql).toContain("function public.get_dashboard_page()\nreturns jsonb");
expect(sql).toContain("security definer");
expect(sql).toContain("set search_path = ''");
expect(sql).toContain("profiles.id = auth.uid()");
expect(sql).toContain("profiles.status = 'active'");
expect(sql).toContain("public.build_monthly_settlement_snapshot(");
expect(sql).toContain("closings.closing_kind = 'final'");
expect(sql).toContain("closings.status = 'closed'");
expect(sql).toContain("interval '5 months'");
expect(sql).toContain("date '2026-07-01'");
expect(sql).toContain(
  "revoke execute on function public.get_dashboard_page() from public, anon",
);
expect(sql).toContain(
  "grant execute on function public.get_dashboard_page() to authenticated",
);
expect(sql).not.toContain("members.name");
expect(sql).not.toContain("phone_number");
expect(sql).not.toContain("expense_rows");
```

- [ ] **Step 2: Run the test and verify RED**

Run `npm run test -- src/features/dashboard/dashboard-migration.test.ts`.

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the secured function and Seoul clock**

Start a transaction and define `security definer set search_path = ''`. Reject callers without an active profile. Compute time once:

```sql
as_of := pg_catalog.statement_timestamp();
current_date_seoul := (as_of at time zone 'Asia/Seoul')::date;
current_period_month := pg_catalog.date_trunc(
  'month', current_date_seoul
)::date;
period_month_end := (
  current_period_month + interval '1 month - 1 day'
)::date;
```

- [ ] **Step 4: Aggregate the compact member summary**

Use one aggregate query with these definitions:

```sql
count(*) filter (
  where members.activity_start_month <= current_period_month
    and (members.withdrawn_date is null or members.withdrawn_date > period_month_end)
    and not (
      members.status = 'paused'
      and members.pause_start_month <= current_period_month
    )
) as active_count,
count(*) filter (
  where members.activity_start_month > current_period_month
    and members.status <> 'withdrawn'
) as upcoming_count,
count(*) filter (
  where members.status = 'paused'
    and members.pause_start_month <= current_period_month
) as paused_count,
count(*) filter (
  where members.joined_date between current_period_month and current_date_seoul
) as joined_this_month_count,
count(*) filter (
  where members.pause_start_month = current_period_month
) as paused_this_month_count,
count(*) filter (
  where members.withdrawn_date between current_period_month and current_date_seoul
) as withdrawn_this_month_count
```

Expose counts only. Do not aggregate or return member rows.

- [ ] **Step 5: Resolve current finance without converting blocked data to zero**

Use the current active final snapshot if one exists. Otherwise call `build_monthly_settlement_snapshot(current_period_month)` inside a nested exception block. Map only these known failures:

```sql
'member activity start month required' -> 'member-activity-start-required'
'prior monthly settlement closing required' -> 'prior-final-closing-required'
'invalid public expense description' -> 'invalid-public-expense-description'
```

Rethrow unknown failures. A blocked result has `status = 'blocked'`, `source = null`, `summary = null`, and one exact reason. For available data, project the calculated snapshot into a dashboard-only `summary` containing `billed_total`, `actual_fee_income`, `expense_total`, `attributed_net`, `fully_paid_count`, `fee_target_count`, `unpaid_count`, `unpaid_total`, `opening_ledger_balance`, and `closing_ledger_balance`. Do not return the full snapshot or its expense rows.

- [ ] **Step 6: Select current closing state and final-only trends**

Select the current month’s newest interim by `closed_at desc, version desc`. Select the latest active final by `period_month desc`. Current closing references contain only `id`, `closing_kind`, `version`, and `status`. The latest-final summary additionally contains `period_month`, `closed_at`, `closed_by`, and the same ten dashboard financial summary fields. Do not return a full closing snapshot.

Build ascending trend rows between:

```sql
greatest(date '2026-07-01', current_period_month - interval '5 months')
and current_period_month
```

Each row contains only:

```sql
pg_catalog.jsonb_build_object(
  'period_month', trend_month,
  'source', trend_source,
  'actual_fee_income', (trend_snapshot->>'actual_fee_income')::bigint,
  'expense_total', (trend_snapshot->>'expense_total')::bigint,
  'closing_ledger_balance',
    (trend_snapshot->>'closing_ledger_balance')::bigint
)
```

Use active final snapshots for past months. Add the available current source once. Omit missing months instead of generating zero rows.

- [ ] **Step 7: Return and secure the exact payload**

Return:

```sql
pg_catalog.jsonb_build_object(
  'as_of', as_of,
  'period_month', current_period_month,
  'members', members_summary,
  'current_finance', current_finance,
  'latest_final', latest_final,
  'trends', trend_rows
)
```

End with explicit revoke/grant, `notify pgrst, 'reload schema';`, and `commit;`.

- [ ] **Step 8: Run database contract regressions**

Run:

```bash
npm run test -- \
  src/features/dashboard/dashboard-migration.test.ts \
  src/features/settlements/interim-closing-migration.test.ts \
  src/features/settlements/settlement-closing-migration.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the database boundary**

```bash
git add \
  supabase/migrations/202608010001_add_dashboard_page.sql \
  src/features/dashboard/dashboard-migration.test.ts
git commit -m "feat: add dashboard aggregate query"
```

---

### Task 2: Parse and Load the Dashboard Contract

**Files:**
- Create: `src/features/dashboard/dashboard-page.ts`
- Create: `src/features/dashboard/dashboard-page.test.ts`
- Create: `src/features/dashboard/dashboard-data.ts`
- Create: `src/features/dashboard/dashboard-data.test.ts`

**Interfaces:**
- Consumes: the aggregate-only Task 1 JSON.
- Produces: `DashboardFinancialSummary`, `DashboardClosingReference`, `DashboardFinalClosingSummary`, `DashboardPageData`, `parseDashboardPage(unknown)`, and `loadDashboardPage()`.

- [ ] **Step 1: Write failing dashboard parser tests**

Define fixtures for available and blocked payloads. Require:

```ts
export type DashboardMemberSummary = {
  activeCount: number;
  upcomingCount: number;
  pausedCount: number;
  joinedThisMonthCount: number;
  pausedThisMonthCount: number;
  withdrawnThisMonthCount: number;
};

export type DashboardTrendPoint = {
  periodMonth: string;
  source: "final" | "current";
  actualFeeIncome: number;
  expenseTotal: number;
  closingLedgerBalance: number;
};

export type DashboardFinancialSummary = {
  billedTotal: number;
  actualFeeIncome: number;
  expenseTotal: number;
  attributedNet: number;
  fullyPaidCount: number;
  feeTargetCount: number;
  unpaidCount: number;
  unpaidTotal: number;
  openingLedgerBalance: number;
  closingLedgerBalance: number;
};
```

Reject negative member/payment counts, arithmetic contradictions (`attributedNet !== actualFeeIncome - expenseTotal` and `closingLedgerBalance !== openingLedgerBalance + attributedNet`), a month not on day 1, duplicate or descending trend months, trends before `2026-07-01`, a `current` point outside the payload period, a blocked payload with a summary, an available payload without a summary, more than six points, and a latest closing that is not final/closed.

- [ ] **Step 2: Run the dashboard parser test and verify RED**

Run `npm run test -- src/features/dashboard/dashboard-page.test.ts`.

Expected: FAIL because the dashboard parser does not exist.

- [ ] **Step 3: Implement aggregate-only schemas and the discriminated finance model**

Create snake-case database schemas and map to:

```ts
export type DashboardCurrentFinance =
  | {
      status: "available";
      blockedReason: null;
      source: "final" | "current";
      summary: DashboardFinancialSummary;
      activeFinal: DashboardClosingReference | null;
      latestInterim: DashboardClosingReference | null;
    }
  | {
      status: "blocked";
      blockedReason:
        | "member-activity-start-required"
        | "prior-final-closing-required"
        | "invalid-public-expense-description";
      source: null;
      summary: null;
      activeFinal: null;
      latestInterim: DashboardClosingReference | null;
    };

export type DashboardPageData = {
  asOf: string;
  periodMonth: string;
  members: DashboardMemberSummary;
  currentFinance: DashboardCurrentFinance;
  latestFinal: DashboardFinalClosingSummary | null;
  trends: DashboardTrendPoint[];
};
```

Define `DashboardClosingReference` as `{ id: string; closingKind: "interim" | "final"; version: number; status: "closed" }`. Refine `activeFinal` to final and `latestInterim` to interim. Define `DashboardFinalClosingSummary` as a final/closed reference plus `periodMonth`, `closedAt`, `closedBy`, and the ten financial summary fields. Also require `fullyPaidCount + unpaidCount === feeTargetCount`. Enforce ascending unique trends, a maximum of six, final-only past points, and at most one current-source point matching `periodMonth`.

- [ ] **Step 4: Run the parser tests and verify GREEN**

```bash
npm run test -- src/features/dashboard/dashboard-page.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing server-loader tests**

Mock `createClient()` and require:

```ts
expect(rpc).toHaveBeenCalledWith("get_dashboard_page");
expect(result.periodMonth).toBe("2026-08-01");
```

Require Supabase errors to throw `대시보드 정보를 불러오지 못했습니다.` and malformed JSON to preserve the controlled dashboard format error.

- [ ] **Step 6: Implement the server-only loader**

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseDashboardPage } from "./dashboard-page";

export async function loadDashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dashboard_page");
  if (error) throw new Error("대시보드 정보를 불러오지 못했습니다.");
  return parseDashboardPage(data);
}
```

Run `npm run test -- src/features/dashboard/dashboard-data.test.ts` and expect PASS.

- [ ] **Step 7: Commit the parsed server boundary**

```bash
git add \
  src/features/dashboard/dashboard-page.ts \
  src/features/dashboard/dashboard-page.test.ts \
  src/features/dashboard/dashboard-data.ts \
  src/features/dashboard/dashboard-data.test.ts
git commit -m "feat: parse dashboard aggregate data"
```

---

### Task 3: Build Accessible Server-Rendered Finance Charts

**Files:**
- Create: `src/features/dashboard/FinancialCharts.tsx`
- Create: `src/features/dashboard/FinancialCharts.module.scss`
- Create: `src/features/dashboard/FinancialCharts.test.tsx`
- Modify: `src/app/globals.scss`

**Interfaces:**
- Consumes: `DashboardTrendPoint[]` from Task 2.
- Produces: `MonthlyCashFlowChart({ points })`, `LedgerBalanceChart({ points })`, and deterministic scale helpers.

- [ ] **Step 1: Write failing scale and semantics tests**

Test pure geometry and rendered labels:

```ts
expect(createLinearScale([0], 32, 208)(0)).toBe(208);
expect(createLinearScale([-100000, 200000], 32, 208)(-100000)).toBe(208);
expect(createLinearScale([-100000, 200000], 32, 208)(200000)).toBe(32);
```

Render one point and require both headings, the visible range label `최근 6개월`, a Korean month label, `실제 회비 수납액`, `운영 지출`, `현재 예상 잔액`, `변동 가능`, and an accessible table containing exact numeric values. With final-only points, require `확정 잔액` and no provisional label.

- [ ] **Step 2: Run the chart test and verify RED**

Run `npm run test -- src/features/dashboard/FinancialCharts.test.tsx`.

Expected: FAIL because the chart module does not exist.

- [ ] **Step 3: Implement deterministic geometry helpers**

Export:

```ts
export function createLinearScale(
  values: number[],
  rangeStart: number,
  rangeEnd: number,
): (value: number) => number;

export function formatChartMonth(periodMonth: string): string;
```

For empty values return a stable baseline mapper. For equal nonzero values expand the numeric domain around the value. For all-zero values use a zero-to-one domain. Include zero in the bar domain. For balance, include zero only when values cross it.

- [ ] **Step 4: Implement the monthly grouped bars**

Use this server component signature:

```tsx
export function MonthlyCashFlowChart({
  points,
}: {
  points: DashboardTrendPoint[];
}) { /* SVG, legend, and accessible table */ }
```

Render separate income and expense bars, month labels, visible legend labels, `aria-labelledby`, `aria-describedby`, and an equivalent table hidden visually but available to assistive technology. With no points, render `표시할 재무 흐름이 없습니다.` rather than an empty SVG.

- [ ] **Step 5: Implement the ledger balance line**

Use this signature:

```tsx
export function LedgerBalanceChart({
  points,
}: {
  points: DashboardTrendPoint[];
}) { /* SVG, legend, and accessible table */ }
```

Render final points with solid segments and filled markers. If the last point is `current`, render the segment to it dashed and use a hollow marker plus `변동 가능`. Do not connect across missing calendar months. One point renders a marker without needing a line.

- [ ] **Step 6: Add only necessary tokens and responsive chart SCSS**

Reuse `--action-blue`, `--hairline`, `--ink`, `--ink-muted-48`, `--canvas`, and all existing spacing, type, border, and radius tokens. Add only missing semantic series tokens, for example:

```scss
--dashboard-expense-series: var(--ink-muted-48);
--dashboard-provisional-series: var(--ink-muted-80);
```

Use CSS variables for SVG stroke/fill. The wrapper has `min-width: 0`; SVG uses `width: 100%`. The local visually hidden class preserves table semantics without affecting layout.

- [ ] **Step 7: Run focused chart verification**

```bash
npm run test -- src/features/dashboard/FinancialCharts.test.tsx
npm run lint -- src/features/dashboard/FinancialCharts.tsx
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit the chart unit**

```bash
git add \
  src/features/dashboard/FinancialCharts.tsx \
  src/features/dashboard/FinancialCharts.module.scss \
  src/features/dashboard/FinancialCharts.test.tsx \
  src/app/globals.scss
git commit -m "feat: add dashboard finance charts"
```

---

### Task 4: Replace the Placeholder with Finance-Led Sections

**Files:**
- Create: `src/features/dashboard/DashboardSections.tsx`
- Create: `src/features/dashboard/DashboardSections.test.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/dashboard/page.module.scss`
- Modify: `src/app/(app)/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `DashboardPageData`, Task 3 charts, and compatible shared atoms/molecules/organisms.
- Produces: the complete `/dashboard` Server Component.

- [ ] **Step 1: Read the relevant local Next.js guides completely**

```bash
sed -n '1,320p' node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md
sed -n '1,280p' node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md
sed -n '1,240p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
sed -n '1,220p' node_modules/next/dist/docs/03-architecture/accessibility.md
```

- [ ] **Step 2: Write failing section tests**

For available open data require:

```ts
expect(screen.getByText("활동 회원")).toBeInTheDocument();
expect(screen.getByText("현재 장부 잔액")).toBeInTheDocument();
expect(screen.getByText("최종 마감 전 변동 가능")).toBeInTheDocument();
expect(screen.getByRole("region", { name: "이번 달 재무 현황" }))
  .toBeInTheDocument();
expect(screen.getByText("완납 18 / 20명")).toBeInTheDocument();
```

For finalized current data require no provisional label. For blocked finance require `계산 대기`, the mapped Korean reason, the member summary, and latest final section. With no latest final require `아직 최종 마감된 결산이 없습니다`.

- [ ] **Step 3: Run section tests and verify RED**

Run `npm run test -- src/features/dashboard/DashboardSections.test.tsx`.

Expected: FAIL because the section module does not exist.

- [ ] **Step 4: Implement the club overview**

Create `DashboardOverview` with a compact member panel and visually stronger finance panel. Display:

```text
활동 회원 20명
활동 예정 1 · 휴회 2
이번 달 신규 1 · 휴회 1 · 탈퇴 0

현재 장부 잔액 1,240,000원
2026.08.01 09:30 기준 · 최종 마감 전 변동 가능
```

Format `asOf` in `Asia/Seoul`. If finance is blocked, replace the balance with `계산 대기` and map each exact reason to a concrete Korean explanation. Never display unavailable finance as `0원`.

- [ ] **Step 5: Implement current-month finance**

Create `CurrentMonthFinance`. For available data render billed total, actual income, operating expense, attributed net, `완납 N / N명`, unpaid count, and unpaid total. Choose closing status in this order:

```ts
activeFinal
  ? `최종 마감 v${activeFinal.version}`
  : latestInterim
    ? `중간 결산 v${latestInterim.version} 이후 변동 가능`
    : "미결산";
```

Link to `/settlements?month=YYYY-MM`. For blocked data, show one explanation panel and the same link instead of empty metric cards.

- [ ] **Step 6: Implement latest final closing**

Create `LatestFinalClosing`. Show target month, final version, opening and closing balances, actual income, operating expense, attributed net, and Seoul-formatted closing date. Link to `/settlements?month=YYYY-MM` and `/reports/monthly?snapshot=${closing.id}`, matching the prerequisite plan’s exact-snapshot contract.

- [ ] **Step 7: Run section tests and verify GREEN**

Run `npm run test -- src/features/dashboard/DashboardSections.test.tsx`.

Expected: PASS.

- [ ] **Step 8: Write the failing route composition test**

Mock `loadDashboardPage()`. Require one call and DOM order:

```text
클럽 요약
이번 달 재무 현황
재무 추이
최근 최종 마감
```

Require both chart components and the shell page title `홈`. Assert that static zero metrics, foundation copy, utility cards, `/reports` shortcut, work queue, meeting copy, and schedule copy are absent.

- [ ] **Step 9: Replace the route and responsive layout**

Make `DashboardPage` async, call `loadDashboardPage()` once, publish `<PageTitle title="홈" />`, and compose:

```tsx
<DashboardOverview data={dashboard} />
<CurrentMonthFinance
  finance={dashboard.currentFinance}
  periodMonth={dashboard.periodMonth}
/>
<section aria-labelledby="finance-trends-title">
  <MonthlyCashFlowChart points={dashboard.trends} />
  <LedgerBalanceChart points={dashboard.trends} />
</section>
<LatestFinalClosing closing={dashboard.latestFinal} />
```

Keep internal vertical scrolling inside `.dashboard-page`; every grid child has `min-width: 0`. Use a wider finance column than member column, side-by-side charts on desktop, and one column on tablet/phone. Remove obsolete dashboard SCSS and global tokens only after `rg` proves no remaining consumer.

- [ ] **Step 10: Run route and feature tests**

```bash
npm run test -- \
  src/features/dashboard/DashboardSections.test.tsx \
  src/features/dashboard/FinancialCharts.test.tsx \
  'src/app/(app)/dashboard/page.test.tsx'
```

Expected: PASS.

- [ ] **Step 11: Commit the page**

```bash
git add \
  src/features/dashboard/DashboardSections.tsx \
  src/features/dashboard/DashboardSections.test.tsx \
  'src/app/(app)/dashboard/page.tsx' \
  'src/app/(app)/dashboard/page.module.scss' \
  'src/app/(app)/dashboard/page.test.tsx' \
  src/app/globals.scss
git commit -m "feat: rebuild dashboard around club finances"
```

---

### Task 5: Add Controlled Failure and Verify the Whole Experience

**Files:**
- Create: `src/app/(app)/dashboard/error.tsx`
- Create: `src/app/(app)/dashboard/error.test.tsx`
- Modify: `src/app/(app)/dashboard/page.module.scss`
- Modify: `docs/PROJECT_CHECKLIST.md`
- Modify: `docs/WORK_LOG.md`

**Interfaces:**
- Consumes: Next.js route error-boundary `error` and `reset` props.
- Produces: a retryable Korean error state and durable verification evidence.

- [ ] **Step 1: Write the failing boundary test**

Render with a test error and reset mock. Require `대시보드를 불러오지 못했습니다`, a `다시 시도` button, no raw exception text, and exactly one reset call after clicking.

- [ ] **Step 2: Run the boundary test and verify RED**

Run `npm run test -- 'src/app/(app)/dashboard/error.test.tsx'`.

Expected: FAIL because `error.tsx` does not exist.

- [ ] **Step 3: Implement the route boundary**

```tsx
"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section aria-labelledby="dashboard-error-title" role="alert">
      <h2 id="dashboard-error-title">대시보드를 불러오지 못했습니다</h2>
      <p>잠시 후 다시 시도해 주세요.</p>
      <button type="button" onClick={reset}>다시 시도</button>
    </section>
  );
}
```

Use the shared `Button` if its existing public contract accepts `onClick`; otherwise use a native button styled with existing tokens. Run the boundary test and expect PASS.

- [ ] **Step 4: Run focused and full automated verification**

Run in order:

```bash
npm run test -- src/features/dashboard 'src/app/(app)/dashboard'
npm run test
npm run lint
npx tsc --noEmit
git diff --check
npm run build
```

Every command must exit 0. If build lacks Supabase variables, use the project’s existing `.env.local` through the standard Next.js command without printing values.

- [ ] **Step 5: Apply and verify the RPC in a rollback-capable environment**

Apply only after all prerequisite migrations and deployment gates. With an authenticated active operator, verify one top-level response, no PII or detailed rows, current finance equals the existing closing preview, past trends equal active final snapshots, no interim appears in trends, and inactive/anonymous callers are rejected. Do not claim production verification if only static tests run.

- [ ] **Step 6: Run authenticated browser QA**

At 1440×900 and 375×812 verify section order, finance emphasis, readable non-overflowing charts, a distinct provisional current month, correct month and exact-snapshot links, `scrollWidth === clientWidth` on mobile, no console errors, and no failed dashboard request. Also exercise first-ledger-month, no-latest-final, and calculation-blocked states using fixtures or rollback-safe data.

- [ ] **Step 7: Update durable project records**

Mark the deferred dashboard checklist item complete only after verification. Add any genuinely unfinished DB deployment or production QA gate. Record implementation, migration status, exact test counts, lint/typecheck/build results, viewport results, and whether DB checks were local or production in `docs/WORK_LOG.md`.

- [ ] **Step 8: Commit verified completion**

```bash
git add \
  'src/app/(app)/dashboard/error.tsx' \
  'src/app/(app)/dashboard/error.test.tsx' \
  'src/app/(app)/dashboard/page.module.scss' \
  docs/PROJECT_CHECKLIST.md \
  docs/WORK_LOG.md
git commit -m "test: verify financial dashboard experience"
```
