# Navigation Performance Design

## Goal

한국 사용자가 인증된 운영 페이지 사이를 이동할 때 발생하는 반복 Supabase 왕복을 줄이고, 서버 데이터가 준비되기 전에도 즉시 전환 피드백을 제공한다.

## Baseline

- 로컬 한국 환경에서 Supabase REST warm TTFB 중앙값은 약 157ms이고 첫 요청은 약 801ms였다.
- 모든 보호 경로는 Proxy에서 `supabase.auth.getUser()` 네트워크 요청을 수행한다.
- 회원 페이지는 연락처·등록·수정 권한을 각각 조회하고 회원·연락처·직책을 별도로 조회해 최대 12회의 Supabase 호출을 수행한다.
- 인증된 App Router 경로에 `loading.tsx`가 없어 동적 경로 이동이 서버 응답 전까지 시각적으로 멈춰 보인다.
- Vercel Function 리전은 저장소에서 지정하지 않았고 Supabase 프로젝트는 Seoul 리전이다.

## Success Criteria

- 회원 목록 페이지 자체의 Supabase 네트워크 호출을 최대 12회에서 1회로 줄인다.
- Proxy 보호 경로 인증을 `getClaims()`로 전환해 정상 JWT의 매 이동 Auth 서버 요청을 제거한다.
- 앱 레이아웃과 등록·수정 경로의 운영자 컨텍스트는 렌더 요청당 한 번만 조회한다.
- 인증된 앱 경로에 즉시 렌더되는 로딩 경계를 추가한다.
- Vercel Node Function을 `icn1`에 배치한다.
- 기존 관리자·운영자 권한, 연락처 마스킹, 직접 경로 차단, 회원 검색·정렬 동작을 유지한다.

## 1. Unified Operator Context

새로운 additive migration에서 `public.get_current_operator_context()`를 추가한다. 함수는 `auth.uid()`를 기준으로 활성 프로필, 표시 이름, 역할 라벨, 직책 라벨, 역할의 전체 권한 배열을 JSON으로 반환한다.

함수는 `security definer`, 고정 `search_path`, `stable`로 정의하고 `authenticated`에만 실행 권한을 부여한다. 호출자가 다른 사용자 ID를 전달하는 인자는 제공하지 않는다.

서버 모듈은 이 RPC 결과를 검증·정규화하고 React `cache()`로 요청 단위 메모이제이션한다. 앱 레이아웃과 회원 등록·수정 권한 확인은 이 컨텍스트를 공유한다. 사용자별 결과를 요청 간 캐시하지 않는다.

## 2. Unified Member Directory Page

`public.get_member_directory_page(requested_status, requested_query)`를 추가한다. 반환 JSON은 `can_create`, `can_update`, `can_manage_contacts`, `members`를 포함한다.

DB 함수 내부에서 현재 사용자의 역할 권한을 확인한다. 연락처 관리 권한이 있으면 전체 전화번호를 형식화하고, 없으면 기존 마스킹 규칙을 적용한다. 회원 기본정보, 그룹 코드, 운영자 직책은 SQL join으로 한 번에 결합한다. 검색은 이름과 회원번호에 적용하고, 상태 값은 허용된 enum 값만 처리한다.

함수는 기존 RLS와 동일한 활성 운영자 조건을 강제한다. 미인증 또는 비활성 사용자는 빈 결과와 false 권한을 반환하거나 실행을 거부한다. 연락처 원문은 권한이 없는 응답에 포함되지 않는다.

회원 페이지는 이 RPC 한 번만 호출하고 결과의 권한과 회원 행을 함께 사용한다. 기존 `loadMemberDirectory()`와 페이지에서 중복 호출하던 `hasCurrentUserPermission()` 조합을 제거한다. 등록·수정 단일 페이지는 공통 운영자 컨텍스트를 사용한다.

## 3. Loading Boundary

`src/app/(app)/loading.tsx`를 추가한다. 공유 AppShell은 유지하고 콘텐츠 영역에 제목·필터·목록을 닮은 가벼운 skeleton을 표시한다. SCSS는 기존 디자인 토큰과 kebab-case 클래스만 사용하며 모션 감소 설정을 존중한다.

로딩 경계는 동적 경로의 레이아웃 프리페치를 허용하고, 서버 응답을 기다리는 동안 즉시 사용자 피드백을 제공한다. 실제 데이터나 이전 사용자의 내용을 로딩 UI에 포함하지 않는다.

## 4. Seoul Function Region

루트 `vercel.json`에 `regions: ["icn1"]`을 설정한다. 정적 자산 배포에는 영향을 주지 않고 Node Function을 Seoul에 배치한다. 빌드 테스트에서 JSON 형식과 정확한 리전 값을 검증한다.

## 5. Proxy Claims Verification

Supabase 공식 SSR 권장 방식에 맞춰 Proxy의 `getUser()`를 `getClaims()`로 변경한다. `sub` claim을 인증 사용자 ID로 사용하고, claim 오류·누락·만료 시 미인증으로 처리한다. `getSession()`은 권한 판단에 사용하지 않는다.

쿠키 refresh 전달 로직은 유지한다. Proxy 테스트는 유효 claim, claim 오류, 보호 경로 로그인 이동, 로그인 사용자의 대시보드 이동을 검증한다.

## 6. Request Memoization

운영자 컨텍스트 로더만 React `cache()`로 감싼다. 회원·회비·지출 등 변경 가능한 업무 데이터에는 cross-request cache를 적용하지 않는다. 권한 변경은 다음 요청부터 즉시 반영된다.

## Data And Error Handling

- 새 DB 함수는 기존 테이블이나 데이터를 변경하지 않는 additive migration으로 배포한다.
- RPC 결과가 없거나 형식이 잘못되면 기본 권한을 false로 두고 보호 경로는 노출하지 않는다.
- 회원 목록 RPC 오류는 기존 사용자용 오류 메시지로 변환한다.
- migration이 적용되지 않은 환경에서는 테스트와 빌드는 통과하지만 런타임 RPC가 실패하므로 배포 전에 Supabase migration 적용을 검증한다.

## Measurement

- 단위 테스트 mock 호출 수로 회원 페이지 RPC 1회와 권한 중복 호출 제거를 검증한다.
- Proxy 테스트에서 `getClaims()` 1회와 `getUser()` 0회를 검증한다.
- 운영자 컨텍스트 테스트에서 동일 요청 내 호출이 메모이제이션되는지 검증한다.
- 전체 테스트, lint, typecheck, build를 실행한다.
- 배포 후 Vercel 함수 리전과 인증 브라우저의 회원·회비·지출·일정·정산 이동 시간을 다시 측정한다.

