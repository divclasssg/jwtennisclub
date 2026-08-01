# Dashboard Line Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dashboard-only shell title bar, exclude president member `#0000` from the active-member total with visible rationale, keep exact chart amounts always visible, and replace dashboard cards with the app's line-based presentation.

**Architecture:** The dashboard publishes a server-rendered marker that AppShell SCSS detects with `:has()` so other routes retain their title bars without pathname-coupled client code. A new forward-only migration replaces `get_dashboard_page()` with the same JSON contract and adds `member_code <> '#0000'` only to `active_count`. Existing chart tables become visible compact value tables, while dashboard and chart SCSS reuse current hairline, spacing, color, typography, and breakpoint tokens.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript, SCSS Modules, Supabase PostgreSQL, Vitest, Testing Library.

## Global Constraints

- Read relevant installed Next.js guidance under `node_modules/next/dist/docs/` before changing App Router code.
- Use SCSS Modules with meaningful kebab-case class names; do not introduce BEM or camelCase classes.
- Reuse tokens from `src/app/globals.scss` and breakpoints from `src/app/_breakpoints.scss`; add no hardcoded visual values.
- Keep the title bar unchanged on every route except `/dashboard`.
- Exclude `member_code = '#0000'` from `active_count` only; preserve every other member, fee, and settlement count.
- Always display `회장(#0000) 제외` next to the activity summary.
- Always display exact monthly graph amounts without hover, pointer, or keyboard interaction.
- Remove dashboard card borders, radii, and the black balance surface; retain action-control styling.
- Do not modify the already-applied `202608010001_add_dashboard_page.sql`; add a forward migration.
- Do not apply a production migration or deploy the app before implementation review, merge approval, and a one-file migration dry-run.

---

### Task 1: Hide the shell title bar only on the dashboard

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/dashboard/page.module.scss`
- Modify: `src/app/(app)/dashboard/page.test.tsx`
- Modify: `src/features/shell/AppShell.module.scss`
- Create: `src/features/shell/AppShellStyles.test.ts`

**Interfaces:**
- Consumes: dashboard route root element and AppShell's existing `.shell-workspace`, `.shell-title-bar`, and `.shell-content` grid structure.
- Produces: `data-hide-shell-title-bar="true"` on the dashboard `h1`; `.dashboard-page-title` as a visually hidden class; AppShell `:has([data-hide-shell-title-bar="true"])` desktop and phone grid overrides.

- [ ] **Step 1: Read the installed Next.js App Router layout and server/client composition guidance**

Run:

```bash
rg -n "layout|Server Component|Client Component" node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.mdx node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.mdx
```

Expected: the installed docs confirm layouts preserve shared UI and Server Components may render ordinary marker attributes without adding client route state.

- [ ] **Step 2: Write failing dashboard-route and AppShell style tests**

In `page.test.tsx`, replace the current PageTitle-only assertion with:

```tsx
const pageTitle = screen.getByRole("heading", { name: "홈", level: 1 });
expect(pageTitle).toHaveAttribute("data-hide-shell-title-bar", "true");
expect(pageTitle.className).toContain("dashboard-page-title");
```

Create `AppShellStyles.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  join(process.cwd(), "src/features/shell/AppShell.module.scss"),
  "utf8",
);

describe("dashboard shell title visibility", () => {
  it("collapses the title row only when dashboard publishes its marker", () => {
    expect(styles).toContain(
      '.shell-workspace:has([data-hide-shell-title-bar="true"])',
    );
    expect(styles).toMatch(
      /> \.shell-title-bar \{\s*display: none;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: bp\.\$breakpoint-phone\)[\s\S]*?\.shell-workspace:has\(\[data-hide-shell-title-bar="true"\]\)[\s\S]*?grid-template-rows: minmax\(0, 1fr\)/,
    );
  });
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npm test -- 'src/app/(app)/dashboard/page.test.tsx' src/features/shell/AppShellStyles.test.ts
```

Expected: FAIL because the dashboard `h1` marker, hidden class, and AppShell marker selector do not exist.

- [ ] **Step 4: Implement the server-rendered marker and grid collapse**

In `page.tsx`, remove the `PageTitle` import and render this as the first child of `.dashboard-page`:

```tsx
<h1
  className={styles["dashboard-page-title"]}
  data-hide-shell-title-bar="true"
>
  홈
</h1>
```

In `page.module.scss`, add the existing project visually-hidden pattern under `.dashboard-page-title` using only `--hairline-width`.

In `AppShell.module.scss`, add a desktop/tablet rule after `.shell-workspace`:

```scss
.shell-workspace:has([data-hide-shell-title-bar="true"]) {
  grid-template-rows:
    var(--shell-user-bar-height)
    minmax(0, 1fr);

  > .shell-title-bar {
    display: none;
  }
}
```

Inside the phone media query add:

```scss
.shell-workspace:has([data-hide-shell-title-bar="true"]) {
  grid-template-rows: minmax(0, 1fr);
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- 'src/app/(app)/dashboard/page.test.tsx' src/features/shell/AppShell.test.tsx src/features/shell/AppShellStyles.test.ts
```

Expected: PASS; existing member-route AppShell title behavior remains covered.

- [ ] **Step 6: Commit Task 1**

```bash
git add 'src/app/(app)/dashboard/page.tsx' 'src/app/(app)/dashboard/page.module.scss' 'src/app/(app)/dashboard/page.test.tsx' src/features/shell/AppShell.module.scss src/features/shell/AppShellStyles.test.ts
git commit -m "fix(dashboard): remove duplicate shell title bar"
```

### Task 2: Exclude the president from the active-member summary

**Files:**
- Create: `supabase/migrations/202608010002_exclude_president_from_dashboard_activity.sql`
- Modify: `src/features/dashboard/dashboard-migration.test.ts`
- Modify: `src/features/dashboard/DashboardSections.tsx`
- Modify: `src/features/dashboard/DashboardSections.test.tsx`

**Interfaces:**
- Consumes: `public.get_dashboard_page() returns jsonb`, `DashboardPageData.members.activeCount`, and reserved member code `#0000`.
- Produces: unchanged dashboard JSON shape with corrected `active_count`; visible supporting copy `회장(#0000) 제외`.

- [ ] **Step 1: Write failing migration and UI tests**

Extend `dashboard-migration.test.ts` to load both migration files and assert the new function body:

```ts
expect(forwardSql).toContain("function public.get_dashboard_page()\nreturns jsonb");
expect(forwardFunction).toMatch(
  /count\(\*\) filter \(\s*where members\.member_code <> '#0000'[\s\S]*?\) as active_count/,
);
expect(forwardFunction.match(/members\.member_code <> '#0000'/g)).toHaveLength(1);
expect(forwardSql).toContain("set search_path = ''");
expect(forwardSql).toContain(
  "revoke execute on function public.get_dashboard_page() from public, anon",
);
expect(forwardSql).toContain(
  "grant execute on function public.get_dashboard_page() to authenticated",
);
```

Extend `DashboardSections.test.tsx`:

```tsx
expect(within(overview).getByText("회장(#0000) 제외")).toBeInTheDocument();
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test -- src/features/dashboard/dashboard-migration.test.ts src/features/dashboard/DashboardSections.test.tsx
```

Expected: FAIL because the forward migration and exclusion explanation do not exist.

- [ ] **Step 3: Create the forward-only migration**

Copy the complete `get_dashboard_page()` definition and transaction/grant envelope from `202608010001_add_dashboard_page.sql` into `202608010002_exclude_president_from_dashboard_activity.sql`. Add exactly one predicate at the start of the `active_count` filter:

```sql
count(*) filter (
  where members.member_code <> '#0000'
    and members.activity_start_month <= current_period_month
    and (
      members.withdrawn_date is null
      or members.withdrawn_date > period_month_end
    )
    and not (
      members.status = 'paused'
      and members.pause_start_month <= current_period_month
    )
) as active_count,
```

Retain `security definer`, `set search_path = ''`, active-profile authorization, source locks, privacy-safe JSON, `revoke`, `grant`, PostgREST schema reload, and the transaction boundary byte-for-byte except for the new predicate.

- [ ] **Step 4: Add the visible exclusion rationale**

In `DashboardOverview`, place this supporting line directly below the active count:

```tsx
<p className={styles["dashboard-member-exclusion"]}>
  회장(#0000) 제외
</p>
```

Use existing caption/muted tokens in `page.module.scss`; do not hide the explanation in an accessible-only class.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/features/dashboard/dashboard-migration.test.ts src/features/dashboard/DashboardSections.test.tsx src/features/dashboard/dashboard-page.test.ts src/features/dashboard/dashboard-data.test.ts
```

Expected: PASS with the JSON parser and RPC loader unchanged.

- [ ] **Step 6: Commit Task 2**

```bash
git add supabase/migrations/202608010002_exclude_president_from_dashboard_activity.sql src/features/dashboard/dashboard-migration.test.ts src/features/dashboard/DashboardSections.tsx src/features/dashboard/DashboardSections.test.tsx 'src/app/(app)/dashboard/page.module.scss'
git commit -m "fix(dashboard): exclude president from active total"
```

### Task 3: Keep exact graph amounts always visible

**Files:**
- Modify: `src/features/dashboard/FinancialCharts.tsx`
- Modify: `src/features/dashboard/FinancialCharts.module.scss`
- Modify: `src/features/dashboard/FinancialCharts.test.tsx`

**Interfaces:**
- Consumes: existing `DashboardTrendPoint[]`, `formatChartMonth()`, and `formatCurrency()`.
- Produces: `.chart-values-table` tables that remain visible and preserve `aria-label="월별 수납 및 지출 수치"` and `aria-label="월별 장부 잔액 수치"`.

- [ ] **Step 1: Write failing visibility and exact-value tests**

In `FinancialCharts.test.tsx`, render both `finalPoint` and `currentPoint`, then assert:

```tsx
const cashTable = screen.getByRole("table", {
  name: "월별 수납 및 지출 수치",
});
const balanceTable = screen.getByRole("table", {
  name: "월별 장부 잔액 수치",
});

expect(cashTable).toHaveClass(expect.stringContaining("chart-values-table"));
expect(cashTable).not.toHaveClass(expect.stringContaining("visually-hidden"));
expect(within(cashTable).getByText("600,000원")).toBeVisible();
expect(within(cashTable).getByText("510,000원")).toBeVisible();
expect(within(cashTable).getByText("205,000원")).toBeVisible();
expect(within(cashTable).getByText("130,000원")).toBeVisible();
expect(within(balanceTable).getByText("395,000원")).toBeVisible();
expect(within(balanceTable).getByText("775,000원")).toBeVisible();
expect(within(balanceTable).getByText("확정")).toBeVisible();
expect(within(balanceTable).getByText("변동 가능")).toBeVisible();
```

- [ ] **Step 2: Run the chart test and verify RED**

Run:

```bash
npm test -- src/features/dashboard/FinancialCharts.test.tsx
```

Expected: FAIL because both tables still use `.visually-hidden`.

- [ ] **Step 3: Expose the existing semantic tables**

Replace both table class names in `FinancialCharts.tsx`:

```tsx
<table
  className={styles["chart-values-table"]}
  aria-label="월별 수납 및 지출 수치"
>
```

and:

```tsx
<table
  className={styles["chart-values-table"]}
  aria-label="월별 장부 잔액 수치"
>
```

Delete the now-unused `.visually-hidden` rule from `FinancialCharts.module.scss`.

- [ ] **Step 4: Add compact line-table styling**

Add `@use "../../app/breakpoints" as bp;` to `FinancialCharts.module.scss`. Add `.chart-values-table` with `width: 100%`, `border-collapse: collapse`, caption typography, right-aligned numeric cells, left-aligned month headers, and one `border-top: var(--hairline-width) solid var(--hairline)` per row. Use spacing tokens for cell padding. Under `bp.$breakpoint-phone`, reduce cell padding using an existing spacing token; do not add horizontal scrolling or a new breakpoint.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/features/dashboard/FinancialCharts.test.tsx src/features/dashboard/dashboard-page.test.ts
```

Expected: PASS; chart geometry, missing-month segment behavior, provisional encoding, and empty states remain intact.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/features/dashboard/FinancialCharts.tsx src/features/dashboard/FinancialCharts.module.scss src/features/dashboard/FinancialCharts.test.tsx
git commit -m "feat(dashboard): show exact chart amounts"
```

### Task 4: Convert all dashboard surfaces to line-based presentation

**Files:**
- Modify: `src/app/(app)/dashboard/page.module.scss`
- Modify: `src/app/(app)/dashboard/page-styles.test.ts`
- Modify: `src/features/dashboard/FinancialCharts.module.scss`

**Interfaces:**
- Consumes: existing dashboard class names and global design tokens.
- Produces: white surfaces separated by hairlines, without rounded outer cards or the black balance surface.

- [ ] **Step 1: Write failing style-contract tests**

Extend `page-styles.test.ts`:

```ts
const chartStyles = readFileSync(
  join(process.cwd(), "src/features/dashboard/FinancialCharts.module.scss"),
  "utf8",
);

it("uses line-based dashboard surfaces without rounded cards", () => {
  expect(pageStyles).not.toContain(
    ".dashboard-member-card,\n.dashboard-balance-card,\n.dashboard-current-finance,\n.dashboard-closing-card,\n.dashboard-empty-state {\n  border:",
  );
  expect(pageStyles).not.toMatch(
    /\.dashboard-balance-card[\s\S]*?background: var\(--surface-black\)/,
  );
  expect(pageStyles).toContain(
    "border-bottom: var(--hairline-width) solid var(--hairline);",
  );
  expect(pageStyles).not.toContain("border-radius: var(--rounded-lg);");
  expect(chartStyles).not.toContain("border-radius: var(--rounded-lg);");
  expect(chartStyles).toContain(
    "border-right: var(--hairline-width) solid var(--hairline);",
  );
});
```

- [ ] **Step 2: Run style and error tests and verify RED**

Run:

```bash
npm test -- 'src/app/(app)/dashboard/page-styles.test.ts' 'src/app/(app)/dashboard/error.test.tsx' src/features/dashboard/FinancialCharts.test.tsx
```

Expected: FAIL because dashboard and chart cards still have rounded borders and the balance card uses `--surface-black`.

- [ ] **Step 3: Replace overview cards with a summary line grid**

In `page.module.scss`, implement the desktop structure with existing tokens:

```scss
.dashboard-overview-grid {
  gap: 0;
  border-top: var(--hairline-width) solid var(--hairline);
  border-bottom: var(--hairline-width) solid var(--hairline);
}

.dashboard-member-card,
.dashboard-balance-card {
  border: 0;
  border-radius: var(--rounded-none);
  background: var(--canvas);
}

.dashboard-member-card {
  border-right: var(--hairline-width) solid var(--hairline);
}

.dashboard-balance-card {
  color: var(--ink);

  .dashboard-card-label,
  .dashboard-balance-meta {
    color: var(--ink-muted-48);
  }
}
```

Inside the existing tablet breakpoint, replace the desktop right divider when the overview stacks:

```scss
.dashboard-member-card {
  border-right: 0;
  border-bottom: var(--hairline-width) solid var(--hairline);
}
```

Preserve the existing display-size balance value and provisional status copy.

- [ ] **Step 4: Convert finance, charts, closing, empty, and error surfaces**

Use this outer-surface contract in `page.module.scss`:

```scss
.dashboard-current-finance,
.dashboard-closing-card,
.dashboard-empty-state,
.dashboard-error {
  border: 0;
  border-top: var(--hairline-width) solid var(--hairline);
  border-bottom: var(--hairline-width) solid var(--hairline);
  border-radius: var(--rounded-none);
  background: var(--canvas);
}

.dashboard-trends-grid {
  gap: 0;
  border-top: var(--hairline-width) solid var(--hairline);
  border-bottom: var(--hairline-width) solid var(--hairline);
}
```

Use this chart contract in `FinancialCharts.module.scss`:

```scss
.chart-card {
  border: 0;
  border-radius: var(--rounded-none);
  background: var(--canvas);
}

.chart-card:first-child {
  border-right: var(--hairline-width) solid var(--hairline);
}
```

At the tablet breakpoint, remove the first chart's right line and add its bottom line:

```scss
@media (max-width: bp.$breakpoint-tablet-landscape) {
  .chart-card:first-child {
    border-right: 0;
    border-bottom: var(--hairline-width) solid var(--hairline);
  }
}
```

Retain `.dashboard-closing-title`, metric-grid, and action hairlines, the existing responsive two-column metrics, and all action button/link styling.

- [ ] **Step 5: Run dashboard-focused tests and verify GREEN**

Run:

```bash
npm test -- src/features/dashboard 'src/app/(app)/dashboard' src/features/shell
```

Expected: PASS for route order, summary copy, chart values, layout contracts, and error retry.

- [ ] **Step 6: Commit Task 4**

```bash
git add 'src/app/(app)/dashboard/page.module.scss' 'src/app/(app)/dashboard/page-styles.test.ts' src/features/dashboard/FinancialCharts.module.scss
git commit -m "style(dashboard): replace cards with line layout"
```

### Task 5: Full verification, browser QA, and release handoff

**Files:**
- Modify: `docs/WORK_LOG.md`
- Review only: `docs/PROJECT_CHECKLIST.md`
- Review only: `supabase/migrations/202608010002_exclude_president_from_dashboard_activity.sql`

**Interfaces:**
- Consumes: completed Tasks 1-4 and the authenticated dashboard environment.
- Produces: verification evidence and a release gate; no production DB mutation during implementation.

- [ ] **Step 1: Run automated verification**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
git diff --check
```

Expected: all commands exit 0; record exact test-file and test counts.

- [ ] **Step 2: Run the production build with configured environment values**

Load the root `.env.local` without printing values and run:

```bash
zsh -c 'set -a; source ../../.env.local; set +a; npm run build'
```

Expected: Next.js 16.2.10 build exits 0 and includes `/dashboard`.

- [ ] **Step 3: Run desktop browser QA at 1440×900**

Verify:

- no visible AppShell title bar or empty title row on `/dashboard`;
- other routes still show their shell title bar;
- activity summary visibly says `회장(#0000) 제외`;
- both chart tables show exact monthly won values;
- every dashboard surface is white and line-separated;
- no horizontal overflow, failed requests, or console errors.

- [ ] **Step 4: Run phone browser QA at 375×812**

Verify:

- content begins without a 56px empty title row;
- overview and charts stack with single hairline separators;
- amount tables fit without horizontal document overflow;
- `document.documentElement.scrollWidth === document.documentElement.clientWidth === 375`;
- exact amounts and exclusion rationale remain visible.

- [ ] **Step 5: Record the work and deployment gate**

Add a dated `docs/WORK_LOG.md` section containing:

- the four user-facing changes;
- RED→GREEN evidence per task;
- full test/lint/typecheck/build results;
- desktop and phone QA results;
- explicit statement that `202608010002` has not been applied to production.

- [ ] **Step 6: Commit Task 5**

```bash
git add docs/WORK_LOG.md
git commit -m "docs: record dashboard line layout verification"
```

- [ ] **Step 7: Prepare release instructions without executing them**

After review and merge approval, run from a clean `main` integration worktree:

```bash
supabase db push --linked --dry-run
```

Proceed only when output lists exactly:

```text
202608010002_exclude_president_from_dashboard_activity.sql
```

Then apply the migration before deploying the app, verify migration history, function security/grants, authenticated RPC output, and finally repeat production dashboard browser QA. Do not perform these release actions as part of this implementation plan without explicit release approval.
