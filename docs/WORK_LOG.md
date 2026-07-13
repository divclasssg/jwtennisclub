# JW Tennis Club SaaS Work Log

## 2026-07-13

### Completed
- 회원 목록에서 그룹 조회 select와 `group` URL·DB 필터 로직을 제거하고, 회원 그룹 표시와 등록·수정 기능은 유지했다.
- 회비 목록에서 납부 상태 조회 select와 `status` URL·행 필터 로직을 제거하고, 납부 상태 컬럼과 요약은 유지했다.
- 회원 검색 placeholder를 `이름 또는 회원번호`로 간결하게 수정했다.
- 회원, 회비, 지출, 정산 카테고리 테이블의 의미 있는 데이터 헤더에 오름차순·내림차순 정렬 링크를 항상 표시하도록 구현했다.
- 정렬 상태를 `sort`, `direction` URL 파라미터로 유지하고 기존 검색어, 상태 탭, 월, 카테고리 필터를 정렬 링크에 보존했다.
- 문자열·숫자 정렬, 안정 정렬, 양방향 null-last 처리와 잘못된 정렬 파라미터의 기본값 복구를 공통 도우미로 구현했다.
- 회원·회비 모바일 목록이 데스크톱 테이블과 동일한 정렬 결과를 사용하도록 통합했다.
- `관리`, `처리`, `증빙`처럼 정렬 기준이 없는 작업 컬럼은 정렬 대상에서 제외했다.
- 공통 `DataTable` 본문 행에 hover 배경색을 추가해 홀수·짝수 행 모두 현재 가리키는 행을 명확히 구분하도록 했다.
- 테이블 hover 색상을 `--table-row-hover-surface` 전역 디자인 토큰으로 정의하고 공통 SCSS에서 사용하도록 했다.
- 전체 정렬 가능 테이블 헤더를 단일 링크로 변경해 비활성 열은 `↕`, 활성 열은 현재 방향에 따라 `↑` 또는 `↓`를 표시하고 클릭 시 다음 방향으로 전환하도록 개선했다.
- 정렬 헤더에 현재 방향을 나타내는 `aria-sort`와 다음 동작을 설명하는 접근 가능한 이름을 적용했다.
- 회원 등록·수정 폼의 이름, 연락처, 그룹, 가입일, 상태, 탈퇴일, 메모 label을 화면에 표시했다.
- 이름, 연락처, 메모 입력에 각각 `홍길동`, `010-1234-5678`, `특이사항을 입력하세요` placeholder를 추가했다.
- 회원 수정 콘텐츠를 공용 컴포넌트로 분리하고, 목록 이동과 수정 URL 직접 접속·새로고침 모두 `회원 수정` 모달을 표시하도록 구현했다.

### Verification Evidence
- 정렬 공통 도우미와 헤더, 회원·회비·지출·정산 페이지 집중 테스트를 RED→GREEN 순서로 검증했다.
- 전체 테스트: 58개 파일, 291개 테스트 통과.
- `npm run lint`: 통과.
- `npx tsc --noEmit`: 통과.
- `npm run build`: Next.js 16.2.10 Turbopack 프로덕션 빌드 통과.
- 테이블 hover 변경 후 공통 organisms 집중 테스트 4개와 전체 테스트 64개 파일, 303개 테스트가 통과했다.
- 테이블 hover 변경 후 `npm run lint`와 `npx tsc --noEmit`이 통과했다.
- 프로젝트 SCSS 컴파일 기반 브라우저 검증에서 홀수·짝수 행 모두 hover 시 `rgb(238, 238, 238)`로 변경되고 콘솔 오류가 없음을 확인했다.
- 테이블 hover 변경 후 프로덕션 빌드는 기존 장기 실행 Next.js 개발 서버가 공유 `.next` 작업공간을 사용 중이어서 완료하지 못했다.
- 단일 정렬 헤더 집중 테스트: 2개 파일, 7개 테스트 통과.
- 회원·회비·지출·정산 페이지 회귀 테스트: 4개 파일, 16개 테스트 통과.
- 변경 후 전체 테스트: 64개 파일, 305개 테스트 통과.
- 변경 후 `npm run lint`: 경고와 오류 없이 통과.
- 변경 후 `npm run build`: 환경 변수 없이 실행한 빌드는 컴파일과 TypeScript 검사 후 Supabase 환경 변수 검증에서 중단됐다. `.env.local`을 프로세스에 주입한 재실행은 오류 출력 없이 최적화 빌드 단계에서 장시간 정체되어 중단했으며, 기존 작업 로그의 로컬 빌드 정체와 동일한 양상이다.
- 회원 폼 표현과 직접·인터셉트 수정 모달 집중 테스트를 RED→GREEN 순서로 검증했다: 5개 파일, 10개 테스트 통과.
- 전체 테스트: 66개 파일, 305개 테스트 통과. 병렬 검증 중 1회 타임아웃된 PDF 테스트는 단독 재실행과 전체 단독 재실행에서 모두 통과했다.
- 회원 폼·수정 모달 변경 후 `npm run lint`와 `npx tsc --noEmit` 통과.
- `.env.local`을 표준 로딩한 `npm run build`: Next.js 16.2.10 Turbopack 컴파일 3.2초, 직접 수정 및 인터셉트 수정 라우트 포함 전체 빌드 통과.

## 2026-07-12

### Completed
- Supabase CLI 호환 `supabase_migrations.schema_migrations` 이력을 로컬 마이그레이션 11개와 동기화했다.
- gstack 인증 브라우저 QA에서 관리자에게만 전체 연락처가 표시되고 운영자에게는 19개 연락처가 모두 마스킹되는 것을 확인했다.
- 운영자에게 잘못 노출되던 회원 등록·수정 링크를 권한에 따라 숨기고, 등록·수정 직접 경로도 권한이 없으면 404로 차단했다.
- 1440x900 및 375x812 화면에서 회원 목록의 가로 넘침이 없고 콘솔 오류가 없음을 확인했다.
- QA용 임시 Supabase Auth 사용자 2명과 로컬 자격증명 파일을 삭제하고 회원 수가 20명으로 유지됨을 확인했다.
- 2일 이상 실행되며 CPU 127%와 메모리 22%를 점유하던 별도 `darksite` Next.js 개발 서버가 프로덕션 빌드 정지의 원인임을 확인하고 종료했다.
- 회원 명부 초기화 과정에서 누락된 회원 목록 직책 데이터를 복구하고, 데스크톱 직책 컬럼과 모바일 직책 항목을 추가했다.
- 회원 목록이 `members.operator_profile_id`로 운영진 프로필의 직책 라벨을 결합하도록 복구했다.
- 직책이 없는 일반 회원은 직책 컬럼과 모바일 목록에서 `일반회원`으로 표시하도록 명확히 했다.
- 회원 목록의 `구분` 컬럼과 모바일 구분 항목을 복구해 운영진은 `운영진`, 일반 회원은 `-`로 표시하도록 했다.
- 회원 목록 컬럼을 `회원번호 | 이름 | 전화번호 | 구분 | 직책 | 그룹 | 상태 | 가입일 | 관리` 순서로 정리했다.
- 회원 목록 정렬 기준을 운영진·직책 우선에서 회원번호 오름차순으로 변경했다.
- 회비 목록 컬럼을 `회원번호 | 이름 | 구분 | 상태 | 기준 금액 | 납부일 | 메모 | 처리` 순서로 정리했다.
- 회비 목록 정렬 기준을 운영진·직책 우선에서 회원번호 오름차순으로 변경했다.
- 회원번호 `#0000`은 회비 납부 대상 조회와 회비 보드에서 제외하도록 했다.

### Verification Evidence
- 회원 권한 집중 테스트: 4개 파일, 20개 테스트 통과.
- gstack 운영자 QA: 등록 링크 0개, 수정 링크 0개, 전체 연락처 0개, 마스킹 연락처 19개, 직접 등록·수정 경로 404.
- 반응형 QA: 1440px와 375px 모두 문서 가로 overflow 없음.
- `npm run build`: Next.js 16.2.10 Turbopack 컴파일 3.2초, 전체 빌드 6.5초 완료.
- 회원·회비 목록 집중 테스트와 전체 검증: 56개 파일, 283개 테스트와 lint, typecheck 통과.
- 목록 복구와 회비 대상 예외 적용 후 `npm run build`: Next.js 16.2.10 Turbopack 컴파일 2.8초, 전체 빌드 완료.

### Issues And Lessons
- 동시에 실행 중인 다른 Next.js 개발 서버가 CPU와 메모리를 과도하게 점유하면 현재 프로젝트 빌드가 `Creating an optimized production build ...`에서 멈춘 것처럼 보일 수 있다. 빌드 재시도 전에 프로젝트 외부의 장기 실행 Next 프로세스 자원 사용량을 확인한다.

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
- Implemented a mobile list view for the fee board:
  - desktop keeps the table-oriented monthly fee board
  - mobile shows each member as a list item with member kind, payment status, phone last four, amount, paid date, memo, and the existing payment/cancel action

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
- Fee board mobile list verification: `npm run test -- src/features/fees src/app/\(app\)/fees` passed with 6 files and 22 tests; full `npm run test` passed with 47 files and 165 tests; `npm run lint`, `npx tsc --noEmit`, `git diff --check`, and `npm run build` passed.

### UI Layout Guidelines
- Keep the shell sub navigation as the only persistent page-title location inside the app shell.
- Do not render a separate body-level `PageHeader` for standard app pages.
- Place primary page actions near the content they affect, usually in `DataPanel.headerSide`; use the schedule toolbar for schedule-specific view actions.
- Preserve existing font-size tokens when shrinking controls unless the requested change explicitly includes typography.

## 2026-07-08

### Completed
- Reworked authenticated desktop user screens against the provided Figma design while preserving existing app functionality.
- Applied the Figma foundation and component styling across the app shell, route title area, tables, summary cards, controls, and login surface.
- Kept the app frame fixed to the viewport so the whole page does not scroll, while bounded content regions such as tables, lists, calendars, and schedule details scroll internally when needed.
- Fixed `/schedule` month view overflow by making the schedule toolbar a fixed row and moving calendar content into a bounded scroll area.
- Changed `/schedule` month view from vertical stacking to a desktop two-column layout:
  - monthly calendar uses the left 70%
  - selected-date schedule details use the right 30%
- Made the month calendar fill the available vertical space inside the schedule content area, reducing the large empty area below the calendar grid.
- Added schedule layout regression coverage for the fixed toolbar, internal scroll area, 70/30 month layout, and accessible grouping of the month calendar with the selected-date detail panel.
- Simplified table status presentation in the fee board:
  - removed badge pills from the desktop fee table member-kind and payment-status cells
  - kept the same Korean text labels as plain table text
  - added regression coverage so those table cells do not reintroduce nested badge spans
- Simplified shared filter bar layout:
  - changed `FilterBar` styling from grid-based column splits to a wrapping flex row
  - removed layout-specific `grid-template-columns` from shared filter bar variants
  - added regression coverage to keep filter bars from returning to grid column splitting
- Increased shared data table row height from 24px to 32px for more readable dense table rows.
- Refined monthly settlement summary actions and metrics:
  - moved `PDF 다운로드` from the settlement panel header to the settlement filter bar next to `조회`
  - split combined transaction counts into separate `회비 납부` and `지출` summary cards
  - added 5-column `SummaryGrid` support for the expanded settlement summary card set
  - kept regression coverage for `회비 납부 1건` and `지출 0건` as separate summary values

### Verification Evidence
- `npm run test` passed with 50 files and 172 tests.
- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- Fee table badge removal verification:
  - `npm run test -- 'src/app/(app)/fees/page.test.tsx'` passed with 1 file and 4 tests.
  - `npm run lint` passed.
- Filter bar layout verification:
  - `npm run test -- src/components/molecules/molecules.test.tsx` passed with 1 file and 12 tests.
  - `npm run lint` passed.
- Settlement summary action verification:
  - `npm run test -- 'src/app/(app)/settlements/page.test.tsx' src/components/molecules/molecules.test.tsx` passed with 2 files and 14 tests.
  - `npm run lint` passed.
  - `npx tsc --noEmit` passed.

### UI Layout Guidelines
- Authenticated desktop pages should keep the shell and page frame fixed to the viewport.
- When content exceeds the available space, scroll the content region itself rather than the whole document.
- Schedule month view should remain a side-by-side desktop layout with the calendar and selected-date details grouped in one bounded content area.

## 2026-07-09

### Completed
- Expanded `/schedule` month calendar date selection so each day cell has a full-cell selected-date navigation target.
- Kept existing schedule event edit links and overflow links independently clickable above the day-cell selection target.
- Added regression coverage for accessible day-cell selection links.
- Fixed the `/schedule` selected-date detail panel so schedule cards sit directly below the date header and the panel consumes only content height instead of stretching down the column.
- Added schedule scroll-layout regression coverage for top-aligned, content-sized selected-date details.
- Removed padding, border, and border radius from selected-date schedule rows in the detail panel.
- Added scroll-layout regression coverage so selected-date schedule rows stay unframed.
- Reworked `/schedule` week view from day cards into a reference-style weekly time-grid calendar:
  - 7 day columns with a time gutter
  - hourly grid lines from morning through late evening
  - event blocks positioned by event start time and weekday
  - event title, location, and time retained inside the block
- Added schedule week time-grid regression coverage.
- Fixed week time-grid clipping where the board only showed down to around 15:00 by letting the full 18-hour grid define the scrollable height instead of hiding overflow inside the timeboard.
- Added scroll-layout regression coverage for full week time range height.
- Fixed week time-grid borders by separating outer frame borders from internal separators, removing duplicate last-column and last-row borders, and adding the missing all-day row separator across day columns.
- Added scroll-layout regression coverage for complete, non-overlapping week time-grid borders.
- Fixed the week timeboard outer border so it wraps the full calendar width by giving the timeboard its own full-width, minimum-width, border-box sizing instead of relying only on the parent week container.
- Added scroll-layout regression coverage for the full week timeboard border box.
- Fixed the week timeboard border height so the outer border wraps the full header plus all-day row plus 18 hourly rows, instead of ending mid-grid while internal lines continued.
- Extended scroll-layout regression coverage to require the full week timeboard height calculation.
- Removed padding from the schedule scroll area so the calendar content sits flush with the surrounding schedule layout.
- Removed the week timeboard frame styling so the weekly calendar is defined by the internal grid separators instead of an extra outer border.
- Updated scroll-layout regression coverage to keep the schedule scroll area unpadded and the week timeboard unframed.

### Verification Evidence
- `npm run test -- src/features/events/ScheduleCalendar.test.tsx` passed with 1 file and 6 tests.
- `npm run test -- 'src/app/(app)/schedule/page.test.tsx' src/features/events/ScheduleCalendar.test.tsx` passed with 2 files and 9 tests.
- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run test` passed with 50 files and 174 tests.
- `npm run build` passed.
- `npm run test -- src/app/scroll-layout.test.ts` passed with 1 file and 4 tests.
- `npm run test -- src/app/scroll-layout.test.ts src/features/events/ScheduleCalendar.test.tsx 'src/app/(app)/schedule/page.test.tsx'` passed with 3 files and 13 tests.
- `npm run test` passed with 50 files and 175 tests.
- `npm run test -- src/app/scroll-layout.test.ts` passed with 1 file and 5 tests.
- `npm run test -- src/app/scroll-layout.test.ts src/features/events/ScheduleCalendar.test.tsx 'src/app/(app)/schedule/page.test.tsx'` passed with 3 files and 14 tests.
- `npm run test` passed with 50 files and 176 tests.
- `npm run test -- src/features/events/ScheduleCalendar.test.tsx` passed with 1 file and 7 tests.
- `npm run test -- src/features/events src/app/scroll-layout.test.ts 'src/app/(app)/schedule/page.test.tsx'` passed with 5 files and 22 tests.
- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run test` passed with 50 files and 177 tests.
- `npm run build` passed.
- `npm run test -- src/app/scroll-layout.test.ts` passed with 1 file and 6 tests.
- `npm run test -- src/app/scroll-layout.test.ts src/features/events/ScheduleCalendar.test.tsx 'src/app/(app)/schedule/page.test.tsx'` passed with 3 files and 16 tests.
- `npm run test` passed with 50 files and 178 tests.
- `npm run test -- src/app/scroll-layout.test.ts` passed with 1 file and 7 tests.
- `npm run test -- src/app/scroll-layout.test.ts src/features/events/ScheduleCalendar.test.tsx 'src/app/(app)/schedule/page.test.tsx'` passed with 3 files and 17 tests.
- `npm run test` passed with 50 files and 179 tests.
- `npm run test -- src/app/scroll-layout.test.ts` passed with 1 file and 8 tests.
- `npm run test -- src/app/scroll-layout.test.ts src/features/events/ScheduleCalendar.test.tsx 'src/app/(app)/schedule/page.test.tsx'` passed with 3 files and 18 tests.
- `npm run test` passed with 50 files and 180 tests.
- `npm run test -- src/app/scroll-layout.test.ts` passed with 1 file and 8 tests after removing schedule scroll padding and the week timeboard border.
- `npm run test -- src/app/scroll-layout.test.ts src/features/events/ScheduleCalendar.test.tsx 'src/app/(app)/schedule/page.test.tsx'` passed with 3 files and 18 tests after the final schedule layout cleanup.
- `git diff --check` passed after the final schedule style cleanup.
- `npm run lint` passed before commit.
- `npx tsc --noEmit` passed before commit.
- `npm run test` passed with 50 files and 180 tests before commit.
- `npm run build` passed before commit.

## Next Planned Work
- Verify CSV member import later when a real CSV file is available.
- Revisit and finalize the dashboard later after enough real operational data has accumulated.
- Deferred by user: verify member/fee kind columns and operator-first sorting later after real data is accumulated.

## 2026-07-11

### Completed
- Ran a focused gstack CSO comprehensive security review for changing member phone storage from the last four digits to the full phone number.
- Confirmed that the current authentication and RLS boundaries block anonymous member-row access.
- Determined that replacing `phone_last_four` in place is unsafe because the default `members.view` permission would expose the full value across member and fee views.
- Identified URL-backed full-phone search, login redirect query propagation, fee-board projections, CSV workflows, and contact retention as areas that require separate controls before full-phone storage.
- Established the recommended direction: keep `members.phone_last_four` for routine member and fee workflows and isolate full contact data behind a separate table, permission, and RLS policy.
- Kept the generated gstack report local under `.gstack/security-reports` so it is not committed.
- Added `/members/` to `.gitignore` so local CSV files containing real member data cannot be staged or committed.

### Verification Evidence
- Focused auth, member, fee, and permission tests passed with 5 files and 20 tests.
- Independent proxy and login URL verification passed with 18 tests.
- `npm audit --audit-level=low --json` reported 0 vulnerabilities across 630 dependencies.
- `git check-ignore -v members members/members.csv` confirmed that the directory and contained CSV are ignored by `/members/`.
- `git diff --check` passed after the ignore and documentation updates.

### Security Guidelines
- Do not replace `members.phone_last_four` with a broadly readable full-phone column.
- Store full contact data only in a separate private table with dedicated view/manage permissions and RLS.
- Do not select or serialize full phone numbers in `/fees`, default member lists, or fee CSV matching.
- Keep sensitive full-phone lookup values out of GET query strings and login redirect parameters.
- Keep real member source files outside tracked repository paths; `/members/` is reserved for ignored local data only.

## 2026-07-12

### 완료
- 회원 명부 초기화 구현을 통합 검증했다. 회원번호 고정, A/B/그룹 없음 분류, 연락처 분리 저장, 중복 확인, 회비의 회원번호 기반 연동, 레거시 필드 제거가 자동 테스트 범위에 포함된다.
- 실제 회원 CSV를 비식별 로컬 dry-run으로 검증했고 원문 값은 출력하지 않았다.
- 루트 작업 공간과 기능 작업 트리에서 `members/members.csv`가 `.gitignore`의 `/members/` 규칙에 의해 제외되는 것을 확인했다.
- Git이 추적하는 `members` 경로 파일이 없음을 확인했다.
- 테스트 파일을 제외한 `src` 런타임에서 `phone_last_four`, `withdrawal_reason`, `phoneLastFour`, `withdrawalReason` 참조가 없음을 확인했다.
- 회비 화면과 회비 기능에서 연락처 필드 참조가 없고, 런타임 URL 검색 파라미터에 연락처를 사용하는 참조가 없음을 확인했다.
- Supabase 준비·안전삭제 패치·최종 마이그레이션을 순서대로 적용하고 승인된 CSV로 회원 명부를 원자적으로 초기화했다.
- 초기화 후 회원 20명, 연락처 19건, 회비 0건, A 4명, B 15명, 그룹 없음 1명, 활성 운영자 재연결 1명을 비식별 집계로 확인했다.
- 회원번호의 단일 접두사·고유성·다음 자동발급 번호를 확인했고, 구형 연락처/탈퇴 사유 컬럼과 reset RPC/표식이 제거된 것을 확인했다.

### 검증 근거
- `npm test`: 56개 파일, 277개 테스트 통과, 종료 코드 0.
- `npm run lint`: 통과, 종료 코드 0.
- `npx tsc --noEmit`: 통과, 종료 코드 0.
- `git diff --check`: 통과, 종료 코드 0.
- 실제 `members/members.csv` DB 연동 dry-run: 20건, A 4건, B 15건, 그룹 없음 1건, 연락처 누락 1건, 활성 운영자 재연결 1건. 기존 문장부호 접두사 1자와 숫자 4자리 회원번호 형식을 유지하도록 파서와 DB 제약을 수정했다.
- `rg -n 'phoneLastFour|phone_last_four|withdrawalReason|withdrawal_reason|탈퇴 사유' src --glob '!**/*.test.*' --glob '!**/*.spec.*'`: 런타임 코드 출력 없음, 종료 코드 1.
- `rg -n 'phone_number|phone_normalized|phoneNumber|phoneDisplay' 'src/app/(app)/fees' src/features/fees --glob '!**/*.test.*' --glob '!**/*.spec.*'`: 회비 런타임 코드 출력 없음, 종료 코드 1.
- `rg -n 'searchParams.*phone|phone.*searchParams' src --glob '!**/*.test.*' --glob '!**/*.spec.*'`: 런타임 코드 출력 없음, 종료 코드 1. 테스트를 포함한 원래 broad 명령은 연락처 원문이 아닌 `invalid-phone`, `phone-reuse` searchParams fixture 2건을 출력했다.
- `npm run build`: 유효한 `.env.local`을 사용해 다시 실행했으나 120초 안에 완료되지 않았다. 오류 출력 없이 `Creating an optimized production build ...` 단계에서 중단했으므로 빌드 통과로 처리하지 않았다.
- 개발 서버는 3012 포트에서 167ms에 준비되었으나, 작업 트리에 유효한 Supabase 공개 환경 변수가 없어 보호 라우트 요청이 프록시 단계에서 500으로 종료되었다. 기본 기동만 확인했으며 비인증 리다이렉트와 화면 컴파일은 검증하지 못했다.

### 보류 검증
- 인증된 관리자/일반 운영자 권한 차이, 연락처 마스킹/수정, 이름·회원번호 검색, 그룹 필터, 중복 확인 흐름은 브라우저에서 검증하지 않았다.
- 375px 모바일과 1440px 데스크톱 레이아웃, 브라우저 콘솔, 네트워크 및 RSC payload의 개인정보 노출 여부는 인증 환경에서 추가 검증해야 한다.

## 2026-07-13

### 완료
- 요청 단위로 재사용하는 `get_current_operator_context` RPC와 React `cache()` 로더를 추가해 앱 셸과 회원 등록·수정 권한 조회를 통합했다.
- 회원 목록, 생성·수정 권한, 연락처 마스킹, 그룹 및 운영진 직책을 `get_member_directory_page` RPC 한 번으로 조회하도록 변경했다.
- 인증 앱 구간에 항상 인지 가능한 로딩 경계를 추가했다.
- Vercel Functions 실행 지역을 Supabase와 같은 서울 `icn1`로 고정했다.
- 보호 경로 프록시의 원격 `getUser()` 호출을 검증된 JWT `getClaims()`로 교체하고 검증 실패 시 차단하도록 유지했다.
- 로컬 최적화 측정 산출물 `.context/`를 Git 추적에서 제외했다.

### 검증 근거
- 정적 측정에서 회원 페이지 Supabase 호출 수가 12회에서 1회로 감소했다.
- 프록시의 `getUser` 호출은 1회에서 0회로, `getClaims` 검증은 0회에서 1회로 변경됐다.
- `npm run test`: 64개 파일, 303개 테스트 통과.
- `npm run lint`: 경고와 오류 없이 통과.
- `npm run build`: 두 차례 모두 오류 출력 없이 `Creating an optimized production build ...` 단계에서 장시간 정체되어 완료 여부를 확인하지 못했다. 이전 작업 로그에도 같은 로컬 빌드 정체가 기록되어 있다.

### 배포 준비
- `202607130001_optimize_navigation_queries.sql`이 연결된 Supabase 프로젝트에 적용됐음을 사용자 확인으로 기록했다.

### React 개발 도구 콘솔 조사
- 페이지 이동 후 발생한 `We are cleaning up async info...` 메시지의 전체 스택이 React Developer Tools Chrome 확장의 `installHook.js`에만 위치함을 확인했다.
- 확장이 없는 독립 Chromium에서 `/login`을 확인했으며 앱 콘솔 오류가 재현되지 않았다.
- React Developer Tools를 비활성화한 뒤 Suspense 메시지가 사라졌고, 남은 출력은 HMR 정상 연결, 개발 도구 설치 안내, 미사용 폰트 preload 경고뿐임을 확인했다.
- 화면 동작이나 서버 요청 실패가 동반되지 않아 앱 코드 및 로딩 경계는 변경하지 않았다.

### 브랜드 파비콘 적용
- 제공된 `jwtennis.jpg`에서 작은 브라우저 탭에서도 식별 가능한 상단 `JW` 심볼만 정사각형으로 크롭했다.
- `favicon.ico`에는 16/32/48px RGBA PNG 아이콘을 포함하고, `icon.png` 512px 및 `apple-icon.png` 180px을 추가했다.
- Next.js 개발 서버가 favicon, 일반 앱 아이콘, Apple Touch 아이콘 메타데이터를 자동 생성하는지 확인했다.
- `/favicon.ico`, `/icon.png`, `/apple-icon.png`가 올바른 콘텐츠 타입으로 200 응답하는 것을 확인했다.
