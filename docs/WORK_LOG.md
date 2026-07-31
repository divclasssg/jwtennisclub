# JW Tennis Club SaaS Work Log

## 2026-07-31

### 완료
- 월별 중간 결산과 최종 마감이 유형별 독립 버전을 사용하도록 구현했다. 중간 결산은 원본을 잠그지 않고, 최종 마감만 해당 월 회비·지출 원본을 데이터베이스 트리거에서 잠근다.
- 최종 마감본은 결산 재개 전까지 원본 변경을 차단하며, 재개 후 다시 최종 마감하면 이전 불변 이력을 유지한 채 다음 최종 버전을 생성한다.
- 중간 결산과 최종 마감 PDF를 생성 당일부터 정확한 스냅샷 ID로 다운로드하도록 변경했다. PDF에는 결산 유형·버전·처리자·처리일시를 표시하고 원본 테이블을 다시 조회하지 않는다.
- 메뉴, 화면, 작업, 안내, 오류와 PDF의 사용자용 `정산` 표현을 `결산`으로 변경했다. 내부 `settlement` 식별자는 배포 호환성을 위해 유지했다.
- DB 우선 혼합 버전 배포를 위해 기존 `get_monthly_settlement_page(date)`와 3인자 PDF 감사 RPC를 유지하고, 새 앱 전용 `get_monthly_settlement_page_v2(date)`와 1인자 PDF 감사 RPC를 분리했다. 전환 RPC는 모두 `authenticated`만 실행할 수 있다.
- 결산 처리일시와 PDF 생성일시를 서울 시간의 초 단위까지 표시해 같은 날 생성한 여러 기록을 구분할 수 있게 했다. 결산 Action은 `category|count|amount`와 `asc|desc`의 유효한 정렬 쌍만 리다이렉트에 보존한다.

### 검증 근거
- 최종 수정 RED에서 호환 RPC 분리, 서울 초 단위 표시, 정렬 FormData 화이트리스트가 없어 집중 테스트 11건이 의도한 이유로 실패했고, 생성 mutation의 v2 반환 계약 2건도 별도 RED로 확인했다.
- 최종 수정 집중 Vitest — 6개 파일, 64개 테스트 통과.
- 전체 Vitest: `npm run test -- --exclude '.worktrees/**'` — 99개 파일, 698개 테스트 통과.
- `npx eslint . --ignore-pattern '.worktrees/**'`, `npx tsc --noEmit`, `git diff --check` — 종료 코드 0으로 통과.
- 대표 최종 마감 PDF를 `tmp/pdfs`에 생성해 `pdfinfo`, `pdftotext -layout`, `pdffonts`, `pdftoppm -png -r 150`으로 검사했다. 1페이지 A4, 서로 다른 결산·생성 초 단위 시각, 내장된 IBM Plex Sans KR subset을 확인했고 1241×1754 PNG 원본 해상도 육안검사에서 잘림·겹침·두부 문자·개인정보 노출이 없었다. 검사 뒤 PDF·텍스트·PNG와 임시 생성 테스트를 삭제했다.
- 환경 변수 없이 실행한 `npm run build`는 컴파일과 TypeScript 검사까지 성공한 뒤 `/(.)expenses/new` 사전 렌더에서 `Missing or invalid Supabase environment variables`로 실패했다. 빌드 통과로 처리하지 않았다.
- 루트 작업 공간의 무시된 `.env.local`을 값 출력이나 복사 없이 실행 환경으로 로드한 빌드는 두 번 모두 오류 출력 없이 `Creating an optimized production build ...`에서 2분 이상 정체돼 해당 빌드 프로세스만 중단했다. 빌드 통과로 처리하지 않았다.
- 기존 `202607300002_add_monthly_settlement_closings.sql`이 구현 기준 커밋에서 변경되지 않았고, 새 순서가 `202607310001_add_interim_monthly_closings.sql` 다음 `202607310002_lock_finalized_month_sources.sql`임을 확인했다.
- 소스 계약과 변경 검토에서 기존 행의 `final` 기본 백필, 직전 활성 최종 마감만 사용하는 기초 잔액, 정확한 스냅샷 PDF RPC, API 역할의 트리거 헬퍼 실행 차단, 활성 운영자·권한 검사, 스냅샷에서 제외된 회비 메모의 편집 허용, 영수증 업로드와 최종 잠금 경합 시 신규 객체 정리를 확인했다.
- Task 1~6의 집중 검토와 최종 수정 라운드를 확인했다. 보류했던 결산 Action의 `sort`·`direction` FormData 화이트리스트도 회귀 테스트와 함께 반영했다.

### 배포 차단
- 읽기 전용 `supabase migration list --linked --output-format json` 결과 `202607290001`, `202607300001`, `202607300002`는 로컬·원격이 일치했고 `202607310001`, `202607310002`는 로컬에만 있는 대기 상태였다.
- 원격에만 있는 것으로 보였던 `202607270001`, `202607270002`는 메인 작업 공간에 미추적 상태로 남아 있던 실제 운영 마이그레이션이었다. 두 파일을 기능 브랜치에 원본 SHA-256 그대로 복구한 뒤 마이그레이션 목록의 로컬·원격 버전 일치를 확인했다.
- 운영 스키마 덤프에서 `save_member_with_contact.member_id` 한정 참조가 후속 함수 정의에도 유지됨을 확인했다. 읽기 전용 운영 조회로 `#0020` 회원 1건, `#0021`~`#0024` 0건, 할당기 다음 번호 21, 정모 명단·출석 회원번호 스냅샷 불일치 0건을 확인했다.
- 읽기 전용 운영 조회에서 전체 회원과 운영자 자동 회원의 `activity_start_month` 누락이 모두 0건임을 확인했고, 운영 스키마에 월 첫날 및 가입 월 이후 제약이 유지됨을 확인했다.
- 유효한 Supabase 환경과 외부 폰트 네트워크를 제공해 Webpack 및 기본 Turbopack 프로덕션 빌드를 각각 실행했고, 두 빌드 모두 TypeScript와 26개 정적 페이지 생성을 포함해 통과했다. 제한된 네트워크에서 보였던 Turbopack 정체는 동일 조건의 Webpack 빌드가 Google Fonts DNS 실패를 명시하면서 원인이 확인됐다.
- 배포 안전 게이트에 따라 `202607310001`·`202607310002` SQL 실행과 migration repair를 모두 수행하지 않았다. SQL 실패 뒤 이력을 적용 상태로 표시하는 작업도 없었다.
- 필수 마이그레이션이 적용되지 않아 인증 운영자 프로덕션 브라우저 QA와 2026년 7월 운영 결산 생성·최종 마감을 수행하지 않았다. 실제 회비·지출·회원 데이터를 QA 목적으로 만들거나 수정하지 않았다.
- 차단 조건이 해소되면 `202607310001`과 `202607310002`를 순서대로 DB에 먼저 적용·검증하고 새 앱을 배포한다. 구 앱 트래픽이 사라진 뒤에만 레거시 페이지·PDF RPC를 제거하는 별도 정리 마이그레이션을 새로 작성하며, 이번 작업에서는 해당 정리 마이그레이션을 만들거나 적용하지 않았다.
- 운영 배포, 브라우저 QA와 프로덕션 빌드는 완료로 처리하지 않는다. 유효한 Supabase 환경으로 프로덕션 빌드를 통과시키고 활동 시작 월 백필 완전성을 확인한 뒤 안전 게이트부터 다시 실행한다.

## 2026-07-30

### Completed
- 가입일과 별도로 활동 시작 월을 저장·검증하고, 미래 시작 회원을 회원 명단에서 `활동 예정`으로 표시했다. 활동 시작 월은 회비 대상, 정모 preparing/최초 locked 명단, 월말 활동 회원 수의 공통 시작 경계가 된다.
- 회원별 회비 인정액·미납액 계산, 실제/인정/조정 수납액 조정식, 2026년 7월 기초 장부 잔액 0원과 월별 기말 잔액 승계, 마감·재개·버전 이력을 가진 정산 스냅샷을 구현했다.
- 정산 화면은 마감 전 원본 데이터 기반 미리보기를, 마감 후에는 활성 마감 스냅샷을 표시하도록 변경했다. 회원 공유용 PDF는 항상 활성 마감 스냅샷만 사용하며, 개인별 납부 정보·회원 식별자·영수증·내부 메모를 제외하고 활동 회원 수·회비 현황·장부 잔액·전체 공개 지출 내역을 표시한다. PDF 생성은 감사 RPC를 통해 감사 로그를 남긴다.
- 운영자 계정으로 자동 생성되는 회원은 활동 시작 월을 추정하지 않고 명시적인 미확정 상태로 둔다. 회원 명단은 `활동 시작월 확인 필요`를 표시하며, 기존 회원 수정 폼에서 운영자가 실제 월을 확인해 저장한다.
- 준비·최초 잠금·임시 추가 정모 후보에 활동 시작 월, 휴회 시작 월과 탈퇴 월말 경계를 동일하게 적용했다. 회비 화면은 부분납부를 미납으로 집계하고 잔여 금액을 표시하며, 마감일은 서울 시간대 달력 날짜로 표시한다.

### Verification Evidence
- 최종 통합 수정 RED 게이트에서 자동 운영자 미확정, 정모 후보 월 경계, 부분납부, 활동 시작 월 오류 UX, 서울 마감일 테스트가 예상 원인으로 17건 실패하는 것을 확인했다.
- 최종 수정 집중 Vitest — 10개 파일, 90개 테스트 통과.
- 교차 기능 Vitest: `npm run test -- src/features/members src/features/fees src/features/meetings src/features/settlements src/features/reports 'src/app/(app)/members' 'src/app/(app)/fees' 'src/app/(app)/meetings' 'src/app/(app)/settlements' 'src/app/(app)/reports'` — 51개 파일, 435개 테스트 통과.
- 최종 전체 `npm run test` — 95개 파일, 630개 테스트 통과.
- 최종 `npm run lint`, `npx tsc --noEmit`, `git diff --check` — 모두 종료 코드 0으로 통과.
- `next.config`와 PDF 경로는 변경하지 않아 프로덕션 컴파일·trace 검사는 다시 실행하지 않았다. 세 마이그레이션은 모두 이번 작업에서 적용하지 않았다.
- 교차 기능 Vitest: `npm run test -- src/features/members src/features/fees src/features/meetings src/features/settlements src/features/reports 'src/app/(app)/members' 'src/app/(app)/fees' 'src/app/(app)/meetings' 'src/app/(app)/settlements' 'src/app/(app)/reports'` — 51개 파일, 416개 테스트 통과.
- 전체 `npm run test` — 95개 파일, 611개 테스트 통과.
- `npm run lint`, `npx tsc --noEmit`, `git diff --check` — 모두 종료 코드 0으로 통과.
- 표준 `npm run build`(Next.js 16.2.10 Turbopack)은 컴파일과 TypeScript 검사까지 성공했으나, 이 격리 작업트리에 Supabase 환경 변수가 없어 `/(.)expenses/new` 정적 사전 렌더에서 `Missing or invalid Supabase environment variables`로 종료 코드 1을 반환했다. 빌드 통과로 처리하지 않았다.
- `npx next build --webpack`도 컴파일과 TypeScript 검사까지 성공했으나 같은 환경 변수 부재로 `/(.)expenses/new`와 `/fees/new` 사전 렌더에서 종료 코드 1을 반환했다. 월간 PDF 라우트 NFT에는 `../../../../../../src/features/reports/fonts/IBMPlexSansKR-Regular.ttf` 항목이 정확히 한 번 포함된 것을 확인했다.
- DB에 적용하지 않고 마이그레이션을 검토했다. `202607300001`은 nullable `activity_start_month`와 월 첫날/가입 월 제약을 먼저 추가하며, `202607300002`는 정산 마감 스키마·RPC·RLS를 추가한다. 최종 `NOT NULL` 마이그레이션은 존재하지 않는다. 마감 계산은 활동 시작 월 null을 거부하고, 스냅샷 JSON은 회원·납부·영수증·메모 식별자를 포함하지 않는다. 활성 운영자 읽기 RLS, 직접 인증 사용자 쓰기 차단, 고정 `search_path`, 명시적 grant/revoke, 권한 재검증, advisory lock과 원본 테이블 공유 잠금, 버전·원장·감사 규칙 및 PDF 감사 RPC의 원자적 closing-row 잠금을 확인했다.

### Deployment Gate
- `202607290001`, `202607300001`, `202607300002`는 이번 작업에서 운영 DB에 적용하지 않았다. 배포는 반드시 `202607290001_add_member_pause_start_month.sql` → `202607300001_add_member_activity_start_month.sql` → 운영자 확인 활동 시작 월 백필 → `202607300002_add_monthly_settlement_closings.sql` 순서로 진행한다.
- 마이그레이션 실행기가 대기 중인 버전을 번호 순서로 자동 적용하더라도, `202607300001` 뒤에서 백필을 완료하고 검증한 다음 `202607300002`를 계속하는 운영 중단점이 보장되기 전에는 실행하지 않는다.
- 기존 회원과 자동 생성 운영자 회원의 활동 시작 월은 가입일·계정 생성 월로 추정하지 않는다. 운영자가 확인한 값으로 입력하고 완전성·월 첫날·가입 월 경계를 검증한다.
- 최종 `NOT NULL` 마이그레이션 전에는 운영자 계정 생성과 확인된 활동 시작 월을 한 작업으로 원자적으로 받도록 자동 회원 생성 흐름을 재설계해야 한다. 이 재설계와 전체 백필 검증 전에는 최종 제약을 만들거나 적용하지 않는다.
- 첫 마감은 2026년 7월이며 기초 장부 잔액은 0원이다. 8월 이후는 직전 활성 마감의 기말 잔액을 승계하므로 월 순서를 건너뛰어 마감하지 않는다.
- 롤백 가능한 DB 환경에서 마이그레이션과 백필을 적용한 뒤, 인증된 운영자 브라우저로 회원·회비·정모·정산 마감/재개·PDF·권한 경계를 QA해야 한다. Supabase 환경 변수를 제공한 프로덕션 빌드도 그 전에 다시 확인해야 한다.

## 2026-07-29

### Completed
- `members.pause_start_month`를 추가하고 휴회원은 휴회 시작 월을 필수로, 활성·탈퇴 회원은 null만 허용하는 월 단위 제약을 구현했다. 기존 휴회원은 개인 식별 없이 모두 `2026-08-01`로 백필한다.
- 회원 등록·수정·디렉터리·목록 UI에 휴회 시작 월을 연결했다. `2026-08-01`부터 휴회인 회원은 2026년 7월에는 대상에 남고 8월부터 제외된다.
- 회비 보드와 월간 메모의 대상 필터, CSV 가져오기에 월 기준 자격 판정을 적용했다. CSV의 7월 행은 허용하고 같은 휴회원의 8월 행은 대상 외로 거부한다.
- 정모 preparing 명단 동기화, 최초 locked 명단, ad-hoc 추가, 정모 디렉터리 후보를 각 회차 월 기준으로 제한했다. 이미 잠긴 명단과 기존 출석 행은 변경하지 않는다.

### Verification Evidence
- 회원·회비 집중 Vitest(`src/features/members`, `src/features/fees`, `src/app/(app)/members`, `src/app/(app)/fees`; `.worktrees/**` 제외): 23개 파일, 175개 테스트 통과.
- 정모 집중 Vitest(`src/features/meetings`, `src/app/(app)/meetings`; `.worktrees/**` 제외): 18개 파일, 144개 테스트 통과.
- `.worktrees/**`를 제외한 전체 Vitest: 90개 파일, 527개 테스트 통과.
- 루트 전체 ESLint: `npx eslint . --ignore-pattern '**/.worktrees/**'` 통과(오류·경고 없음).
- `npx tsc --noEmit`: 통과.
- `npm run build`: `.env.local` 표준 로딩으로 Next.js 16.2.10 Turbopack 프로덕션 빌드 통과(26개 정적 페이지 생성).
- `git diff --check`: 통과.

### Remaining Concern
- 로컬 Supabase PostgreSQL 컨테이너가 없어 마이그레이션을 실제 DB에 적용하지는 못했다. 배포 전 롤백 가능한 환경에서 `2026-08-01` 백필, 제약 조건, RPC 저장·조회 및 정모 명단 경계를 실행 검증해야 한다.

### Deployment Gate
- DB 마이그레이션을 먼저 적용하고 앱을 배포한다. 전환 중에는 구버전 UI의 신규 `active`→`paused` 전환을 금지하거나 짧게 회원 쓰기를 중단한다. 구버전 요청은 기존 휴회원 수정과 재활성화는 호환되지만, 시작 월 키 없는 신규 휴회 전환은 DB 제약으로 거부된다.
- 배포 전 롤백 가능한 DB에서 백필·제약, `save_member_with_contact`, 회원 디렉터리, 7월 포함·8월 제외 회비/정모 명단 smoke를 완료해야 한다. 로컬 DB 부재 상태에서 운영 DB에 임의 적용하지 않는다.

## 2026-07-27

### 회원 등록 RPC 장애 진단
- 관리자 Auth 사용자가 이메일 확인·비차단 상태이고, 연결된 프로필이 활성 `admin`이며 `members.create`와 `members.contacts.manage` 권한을 모두 보유한 것을 운영 Supabase에서 확인했다.
- 관리자 일회성 인증으로 반드시 롤백되는 회원 저장 요청을 재현해 PostgreSQL `42702` 오류(`member_id` 매개변수와 컬럼 참조가 모호함)를 확인했다.
- `save_member_with_contact`의 공개 함수 시그니처를 유지하면서 모든 매개변수 참조를 함수명으로 한정하고 연락처 upsert 충돌 대상을 기본키 제약 이름으로 변경하는 전진 마이그레이션을 추가했다.
- 회귀 테스트를 RED→GREEN으로 실행해 새 마이그레이션이 모호한 `member_id` 참조를 다시 도입하지 않도록 했다.

### 적용 상태
- 로컬 수정과 집중 테스트는 완료했다.
- 운영 DB에 Supabase SQL Editor로 적용했다.
- 적용 후 존재하지 않는 그룹 ID를 사용한 롤백 진단에서 기존 `42702` 모호성 오류가 사라지고 예상한 `23503` 외래 키 오류까지 도달해 수정된 함수가 실제 호출되는 것을 확인했다. 진단 데이터는 트랜잭션 롤백으로 저장되지 않았다.

### 첫 신규 회원번호 교정 준비
- 운영 DB에서 첫 신규 회원의 실제 번호가 `#0024`, 기존 번호가 `#0000`~`#0019`, 할당기의 다음 번호가 `#0025`인 것을 확인했다.
- 기대 상태 `#0020`과 다음 번호 `#0021`을 검사하는 읽기 전용 회귀 검사를 실행해 현재 상태에서 의도대로 실패(RED)하는 것을 확인했다.
- `#0020`~`#0023`의 공백, 정확히 하나인 `#0024` 대상, 할당기 `#/25`를 선행 검증하고 회원번호·정모 명단/출석 스냅샷·할당기를 한 트랜잭션에서 각각 `#0020`·`#0021` 상태로 교정하는 전진 마이그레이션을 추가했다.
- 운영 DB에 마이그레이션을 적용한 뒤 동일한 읽기 전용 검사를 다시 실행해 첫 신규 회원 `#0020`, 할당기 `#/21`, 예약 구간의 유일한 행 `#0020`, 정모 명단 스냅샷 `#0020`, 출석 스냅샷 0건을 확인했다.
- SQL Editor 직접 실행에 따른 `supabase_migrations` 이력은 PostgREST가 해당 스키마를 노출하지 않아 API로 확인하지 못했다.

## 2026-07-15

### Completed
- 정모 회차를 월별 첫째·셋째 주차 표기와 분리해 2026년 7월 18일을 1회차로 시작하는 전체 기간 누적 번호로 변경하고, 연결 번개는 원 정모 회차의 대체 일정으로 표시하도록 구현했다.
- 정모 디렉터리 데스크톱 표를 회차·구분·날짜·시간·장소·상태와 사전 참석·출석의 2단 그룹 헤더 및 개별 숫자 컬럼으로 재구성하고, 넓어진 표가 데이터 패널 안에서 스크롤되도록 유지했다.
- 데스크톱 표와 모바일 카드의 정모 구분·상태·연결 관계 칩을 의미 있는 색상의 일반 텍스트로 바꾸고 텍스트 의미를 그대로 유지했다.
- 모바일 카드에 누적 회차와 대체 회차 관계를 표시했으며, 기존 카드형 날짜·시간·장소·참석 요약 구조를 유지했다.
- 정모 월 필터의 기존 숨김 레이블을 유지해 화면에는 중복 레이블이 노출되지 않으면서 접근 가능한 이름은 보존했다.
- 회비 납부 여부와 독립된 `fee_monthly_notes` 테이블을 추가하고 회원·기준 월 복합 유일 제약, 1~500자 검증, 조회·생성·수정·삭제 RLS 정책을 적용했다.
- 기존 `fee_payments.memo`는 CSV 호환을 위해 유지하고, 기존 메모 이관과 이후 CSV 메모를 월간 메모로 동기화하는 트리거를 추가했다.
- 회비 보드의 데스크톱 메모 컬럼과 모바일 카드에 회원별 `메모 입력`·`수정` 버튼을 추가하고, 같은 모달에서 저장·수정·빈 값 삭제를 지원했다.
- 미납 회원도 메모를 먼저 기록할 수 있게 했으며, 납부 처리와 납부 취소가 월간 메모를 삭제하거나 변경하지 않도록 분리했다.
- 메모 조회는 `fees.payments.view`, 저장·수정·삭제는 `fees.payments.create` 또는 `fees.payments.update` 권한으로 제한했다.
- 실제 QA에서 긴 메모가 데스크톱 표 셀을 과도하게 확장하는 문제를 발견해 전역 최대 너비 토큰과 말줄임 회귀 테스트를 추가했다.
- Next.js가 생성한 병렬 라우트 타입에 맞춰 앱 레이아웃의 `modal` 슬롯을 필수 속성으로 정리했다.
- Supabase SQL Editor에서 `202607150001_add_fee_monthly_notes.sql`을 단일 트랜잭션으로 운영 DB에 적용하고 마이그레이션 이력을 등록했다.
- `202607150002_update_club_meeting_numbering.sql`을 운영 Supabase에 적용해 7월 4일 정모를 제거하고 7월 18일부터 전체 기간 누적 회차를 부여했다.
- 정모 페이지의 권한 확인·월 준비·목록 조회가 원격 DB 왕복을 순차적으로 누적하는 병목을 확인하고, 월 준비와 목록 조회를 단일 보안 RPC로 합치는 성능 최적화를 구현했다.
- 성능 최적화 마이그레이션 적용 전에도 페이지가 동작하도록 새 RPC가 없을 때 기존 두 RPC로만 복귀하는 배포 순서 호환 처리를 추가했다.
- 정모의 기존·신규 장소 기본값을 `용마테니스장`으로 통일하는 데이터 규칙과 마이그레이션 범위를 설계 문서로 확정했다.
- 검증된 월간 회비 메모 커밋을 `main`에 fast-forward 병합하고 기능 작업 트리와 로컬 기능 브랜치를 정리했다.

### Verification Evidence
- 정모 집중 테스트: 16개 파일, 135개 테스트 통과.
- 전체 테스트: 87개 파일, 494개 테스트 통과.
- `npm run lint`, `npx tsc --noEmit`, `git diff --check`: 통과.
- 루트 작업 공간의 기존 `.env.local`을 값 출력 없이 로드하고 필요한 네트워크 접근을 허용한 `npm run build`: Next.js 16.2.10 Turbopack 컴파일, TypeScript, 26/26개 정적 페이지 생성과 `/meetings`, `/api/meetings/rows`를 포함한 전체 라우트 빌드 통과.
- 인증된 로컬 admin 브라우저 세션이 이미 실행 중인 상태가 아니었고 샌드박스에서 브라우저 데몬의 localhost 바인딩도 허용되지 않아 1440×900 및 375×812 브라우저 관찰, 콘솔 오류와 실패 요청 검증은 수행할 수 없었다. 브라우저 QA는 성공으로 처리하지 않았다.
- 정적 범위 검토에서 월 필터의 숨김 레이블이 유지되고, 2026년 7월 4일 삭제가 `meeting_kind = 'regular'`와 날짜로 한정되며 연결 번개 존재 시 마이그레이션을 중단하는 것을 확인했다.
- 정모 디렉터리의 `Badge` 제거는 데스크톱 디렉터리 표와 모바일 카드에만 적용됐고 명단 입력이나 관련 없는 버튼·링크 표현은 변경하지 않았다.
- 운영 DB에서 `meeting_number` 컬럼이 생성된 것을 확인했고 7월 4일 정모 0건, 누락·중복 회차 0건을 확인했다. 7월 18일은 1차, 8월 1일은 2차, 8월 15일은 3차 정모로 저장됐다.
- Supabase 읽기 요청 3회를 비교한 결과 순차 호출은 898~1,893ms, 병렬 호출은 345~923ms로 측정돼 데이터 양보다 원격 왕복 누적이 정모 페이지 병목임을 확인했다.
- 단일 정모 디렉터리 RPC와 구버전 DB 호환 경로를 RED→GREEN으로 검증했고 전체 테스트 88개 파일, 496개 테스트와 ESLint, TypeScript, `git diff --check`가 통과했다.
- Supabase SQL Editor에서 `202607150003_optimize_meeting_directory_load.sql`을 먼저 실행해 성공을 확인한 뒤 `202607150004_default_meeting_location.sql`을 적용했다. `202607150004` 최초 시도는 편집기 SQL 연결로 인한 구문 오류로 실행되지 않았고, 편집기를 비운 뒤 해당 마이그레이션만 다시 실행해 성공을 확인했다.
- 정모 기본 장소 변경의 로컬 검증 게이트에서 전체 테스트 89개 파일, 501개 테스트와 ESLint, TypeScript, `git diff --check`가 통과했다.
- 운영 DB 검증 SQL에서 장소 null 0건, `용마테니스장` 5건, 장소 기본값 `'용마테니스장'::text`, `is_nullable = NO`, `load_club_meeting_directory_page` 존재를 확인했다. 2026년 7월 18일부터 9월 19일까지 실제 정기 정모 5건은 누적 회차 1~5와 장소 `용마테니스장`으로 조회됐다.
- 인증된 로컬 사용자로 `/meetings`의 2026년 7월 정모 1건과 7월 18일 1차 정모 장소 `용마테니스장`을 확인했고 콘솔 오류는 없었다. 회차 관리에서 장소 입력을 비워 저장한 뒤 입력값과 목록이 모두 `용마테니스장`으로 유지되고 `장소를 변경했습니다.` 메시지가 표시되는 것을 확인했으며 콘솔 오류는 없었다. `/schedule?month=2026-07&selectedDate=2026-07-18`에서도 1차 정모 장소가 동일하게 표시됐고 콘솔 오류는 없었다. 시각 검토에서 `조회 월` 텍스트는 노출되지 않으면서 월 입력의 접근 가능한 이름은 유지됐다.
- 정모 디렉터리의 구버전 fallback은 결합 RPC가 정확히 `PGRST202`를 반환할 때만 실행되며, 운영 DB에 해당 함수가 존재하고 PostgREST OpenAPI에도 노출된 상태에서 인증된 `/meetings` 렌더링을 확인해 기본 결합 RPC 경로 사용을 검증했다. 개발 서버 로그에서 최종 `GET /meetings 200`은 615ms였고 장소 저장 `POST /meetings 200`, `GET /schedule 200`, `selectedDate` 일정 경로 200을 확인했다. 관련 앱 요청 실패는 없었고 브라우저 콘솔은 비어 있었다.
- 운영 DB에 `fee_monthly_notes` 테이블, RLS 정책 4개, `fee_payments_sync_monthly_note` 트리거와 `202607150001` 마이그레이션 이력이 존재함을 확인했다.
- 마이그레이션 직후 월간 메모 0건, `(member_id, period_month)` 중복 그룹 0건이었다.
- 1440×900에서 미납 회원 메모 입력·수정, 459자 요약의 320px 말줄임, 납부 처리 후 메모 유지, 납부 취소 후 미납 복구를 확인했다.
- 375×812에서 모든 회원 카드의 메모 작업, 351×302px 모달 적합성, 문서 너비와 viewport 375px 일치, 가로 넘침 없음과 콘솔 오류 없음·실패한 로컬 요청 없음을 확인했다.
- QA 종료 후 대상 회원의 2026-07 월간 메모와 납부 기록이 각각 0건임을 Supabase HEAD/count로 확인했다.
- 전체 테스트: 85개 파일, 479개 테스트 통과.
- `npm run lint`, `npx tsc --noEmit`, `git diff --check`: 통과.
- 공개 Supabase 환경 변수만 사용한 Next.js 16.2.10 Webpack 프로덕션 빌드: 컴파일, TypeScript, 26개 정적 페이지 생성과 전체 라우트 빌드 통과.
- 작업 트리 정리 후 원본 `main`에서 `npm test`: 85개 파일, 479개 테스트 통과.

## 2026-07-14

### Completed
- Supabase Management API를 통해 `202607130002_add_club_meetings.sql`을 운영 DB에 단일 트랜잭션으로 적용했다.
- 정모 마이그레이션 부트스트랩에서 `period_month` PL/pgSQL 변수와 충돌 대상 컬럼이 모호해지는 오류를 재현하고, 내부 변수를 `normalized_period_month`로 구분해 수정했다.
- 적용이 확인된 `202607130001_optimize_navigation_queries.sql`과 `202607130002_add_club_meetings.sql`을 `supabase_migrations.schema_migrations` 이력과 동기화했다.
- 정모 목록에서 장소 변경·취소·마감 등 보조 작업을 회차별 관리 disclosure로 이동하고 데스크톱 행과 모바일 카드를 스캔 중심으로 압축했다.
- 정모 명단에 이름·회원번호 검색, 탭별 상태 필터, 접힌 임시 대상 추가, RSVP·출석 행 단위 자동 저장을 적용했다.
- 명단 준비 전, 읽기 전용, 충돌·오류·지각 시간 검증과 기존 URL·권한 계약을 유지하면서 모바일 명단의 첫 화면에 실제 회원 입력이 보이도록 개선했다.
- 구조화 코드 리뷰에서 관리 disclosure를 닫았다 열 때 진행 중인 생명주기 작업 잠금이 초기화되던 문제를 수정해 닫힌 동안에도 하위 작업 상태를 유지했다.
- 상태 필터와 서버 충돌이 겹칠 때 행이 사라져 재시도할 수 없던 문제를 수정해 재시도가 끝날 때까지 해당 행을 표시하고, 재시도 상태가 해제되면 정상 필터로 복귀하도록 했다.
- 검증된 정모 참석·출석 관리 및 UI 개선 커밋 23개를 `main`에 fast-forward 병합하고 `origin/main`의 `20abb9b`까지 푸시했다.

### Verification Evidence
- 최초 적용 실패 후 트랜잭션 롤백을 확인해 정모 테이블이 0개인 상태에서 수정본을 재적용했다.
- 운영 DB에 정모 테이블 5개, RLS 정책 5개, 권한 종류 3개와 admin/operator 권한 행 6개가 생성됐다.
- 부트스트랩 결과 정모 6개, 월 명단 1개, 명단 회원 20명, 출석 대상 40개가 생성됐고 중복 정기 정모는 0개다.
- `authenticated`와 `anon`의 정모 테이블 직접 쓰기는 차단됐으며, `prepare_club_meeting_month(date)` 실행 권한은 `authenticated`에만 부여됐다.
- PL/pgSQL 변수 충돌 회귀 테스트를 RED→GREEN으로 검증했고 정모 마이그레이션 집중 테스트 23개가 통과했다.
- 인증된 admin 브라우저에서 7월 정모 목록과 명단 20명, 미래 회차 사전 참석 편집, 시작 전 출석 입력 20건 비활성화를 확인했다.
- 같은 행을 두 탭에서 저장해 첫 요청은 저장되고 오래된 두 번째 요청은 충돌 메시지와 최신 서버 값으로 복원되는 낙관적 동시성 흐름을 확인한 뒤 사전 참석을 미응답으로 복구했다.
- 8월 정모가 1일·15일, 9월 정모가 5일·19일로 생성됐고 7월 말~8월 초 주간 일정에 8월 1차 정모가 표시되며 `month=2026-08`와 검증된 일정 복귀 URL을 유지했다.
- 일정 딥링크로 연 정모 모달이 닫힐 때 `/schedule?view=week&date=2026-08-01`로 복귀했고, 비인증 `/meetings` 접근은 `/login?next=%2Fmeetings`로 리디렉션됐다.
- 375×812 모바일 화면에서 문서 너비와 viewport가 모두 375px였고 정모 카드 목록에 가로 넘침이 없었다.
- 브라우저 콘솔 오류와 실패한 확인 대상 네트워크 요청은 없었다.
- QA 종료 후 운영 DB는 정모 6개, 마감 0개, 사전 응답 40건 전부 미응답, 출석 40건 전부 미확인으로 복구됐다. QA 중 의도치 않은 마감과 즉시 재개로 append-only 생명주기 이력에 `attendance_closed`, `attendance_reopened`가 각각 1건 남았다.
- 임시 operator 계정으로 전체 권한, 조회 전용, 회차 관리 전용, 출석 관리 전용, 조회 권한 없음의 다섯 조합을 실제 인증 RPC와 RLS에서 검증했다.
- 조회 전용은 정모 조회만 허용하고 회차 변경을 거부했으며, 회차 관리·출석 관리 조합은 각 DTO 플래그와 전용 RPC 경계만 허용했다. 조회 권한이 없으면 디렉터리 RPC가 거부되고 RLS 조회 결과도 0건이었다.
- 검증 후 임시 Auth 사용자, operator 프로필, 자동 생성 회원이 모두 0건임을 확인했고 operator의 정모 권한 3개를 복원했다. 운영 사전 응답 40건은 전부 미응답, 출석 40건은 전부 미확인 상태를 유지했다.
- 정모 UI 개선과 코드 리뷰 수정 후 전체 테스트 80개 파일, 458개 테스트와 `npm run lint`, `npx tsc --noEmit`, Next.js 16.2.10 프로덕션 빌드, `git diff --check`가 통과했다.
- 인증된 admin 브라우저의 1440×900 화면에서 두 회차가 닫힌 관리 작업과 함께 압축된 표로 표시되고, 명단 검색·상태 필터·접힌 임시 대상·변경 이력이 정상 동작함을 확인했다.
- 375×812 화면에서 월 요약이 2×2로 표시되고 첫 회차의 제목·상태·명단 작업과 명단 모달의 첫 회원 상태 입력이 초기 화면에 노출됐다. 목록과 명단 모두 `innerWidth`, `clientWidth`, `scrollWidth`가 375px로 일치했다.
- 8월 준비 중 회차는 `명단 준비 전`과 생성 조건을 표시하고 활성 명단 링크를 제공하지 않았다. 브라우저 콘솔 오류는 없었고 검색·필터·관리 영역 열기만 검증해 운영 참석·출석 데이터는 변경하지 않았다.
- `main` 병합은 충돌과 별도 merge commit 없이 완료됐으며, 푸시 후 로컬 `main`과 `origin/main`이 동일한 `20abb9b`를 가리키는 것을 확인했다.

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
- 정렬 방향 문자 기호를 외부 폰트 의존성이 없는 로컬 인라인 SVG로 교체하고, 위·아래 화살표를 항상 유지하면서 현재 방향만 활성 색상으로 표시하도록 개선했다.
- 회원 등록·수정 폼의 이름, 연락처, 그룹, 가입일, 상태, 탈퇴일, 메모 label을 화면에 표시했다.
- 이름, 연락처, 메모 입력에 각각 `홍길동`, `010-1234-5678`, `특이사항을 입력하세요` placeholder를 추가했다.
- 회원 수정 콘텐츠를 공용 컴포넌트로 분리하고, 목록 이동과 수정 URL 직접 접속·새로고침 모두 `회원 수정` 모달을 표시하도록 구현했다.
- Superpowers 브레인스토밍으로 정모 참석·출석 관리의 제품 범위, 상태 모델, 월별 회원 명단 확정 규칙, 취소·번개·출석 마감 흐름을 확정했다.
- 정모 전용 데이터와 기존 일정 달력 통합 조회, 월별 운영 테이블과 큰 명단 모달, 기존 Figma 기반 스타일 재사용 방향을 설계했다.
- 승인된 설계를 `docs/superpowers/specs/2026-07-13-club-meeting-attendance-design.md`에 문서화하고 커밋했다.

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
- 로컬 SVG 정렬 아이콘 변경 후 집중 회귀 테스트: 5개 파일, 19개 테스트 통과.
- 로컬 SVG 정렬 아이콘 변경 후 전체 테스트: 66개 파일, 308개 테스트 통과.
- `.worktrees/**`를 제외한 루트 프로젝트 린트와 `git diff --check`: 통과.
- 브라우저 렌더링에서 오름차순은 위 화살표만 파란색, 내림차순은 아래 화살표만 파란색, 비활성 열은 두 화살표 모두 회색으로 표시되고 두 화살표가 항상 유지됨을 확인했다.
- 회원 폼 표현과 직접·인터셉트 수정 모달 집중 테스트를 RED→GREEN 순서로 검증했다: 5개 파일, 10개 테스트 통과.
- 전체 테스트: 66개 파일, 305개 테스트 통과. 병렬 검증 중 1회 타임아웃된 PDF 테스트는 단독 재실행과 전체 단독 재실행에서 모두 통과했다.
- 회원 폼·수정 모달 변경 후 `npm run lint`와 `npx tsc --noEmit` 통과.
- `.env.local`을 표준 로딩한 `npm run build`: Next.js 16.2.10 Turbopack 컴파일 3.2초, 직접 수정 및 인터셉트 수정 라우트 포함 전체 빌드 통과.
- 정모 참석·출석 설계 명세에서 미완성 표현, 내부 모순, 월 경계, 출석 마감 복원, 후속 통계 계산 계약을 자체 검토하고 `git diff --check`를 통과했다.
- 설계 문서 커밋: `382dd4d docs: add club meeting attendance design`.

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

### 회원 등록·수정 팝업 개선
- 회원 등록 폼의 모든 입력 항목에 항상 보이는 레이블과 구체적인 placeholder를 추가했다.
- 기존 페이지형 회원 수정 화면을 등록 화면과 같은 모달 흐름으로 통일하고, 직접 URL 진입과 회원 목록의 인터셉트 라우트 모두 팝업으로 표시되도록 구성했다.
- 등록과 수정 화면이 동일한 회원 폼을 공유하도록 유지해 필드 안내와 검증 동작의 차이를 방지했다.
- 회원 수정 버튼 클릭 후 팝업이 늦게 표시되는 원인을 조사했다. 인터셉트 라우트가 권한·회원·연락처·그룹 조회가 모두 끝날 때까지 `ModalDialog` 렌더링 자체를 대기하고 있었다.
- 회원 수정 모달 껍데기는 동기적으로 먼저 렌더링하고 비동기 회원 데이터 영역만 `Suspense`로 분리했다. 조회 중에는 접근 가능한 로딩 상태를 팝업 내부에 표시한다.
- 회원 데이터 Promise가 완료되지 않은 상태에서도 수정 dialog가 즉시 존재하는 회귀 테스트를 추가했다.

### 테이블 헤더 정렬 개선
- 회원 및 회비 테이블 헤더를 클릭해 오름차순·내림차순 정렬을 전환할 수 있도록 공용 정렬 헤더를 적용했다.
- 현재 정렬 방향과 반대 방향 화살표를 함께 유지하면서 활성 방향을 시각적으로 구분하도록 보완했다.
- 키보드와 스크린 리더에서 정렬 버튼 및 현재 정렬 상태를 인식할 수 있도록 접근성 속성과 테스트를 추가했다.
- 구현 계획과 디자인 명세를 `docs/superpowers/`에 기록했다.

### 추가 검증 근거
- `npm test`: 66개 파일, 308개 테스트 통과.
- 회원 수정 모달 회귀 테스트: 1개 파일, 2개 테스트 통과.
- 변경된 회원 수정 모달 파일 대상 ESLint: 경고와 오류 없이 통과.
- `npm run build`: Next.js 16.2.10 프로덕션 빌드, TypeScript 검사, 24개 정적 페이지 생성까지 통과.
- `git diff --check`: 변경 파일의 공백 오류 없음.

### 정모 참석 및 출석 관리 설계·계획
- 정모 월 명단, 사전 응답, 실제 출석, 마감·재개, 취소·복구, 대체 번개, 일정 연동의 제품 계약을 보완했다.
- 최초 배포 월 통계 제외, 준비 명단 전체 스냅샷 동기화, 임시 대상 제거 조건, 변경 이력 표시, 일정 복귀 URL, 권한 조합, 번개 상태 행렬을 설계에 확정했다.
- RPC 전용 쓰기, 월 단위 잠금, 교차 월 명단 연결 차단, 행 동시성, KST 판정, 기존 회원 RPC 복구를 포함한 구현 계획을 작성했다.
- 구현 코드는 아직 시작하지 않았고 Supabase 마이그레이션도 적용하지 않았다.

## 2026-07-14

### 정모 참석 및 출석 관리 구현
- 정모 회차, 월 명단, 회차별 응답·출석, 추가 전용 생명주기 이력과 세분화 권한을 단일 추가형 마이그레이션으로 구현했다.
- KST 기준 현재 월부터 다음 2개월 회차 보장, 최초 배포 월 bootstrap 통계 제외, 다음 달 preparing 명단 동기화, 월 1일 잠금과 회원 쓰기 연동을 구현했다.
- 응답·출석 CAS 저장, 장소 변경, 취소·복구, 출석 마감·재개, 원 정모당 한 번의 대체 번개, 확정 명단 이후 임시 대상 추가·제거 RPC와 안전한 Server Action 오류 계약을 추가했다.
- 동시 회원 저장의 전체 회원 공유 잠금을 제거하고, 준비 중 명단의 잘못된 임시 대상과 명단 잠금 전 생성된 번개의 대상 누락을 회귀 테스트와 함께 보완했다.
- `/meetings` 월별 데스크톱 표·모바일 카드, 권한·상태별 생명주기 작업, 검색 파라미터 명단 모달, 행 단위 병렬 저장, 충돌·재시도, ARIA 탭·포커스 트랩·변경 이력을 구현했다.
- `/schedule`에 일반 일정과 정모·취소 정모·대체 번개를 공통 표시 모델로 병합하고 실제 월/7일 범위, KST 오늘, 원 정모 월 링크와 검증된 복귀 URL을 적용했다.
- 비인증 `/meetings` 딥링크가 앱 코드를 실행해 500이 되던 보호 경로 누락을 브라우저에서 발견하고 프록시 리다이렉트 회귀 테스트로 수정했다.
- 품질 리뷰에서 먼 미래 월 URL로 회차를 무제한 생성할 수 있던 준비 범위를 현재 월부터 다음 2개월로 제한하고, 행 저장의 회차 공유 잠금·무변경 장소 이력 억제·행 API 계약 단일화를 반영했다.
- 생명주기 Action 거부, 행 네트워크 실패 복원·재시도, 잘못된 일정 DTO를 검증하는 회귀 테스트를 보강했다.

### 검증 근거
- DB·도메인 집중 게이트: 12개 파일, 124개 테스트 통과.
- 정모 UI 집중 게이트: 4개 파일, 47개 테스트 통과.
- 일정·셸 회귀 게이트: 5개 파일, 29개 테스트 통과.
- 전체 `npm run test`: 79개 파일, 445개 테스트 통과.
- `npm run lint`, `npx tsc --noEmit`, `git diff --check`: 통과.
- `npm run build`: Next.js 16.2.10 프로덕션 빌드, TypeScript, 26개 정적 페이지 생성과 `/meetings`, `/api/meetings/rows` 경로 포함까지 통과.
- 로컬 브라우저에서 `/login` 접근성 입력과 콘솔 오류 없음을 확인하고, 비인증 `/meetings?month=2026-07`이 `/login?next=%2Fmeetings%3Fmonth%3D2026-07`로 이동함을 확인했다.

### 운영 적용 보류
- 로컬 환경에는 `supabase`, `psql`, `docker`가 없고 `.env.local`에는 DDL 실행 경로가 없어 `202607130002_add_club_meetings.sql`을 실제 Supabase 프로젝트에 적용하지 않았다.
- 실제 admin/operator 및 분리 권한 계정의 RPC 권한 행렬, 두 연결 동시성, KST 월·시간 경계, 1440px/375px 인증 화면과 네트워크 검증은 마이그레이션 적용 뒤 수행해야 한다.
