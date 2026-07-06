# JW Tennis Club SaaS Work Log

## 2026-07-02

### Completed
- Added Apple design guide as `DESIGN-apple.md`.
- Defined the product as an internal SaaS ledger for tennis club operators.
- Documented the main goals: member management, membership fee management, expenses, schedules, monthly settlement, and PDF reporting.
- Implemented the foundation branch with Supabase auth, role-based access foundations, app shell, login flow, dashboard, tests, and migration SQL.
- Added Supabase migration at `supabase/migrations/202607020001_foundation.sql`.
- Added environment validation for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Merged the foundation work into `main`.
- Removed the temporary `.worktrees/foundation` Git worktree and related metadata.
- Ran `npm install` in the main workspace after merging.
- Verified the merged foundation with test, lint, typecheck, and build commands.
- Pushed `main` to GitHub.
- Created local `.env.local` with Supabase project URL and anon key.
- Confirmed Supabase `roles` and `profiles` tables exist.
- Registered the initial admin profile in Supabase.
- Named Supabase SQL Editor queries:
  - `001_foundation_schema_and_roles`
  - `002_seed_initial_admin_profile`
- Converted app styles from CSS to SCSS.
- Added `sass` as a dev dependency.
- Renamed CSS Module classes to kebab-case hyphen names.
- Corrected the style naming rule to avoid arbitrary prefixes and keep meaningful hyphen class names such as `shell-nav-link`.
- Added the SCSS token usage rule: use `src/app/globals.scss` tokens and `src/app/_breakpoints.scss` variables before introducing hardcoded style values.
- Added a protected password change flow at `/settings/password` with current-password verification, a shell action link before logout, and forced re-login after a successful password update.
- Removed the dashboard hero section for now; dashboard cleanup is deferred until the main operational features are implemented.
- Revised the foundation UI design before starting member management.

### Verification Evidence
- `npm run test`: 7 files passed, 33 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Production build output included `Proxy (Middleware)`.
- SCSS conversion verification passed with test, lint, typecheck, and build.
- Password change flow verification passed with `npm run test` and `npm run build`.
- Dashboard hero removal verification passed with `npm run test` and `npm run build`.

### Product Decisions
- The service is for tennis club operators.
- General members may receive monthly PDF reports, but they are not the primary app users yet.
- Fee payment method selection is unnecessary because payments are managed as bank transfers.
- Admin and operator roles can have multiple users.
- Admins and operators are still tennis club members. They should also exist in the member list and be treated the same as other members for membership fees.
- Admin/operator profiles should automatically create linked member records so operators are not missed in monthly fee tracking.
- Role permission editing must be supported later.
- Member records should include join date and withdrawal date.
- Any operator can generate monthly PDFs.
- A monthly PDF for a completed month becomes available on the 1st day of the next month.

### Technical Decisions
- Supabase Auth is used for login and session management.
- Supabase Postgres is used for app data.
- `roles`, `role_permissions`, and `profiles` provide the permission foundation.
- The first admin is registered manually through SQL because the app does not yet have an operator management screen.
- Operator login profiles and member records are linked through `members.operator_profile_id`.
- Added migration `202607030004_auto_add_operator_members.sql` to backfill existing profiles into members, auto-create members after new profile inserts, and sync member names when profile display names change.
- Added a member-list kind column that distinguishes linked operator members from general members using `members.operator_profile_id`.
- Member and fee-board lists now keep operator members above general members and order operators by club position: president, match director, treasurer, assistant treasurer.
- Added the same operator/general member kind column to the fee board.
- `.env.local` is not committed because `.env*` is ignored.
- `src/proxy.ts` is the correct Next.js proxy location for this project structure.
- Style files use `.scss` and `.module.scss`.
- CSS Module class names use kebab-case hyphen names and TSX bracket access.
- SCSS should use existing design tokens and breakpoint variables first; new hardcoded values should become meaningful tokens before use.

### Issues And Lessons
- The temporary worktree was useful for isolating the foundation implementation, but it confused project location until merged back into `main`.
- Deleting `.worktrees/foundation` failed at first because Windows permissions and Next build cache files blocked removal.
- Next telemetry Node processes may keep files under `.next` active after verification.
- Removing a worktree may require deleting both the worktree folder and `.git/worktrees/<name>` metadata when Git cannot prune it.
- Verification must be run from the final `main` workspace, not only from a temporary worktree.

## 2026-07-03

### Completed
- Defined the member data model with `active`, `paused`, and `withdrawn` statuses, joined and withdrawn dates, optional phone last-four digits, optional withdrawal reason, a stable UUID key for future fee record references, permission-based RLS, and lifecycle validation helpers.
- Implemented the member list screen at `/members` with Supabase-backed loading, name or phone-last-four search, status filters, table display, and empty state.
- Implemented member create and edit flows, including single-member registration and CSV member import.
- Executed the Supabase member schema query in SQL Editor.
- Verified the member screen flow with the operator account: login, member list, single-member registration, search, edit, withdrawal status, withdrawal date, and withdrawal reason.
- Marked member management complete; CSV import execution remains deferred until a real CSV file is available.
- Implemented the fee payment tracking code path with:
  - Supabase migration `202607030003_add_fee_payments.sql`
  - `fee_payments` table model with one payment per member per month
  - permission-based RLS for fee payment view/create/update/delete
  - `/fees` monthly fee board, filters, summary cards, and unpaid count
  - `/fees/new` active-member payment registration flow
  - fee model, form, list, and page tests
- Revised the fee UX from a separate payment-record list into a monthly member checklist:
  - Default monthly fee amount changed to 30,000 KRW.
  - `/fees` now shows target members for the selected month.
  - Paid/unpaid status is visible per member row.
  - Unpaid rows can be processed inline with a single `납부 처리` action.
- Executed the Supabase fee payment schema query in SQL Editor.
- Implemented fee payment cancellation handling from paid rows on the monthly fee board.
- Implemented fee payment CSV upload from `/fees/new` using `name`, `phoneLastFour`, `periodMonth`, `amount`, `paidDate`, and `memo` columns.
- Changed `/fees/new` into a CSV-only import page and updated `/fees` to link to it as `CSV 등록`.
- Marked membership fee management complete after schema execution, browser fee-flow verification, inline payment processing, cancellation handling, and CSV upload implementation.
- Implemented expense record management with:
  - Supabase migration `202607030005_add_expenses.sql`
  - `expenses` table model with category, date, amount, receipt, memo, and audit fields
  - permission-based RLS for expense view/create/update/delete
  - `/expenses` monthly expense list, category filter, summary cards, and empty state
  - `/expenses/new` expense registration flow
  - expense model, form, list, action, and page tests
- Marked expense management complete after local verification.
- Implemented Cloudflare R2-backed expense receipt attachments:
  - Added R2 S3-compatible upload/download helpers.
  - Added optional JPG, PNG, WebP, and PDF upload to `/expenses/new`.
  - Added private receipt object metadata columns through `202607030006_add_expense_receipts_r2.sql`.
  - Added `/expenses/receipts` authenticated signed-download route.
  - Raised Next server action body size limit to 10MB for receipt uploads.
  - Added `.env.example` entries for Cloudflare R2 credentials.
- Added expense deletion from the `/expenses` table. Deleting an expense removes the database row first, then best-effort deletes the attached R2 receipt object.
- Added expense editing:
  - `/expenses/[id]/edit` loads existing expense values.
  - `/expenses` rows now include a `수정` link next to `삭제`.
  - Updating an expense can replace the receipt file; the database is updated to the new R2 object and the old object is deleted best-effort after a successful save.
- Removed the manual `증빙 있음` checkbox from expense forms. Receipt state is now derived from an attached receipt file.
- Added a receipt deletion button on the expense edit form. Removing a receipt clears receipt metadata and best-effort deletes the R2 object after a successful save.
- Executed the Supabase expense receipt metadata query in SQL Editor.
- Configured Cloudflare R2 receipt bucket credentials in local `.env.local`.
- Verified receipt attachment locally through `/expenses/new` and confirmed the receipt link appears in `/expenses`.

### Verification Evidence
- `npm run test -- src/features/members/member-model.test.ts`: 1 file passed, 8 tests passed.
- `npm run test`: 8 files passed, 41 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Supabase SQL Editor member schema query: completed.
- Browser verification: `/members`, `/members/new`, single-member create, search, edit, and withdrawn filter passed using verification member `Verify463463`.
- CSV import screen rendered, but CSV upload execution is deferred until a real CSV file is available.
- Fee payment focused tests: 4 files passed, 15 tests passed.
- `npm run test`: 17 files passed, 72 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Supabase SQL Editor fee payment schema query: completed.
- Browser verification: `/fees`, `/fees/new`, and inline `납부 처리` passed with an operator account.
- Fee payment cancellation tests: action deletion and paid-row cancel button passed.
- Fee payment CSV upload tests: CSV parser, CSV upload form rendering, and bulk import action passed.
- `npm run test`: 19 files passed, 83 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- Expense management focused tests: 6 files passed, 9 tests passed.
- `npm run test`: 25 files passed, 92 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Expense receipt attachment focused tests: 8 files passed, 14 tests passed.
- `npm run test`: 28 files passed, 101 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Expense deletion tests: action deletion and table delete button passed.
- `npm run test`: 28 files passed, 102 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- Expense editing tests: update action, receipt replacement, edit page, and list edit link passed.
- `npm run test`: 29 files passed, 105 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- Receipt deletion button and proof-checkbox removal tests passed.
- `npm run test`: 29 files passed, 106 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- Supabase SQL Editor expense receipt metadata query: completed.
- Local browser verification: expense receipt attachment and list receipt link passed.

## 2026-07-04

### Completed
- Designed the schedule management feature with month and week calendar views.
- Implemented Supabase event permissions and migration SQL for `events`.
- Implemented event form parsing, validation, and database input mapping.
- Implemented month and week calendar builders with date grouping, time sorting, three-event month previews, and `+N개` overflow counts.
- Implemented schedule create, update, and delete server actions.
- Implemented `/schedule/new` and `/schedule/[id]/edit` event form pages.
- Implemented `/schedule` month/week calendar UI:
  - Month view shows time and event title only.
  - Month date cells show up to three events.
  - Overflow events are represented as `+N개`.
  - Selected-date details show all events with location and management actions.
  - Week view shows all events for each day with location.

### Verification Evidence
- Baseline before schedule implementation: `npm run test` passed with 29 files and 106 tests.
- Schedule focused tests: `npm run test -- src/features/events src/app/\(app\)/schedule` passed with 6 files and 14 tests.
- Full test suite: `npm run test` passed with 35 files and 121 tests.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.

### Pending Verification
- Supabase SQL Editor event schedule schema query: completed.
- Supabase REST check for `public.events` returned 200 with an empty result set after the schema query was executed.
- Browser verification for schedule create/edit/delete is pending because unauthenticated `/schedule` requests correctly redirect to `/login`.

## 2026-07-05

### Completed
- Verified the schedule management screen flow in browser with an authenticated operator session.
- Implemented member list tabs for `활동`, `휴회`, and `탈퇴`.
- Changed member list status filtering from a dropdown with `전체` to URL-backed status tabs.
- Kept member search within the selected status tab by submitting the current `status` as a hidden form value.
- Defaulted missing or unsupported member `status` query parameters to `active`.
- Implemented the monthly settlement summary page at `/settlements`.
- Added read-only monthly settlement calculations from existing `fee_payments` and `expenses` data:
  - income total from fee payments in the selected month
  - expense total from expenses in the selected month
  - settlement balance as income minus expenses
  - fee payment and expense counts
  - expense totals grouped by category
- Implemented monthly PDF report generation:
  - Added `PDF 다운로드` to `/settlements` for the selected settlement month.
  - Added `/reports/monthly?month=YYYY-MM` as an authenticated PDF download route.
  - Changed `/reports` to redirect to `/settlements` so PDF generation stays inside the settlement workflow.
  - Added a member-facing PDF template with Korean font support through `@react-pdf/renderer` and `@fontsource/noto-sans-kr`.
  - Included income total, expense total, monthly balance, payment and expense counts, expense category totals, major expense rows, generation date, and generator name.
  - Excluded individual payment records, unpaid member names, receipt links/files, and internal expense memos from the PDF.
  - Current PDF generation uses live monthly fee and expense data because monthly closing snapshots are not implemented yet.
- Removed the unused `설정` item from the primary navigation while keeping the `비밀번호 변경` account action.
- Removed the separate `PDF` primary navigation item because PDF download is part of the settlement flow.
- Introduced an atomic UI component structure under `src/components`:
  - atoms for buttons, action links, badges, and form controls
  - molecules for filters, tabs, summaries, form fields, form grids, CSV upload fields, form messages, row actions, and table scroll areas
  - organisms for page headers, data panels, data tables, and form panels
  - templates for management pages and form pages
- Refactored repeated member, fee, expense, schedule, settlement, and password-change page structures to use the shared atomic UI components.
- Moved the schedule calendar UI into `src/features/events/ScheduleCalendar.tsx` with focused tests.
- Stabilized the monthly report PDF render test by giving the renderer-specific test a longer timeout because font/PDF initialization can exceed the default timeout under full-suite load.
- Reused shared schedule UI patterns:
  - selected-date empty schedule state now uses the shared `EmptyState`
  - schedule event actions now use the shared `RowActions`
- Revised the shared segmented `Tabs` UI to match the requested pill-style control:
  - gray segmented track
  - blue active segment
  - same segmented interaction model on mobile
  - constrained width on wider screens while preserving full-width mobile behavior
- Implemented the originally planned mobile member list view:
  - desktop keeps the table-oriented member layout
  - mobile hides the table and shows a searchable member list/card layout
  - mobile rows include member name, kind, status, phone last four, joined date, withdrawn date, withdrawal reason, and an accessible edit link

### Verification Evidence
- Member tab focused tests: `npm run test -- src/features/members/member-list.test.ts src/app/\(app\)/members/page.test.tsx` passed with 2 files and 9 tests.
- Settlement focused tests: `npm run test -- src/features/settlements/settlement-summary.test.ts src/app/\(app\)/settlements/page.test.tsx` passed with 2 files and 6 tests.
- PDF report focused tests: `npm run test -- src/features/reports/monthly-report.test.ts src/features/reports/MonthlyReportPdf.test.tsx src/app/\(app\)/reports/page.test.tsx src/app/\(app\)/reports/monthly/route.test.ts` passed with 4 files and 7 tests.
- Settlement/PDF navigation focused tests: `npm run test -- src/features/shell/AppShell.test.tsx src/app/\(app\)/settlements/page.test.tsx src/app/\(app\)/reports/page.test.tsx src/app/\(app\)/reports/monthly/route.test.ts` passed with 4 files and 5 tests.
- Shell navigation focused test: `npm run test -- src/features/shell/AppShell.test.tsx` passed with 1 file and 1 test.
- Full test suite: `npm run test` passed with 41 files and 135 tests.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Atomic UI refactor focused tests: `npm run test -- src/components/molecules/molecules.test.tsx src/features/members/member-form.test.ts src/features/events src/features/expenses src/features/fees src/app/\(app\)/members src/app/\(app\)/expenses src/app/\(app\)/fees src/app/\(app\)/schedule` passed with 27 files and 80 tests.
- Full test suite after atomic UI refactor: `npm run test` passed with 46 files and 158 tests.
- Atomic UI refactor verification: `npm run lint`, `npx tsc --noEmit`, `git diff --check`, and `npm run build` passed.
- Shared schedule UI reuse verification: `npm run test`, `npm run lint`, `npx tsc --noEmit`, `git diff --check`, and `npm run build` passed with 46 files and 160 tests.
- Segmented tab UI verification: focused member/molecule tests, `npm run test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` passed with 46 files and 160 tests.
- Mobile member list verification: `npm run test -- src/features/members src/app/\(app\)/members` passed with 6 files and 30 tests.
- Full verification after mobile member list: `npm run test` passed with 46 files and 161 tests; `npm run lint`, `npx tsc --noEmit`, `git diff --check`, and `npm run build` passed.

### Atomic UI Guidelines
- Prefer existing shared components before adding page-local markup or styles.
- Use atoms for single controls and display primitives.
- Use molecules for reusable field groups, filter bars, CSV file inputs, form messages, tabs, summaries, and action rows.
- Use organisms for larger reusable page regions such as headers, data panels, tables, and form panels.
- Use templates for route-level management and form page layout.
- Keep page SCSS only for truly page-specific layout. Shared spacing, panel, table, and form action styling should live in shared components.

## 2026-07-06

### Completed
- Ran the gstack CSO security review and recorded the generated report locally under `.gstack/security-reports`.
- Added `.gstack/` to `.gitignore` so local security scan artifacts are not committed.
- Added `.gitleaks.toml` using the default gitleaks rule set for repeatable secret scanning.
- Confirmed the protected password-change page remains part of the authenticated app surface.
- Reduced the segmented tab footprint while preserving the existing font size:
  - tab height now follows the search input height token
  - tab minimum width uses a smaller tokenized value
  - tab padding and radius were reduced one step
- Moved route page titles from body-level page headers into the shell sub navigation.
- Split shell account identity into separate name and role/club-position text, with role and position displayed as `관리자 · 부총무`.
- Corrected management page title hierarchy so labels such as `회원 관리`, `회비 관리`, `지출 관리`, and `월별 정산` are page titles, while list/status labels remain secondary context.
- Moved page-level action buttons into the relevant data panel header or schedule toolbar:
  - member registration in the member list panel
  - fee CSV upload in the fee board panel
  - expense registration in the expense list panel
  - settlement PDF download in the settlement summary panel
  - schedule registration in the schedule toolbar
- Removed the `PageHeader` organism, its exports, styles, and dedicated tests.
- Updated templates and the schedule page to publish titles directly to the shell title context instead of rendering a body page header.
- Replaced non-schedule registration page transitions with intercepted modal routes:
  - `/members` opens `/members/new` as a modal for member registration during client navigation.
  - `/fees` opens `/fees/new` as a modal for fee CSV import during client navigation.
  - `/expenses` opens `/expenses/new` as a modal for expense registration during client navigation.
  - Direct `/members/new`, `/fees/new`, and `/expenses/new` navigation remains full page fallback.
- Added the authenticated app `@modal` parallel route slot and shared `ModalDialog` molecule.
- Kept `/schedule/new` as a normal page navigation and left settlement PDF actions unchanged.
- Tightened mobile layout overflow handling:
  - modal panels now reserve a bounded scroll body so long registration forms stay inside the viewport
  - shell account actions can wrap on phone-width screens instead of forcing the sub navigation wider
  - member mobile list titles can shrink and wrap long names
  - segmented tabs switch to zero-minimum grid columns on phone-width screens, fixing `/members` horizontal overflow from the three status tabs

### Verification Evidence
- Page header removal focused tests: `npm run test -- src/components/organisms/organisms.test.tsx src/components/templates/templates.test.tsx src/features/shell/AppShell.test.tsx src/features/events/ScheduleCalendar.test.tsx` passed with 4 files and 11 tests.
- Full test suite: `npm run test` passed with 46 files and 160 tests.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Registration modal focused tests passed:
  - `npm run test -- src/components/molecules/molecules.test.tsx`
  - `npm run test -- src/app/(app)/members/new/page.test.tsx src/app/(app)/fees/new/page.test.tsx src/app/(app)/expenses/new/page.test.tsx`
  - `npm run test -- src/features/shell/AppShell.test.tsx src/app/(app)/@modal/registration-modal-routes.test.tsx`
  - `npm run test -- src/app/(app)/members/page.test.tsx src/app/(app)/fees/page.test.tsx src/app/(app)/expenses/page.test.tsx src/app/(app)/schedule/page.test.tsx src/features/events/ScheduleCalendar.test.tsx`
- Registration modal full verification passed: `npm run test` passed with 47 files and 164 tests; `npm run lint`, `npx tsc --noEmit`, `git diff --check`, and `npm run build` passed.
- HTTP unauthenticated checks confirmed protected registration routes still redirect to `/login?next=...`.
- Headless browser click verification was not completed because the local `browse` tool could not start without `bun`, and no authenticated browser session was available in the tool context.
- Mobile layout overflow verification: `npm run test -- src/components/molecules/molecules.test.tsx src/features/shell/AppShell.test.tsx src/features/members src/app/\(app\)/members` passed with 8 files and 42 tests; `npm run lint`, `npx tsc --noEmit`, `git diff --check`, and `npm run build` passed.
- `/members` horizontal overflow fix verification: `npm run test -- src/components/molecules/molecules.test.tsx src/app/\(app\)/members/page.test.tsx src/features/members` passed with 5 files and 37 tests; `npm run lint`, `npx tsc --noEmit`, `git diff --check`, and `npm run build` passed.

### UI Layout Guidelines
- Keep the shell sub navigation as the only persistent page-title location inside the app shell.
- Do not render a separate body-level `PageHeader` for standard app pages.
- Place primary page actions near the content they affect, usually in `DataPanel.headerSide`; use the schedule toolbar for schedule-specific view actions.
- Preserve existing font-size tokens when shrinking controls unless the requested change explicitly includes typography.

## Next Planned Work
- Verify CSV member import later when a real CSV file is available.
- Revisit and finalize the dashboard later after enough real operational data has accumulated.
- Deferred by user: verify member/fee kind columns and operator-first sorting later after real data is accumulated.
