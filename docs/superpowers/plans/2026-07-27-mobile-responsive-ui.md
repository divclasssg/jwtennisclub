# Mobile Responsive UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Figma `12:189` mobile shell to every authenticated screen and replace every phone-width `DataTable` surface with a compact, overflow-safe list.

**Architecture:** Keep data loading, filtering, sorting, mutations, and desktop tables in their current server pages. Extend `AppShell` and shared SCSS for the common phone layout, then give each table-owning domain a presentation-only mobile list that consumes the same already-sorted rows. Permit horizontal scrolling only inside the primary navigation strip.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript, SCSS Modules, Vitest, Testing Library.

## Global Constraints

- Read relevant local Next.js documentation before editing Next.js code.
- Use SCSS Modules and kebab-case hyphen class names.
- Reuse tokens from `src/app/globals.scss` and breakpoints from `src/app/_breakpoints.scss`.
- Do not add Tailwind or another styling dependency.
- Phone layout activates at the existing `640px` breakpoint.
- At 375px and 402px, no horizontal scrolling is allowed outside the primary navigation strip.
- Desktop shell, tables, data order, permissions, URLs, and server actions remain unchanged.
- Mobile lists show only the essential information defined in the approved design.
- Every behavior change follows RED → GREEN → REFACTOR.

---

### Task 1: Common mobile shell and account menu

**Files:**
- Modify: `src/features/shell/AppShell.test.tsx`
- Modify: `src/app/(app)/layout.test.tsx`
- Modify: `src/features/shell/AppShell.tsx`
- Modify: `src/features/shell/AppShell.module.scss`
- Modify: `src/features/shell/ShellNavigation.tsx`
- Create: `public/icons/menu.png`
- Modify: `src/app/globals.scss`

**Interfaces:**
- Consumes: `AppShellProps` identity values and `navigationItems`.
- Produces: `AppShell` markup with `.shell-mobile-header`, `.shell-mobile-menu`, existing `.shell-nav`, and an exact 24×24 Figma menu image.
- Produces: the same desktop account actions and a phone-only account menu containing identity, password change, and logout.

- [ ] **Step 1: Write failing shell tests**

Add assertions that catch removal of the mobile header, menu control, or duplicated mobile account actions:

```tsx
const mobileHeader = screen.getByRole("banner", { name: "모바일 앱 헤더" });
const accountMenu = within(mobileHeader).getByRole("button", {
  name: "계정 메뉴",
});
expect(accountMenu.querySelector("img")).toHaveAttribute("src", "/icons/menu.png");
expect(screen.getAllByRole("link", { name: "비밀번호 변경" })).toHaveLength(2);
expect(screen.getAllByRole("button", { name: "로그아웃" })).toHaveLength(2);
```

Update the layout identity test to expect the user name and role text in desktop and mobile account surfaces.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/features/shell/AppShell.test.tsx 'src/app/(app)/layout.test.tsx'
```

Expected: FAIL because the account menu button, menu image, and second account surface do not exist.

- [ ] **Step 3: Add the exact Figma menu asset**

Download the 24×24 PNG export returned for Figma node `12:923` into `public/icons/menu.png`. Do not draw or author a replacement SVG.

- [ ] **Step 4: Implement minimal shell markup**

Keep `AppShell` server-rendered. Use a native `<details>` element for the mobile account menu so the entire shell does not become a client component:

```tsx
<header
  aria-label="모바일 앱 헤더"
  className={styles["shell-mobile-header"]}
>
  <details className={styles["shell-mobile-menu"]}>
    <summary aria-label="계정 메뉴">
      <Image alt="" height={24} src="/icons/menu.png" width={24} />
    </summary>
    <div className={styles["shell-mobile-account-panel"]}>
      <p>{userDisplayName}</p>
      <p>{shellKicker}</p>
      <Link href="/settings/password">비밀번호 변경</Link>
      <form action={logout}>
        <button type="submit">로그아웃</button>
      </form>
    </div>
  </details>
  <Link href="/dashboard">JW TENNIS CLUB</Link>
</header>
```

Keep the existing desktop header/user bar markup. Change only responsive visibility and grid rows in SCSS.

- [ ] **Step 5: Implement phone shell styling**

At `max-width: bp.$breakpoint-phone`:

- make the shell rows `64px 56px minmax(0, 1fr)`;
- show the white mobile header and hide the desktop global header/user bar;
- render `.shell-nav` as a 56px padded strip;
- make links 13px pills with black current state and gray inactive state;
- position the account panel below the 64px header with `max-width: calc(100vw - var(--spacing-24) * 2)`;
- set `min-width: 0`, `max-width: 100%`, and hidden overflow on non-navigation shell containers.

Add meaningful tokens only if no existing height, surface, or spacing token matches.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/features/shell/AppShell.test.tsx 'src/app/(app)/layout.test.tsx'
```

Expected: PASS with no warnings.

- [ ] **Step 7: Commit**

```bash
git add public/icons/menu.png src/app/globals.scss src/features/shell/AppShell.tsx src/features/shell/AppShell.module.scss src/features/shell/ShellNavigation.tsx src/features/shell/AppShell.test.tsx 'src/app/(app)/layout.test.tsx'
git commit -m "feat(shell): add Figma mobile navigation"
```

### Task 2: Shared phone toolbars and compact member list

**Files:**
- Modify: `src/app/(app)/members/page.test.tsx`
- Modify: `src/features/members/MemberMobileList.tsx`
- Modify: `src/features/members/MemberMobileList.module.scss`
- Modify: `src/components/molecules/Molecules.module.scss`
- Modify: `src/components/atoms/Button.module.scss`
- Modify: `src/components/atoms/FormControls.module.scss`
- Modify: `src/components/templates/Templates.module.scss`

**Interfaces:**
- Consumes: existing `MemberMobileListProps`.
- Produces: member list items containing name, member code, position, directory kind, status, and optional edit only.
- Produces: phone-width filters whose direct form fields and submit actions fill the available width.

- [ ] **Step 1: Write a failing member presentation test**

In the existing mobile member test, scope to `모바일 회원 목록` and assert essential information plus omitted details:

```tsx
expect(within(mobileList).getByText("JW-000001")).toBeInTheDocument();
expect(within(mobileList).getByText("총무")).toBeInTheDocument();
expect(within(mobileList).getByText("운영진")).toBeInTheDocument();
expect(within(mobileList).getByText("활동중")).toBeInTheDocument();
expect(within(mobileList).queryByText(/010-/)).not.toBeInTheDocument();
expect(within(mobileList).queryByText(/^그룹 /)).not.toBeInTheDocument();
expect(within(mobileList).queryByText(/^가입일 /)).not.toBeInTheDocument();
```

The production mutation this catches is reintroducing nonessential mobile fields or dropping a required identity/status field.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- 'src/app/(app)/members/page.test.tsx'
```

Expected: FAIL because contact, group, and joined date still render and meta values include verbose labels.

- [ ] **Step 3: Implement the compact member row**

Remove `Badge`, contact, group, and joined-date rendering. Render:

```tsx
<h3>{member.name}</h3>
<div className={styles["member-mobile-meta"]}>
  <span>{member.memberCode}</span>
  <span>{formatMemberPosition(member)}</span>
  <span>{formatMemberDirectoryKind(member)}</span>
  <span>{formatMemberStatus(member.status)}</span>
</div>
```

Keep the permission-gated edit link.

- [ ] **Step 4: Implement shared phone toolbar rules**

In the existing phone media query:

- set `.filter-bar` to a one-column grid with 24px horizontal padding and 12px vertical gap;
- give form fields, controls, submit buttons, and action links `width: 100%` where they are direct filter children;
- keep `.tabs` horizontal and 56px tall;
- let `.panel-header` wrap while keeping title and actions visible;
- set `.management-page`, `.management-list`, and data-panel descendants to `min-width: 0`.

Use the Figma sizes already represented by `--spacing-24`, `--spacing-12`, `--text-body-size`, and existing 56px tokens.

- [ ] **Step 5: Flatten member list SCSS**

Use zero outer gap, 24px horizontal/12px vertical item padding, a bottom hairline, 17px title tokens, 13px wrapping metadata, and `min-width: 0`. Do not add card radius or shadow.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm test -- 'src/app/(app)/members/page.test.tsx' src/components/molecules/molecules.test.tsx src/components/templates/templates.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(app)/members/page.test.tsx' src/features/members/MemberMobileList.tsx src/features/members/MemberMobileList.module.scss src/components/molecules/Molecules.module.scss src/components/atoms/Button.module.scss src/components/atoms/FormControls.module.scss src/components/templates/Templates.module.scss
git commit -m "feat(members): compact the mobile directory"
```

### Task 3: Compact fee and meeting mobile lists

**Files:**
- Modify: `src/app/(app)/fees/page.test.tsx`
- Modify: `src/features/fees/FeeMobileList.tsx`
- Modify: `src/features/fees/FeeMobileList.module.scss`
- Modify: `src/features/meetings/MeetingMobileList.test.tsx`
- Modify: `src/features/meetings/MeetingMobileList.module.scss`
- Modify: `src/app/(app)/meetings/page.module.scss`

**Interfaces:**
- Consumes: existing fee and meeting list props and server actions.
- Produces: flat, wrapping, width-safe list items without changing action payloads.

- [ ] **Step 1: Write failing fee and meeting tests**

For fees, assert the mobile item keeps member code, payment status, amount, payment date, payment action, and note action while omitting the operator/general badge text.

For meetings, add a long title/location fixture and assert the real rendered item still exposes roster and lifecycle actions; the SCSS change will be guarded by browser overflow verification rather than source-text assertions.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- 'src/app/(app)/fees/page.test.tsx' src/features/meetings/MeetingMobileList.test.tsx
```

Expected: fee test FAIL because the mobile list still renders the member-kind badge.

- [ ] **Step 3: Implement compact fee rows**

Remove the nonessential member-kind badge. Render member code and payment status in a wrapping metadata line, retain amount/date, payment mutation forms, and note controls. Convert the outer list and items to flat divider rows.

- [ ] **Step 4: Harden meeting overflow**

Add `min-width: 0`, `max-width: 100%`, `overflow-wrap: anywhere`, and `flex-wrap: wrap` to meeting headers, metadata, detail values, roster links, action containers, and lifecycle controls. Replace mobile card borders/radii with flat dividers.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- 'src/app/(app)/fees/page.test.tsx' src/features/meetings/MeetingMobileList.test.tsx 'src/app/(app)/meetings/page.test.tsx'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(app)/fees/page.test.tsx' src/features/fees/FeeMobileList.tsx src/features/fees/FeeMobileList.module.scss src/features/meetings/MeetingMobileList.test.tsx src/features/meetings/MeetingMobileList.module.scss 'src/app/(app)/meetings/page.module.scss'
git commit -m "feat: prevent mobile fee and meeting overflow"
```

### Task 4: Expense mobile list

**Files:**
- Create: `src/features/expenses/ExpenseMobileList.tsx`
- Create: `src/features/expenses/ExpenseMobileList.module.scss`
- Create: `src/features/expenses/ExpenseMobileList.test.tsx`
- Modify: `src/app/(app)/expenses/page.tsx`
- Create: `src/app/(app)/expenses/page.module.scss`
- Modify: `src/app/(app)/expenses/page.test.tsx`

**Interfaces:**
- Consumes: `expenses: ExpenseRecord[]` and `deleteAction: NonNullable<ComponentProps<"form">["action"]>`.
- Produces: `ExpenseMobileList({ expenses, deleteAction })`.
- Preserves: receipt URL `/expenses/receipts?key=<encoded>`, edit URL `/expenses/<id>/edit`, and delete form field `expenseId`.

- [ ] **Step 1: Write the failing component test**

Render a real `ExpenseMobileList` fixture and assert:

```tsx
const list = screen.getByRole("list", { name: "모바일 지출 목록" });
expect(within(list).getByRole("heading", { name: "코트 대관" })).toBeInTheDocument();
expect(within(list).getByText("2026.07.03")).toBeInTheDocument();
expect(within(list).getByText("코트")).toBeInTheDocument();
expect(within(list).getByText("120,000원")).toBeInTheDocument();
expect(within(list).getByRole("link", { name: "영수증 보기" })).toHaveAttribute(
  "href",
  "/expenses/receipts?key=expenses%2Foperator%2Freceipt.jpg",
);
expect(within(list).getByRole("link", { name: "수정" })).toHaveAttribute(
  "href",
  "/expenses/expense-1/edit",
);
expect(within(list).getByRole("button", { name: "삭제" })).toBeInTheDocument();
expect(within(list).queryByText("야간 경기 메모")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- src/features/expenses/ExpenseMobileList.test.tsx
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `ExpenseMobileList`**

Use existing `ActionLink`, `Button`, `formatCurrency`, and `formatExpenseCategory`. Render a flat `<ul>` with the exact receipt-state branches already used by the table. Do not render `memo`.

- [ ] **Step 4: Add page integration RED test**

In `expenses/page.test.tsx`, assert that `월별 지출 목록` contains both the desktop table and `모바일 지출 목록` using the same fixture and that the mobile list preserves the receipt/edit/delete actions.

- [ ] **Step 5: Run page test and verify RED**

Run:

```bash
npm test -- 'src/app/(app)/expenses/page.test.tsx'
```

Expected: FAIL because the page has no mobile list.

- [ ] **Step 6: Integrate desktop/mobile wrappers**

Wrap the existing table in `.expenses-table-view`, add `.expenses-mobile-list-view`, pass `sortedExpenses` and `deleteExpense`, and switch display at the phone breakpoint.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/features/expenses/ExpenseMobileList.test.tsx 'src/app/(app)/expenses/page.test.tsx'
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/expenses/ExpenseMobileList.tsx src/features/expenses/ExpenseMobileList.module.scss src/features/expenses/ExpenseMobileList.test.tsx 'src/app/(app)/expenses/page.tsx' 'src/app/(app)/expenses/page.module.scss' 'src/app/(app)/expenses/page.test.tsx'
git commit -m "feat(expenses): add a mobile expense list"
```

### Task 5: Settlement category mobile list

**Files:**
- Create: `src/features/settlements/SettlementCategoryMobileList.tsx`
- Create: `src/features/settlements/SettlementCategoryMobileList.module.scss`
- Create: `src/features/settlements/SettlementCategoryMobileList.test.tsx`
- Modify: `src/app/(app)/settlements/page.tsx`
- Create: `src/app/(app)/settlements/page.module.scss`
- Modify: `src/app/(app)/settlements/page.test.tsx`

**Interfaces:**
- Consumes: `rows: SettlementExpenseCategoryRow[]`.
- Produces: `SettlementCategoryMobileList({ rows })`.

- [ ] **Step 1: Write the failing component test**

Render literal rows and assert:

```tsx
const list = screen.getByRole("list", { name: "모바일 카테고리별 지출" });
expect(within(list).getByRole("heading", { name: "코트" })).toBeInTheDocument();
expect(within(list).getByText("2건")).toBeInTheDocument();
expect(within(list).getByText("120,000원")).toBeInTheDocument();
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- src/features/settlements/SettlementCategoryMobileList.test.tsx
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the component**

Use `formatExpenseCategory` and `formatCurrency`. Render category as the heading and count/amount as wrapping metadata.

- [ ] **Step 4: Add page integration RED test**

Assert the category panel contains `모바일 카테고리별 지출` in the same sorted order as the desktop table.

- [ ] **Step 5: Run page test and verify RED**

Run:

```bash
npm test -- 'src/app/(app)/settlements/page.test.tsx'
```

Expected: FAIL because no mobile list is integrated.

- [ ] **Step 6: Integrate desktop/mobile wrappers**

Wrap the existing table and new list in page-specific view containers and switch them at the phone breakpoint without changing sorting or empty state behavior.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/features/settlements/SettlementCategoryMobileList.test.tsx 'src/app/(app)/settlements/page.test.tsx'
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/settlements/SettlementCategoryMobileList.tsx src/features/settlements/SettlementCategoryMobileList.module.scss src/features/settlements/SettlementCategoryMobileList.test.tsx 'src/app/(app)/settlements/page.tsx' 'src/app/(app)/settlements/page.module.scss' 'src/app/(app)/settlements/page.test.tsx'
git commit -m "feat(settlements): add a mobile category list"
```

### Task 6: Full verification and browser overflow QA

**Files:**
- Modify: `docs/WORK_LOG.md`

**Interfaces:**
- Consumes: completed responsive shell and all mobile lists.
- Produces: fresh automated and browser evidence.

- [ ] **Step 1: Run related tests**

```bash
npm test -- src/features/shell/AppShell.test.tsx 'src/app/(app)/layout.test.tsx' 'src/app/(app)/members/page.test.tsx' 'src/app/(app)/fees/page.test.tsx' 'src/app/(app)/expenses/page.test.tsx' 'src/app/(app)/settlements/page.test.tsx' 'src/app/(app)/meetings/page.test.tsx' src/features/members src/features/fees src/features/expenses src/features/settlements src/features/meetings
```

- [ ] **Step 2: Run full static verification**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

Every command must exit 0 before claiming completion.

- [ ] **Step 3: Run authenticated browser QA**

At 375×812 and 402px widths, inspect `/members`, `/fees`, `/expenses`, `/settlements`, and `/meetings`:

```js
({
  innerWidth: window.innerWidth,
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
})
```

Require all three widths to match. Confirm the desktop table is hidden, the mobile list is visible, essential actions are not clipped, the account menu stays within the viewport, and only the primary navigation can scroll horizontally.

At 1440×900, confirm the desktop header, sidebar, user bar, and tables remain visible.

- [ ] **Step 4: Record evidence**

Append a dated `2026-07-27` section to `docs/WORK_LOG.md` listing only verification actually completed. Do not claim browser QA if authentication or browser startup blocks it.

- [ ] **Step 5: Commit verification documentation**

```bash
git add docs/WORK_LOG.md
git commit -m "docs: record mobile UI verification"
```
