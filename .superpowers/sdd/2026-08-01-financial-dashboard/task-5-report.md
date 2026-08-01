# Task 5 Report: Controlled Failure and Whole-Experience Verification

## Status

Complete from base `0f9eb8b`. The SDD installation has no `report-task` script, so this report was written directly in the same format as the earlier task reports, as directed by the controller.

The code, fixture-based responsive/state QA, comparison artifact, durable project records, and production build are complete. Dashboard RPC deployment and production-data QA remain explicitly gated.

## Implemented scope

- Added the `/dashboard` route error boundary as a Client Component.
- Rendered safe Korean copy, omitted the raw error message, and wired the existing shared `Button` to the supplied `reset()` callback.
- Added a boundary test covering safe copy, raw-message absence, and exactly one reset call.
- Added the deferred blocked route-composition regression proving member context, two controlled blocked presentations, latest final, current-month settlement link, and latest-final settlement link remain together.
- Scoped current-finance divider selectors away from the five-column latest-final grid and added a style regression.
- Fixed a browser-discovered grid sizing bug that clipped the entire current-finance body to 2 px by making implicit dashboard rows `max-content`.
- Restored the approved compact two-column current/latest-final metric density at phone width and corrected responsive latest-final dividers.
- Added project-root `design-qa.md`, combined source/implementation evidence, desktop/mobile screenshots, live controlled-error evidence, and first-ledger/no-final/blocked fixture captures.
- Marked the deferred dashboard implementation complete and added explicit dashboard RPC deployment/production-QA gates to the checklist and work log.

## TDD evidence

1. Boundary RED: `npm run test -- 'src/app/(app)/dashboard/error.test.tsx'` failed because `./error` did not exist.
2. Boundary GREEN: after minimal implementation, the boundary test passed.
3. Divider RED: the style regression failed because current and latest-final grids lacked separately scoped selectors. The selector fix made it pass.
4. Browser clipping RED: after the first visual comparison showed a 2 px current-finance row, a stylesheet regression failed without content-sized implicit rows. `align-content: start` plus `grid-auto-rows: max-content` made it pass and browser measurements confirmed 203 px desktop / 380 px final mobile finance panels.
5. Mobile-density RED: the phone regression failed while both metric grids collapsed to one column. The two-column responsive correction made it pass and the browser measured two 186.5 px columns at 375 px viewport width.
6. The blocked route test filled a deferred coverage gap and passed against the already-correct composition; it did not require a production behavior change.

## Automated verification

- `npm run test -- src/features/dashboard 'src/app/(app)/dashboard'` — 8 files, 48 tests passed.
- `npm run test` — 109 files, 758 tests passed.
- `npm run lint` — exit 0, no warnings or errors printed.
- `npx tsc --noEmit` — exit 0.
- `git diff --check` — exit 0 before records/staging; rerun after final records is part of the commit gate.
- Final environment-backed `npm run build` — Next.js 16.2.10 Turbopack compiled in 3.0s, TypeScript finished in 3.2s, 26/26 static pages generated, exit 0.
- An earlier sandboxed build stalled for more than 90 seconds at optimization and was stopped; it was not counted as a pass. The same build with required external access passed, as did the final build.

## Browser and design QA evidence

- Browser: authenticated Codex in-app browser session.
- Desktop: exact 1440 × 900 CSS viewport, DPR 1. Document `scrollWidth/clientWidth` was 1440/1440. Charts measured 560 × 216. Required section order, finance emphasis, provisional treatment, correct settlement and exact-snapshot links, five latest-final metric columns, and no closer identity were verified. Fresh-tab console errors: 0.
- Mobile: exact 375 × 812 CSS viewport, DPR 1. Document and dashboard widths were 375/375. Charts measured 341 × 132 with visible month labels. Current metrics measured two 186.5 px columns. Fresh-tab console errors: 0.
- First-ledger/no-final fixture: only the July current point rendered, the link was `/settlements?month=2026-07`, and the no-final message rendered. Console errors: 0.
- Blocked fixture: member summary, both `계산 대기` contexts, the concrete prior-final reason, latest final, both settlement links, and exact-snapshot PDF link rendered together. Console errors: 0.
- Live authenticated route: because the dashboard RPC is not deployed, the request failed and the controlled error boundary rendered. The screenshot and handled error are retained as deployment-gate evidence.
- Source/implementation evidence was captured at identical available/provisional desktop and mobile states and placed in `design-qa-assets/dashboard-comparison-board.png`. `design-qa.md` records both fix iterations and `final result: passed`.
- The approved HTML lacks `<meta charset="utf-8">`, so Korean text is mojibake in source screenshots. Raw source copy was inspected directly; implementation Korean renders correctly.
- All temporary aggregate fixture edits were fully reverted. `git diff -- src/features/dashboard/dashboard-data.ts` is empty.

## Database verification scope

- `supabase/migrations/202608010001_add_dashboard_page.sql` was not applied locally or to production.
- No production database verification was performed or claimed.
- Static SQL/parser/loader tests cover the aggregate contract, but actual response equality with the settlement preview, final-only trend selection, PII/detail omission, and inactive/anonymous rejection remain deployment gates.

## Files included

- `src/app/(app)/dashboard/error.tsx`
- `src/app/(app)/dashboard/error.test.tsx`
- `src/app/(app)/dashboard/page.module.scss`
- `src/app/(app)/dashboard/page.test.tsx`
- `src/app/(app)/dashboard/page-styles.test.ts`
- `design-qa.md`
- `design-qa-assets/*`
- `docs/PROJECT_CHECKLIST.md`
- `docs/WORK_LOG.md`
- `.superpowers/sdd/2026-08-01-financial-dashboard/task-5-report.md`

## Residual concerns

- Apply the dashboard RPC only after prerequisite migration and deployment gates in a rollback-capable environment.
- Repeat authenticated active-operator, inactive-operator, anonymous, payload-privacy, preview-equality, final-only trend, network, and production responsive checks after deployment.
- The deferred chart-only rendered negative/zero/zero-crossing regression remains unchanged because Task 5 did not modify chart geometry.
