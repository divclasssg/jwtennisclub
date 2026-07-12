# 회원 명부 재정비 구현 계획

> **에이전트 작업자용:** 필수 하위 스킬로 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`를 사용해 이 계획을 작업별로 실행한다. 진행 상태는 체크박스(`- [ ]`)로 추적한다.

**목표:** `members/members.csv`의 ID를 영구 회원번호로 삼아 회원 명부를 원자적으로 재구축하고, 전체 연락처를 별도 보호 저장하며, 회원·회비 관리 전 과정을 새 회원번호 기준으로 전환한다.

**아키텍처:** 공개 가능 회원 정보는 `members`, 연락처 원문은 별도 RLS 테이블 `member_contacts`, 확장 가능한 그룹은 `member_groups`에 둔다. 일반 조회는 서버 전용 DAL이 권한에 따라 연락처 원문 또는 마스킹 문자열만 반환하고, 생성·수정과 일회성 초기화는 PostgreSQL 함수 한 번으로 원자성을 보장한다. 초기화 스크립트는 기본적으로 검증만 수행하며 명시적 실행 문구가 있어야 회원과 회비를 삭제하고 CSV 명부를 반영한다.

**기술 스택:** Next.js 16.2.10 App Router, React 19, TypeScript, Supabase/PostgreSQL RLS, SCSS Modules, Vitest, Node.js 22

## 전역 제약

- 구현 전에 관련 `node_modules/next/dist/docs/` 문서와 `docs/solutions/`의 해당 영역을 다시 확인한다.
- 실제 개인정보가 든 `members/` 디렉터리는 계속 Git에서 제외하고, 테스트에는 합성 데이터만 사용한다.
- CSV ID는 변경 불가능한 영구 회원번호이며, 신규 회원번호는 기존 접두사와 4자리 숫자 형식으로 자동 발급한다.
- 회원 중복의 기본 키는 영구 회원번호다. 수동 등록 시 정규화된 이름과 연락처가 모두 같으면 차단한다.
- 같은 연락처와 다른 이름은 경고 후 명시적 재확인으로 허용하고, 같은 이름에 연락처가 없을 때도 명시적 재확인을 요구한다.
- 전체 연락처는 URL, 로그, 일반 회원 DTO, 회비 DTO에 포함하지 않는다. 연락처 검색은 권한 확인이 있는 POST 서버 액션만 사용한다.
- 관리자 또는 `members.contacts.manage` 권한 보유자만 연락처 원문을 읽고 수정한다. 일반 `members.view` 사용자는 마스킹 값만 본다.
- `Group`은 참조 테이블로 관리하고 A/B를 시드한다. CSV의 `-`는 그룹 없음으로 변환하며 관리 UI는 이번 범위에 포함하지 않는다.
- 탈퇴 사유 필드와 데이터는 백업 없이 제거한다. 탈퇴 상태와 탈퇴일 규칙은 유지한다.
- 초기화는 기존 회원과 회비 내역만 삭제한다. 운영자 프로필, 지출, 일정 등 다른 데이터는 유지한다.
- 운영자 프로필은 정규화된 이름의 정확 일치로 새 회원에 다시 연결하며, 누락·중복·모호성이 하나라도 있으면 전체 초기화를 롤백한다.
- 스타일 변경은 SCSS Modules, 의미 있는 kebab-case 클래스명, 기존 전역 토큰과 breakpoint만 사용한다.

---

## 파일 구조

### 새 파일

- `supabase/migrations/202607120001_prepare_member_roster_reset.sql`: 그룹·회원번호·연락처·권한·원자적 회원 저장 함수와 초기화 전용 함수를 추가한다.
- `supabase/migrations/202607120002_finalize_member_roster_reset.sql`: 초기화 함수와 구형 연락처/탈퇴 사유 컬럼 및 제약을 제거한다.
- `src/features/members/member-contact.ts`: 연락처 정규화, 검증, 마스킹의 순수 함수를 담당한다.
- `src/features/members/member-contact.test.ts`: 연락처 순수 함수의 경계값을 검증한다.
- `src/features/members/member-directory.ts`: `server-only` 회원/연락처 조회와 최소 DTO 조립을 담당한다.
- `src/features/members/member-directory.test.ts`: 권한별 DTO에 원문 연락처가 섞이지 않는지 검증한다.
- `scripts/member-roster-reset.mjs`: 무시된 CSV를 읽어 검증 보고서를 만들고, 승인 시 초기화 RPC를 한 번 호출한다.
- `scripts/member-roster-reset.test.ts`: CSV 매핑, 중복, 프로필 재연결 사전검증, 출력 비식별화를 검증한다.

### 주요 수정 파일

- `src/features/admin/permissions.ts`: `members.contacts.manage` 권한을 추가하고 관리자에게만 기본 부여한다.
- `src/features/members/member-model.ts`: 영구 회원번호와 그룹을 모델에 추가하고 탈퇴 사유를 제거한다.
- `src/features/members/member-form.ts`: 전체 연락처 입력, 그룹, 중복 재확인 입력으로 변경한다.
- `src/features/members/member-list.ts`: 회원번호/이름 검색과 그룹 필터를 지원한다.
- `src/features/members/MemberForm.tsx`: 회원번호 읽기 전용 표시, 전체 연락처, 그룹, 중복 경고 흐름을 제공한다.
- `src/features/members/MemberMobileList.tsx`: 회원번호·그룹·권한별 연락처 표시로 변경한다.
- `src/app/(app)/members/actions.ts`: 생성/수정 RPC, 중복 판정, POST 연락처 검색을 담당한다.
- `src/app/(app)/members/page.tsx`: 서버 DAL과 새 검색/필터 DTO를 사용한다.
- `src/app/(app)/members/[id]/edit/page.tsx`: 권한별 편집 DTO와 읽기 전용 회원번호를 사용한다.
- `src/features/fees/fee-form.ts`: 회비 CSV 회원 식별자를 회원번호로 변경한다.
- `src/app/(app)/fees/actions.ts`: 회비 CSV를 회원번호로만 매칭한다.
- `src/features/fees/fee-list.ts`, `src/features/fees/FeeMobileList.tsx`, `src/app/(app)/fees/page.tsx`: 전화번호 의존성을 제거하고 회원번호를 표시한다.
- `docs/PROJECT_CHECKLIST.md`, `docs/WORK_LOG.md`: 마이그레이션 실행 순서, 보안 검증, 실제 초기화 결과를 기록한다.

---

### 작업 1: 데이터베이스 준비와 개인정보 권한 경계

**파일:**
- 생성: `supabase/migrations/202607120001_prepare_member_roster_reset.sql`
- 수정: `src/features/admin/permissions.ts`
- 테스트: `src/features/admin/permissions.test.ts`

**인터페이스:**
- 생성: `member_groups(id uuid, code text, label text, is_active boolean)`
- 생성: `member_contacts(member_id uuid, phone_number text, phone_normalized text)`
- 생성: `save_member_with_contact(member_id uuid, member_data jsonb, duplicate_confirmation text) returns jsonb`
- 생성: `search_members_by_phone(phone_query text) returns table(member_id uuid)`
- 생성: `admin_reset_member_roster(import_rows jsonb, confirmation text) returns jsonb`
- 보장: `members.member_code`는 `^[A-Z][0-9]{4}$`, 고유·변경 불가

- [ ] **1단계: 새 권한의 실패 테스트 작성**

```ts
it("연락처 관리 권한은 관리자에게만 기본 부여한다", () => {
  expect(hasPermission("admin", "members.contacts.manage")).toBe(true);
  expect(hasPermission("operator", "members.contacts.manage")).toBe(false);
});
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- src/features/admin/permissions.test.ts`

예상: `members.contacts.manage`가 `Permission`에 없어 타입 검사 또는 단언이 실패한다.

- [ ] **3단계: 권한 상수와 관리자 기본 권한 갱신**

```ts
export const PERMISSIONS = [
  "members.view",
  "members.create",
  "members.update",
  "members.delete",
  "members.contacts.manage",
  // 기존 권한 유지
] as const;
```

- [ ] **4단계: 준비 마이그레이션 작성**

마이그레이션에는 다음 핵심 제약을 그대로 구현한다.

```sql
create table public.member_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_-]{0,15}$'),
  label text not null check (length(btrim(label)) > 0),
  is_active boolean not null default true
);

insert into public.member_groups (code, label)
values ('A', 'A'), ('B', 'B')
on conflict (code) do nothing;

alter table public.members
  add column member_code text,
  add column group_id uuid references public.member_groups(id) on delete set null;

create unique index members_member_code_unique
on public.members(member_code) where member_code is not null;

create table public.member_contacts (
  member_id uuid primary key references public.members(id) on delete cascade,
  phone_number text,
  phone_normalized text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint member_contacts_phone_pair check (
    (phone_number is null and phone_normalized is null)
    or (phone_number is not null and phone_normalized ~ '^01[016789][0-9]{7,8}$')
  )
);

alter table public.member_contacts enable row level security;
create policy "contact managers can read member contacts"
on public.member_contacts for select to authenticated
using (public.has_permission('members.contacts.manage'));
```

같은 파일에 다음도 포함한다.

- 관리자 역할에 `members.contacts.manage` 삽입
- `members.member_code` 수정 방지 트리거
- `member_contacts`의 직접 쓰기는 금지하고 `save_member_with_contact`만 사용
- 일반 조회용 마스킹 RPC는 원문이 아닌 `010-****-1234`만 반환
- 연락처 검색 RPC는 `members.contacts.manage` 확인 후 정확 일치만 반환
- 회원번호 발급은 advisory transaction lock 후 현재 최대 숫자 + 1을 사용하고 9999 초과 시 오류
- 저장 RPC는 이름+연락처 동일이면 `DUPLICATE_BLOCKED`, 다른 이름+동일 연락처면 `PHONE_REUSE_CONFIRMATION_REQUIRED`, 같은 이름+연락처 없음이면 `NAME_ONLY_CONFIRMATION_REQUIRED`를 반환
- 초기화 RPC는 `service_role`만 실행 가능하고 `confirmation = 'RESET_MEMBERS_AND_FEES'`를 검사한 뒤 회비 삭제, 프로필 연결 임시 보관, 회원 삭제/삽입, 프로필 재연결을 한 트랜잭션에서 수행

- [ ] **5단계: 로컬 DB 마이그레이션 검증**

실행: `npx supabase db reset`

예상: 모든 마이그레이션 성공, A/B 그룹 2건, 연락처 테이블 RLS 활성화, authenticated 사용자는 연락처 직접 쓰기 불가.

- [ ] **6단계: 권한 테스트 재실행**

실행: `npm test -- src/features/admin/permissions.test.ts`

예상: PASS.

- [ ] **7단계: 커밋**

```bash
git add supabase/migrations/202607120001_prepare_member_roster_reset.sql src/features/admin/permissions.ts src/features/admin/permissions.test.ts
git commit -m "feat(members): add protected roster data model"
```

---

### 작업 2: 연락처와 회원 도메인 순수 함수

**파일:**
- 생성: `src/features/members/member-contact.ts`
- 생성: `src/features/members/member-contact.test.ts`
- 수정: `src/features/members/member-model.ts`
- 수정: `src/features/members/member-model.test.ts`

**인터페이스:**
- 생성: `normalizePhoneNumber(value: string | null | undefined): string | null`
- 생성: `validatePhoneNumber(value: string | null): string[]`
- 생성: `maskPhoneNumber(value: string | null): string`
- 변경: `MemberRecord`에 `memberCode`, `groupId`, `groupCode` 추가; `phoneLastFour`, `withdrawalReason` 제거

- [ ] **1단계: 연락처 및 생명주기 실패 테스트 작성**

```ts
it.each([
  ["010-1234-5678", "01012345678"],
  ["010 1234 5678", "01012345678"],
  ["", null],
])("연락처를 정규화한다", (source, expected) => {
  expect(normalizePhoneNumber(source)).toBe(expected);
});

it("원문 없이 끝 네 자리만 표시한다", () => {
  expect(maskPhoneNumber("01012345678")).toBe("010-****-5678");
});

it("탈퇴 사유 없이 탈퇴 상태와 날짜만 검증한다", () => {
  expect(validateMemberLifecycle({
    status: "withdrawn",
    joinedDate: "2026-01-01",
    withdrawnDate: "2026-07-01",
  })).toEqual([]);
});
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- src/features/members/member-contact.test.ts src/features/members/member-model.test.ts`

예상: 새 함수가 없고 기존 생명주기 타입이 `withdrawalReason`을 요구해 실패한다.

- [ ] **3단계: 최소 순수 함수 구현**

```ts
export function normalizePhoneNumber(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

export function validatePhoneNumber(value: string | null) {
  return value && !/^01[016789][0-9]{7,8}$/.test(value)
    ? ["연락처를 올바른 휴대전화 번호로 입력하세요."]
    : [];
}

export function maskPhoneNumber(value: string | null) {
  if (!value) return "연락처 없음";
  return `${value.slice(0, 3)}-****-${value.slice(-4)}`;
}
```

`MemberLifecycleInput`은 `status | joinedDate | withdrawnDate`만 포함하도록 줄이고 탈퇴 사유 검증 분기를 삭제한다.

- [ ] **4단계: 테스트 재실행**

실행: `npm test -- src/features/members/member-contact.test.ts src/features/members/member-model.test.ts`

예상: PASS.

- [ ] **5단계: 커밋**

```bash
git add src/features/members/member-contact.ts src/features/members/member-contact.test.ts src/features/members/member-model.ts src/features/members/member-model.test.ts
git commit -m "refactor(members): model full protected contacts"
```

---

### 작업 3: 권한별 서버 전용 회원 조회 계층

**파일:**
- 생성: `src/features/members/member-directory.ts`
- 생성: `src/features/members/member-directory.test.ts`
- 수정: `src/features/members/member-list.ts`
- 수정: `src/features/members/member-list.test.ts`

**인터페이스:**
- 생성: `MemberListRow { id, memberCode, name, phoneDisplay, groupCode, status, joinedDate, withdrawnDate, memo }`
- 생성: `MemberEditRecord extends MemberListRow { phoneNumber: string | null; groupId: string | null }`
- 생성: `loadMemberDirectory(input: { q?: string; status?: MemberStatus; group?: string }): Promise<MemberListRow[]>`
- 생성: `loadMemberForEdit(id: string): Promise<MemberEditRecord | null>`
- 생성: `searchMemberIdsByPhone(formData: FormData): Promise<string[]>`

- [ ] **1단계: DTO 유출 방지 실패 테스트 작성**

```ts
it("일반 조회 DTO에는 연락처 원문 키가 존재하지 않는다", () => {
  const row = toMemberListRow(memberRow, "010-****-5678");
  expect(row.phoneDisplay).toBe("010-****-5678");
  expect(row).not.toHaveProperty("phoneNumber");
  expect(JSON.stringify(row)).not.toContain("01012345678");
});

it("검색어는 이름과 회원번호에만 적용한다", () => {
  expect(buildMemberSearchFilter("M0012")).toContain("member_code.ilike");
  expect(buildMemberSearchFilter("M0012")).not.toContain("phone");
});
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- src/features/members/member-directory.test.ts src/features/members/member-list.test.ts`

예상: DAL과 새 DTO가 없어 실패한다.

- [ ] **3단계: 서버 전용 DAL 구현**

파일 첫 줄에 `import "server-only";`를 두고, 현재 사용자의 권한을 확인한 뒤 다음 규칙으로 조회한다.

```ts
export type MemberListRow = {
  id: string;
  memberCode: string;
  name: string;
  phoneDisplay: string;
  groupCode: string | null;
  status: MemberStatus;
  joinedDate: string;
  withdrawnDate: string | null;
  memo: string | null;
};
```

- `members.contacts.manage` 있음: `member_contacts`에서 원문을 읽되 목록 DTO에는 형식화된 원문만 `phoneDisplay`로 넣는다.
- 권한 없음: 마스킹 RPC 결과만 받아 `phoneDisplay`에 넣는다.
- `q`는 `members.name`과 `members.member_code`에만 적용한다.
- `group`은 `member_groups.code`, 상태는 `members.status`에 적용한다.
- 편집 DTO의 `phoneNumber`는 연락처 관리 권한이 있을 때만 채운다.

- [ ] **4단계: 테스트 재실행**

실행: `npm test -- src/features/members/member-directory.test.ts src/features/members/member-list.test.ts`

예상: PASS, 일반 DTO 직렬화 결과에 합성 원문 번호가 없음.

- [ ] **5단계: 커밋**

```bash
git add src/features/members/member-directory.ts src/features/members/member-directory.test.ts src/features/members/member-list.ts src/features/members/member-list.test.ts
git commit -m "feat(members): add permission-aware member directory"
```

---

### 작업 4: 회원 입력과 중복 확인 서버 흐름

**파일:**
- 수정: `src/features/members/member-form.ts`
- 수정: `src/features/members/member-form.test.ts`
- 수정: `src/app/(app)/members/actions.ts`
- 수정: `src/app/(app)/members/actions.test.ts`

**인터페이스:**
- 변경: `MemberFormInput { name, phoneNumber, groupId, status, joinedDate, withdrawnDate, memo, duplicateConfirmation }`
- 생성: `MemberSaveResult = { status: "saved"; memberCode: string } | { status: "confirmation-required"; reason: "phone-reuse" | "name-without-phone" } | { status: "blocked" }`
- 소비: DB RPC `save_member_with_contact`

- [ ] **1단계: 폼 정규화와 RPC 결과 실패 테스트 작성**

```ts
it("전체 연락처와 그룹을 DB 입력으로 변환하고 탈퇴 사유를 보내지 않는다", () => {
  const input = normalizeMemberInput({
    name: " 홍길동 ", phoneNumber: "010-1234-5678", groupId: "group-a",
    status: "active", joinedDate: "2026-07-01",
  });
  expect(toMemberDatabaseInput(input)).toMatchObject({
    name: "홍길동", phone_number: "01012345678", group_id: "group-a",
  });
  expect(toMemberDatabaseInput(input)).not.toHaveProperty("withdrawal_reason");
});
```

액션 테스트에는 RPC가 `PHONE_REUSE_CONFIRMATION_REQUIRED`를 반환하면 저장하지 않고 경고 상태로 이동하고, `duplicateConfirmation=phone-reuse`로 재제출하면 저장되는 사례를 추가한다.

- [ ] **2단계: 실패 확인**

실행: `npm test -- src/features/members/member-form.test.ts 'src/app/(app)/members/actions.test.ts'`

예상: 구형 `phoneLastFour`/`withdrawalReason` 타입과 직접 insert 때문에 실패한다.

- [ ] **3단계: 폼 파서와 액션 구현**

```ts
export type MemberFormInput = {
  name: string;
  phoneNumber: string | null;
  groupId: string | null;
  status: MemberStatus;
  joinedDate: string;
  withdrawnDate: string | null;
  memo: string | null;
  duplicateConfirmation: "phone-reuse" | "name-without-phone" | null;
};
```

`createMember`와 `updateMember`는 직접 테이블 쓰기를 제거하고 RPC를 호출한다. 오류 코드를 URL에 원문 번호 없이 `duplicate=phone-reuse` 또는 `duplicate=name-without-phone`로만 전달한다. POST 연락처 검색 액션은 `FormData`에서 번호를 읽고 권한 확인 RPC를 호출하며 검색 문자열을 redirect/query string에 넣지 않는다.

- [ ] **4단계: 테스트 재실행**

실행: `npm test -- src/features/members/member-form.test.ts 'src/app/(app)/members/actions.test.ts'`

예상: PASS.

- [ ] **5단계: 커밋**

```bash
git add src/features/members/member-form.ts src/features/members/member-form.test.ts 'src/app/(app)/members/actions.ts' 'src/app/(app)/members/actions.test.ts'
git commit -m "feat(members): save members with duplicate safeguards"
```

---

### 작업 5: 회원 화면을 회원번호·전체 연락처·그룹 기준으로 전환

**파일:**
- 수정: `src/features/members/MemberForm.tsx`
- 수정: `src/features/members/MemberForm.module.scss`
- 수정: `src/features/members/MemberMobileList.tsx`
- 수정: `src/features/members/MemberMobileList.module.scss`
- 수정: `src/app/(app)/members/page.tsx`
- 수정: `src/app/(app)/members/page.test.tsx`
- 수정: `src/app/(app)/members/new/NewMemberContent.tsx`
- 수정: `src/app/(app)/members/new/page.test.tsx`
- 수정: `src/app/(app)/members/[id]/edit/page.tsx`
- 수정: `src/app/(app)/members/[id]/edit/page.test.tsx`

**인터페이스:**
- 소비: `loadMemberDirectory`, `loadMemberForEdit`, `MemberListRow`
- 화면 검색 파라미터: `q`, `status`, `group`만 허용

- [ ] **1단계: 화면 실패 테스트 작성**

```tsx
expect(screen.getByRole("columnheader", { name: "회원번호" })).toBeInTheDocument();
expect(screen.getByRole("columnheader", { name: "그룹" })).toBeInTheDocument();
expect(screen.queryByText("탈퇴 사유")).not.toBeInTheDocument();
expect(screen.getByLabelText("연락처")).toHaveAttribute("autocomplete", "tel");
```

일반 운영자 fixture에는 `010-****-5678`, 관리자 fixture에는 `010-1234-5678`이 표시되는 사례를 분리한다. 생성 화면은 회원번호가 자동 발급됨을 짧게 표시하고 입력 칸을 만들지 않으며, 편집 화면은 회원번호를 읽기 전용으로 표시한다.

- [ ] **2단계: 실패 확인**

실행: `npm test -- 'src/app/(app)/members/page.test.tsx' 'src/app/(app)/members/new/page.test.tsx' 'src/app/(app)/members/[id]/edit/page.test.tsx'`

예상: 구형 전화번호 끝 4자리와 탈퇴 사유 UI 때문에 실패한다.

- [ ] **3단계: 컴포넌트와 페이지 변경**

- 목록 열: 회원번호, 이름, 연락처 표시값, 그룹, 상태, 가입일
- 검색 placeholder: `이름 또는 회원번호 검색`
- 그룹 필터: 전체, A, B, 그룹 없음
- 폼: 연락처 `type="tel"`, 그룹 select, 탈퇴 사유 제거
- 중복 경고: `같은 연락처가 다른 이름으로 등록되어 있습니다.` 또는 `같은 이름이며 연락처가 없습니다.`와 명시적 `확인 후 등록` 버튼
- 연락처 관리 권한이 없는 편집 화면은 연락처 입력을 렌더링하지 않고 마스킹 값만 표시

SCSS 변경에는 `var(--...)` 토큰만 사용하고 새 클래스는 `member-code-cell`, `group-filter`, `duplicate-warning`처럼 kebab-case로 작성한다.

- [ ] **4단계: 화면 테스트 재실행**

실행: `npm test -- 'src/app/(app)/members/page.test.tsx' 'src/app/(app)/members/new/page.test.tsx' 'src/app/(app)/members/[id]/edit/page.test.tsx'`

예상: PASS.

- [ ] **5단계: 커밋**

```bash
git add src/features/members 'src/app/(app)/members'
git commit -m "feat(members): show permanent codes and protected contacts"
```

---

### 작업 6: 회비 관리를 영구 회원번호 기준으로 전환

**파일:**
- 수정: `src/features/fees/fee-form.ts`
- 수정: `src/features/fees/fee-form.test.ts`
- 수정: `src/features/fees/fee-list.ts`
- 수정: `src/features/fees/fee-list.test.ts`
- 수정: `src/features/fees/FeeMobileList.tsx`
- 수정: `src/app/(app)/fees/actions.ts`
- 수정: `src/app/(app)/fees/actions.test.ts`
- 수정: `src/app/(app)/fees/page.tsx`
- 수정: `src/app/(app)/fees/page.test.tsx`

**인터페이스:**
- 변경: `FeePaymentCsvInput { memberCode, periodMonth, amount, paidDate, memo }`
- 변경: CSV 필수 헤더 `회원번호`, `납부월`, `금액`, `납부일`; `이름`, `전화번호끝4자리` 매칭 제거

- [ ] **1단계: 회원번호 CSV 실패 테스트 작성**

```ts
it("회비 CSV를 영구 회원번호로 파싱한다", () => {
  const result = parseFeePaymentsCsv(
    "회원번호,납부월,금액,납부일\nM0001,2026-07,30000,2026-07-05",
  );
  expect(result).toMatchObject({ ok: true, payments: [{ memberCode: "M0001" }] });
});

it("전화번호 헤더로 회원을 찾지 않는다", () => {
  expect(parseFeePaymentsCsv(
    "이름,전화번호끝4자리,납부월,금액,납부일\n홍길동,5678,2026-07,30000,2026-07-05",
  )).toMatchObject({ ok: false, line: 1 });
});
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- src/features/fees/fee-form.test.ts src/features/fees/fee-list.test.ts 'src/app/(app)/fees/actions.test.ts' 'src/app/(app)/fees/page.test.tsx'`

예상: 구형 이름+끝 4자리 파서와 목록 때문에 실패한다.

- [ ] **3단계: 파서·액션·목록 변경**

```ts
type FeeImportMemberRow = { id: string; member_code: string };

function buildMemberImportMap(members: FeeImportMemberRow[]) {
  return new Map(members.map((member) => [member.member_code, member.id]));
}
```

액션은 활성 회원의 `id, member_code`만 조회하고 정규화된 대문자 회원번호로 정확 일치시킨다. 목록과 모바일 행은 연락처를 완전히 제거하고 `memberCode`를 이름 옆 또는 별도 열에 표시한다.

- [ ] **4단계: 테스트 재실행**

실행: `npm test -- src/features/fees/fee-form.test.ts src/features/fees/fee-list.test.ts 'src/app/(app)/fees/actions.test.ts' 'src/app/(app)/fees/page.test.tsx'`

예상: PASS, 회비 계층에 `phoneLastFour` 참조가 없음.

- [ ] **5단계: 정적 잔존 참조 확인**

실행: `rg -n 'phoneLastFour|phone_last_four|전화번호끝4자리' src/features/fees 'src/app/(app)/fees'`

예상: 출력 없음.

- [ ] **6단계: 커밋**

```bash
git add src/features/fees 'src/app/(app)/fees'
git commit -m "refactor(fees): match payments by permanent member code"
```

---

### 작업 7: CSV 초기화 사전검증과 원자적 실행 도구

**파일:**
- 생성: `scripts/member-roster-reset.mjs`
- 생성: `scripts/member-roster-reset.test.ts`
- 수정: `.env.example`

**인터페이스:**
- 생성: `parseRosterCsv(source: string): ResetRosterRow[]`
- 생성: `buildResetPreview(rows, linkedProfiles): ResetPreview`
- CLI: `node --env-file=.env.local scripts/member-roster-reset.mjs members/members.csv`
- 실행 CLI: 위 명령에 `--execute --confirm=RESET_MEMBERS_AND_FEES --expected-sha256=<dry-run 해시>` 추가

- [ ] **1단계: 합성 CSV 실패 테스트 작성**

```ts
const csv = [
  "ID,이름,전화번호,구분,직책,Group,상태,가입일",
  "M0001,홍길동,010-1234-5678,정회원,회원,A,활동중,2026.7.1",
].join("\n");

it("필요한 열만 ResetRosterRow로 변환한다", () => {
  expect(parseRosterCsv(csv)).toEqual([{
    memberCode: "M0001", name: "홍길동", phoneNumber: "01012345678",
    groupCode: "A", status: "active", joinedDate: "2026-07-01",
  }]);
});

it("미리보기와 오류 메시지에 원문 연락처를 출력하지 않는다", () => {
  expect(JSON.stringify(buildResetPreview(parseRosterCsv(csv), [])))
    .not.toContain("01012345678");
});
```

추가 사례: 중복 ID 차단, 이름+번호 중복 차단, `-`를 null 그룹으로 변환, 알 수 없는 그룹 차단, 연락처 없음 허용, 운영자 이름 누락/복수 일치 차단.

- [ ] **2단계: 실패 확인**

실행: `npm test -- scripts/member-roster-reset.test.ts`

예상: 스크립트 모듈이 없어 실패한다.

- [ ] **3단계: 기본 dry-run 스크립트 구현**

스크립트는 다음 순서만 허용한다.

```js
const executionRequested = process.argv.includes("--execute");
const confirmation = process.argv
  .find((value) => value.startsWith("--confirm="))
  ?.slice("--confirm=".length);
const expectedSha256 = process.argv
  .find((value) => value.startsWith("--expected-sha256="))
  ?.slice("--expected-sha256=".length);

if (executionRequested && (
  confirmation !== "RESET_MEMBERS_AND_FEES" || expectedSha256 !== csvSha256
)) {
  throw new Error("실행 확인 문구가 일치하지 않습니다.");
}
```

1. 인자로 받은 경로가 정확히 `members/members.csv`인지 확인한다.
2. 파일을 메모리에서 파싱하되 행별 원문을 콘솔에 출력하지 않는다.
3. DB에서 A/B 그룹 코드와 연결된 운영자 프로필의 ID·이름만 읽는다.
4. ID/이름+번호/그룹/상태/날짜/프로필 재연결을 검증한다.
5. dry-run은 CSV SHA-256, 행 수, 그룹별 수, 연락처 누락 수, 재연결 프로필 수만 출력하고 종료한다.
6. 실행 모드만 `admin_reset_member_roster(rows, confirmation)`를 정확히 한 번 호출한다.
7. 반환된 삽입 회원 수와 재연결 프로필 수가 preview와 다르면 오류 종료한다.

`.env.example`에는 서버 전용임을 명시한 `SUPABASE_SERVICE_ROLE_KEY=`만 추가하고 실제 값은 기록하지 않는다.

- [ ] **4단계: 단위 테스트 재실행**

실행: `npm test -- scripts/member-roster-reset.test.ts`

예상: PASS.

- [ ] **5단계: 실제 무시 CSV로 dry-run 수행**

실행: `node --env-file=.env.local scripts/member-roster-reset.mjs members/members.csv`

예상: 삭제나 삽입 없이 총 20건, 연락처 누락 1건과 비식별 집계만 출력. 원문 이름과 연락처는 출력하지 않음.

- [ ] **6단계: 승인된 환경에서 초기화 실행**

실행: `node --env-file=.env.local scripts/member-roster-reset.mjs members/members.csv --execute --confirm=RESET_MEMBERS_AND_FEES --expected-sha256=<5단계 출력값>`

예상: 회원 20건 삽입, 기존 회비 0건, 모든 운영자 프로필 재연결 성공. 하나라도 불일치하면 DB 상태 변화 없이 실패.

- [ ] **7단계: 커밋**

```bash
git add scripts/member-roster-reset.mjs scripts/member-roster-reset.test.ts .env.example
git commit -m "feat(members): add guarded roster reset tool"
```

---

### 작업 8: 구형 컬럼 제거와 초기화 함수 폐기

**파일:**
- 생성: `supabase/migrations/202607120002_finalize_member_roster_reset.sql`

**인터페이스:**
- 제거: `members.phone_last_four`, `members.withdrawal_reason`
- 제거: `admin_reset_member_roster(jsonb, text)` 실행 표면
- 유지: `save_member_with_contact`, 마스킹 조회, 권한 기반 연락처 검색

- [ ] **1단계: 애플리케이션 잔존 참조 확인**

실행: `rg -n 'phoneLastFour|phone_last_four|withdrawalReason|withdrawal_reason|탈퇴 사유' src`

예상: 출력 없음. 사용자 메시지나 테스트 fixture에 남은 구형 표현도 제거한다.

- [ ] **2단계: 마무리 마이그레이션 작성**

```sql
alter table public.members
  drop constraint if exists members_phone_last_four_digits,
  drop constraint if exists members_withdrawal_reason_not_blank,
  drop constraint if exists members_withdrawal_reason_matches_status,
  drop column if exists phone_last_four,
  drop column if exists withdrawal_reason,
  alter column member_code set not null;

drop function if exists public.admin_reset_member_roster(jsonb, text);
```

`member_code`의 형식 check와 unique index, 수정 방지 트리거가 존재하는지 검증하는 `DO` 블록을 포함해 잘못된 순서로 실행하면 명시적으로 실패시킨다.

- [ ] **3단계: 깨끗한 DB 전체 마이그레이션 검증**

실행: `npx supabase db reset`

예상: 구형 컬럼과 초기화 함수가 없고, 영구 회원번호·그룹·연락처 테이블과 저장/조회 RPC는 존재한다.

- [ ] **4단계: 커밋**

```bash
git add supabase/migrations/202607120002_finalize_member_roster_reset.sql
git commit -m "chore(members): remove legacy member fields"
```

---

### 작업 9: 전체 회귀·보안·브라우저 검증과 기록

**파일:**
- 수정: `docs/PROJECT_CHECKLIST.md`
- 수정: `docs/WORK_LOG.md`

**인터페이스:** 없음. 앞선 모든 작업의 완료 조건을 통합 검증한다.

- [ ] **1단계: 전체 자동 검증**

실행:

```bash
npm test
npm run lint
npm run build
git diff --check
```

예상: 모든 명령 종료 코드 0.

- [ ] **2단계: 개인정보 정적 검사**

실행:

```bash
git check-ignore -v members/members.csv
git ls-files members
rg -n 'phone_number|phone_normalized' 'src/app/(app)/fees' src/features/fees
rg -n 'searchParams.*phone|phone.*searchParams' src
```

예상: 첫 명령은 `.gitignore`의 `/members/` 규칙을 표시하고, 나머지 세 명령은 출력 없음.

- [ ] **3단계: 개발 서버와 회원 화면 브라우저 검증**

실행: `npm run dev`

브라우저에서 데스크톱과 모바일로 다음을 확인한다.

1. 일반 운영자는 `/members`에서 마스킹 연락처만 본다.
2. 관리자는 전체 연락처를 보고 수정할 수 있다.
3. 이름/회원번호 검색과 A/B/그룹 없음 필터가 동작한다.
4. 동일 이름+동일 번호는 차단되고, 다른 이름+동일 번호와 같은 이름+번호 없음은 재확인 후 등록된다.
5. 주소창과 브라우저 히스토리에 연락처가 나타나지 않는다.
6. `/fees`와 회비 CSV는 회원번호로 동작하고 연락처를 렌더링하지 않는다.
7. 375px 모바일과 1440px 데스크톱에서 텍스트 겹침과 가로 넘침이 없다.

- [ ] **4단계: 콘솔과 네트워크 검증**

예상: 브라우저 콘솔 오류 0건. 일반 운영자의 RSC payload와 네트워크 응답을 검색해 합성 전체 연락처가 없고 마스킹 문자열만 존재한다.

- [ ] **5단계: 프로젝트 기록 갱신**

`docs/PROJECT_CHECKLIST.md`에 회원번호/연락처/그룹/회비 전환과 개인정보 검증을 완료 처리한다. `docs/WORK_LOG.md`에는 실행한 마이그레이션, dry-run 집계, 초기화 성공 여부, 테스트·lint·build·브라우저 결과를 실제 값으로 기록하며 이름과 연락처 원문은 적지 않는다.

- [ ] **6단계: 최종 커밋**

```bash
git add docs/PROJECT_CHECKLIST.md docs/WORK_LOG.md
git commit -m "docs(members): record roster reset verification"
```

---

## 실행 순서 주의사항

1. 작업 1의 준비 마이그레이션을 배포한다.
2. 작업 7의 dry-run 결과를 검토한 뒤 같은 CSV SHA-256을 지정해 초기화를 실행한다.
3. 초기화된 회원번호와 운영자 프로필 재연결을 SQL로 확인한다.
4. 작업 2~6의 애플리케이션을 배포하고 기본 기능을 확인한다.
5. 작업 8의 마무리 마이그레이션을 배포해 구형 컬럼과 초기화 RPC를 폐기한다.
6. 작업 9의 전체 검증을 완료한다.

준비와 마무리 마이그레이션을 한 배포에 묶으면 초기화 RPC가 실행 전에 사라지므로 반드시 위 순서를 지킨다.
