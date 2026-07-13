# Table Header Sort Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two arrow controls in every sortable table header with one clickable header label whose arrow reflects and toggles the current sort direction.

**Architecture:** Keep the existing URL-based sorting and page integrations unchanged. Update the shared `SortableTableHeader` to derive its displayed state and next direction from `sortState`, then adjust its colocated SCSS so the label and arrow form one link.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript, SCSS Modules, Vitest, Testing Library

## Global Constraints

- Apply the interaction to all tables that use `SortableTableHeader`.
- Inactive sortable columns display `↕` and sort ascending when clicked.
- Active sortable columns display `↑` or `↓` and toggle direction when clicked.
- Preserve all existing URL search parameters other than `sort` and `direction`.
- Use existing tokens from `src/app/globals.scss`; use meaningful kebab-case SCSS Module names.
- Read relevant Next.js documentation from `node_modules/next/dist/docs/` before changing code.

---

### Task 1: Shared sortable table header interaction

**Files:**
- Modify: `src/components/organisms/SortableTableHeader.test.tsx`
- Modify: `src/components/organisms/SortableTableHeader.tsx`
- Modify: `src/components/organisms/Organisms.module.scss`

**Interfaces:**
- Consumes: `buildSortHref(pathname, params, key, direction)` and `SortState<TKey>` from `table-sort.ts`.
- Produces: one accessible Next.js `Link` per sortable header, with the next direction in `href` and current direction in `aria-sort`.

- [ ] **Step 1: Write the failing component tests**

Replace the existing two-link assertion with three focused tests. Assert that an active ascending header renders one `회원번호 내림차순 정렬` link, `회원번호 ↑`, `aria-current="true"`, `aria-sort="ascending"`, and a descending URL. Assert that an active descending header renders `↓` and an ascending URL. Assert that an inactive header renders `↕`, omits `aria-current` and `aria-sort`, and links to ascending sorting while preserving filters.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/components/organisms/SortableTableHeader.test.tsx`

Expected: FAIL because the current component renders separate ascending and descending links and has no `aria-sort` state.

- [ ] **Step 3: Implement the single-link toggle**

In `SortableTableHeader.tsx`, compute:

```tsx
const isActive = sortState.key === sortKey;
const nextDirection = isActive && sortState.direction === "asc" ? "desc" : "asc";
const symbol = isActive ? (sortState.direction === "asc" ? "↑" : "↓") : "↕";
const nextDirectionLabel = nextDirection === "asc" ? "오름차순" : "내림차순";
```

Render one `Link` containing separate label and `aria-hidden` symbol spans. Put `aria-sort={isActive ? (sortState.direction === "asc" ? "ascending" : "descending") : undefined}` on the `th`, and point the link to `buildSortHref(..., nextDirection)`.

- [ ] **Step 4: Update shared SCSS**

Remove the obsolete `.sort-controls` layout. Make `.sort-link` an inline flex link with `gap: var(--spacing-xs)`, `min-height: var(--button-compact-height)`, inherited header color and font, and no text decoration. Keep `.sort-link-active` limited to the active color and use a `.sort-direction-indicator` class for the muted inactive arrow.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `npm test -- src/components/organisms/SortableTableHeader.test.tsx src/components/organisms/table-sort.test.ts`

Expected: both test files PASS with no warnings.

- [ ] **Step 6: Run regression verification**

Run: `npm test`

Expected: all Vitest tests PASS.

Run: `npm run lint`

Expected: ESLint exits successfully with no errors.

Run: `npm run build`

Expected: Next.js production build exits successfully.

- [ ] **Step 7: Record project context**

Append a dated entry to `docs/WORK_LOG.md` stating that all shared sortable table headers now use a single label link with neutral and active directional arrows, and list the focused test, full test suite, lint, and build results.

