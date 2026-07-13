# Table Column Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent ascending and descending controls to every meaningful data column in the member, fee, expense, and settlement tables.

**Architecture:** Keep pages as Next.js Server Components and represent sorting with validated `sort` and `direction` URL parameters. A shared sortable-header component builds filter-preserving links, while a shared stable sorting helper orders each page's completed display rows so desktop tables and mobile lists remain synchronized.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, SCSS Modules, Vitest, Testing Library.

## Global Constraints

- Read relevant files in `node_modules/next/dist/docs/` before editing Next.js code.
- Style files use SCSS and meaningful kebab-case CSS Module class names.
- Reuse tokens from `src/app/globals.scss` and breakpoints from `src/app/_breakpoints.scss`; do not add hardcoded design values when a token exists.
- Preserve all existing uncommitted member and fee filter changes.
- Sort controls are excluded from `관리`, `처리`, and `증빙` columns.
- Missing values sort last in both directions.
- Existing filters and month/status tabs remain in sort URLs.

---

### Task 1: Shared sorting contract and header UI

**Files:**
- Create: `src/components/organisms/table-sort.ts`
- Create: `src/components/organisms/table-sort.test.ts`
- Create: `src/components/organisms/SortableTableHeader.tsx`
- Create: `src/components/organisms/SortableTableHeader.test.tsx`
- Modify: `src/components/organisms/index.ts`
- Modify: `src/components/organisms/Organisms.module.scss`

**Interfaces:**
- Produces: `SortDirection = "asc" | "desc"`.
- Produces: `parseSortState<TKey>(params, allowedKeys, fallback): { key: TKey; direction: SortDirection }`.
- Produces: `buildSortHref(pathname, params, key, direction): string`.
- Produces: `stableSortRows<T>(rows, getValue, direction): T[]` supporting `string | number | null | undefined`.
- Produces: `SortableTableHeader` with `label`, `sortKey`, `sortState`, `pathname`, and `searchParams` props.

- [ ] **Step 1: Write failing helper tests**

Test valid and invalid sort parameters, filter-preserving hrefs, Korean/numeric string comparison, number comparison, stable ties, and null-last behavior in both directions:

```ts
expect(parseSortState({ sort: "name", direction: "desc" }, ["name", "date"] as const, { key: "date", direction: "asc" }))
  .toEqual({ key: "name", direction: "desc" });
expect(buildSortHref("/members", { q: "김", status: "active" }, "name", "asc"))
  .toBe("/members?q=%EA%B9%80&status=active&sort=name&direction=asc");
expect(stableSortRows(rows, (row) => row.value, "desc").map((row) => row.id))
  .toEqual(["high", "low", "empty"]);
```

- [ ] **Step 2: Run helper tests and verify RED**

Run: `npm run test -- src/components/organisms/table-sort.test.ts`

Expected: FAIL because `table-sort.ts` does not exist.

- [ ] **Step 3: Implement the helper contract**

Implement whitelist validation, URLSearchParams preservation, locale comparison with `{ numeric: true }`, numeric comparison, original-index tie-breaking, and direction-independent null-last handling. Do not mutate the input array.

- [ ] **Step 4: Run helper tests and verify GREEN**

Run: `npm run test -- src/components/organisms/table-sort.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing header tests**

Render a header and assert the two always-visible links and active direction:

```tsx
render(<table><thead><tr><SortableTableHeader label="회원번호" pathname="/members" searchParams={{ q: "김" }} sortKey="memberCode" sortState={{ key: "memberCode", direction: "asc" }} /></tr></thead></table>);
expect(screen.getByRole("link", { name: "회원번호 오름차순 정렬" })).toHaveAttribute("aria-current", "true");
expect(screen.getByRole("link", { name: "회원번호 내림차순 정렬" })).toHaveAttribute("href", expect.stringContaining("direction=desc"));
```

- [ ] **Step 6: Run header tests and verify RED**

Run: `npm run test -- src/components/organisms/SortableTableHeader.test.tsx`

Expected: FAIL because the component is missing.

- [ ] **Step 7: Implement and style `SortableTableHeader`**

Render a `<th scope="col">` containing a label and two Next.js `Link` controls with `↑` and `↓` visual text, descriptive `aria-label`s, and `aria-current="true"` only for the active direction. Add `sortable-table-header`, `sort-controls`, `sort-link`, and `sort-link-active` styles using existing color, spacing, radius, typography, and focus tokens.

- [ ] **Step 8: Export and verify the shared component**

Run: `npm run test -- src/components/organisms/SortableTableHeader.test.tsx src/components/organisms/organisms.test.tsx`

Expected: PASS.

### Task 2: Member table sorting

**Files:**
- Modify: `src/app/(app)/members/page.tsx`
- Modify: `src/app/(app)/members/page.test.tsx`
- Modify: `src/features/members/member-list.ts`
- Modify: `src/features/members/member-list.test.ts`

**Interfaces:**
- Consumes: shared `parseSortState`, `stableSortRows`, and `SortableTableHeader`.
- Produces: member sort keys `memberCode | name | phone | kind | position | group | status | joinedDate`.

- [ ] **Step 1: Write failing member sort tests**

Add `sort` and `direction` to the page search parameters, render at least two deliberately reversed members, and assert that `sort=name&direction=desc` reverses both table and mobile list order. Assert all eight sortable headers expose both direction links, `관리` does not, and the links preserve `q` and `status`.

- [ ] **Step 2: Run member tests and verify RED**

Run: `npm run test -- 'src/app/(app)/members/page.test.tsx' src/features/members/member-list.test.ts`

Expected: FAIL because the headers and sorting contract are absent.

- [ ] **Step 3: Implement member sort values and page wiring**

Use the existing formatters for displayed values:

```ts
const memberSortValues = {
  memberCode: (row) => row.memberCode,
  name: (row) => row.name,
  phone: (row) => row.phoneDisplay,
  kind: (row) => formatMemberDirectoryKind(row),
  position: (row) => formatMemberPosition(row),
  group: (row) => row.groupCode,
  status: (row) => formatMemberStatus(row.status),
  joinedDate: (row) => row.joinedDate,
};
```

Default to `memberCode asc`. Replace only the eight data `<th>` elements, preserve the plain `관리` header, and pass the sorted rows to both desktop and mobile renderers.

- [ ] **Step 4: Run member tests and verify GREEN**

Run: `npm run test -- 'src/app/(app)/members/page.test.tsx' src/features/members/member-list.test.ts`

Expected: PASS.

### Task 3: Fee table sorting

**Files:**
- Modify: `src/app/(app)/fees/page.tsx`
- Modify: `src/app/(app)/fees/page.test.tsx`
- Modify: `src/features/fees/fee-list.ts`
- Modify: `src/features/fees/fee-list.test.ts`

**Interfaces:**
- Consumes: shared sort helpers and header.
- Produces: fee sort keys `memberCode | name | kind | status | amount | paidDate | memo`.

- [ ] **Step 1: Write failing fee sort tests**

Assert amount descending, payment-status ordering, null-last paid dates, two links on seven sortable headers, no links on `처리`, preservation of `month` and `q`, and identical mobile row order.

- [ ] **Step 2: Run fee tests and verify RED**

Run: `npm run test -- 'src/app/(app)/fees/page.test.tsx' src/features/fees/fee-list.test.ts`

Expected: FAIL because fee sorting is not implemented.

- [ ] **Step 3: Implement fee sort values and page wiring**

Sort the completed fee board rows with these values:

```ts
const feeSortValues = {
  memberCode: (row) => row.memberCode,
  name: (row) => row.memberName,
  kind: (row) => formatMemberKind(row),
  status: (row) => formatPaymentStatus(row),
  amount: (row) => row.payment?.amount ?? DEFAULT_MONTHLY_FEE_AMOUNT,
  paidDate: (row) => row.payment?.paidDate,
  memo: (row) => row.payment?.memo,
};
```

Default to `memberCode asc`. Use sorted rows for the table, total label, and `FeeMobileList`; keep summary calculations based on the complete target-member set.

- [ ] **Step 4: Run fee tests and verify GREEN**

Run: `npm run test -- 'src/app/(app)/fees/page.test.tsx' src/features/fees/fee-list.test.ts`

Expected: PASS.

### Task 4: Expense table sorting

**Files:**
- Modify: `src/app/(app)/expenses/page.tsx`
- Modify: `src/app/(app)/expenses/page.test.tsx`
- Modify: `src/features/expenses/expense-list.ts`
- Modify: `src/features/expenses/expense-list.test.ts`

**Interfaces:**
- Consumes: shared sort helpers and header.
- Produces: expense sort keys `expenseDate | category | description | amount | memo`.

- [ ] **Step 1: Write failing expense sort tests**

Assert date ascending, amount descending, null-last memo behavior, two links on five sortable headers, no links on `증빙` and `관리`, and preservation of `month` and `category`.

- [ ] **Step 2: Run expense tests and verify RED**

Run: `npm run test -- 'src/app/(app)/expenses/page.test.tsx' src/features/expenses/expense-list.test.ts`

Expected: FAIL because expense sorting is not implemented.

- [ ] **Step 3: Implement expense sort values and page wiring**

Use ISO `expenseDate`, formatted category text, raw description, numeric amount, and nullable memo. Default to `expenseDate desc`, sort after `getExpenses`, and render the sorted rows while calculating summary totals from the same complete records.

- [ ] **Step 4: Run expense tests and verify GREEN**

Run: `npm run test -- 'src/app/(app)/expenses/page.test.tsx' src/features/expenses/expense-list.test.ts`

Expected: PASS.

### Task 5: Settlement category table sorting

**Files:**
- Modify: `src/app/(app)/settlements/page.tsx`
- Modify: `src/app/(app)/settlements/page.test.tsx`
- Modify: `src/features/settlements/settlement-summary.ts`
- Modify: `src/features/settlements/settlement-summary.test.ts`

**Interfaces:**
- Consumes: shared sort helpers and header.
- Produces: settlement sort keys `category | count | amount`.

- [ ] **Step 1: Write failing settlement sort tests**

Create multiple category rows and assert category ascending, count descending, and amount descending. Assert both links on all three headers and preservation of `month`.

- [ ] **Step 2: Run settlement tests and verify RED**

Run: `npm run test -- 'src/app/(app)/settlements/page.test.tsx' src/features/settlements/settlement-summary.test.ts`

Expected: FAIL because settlement category sorting is absent.

- [ ] **Step 3: Implement settlement sort values and page wiring**

Default to `category asc`; compare category by `formatExpenseCategory(row.category)`, count numerically, and amount numerically. Sort only `summary.expenseCategoryRows`; do not alter summary totals or PDF data.

- [ ] **Step 4: Run settlement tests and verify GREEN**

Run: `npm run test -- 'src/app/(app)/settlements/page.test.tsx' src/features/settlements/settlement-summary.test.ts`

Expected: PASS.

### Task 6: Full regression and production verification

**Files:**
- Verify all files above.

**Interfaces:**
- Consumes: all implemented sorting behavior.
- Produces: verified application state only; no new runtime API.

- [ ] **Step 1: Run focused table suites**

Run: `npm run test -- src/components/organisms 'src/app/(app)/members' 'src/app/(app)/fees' 'src/app/(app)/expenses' 'src/app/(app)/settlements'`

Expected: all focused tests pass with no warnings.

- [ ] **Step 2: Run the complete automated checks**

Run: `npm run test`

Expected: all test files pass.

Run: `npm run lint`

Expected: exit code 0.

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: Next.js production build exits 0 and includes `/members`, `/fees`, `/expenses`, and `/settlements` routes.

- [ ] **Step 4: Inspect final scope**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only the approved sorting work, its docs, and the user's pre-existing member/fee changes are modified.

