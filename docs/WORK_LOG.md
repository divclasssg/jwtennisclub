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

## Next Planned Work
- Implement member tabs for separate active and withdrawn member management.
- Implement fee payment CSV upload.
- Complete membership fee management after database and browser verification.
- Verify CSV member import later when a real CSV file is available.
- Deferred by user: verify member/fee kind columns and operator-first sorting later after real data is accumulated.
