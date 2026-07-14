# JW Tennis Club SaaS Project Checklist

## Current Status
- [x] Apple-style design guide added as `DESIGN-apple.md`
- [x] Product requirements documented for tennis club operations
- [x] Foundation implementation merged into `main`
- [x] Supabase environment variables configured in `.env.local`
- [x] Supabase foundation tables confirmed in the project database
- [x] Initial admin profile registered in Supabase
- [x] Local verification passed after foundation merge
- [x] Changes pushed to GitHub `main`
- [x] Styles converted from CSS to SCSS
- [x] CSS Module class names converted to kebab-case hyphen naming
- [x] SCSS token usage rule documented in `AGENTS.md`
- [x] Foundation UI design revised before member management
- [x] Member table fields and statuses defined
- [x] Supabase member schema query executed
- [x] Member list screen implemented
- [x] Member create/edit flow implemented
- [x] Member withdrawal handling with withdrawal date implemented
- [x] Admin/operator profile auto-add migration added for member records
- [x] Member management screen flow verified
- [x] Member management feature implemented
- [x] Membership fee management feature implemented
- [x] Expense management feature implemented
- [x] Execute Supabase expense receipt metadata query
- [x] Configure Cloudflare R2 receipt bucket credentials in `.env.local`
- [x] Verify expense receipt attachment locally
- [x] Schedule management feature implemented
- [x] Schedule month/week calendar UI implemented
- [x] Schedule month view overflow displays as `+N개`
- [x] Schedule week navigation stays in week view
- [x] Execute Supabase event schedule schema query
- [x] Verify schedule management screen flow in browser
- [x] Member tabs for separate active, paused, and withdrawn member management implemented
- [x] Monthly settlement summary implemented
- [x] Monthly PDF generation implemented
- [x] PDF download consolidated into settlement screen
- [x] Unused settings item removed from primary navigation
- [x] Atomic design UI component structure introduced for shared atoms, molecules, organisms, and templates
- [x] Segmented tab UI revised for desktop and mobile
- [x] Member list mobile layout implemented as a searchable list/card view
- [x] Security scan follow-up files configured and gstack reports ignored
- [x] Page titles moved into the shell sub navigation
- [x] PageHeader organism removed from app page layouts
- [x] Page-level action buttons moved into data panel or toolbar headers
- [x] Member, fee CSV, and expense registration actions open as modals during list-page navigation
- [x] Member page mobile horizontal overflow fixed
- [x] Fee board mobile layout implemented as a list view
- [x] Authenticated user screens refreshed against the Figma desktop design
- [x] App shell changed to fixed viewport height with internal content scrolling
- [x] Schedule month view changed to a 70/30 calendar and selected-date detail layout
- [x] Schedule month day cells made fully selectable for selected-date navigation
- [x] Schedule selected-date detail panel top-aligned and sized to its content
- [x] Schedule week view changed to a reference-style time-grid calendar
- [x] Local member source-data directory excluded from Git after full-phone security review
- [x] 변경 불가 회원번호, 비공개 연락처, A/B/그룹 없음 분류를 포함한 회원 명부 초기화 구현
- [x] 회원 및 회비 런타임 경로에서 레거시 연락처·탈퇴 사유 필드 제거
- [x] 회원 명부 초기화 자동 테스트, lint, typecheck, 테스트 제외 런타임 개인정보 정적 검사 통과
- [x] 페이지 이동 성능 개선: 운영자 권한 요청 캐시, 회원 목록 단일 RPC, 로딩 경계, 서울 리전, JWT claims 검증
- [x] 페이지 이동 성능 개선용 Supabase RPC 마이그레이션 적용
- [x] 정모 월 명단, 사전 응답, 실제 출석, 생명주기, 일정 통합 코드 구현
- [x] 정모 기능 전체 테스트, lint, TypeScript, 프로덕션 빌드 통과
- [x] 정모 목록 스캔 중심 UI와 접힌 회차 관리 작업 구현
- [x] 정모 명단 검색·상태 필터·행 단위 자동 저장·모바일 작업면 개선

## Next Work
- [x] Implement `docs/superpowers/plans/2026-07-13-club-meeting-attendance.md`
- [x] Supabase에 `202607130002_add_club_meetings.sql` 적용
- [x] 적용 후 admin 인증 흐름·낙관적 동시성·월 경계·일정 왕복·모바일 정모 흐름 검증
- [x] 실제 operator 및 분리 권한 조합으로 정모 권한 경계 검증
- [x] Implement member tabs for separate active, paused, and withdrawn member management
- [x] Define membership fee payment records
- [x] Implement fee payment list and monthly filters
- [x] Implement fee payment CSV upload
- [x] Implement fee payment cancellation handling
- [x] Execute Supabase fee payment schema query
- [x] Verify fee payment screen flow in browser
- [x] Implement expense records
- [x] Implement expense receipt attachment with Cloudflare R2
- [x] Implement monthly settlement summary
- [x] Implement PDF template for monthly report
- [x] Refactor repeated management pages, data tables, form panels, CSV fields, and form actions into shared atomic UI components
- [x] Implement mobile member list view from the original responsive design plan
- [x] Consolidate page titles into the shell sub navigation

## Deferred Work
- [ ] Revisit and finalize the dashboard after enough real operational data has accumulated
- [ ] Verify CSV member import with a real CSV file
- [ ] Verify member and fee operator/general kind columns after real operator/member data exists
- [ ] Verify operator-first sorting after real club positions are assigned
- [x] Verify fee inline payment processing after real monthly payment data exists
- [x] Supabase에 회원 명부 준비·안전삭제 패치·초기화·최종 마이그레이션 적용
- [x] 실제 회원 CSV 로컬 dry-run 후 개인정보 원문 없이 구조·집계 확인
- [x] service role 환경에서 A/B 그룹·활성 운영자 재연결을 포함한 DB 연동 dry-run 실행
- [x] dry-run 결과 검토 후 파괴적 회원 명부 초기화 실행
- [x] 인증 브라우저에서 회원·회비 권한, 개인정보 마스킹, 반응형 UI, 직접 경로와 콘솔 검증
- [x] 자원을 고갈시키던 별도 Next.js 개발 서버 종료 후 프로덕션 빌드 재실행

## Confirmed Product Decisions
- [x] Target users are tennis club operators, not general members
- [x] Main goal is reducing repeated checks and settlement mistakes
- [x] Payment method tracking is not needed; transfers are handled externally
- [x] Admins and operators can both exist as multiple users
- [x] Admins and operators are also tennis club members and must be registered in members
- [x] Role permissions must be editable later
- [x] Member records need join date and withdrawal date
- [x] Monthly PDF reports are shared with general members
- [x] PDF can be generated by any operator
- [x] PDF becomes available on the 1st day of the next month

## Technical Decisions
- [x] Authentication provider: Supabase Auth
- [x] Database provider: Supabase Postgres
- [x] Authorization model: `roles`, `role_permissions`, `profiles`
- [x] Operator accounts and member records are linked by `members.operator_profile_id`; profiles auto-create member records
- [x] First admin profile is seeded manually through Supabase SQL Editor
- [x] Member schema is applied through Supabase SQL Editor
- [x] `.env.local` is local-only and ignored by Git
- [x] Next.js proxy lives at `src/proxy.ts`
- [x] Vercel Functions run in Seoul (`icn1`) next to the Supabase project
- [x] Protected-route proxy authentication uses verified JWT claims instead of a remote user lookup
- [x] Component styles use SCSS Modules with kebab-case hyphen class names
- [x] SCSS should use `src/app/globals.scss` design tokens and `src/app/_breakpoints.scss` breakpoint variables before hardcoded values
- [x] `.gstack/` security scan artifacts are local-only and ignored by Git
- [x] `/members/` is local-only and ignored by Git so real member CSV data cannot be committed
- [x] Page body layouts should not reintroduce the removed `PageHeader`; publish route titles to the shell instead
- [x] Desktop app pages should avoid whole-page scrolling; overflowing tables, lists, calendars, and form bodies scroll inside their bounded content area
- [x] Schedule month view uses a desktop two-column layout: monthly calendar on the left and selected-date schedule details on the right

## Verification Commands
- [x] `npm run test`
- [x] `npm run lint`
- [x] `npx tsc --noEmit`
- [x] `npm run build`

## Before Starting A New Session
- [ ] Read `docs/PROJECT_CHECKLIST.md`
- [ ] Read `docs/WORK_LOG.md`
- [ ] Check `git status --short --branch`
- [ ] Confirm whether local `.env.local` exists
- [ ] If editing Next.js code, read the relevant local Next docs in `node_modules/next/dist/docs/`
