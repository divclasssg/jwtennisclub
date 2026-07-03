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

## Next Planned Work
- Verify the schedule management screen flow in browser with an authenticated operator session.
- Implement member tabs for separate active and withdrawn member management.
- Verify CSV member import later when a real CSV file is available.
- Deferred by user: verify member/fee kind columns and operator-first sorting later after real data is accumulated.
- Implement monthly settlement summary.
