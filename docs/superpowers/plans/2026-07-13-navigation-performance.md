# Navigation Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce authenticated navigation latency by collapsing member and permission queries, streaming dynamic routes immediately, colocating Vercel Functions with Supabase, and removing per-navigation Auth server validation.

**Architecture:** Add two authenticated, additive Supabase RPCs: one for request-scoped operator context and one for the complete member page payload. Keep mutable business data uncached across requests, but memoize operator context within a render request. Use a shared App Router loading boundary, `icn1` Vercel Functions, and Supabase `getClaims()` in Proxy.

**Tech Stack:** Next.js 16.2 App Router, React 19 `cache`, TypeScript, Supabase Postgres/RPC/SSR, SCSS Modules, Vitest, Vercel.

## Global Constraints

- Preserve existing RLS, active-operator checks, direct-route authorization, and contact masking.
- New database changes are additive and grant execution only to `authenticated`.
- Never use `getSession()` for server authorization.
- Do not cache operator or business data across requests.
- Use SCSS design tokens and kebab-case class names.
- Follow RED→GREEN for every runtime change.

---

### Task 1: Consolidate current-operator permissions

**Files:**
- Create: `supabase/migrations/202607130001_optimize_navigation_queries.sql`
- Create: `src/features/auth/operator-context.ts`
- Create: `src/features/auth/operator-context.test.ts`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/members/new/page.tsx`
- Modify: `src/app/(app)/members/[id]/edit/page.tsx`
- Modify: corresponding page tests

**Interfaces:**
- SQL: `public.get_current_operator_context() returns jsonb`.
- TypeScript: `loadCurrentOperatorContext(): Promise<OperatorContext | null>`.
- TypeScript: `currentOperatorHasPermission(permission): Promise<boolean>`.

- [ ] Write migration contract tests that require `security definer`, fixed `search_path`, `auth.uid()`, active profile filtering, permission aggregation, authenticated-only grant, and public/anon revoke.
- [ ] Run the migration contract test and verify RED.
- [ ] Add the SQL function and verify GREEN.
- [ ] Write operator-context tests for one `rpc("get_current_operator_context")` call, normalized permissions, null fallback, and request memoization.
- [ ] Implement the cached loader and permission helper.
- [ ] Replace layout and member create/edit permission lookups with the shared loader; update tests and verify focused suites.

### Task 2: Collapse the member page into one RPC

**Files:**
- Modify: `supabase/migrations/202607130001_optimize_navigation_queries.sql`
- Modify: `src/features/members/member-directory.ts`
- Modify: `src/features/members/member-directory.test.ts`
- Modify: `src/app/(app)/members/page.tsx`
- Modify: `src/app/(app)/members/page.test.tsx`

**Interfaces:**
- SQL: `public.get_member_directory_page(requested_status text, requested_query text) returns jsonb`.
- TypeScript: `loadMemberDirectoryPage(input): Promise<{ members; canCreate; canUpdate; canManageContacts }>`.

- [ ] Add failing SQL contract tests for active-operator enforcement, permission booleans, contact masking/full-contact branch, member/group/position joins, name/member-code search, and authenticated-only execution.
- [ ] Add failing loader/page tests asserting exactly one RPC and no separate `hasCurrentUserPermission` calls.
- [ ] Implement the SQL RPC and TypeScript mapper, preserving phone formatting and member sorting.
- [ ] Update the member page to consume the single payload and verify desktop/mobile, search, tabs, sorting, contact masking, and management-link tests.

### Task 3: Add an authenticated route loading boundary

**Files:**
- Create: `src/app/(app)/loading.tsx`
- Create: `src/app/(app)/loading.module.scss`
- Create: `src/app/(app)/loading.test.tsx`

**Interfaces:**
- Produces a static, data-free loading UI under the existing AppShell.

- [ ] Write a failing test requiring accessible `페이지 불러오는 중` status text and data-free skeleton structure.
- [ ] Implement the loading component and SCSS using existing tokens plus reduced-motion handling.
- [ ] Verify loading tests and the existing scroll-layout/design-token tests.

### Task 4: Colocate Vercel Functions in Seoul

**Files:**
- Create: `vercel.json`
- Create: `src/app/vercel-region.test.ts`

**Interfaces:**
- Vercel configuration: `{ "regions": ["icn1"] }`.

- [ ] Write a failing test that reads `vercel.json` and requires the sole region `icn1`.
- [ ] Add the minimal configuration and verify the test.

### Task 5: Replace Proxy `getUser()` with `getClaims()`

**Files:**
- Modify: `src/lib/supabase/proxy.ts`
- Modify: `src/proxy.ts`
- Create: `src/lib/supabase/proxy.test.ts`
- Modify: `src/proxy.test.ts`

**Interfaces:**
- `updateSession(request)` returns `{ response, userId: string | null }`.

- [ ] Write failing tests for valid `sub`, missing `sub`, claim error, cookie propagation, zero `getUser()` calls, protected redirect, and authenticated login redirect.
- [ ] Implement `getClaims()` validation and return only `userId`, not an unneeded full user object.
- [ ] Verify proxy-focused tests and ensure `getSession()` is absent from server authorization code.

### Task 6: Verify request memoization and measure the final call budget

**Files:**
- Create: `scripts/measure-navigation-performance.mjs`
- Modify: `.context/compound-engineering/ce-optimize/navigation-latency/experiment-log.yaml`
- Modify: `docs/WORK_LOG.md`

**Interfaces:**
- Measurement command prints JSON with `member_page_supabase_calls`, `proxy_get_user_calls`, `proxy_get_claims_calls`, `loading_boundary`, `vercel_icn1`, and `required_tests_passed`.

- [ ] Run the measurement harness before changes and record the baseline.
- [ ] Run focused tests for operator context, member directory/page, loading, region, and proxy.
- [ ] Run the harness after implementation and require member calls `<= 1`, proxy `getUser == 0`, proxy `getClaims == 1`, loading boundary `== 1`, Seoul region `== 1`, tests `== 1`.
- [ ] Run `npm run test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- [ ] Apply the additive Supabase migration, verify both RPCs exist, deploy the branch, and remeasure authenticated production navigation.
- [ ] Record results and operational caveats in `docs/WORK_LOG.md`.
