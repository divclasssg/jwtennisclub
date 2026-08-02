# 마이그레이션 인벤토리 v3 설계

## 상태

- 설계 방향 승인: 2026-08-02
- 문서 검토 승인: 대기 중
- 구현 상태: 미착수

## 1. 목적

Task 8 검증 프로젝트 인벤토리가 Supabase 마이그레이션 카탈로그의 실제 상태를
과장 없이 기록하도록 한다. 과거 일부 `supabase_migrations.schema_migrations`
행은 `statements`를 보관하지 않으므로, 로컬 SQL 파일 해시를 실제 적용 SQL의
해시처럼 대체하지 않는다.

이 변경은 검증 프로젝트의 읽기 전용 인벤토리 수집과 검증 형식에만 적용한다.
운영·검증 DB의 마이그레이션 이력 행을 수정하거나 누락된 SQL을 역으로 채우지
않는다.

## 2. 확인된 문제

2026-08-02 검증 프로젝트 인벤토리에서 다음 두 행의 `statements`가 `null`이었다.

- `202607130001_optimize_navigation_queries`
- `202607130002_add_club_meetings`

기존 인벤토리 v2는 모든 마이그레이션에 `sha256` 문자열을 요구하므로 실제 DB
출력의 `null`을 정직하게 표현할 수 없다. 제품 저장소의 SQL 파일은 현재 기대
정의를 증명하지만, 해당 SQL이 과거 DB에 그대로 실행됐다는 증거는 아니다.

## 3. 결정

인벤토리를 v3로 올리고 각 마이그레이션을 다음 구조로 기록한다.

```json
{
    "version": "202607130001",
    "name": "optimize_navigation_queries",
    "statementsState": "unavailable",
    "statementSha256": null,
    "catalogSha256": "<64 lowercase hex>"
}
```

- `statementsState`는 `recorded` 또는 `unavailable`만 허용한다.
- `recorded`이면 `statementSha256`은 64자리 소문자 SHA-256이어야 한다.
- `unavailable`이면 `statementSha256`은 반드시 `null`이어야 한다.
- `catalogSha256`은 DB가 보유한 `version`, `name`, `statements`의 canonical JSON
  표현을 서버에서 SHA-256한 값이다. `statements=null`도 명시적으로 해시에
  포함한다.
- 기존의 의미가 불명확한 `sha256` 필드는 제거한다.

합성 인벤토리 최상위에는 `sourceDatabaseInventorySha256`을 추가한다. 이 값은
identity-guarded SQL이 반환한 canonical DB payload 전체의 SHA-256이며, 검증기는
증거 디렉터리의 원시 DB payload를 직접 읽어 해시와 DB 소유 필드가 합성본과
일치하는지 확인한다.

`catalogSha256`은 누락된 SQL을 복원하거나 실제 실행 내용을 증명하지 않는다. 대신
수집 시점의 마이그레이션 카탈로그 행 전체를 변조 감지 가능한 형태로 결속한다.
`statementSha256`만 보존된 SQL 본문의 지문으로 해석한다.

## 4. 버전 및 호환성 경계

- 합성 인벤토리 최상위 `schemaVersion`은 `3`이어야 한다.
- 합성 인벤토리는 정확한 원시 DB payload를 가리키는
  `sourceDatabaseInventorySha256`을 필수로 포함한다.
- 새 스키마 파일은 `inventory-v3.schema.json`으로 추가한다.
- 검증기는 v2 또는 v1 입력을 묵시적으로 승격하지 않고 명시적으로 거부한다.
- 기존 `inventory-v2.json` 증거는 감사 이력으로 보존하되 새 릴리스 원장의
  `inventory-validated` 단계에 사용할 수 없다.
- 원격 SQL 원시 출력도 새 마이그레이션 구조를 식별할 수 있도록 원시 payload
  버전을 올린다.

현재 Match 최초 롤아웃은 아직 완료되지 않았으므로, 이전 형식과의 런타임 호환
계층은 만들지 않는다. 이는 두 형식이 같은 `sha256` 이름을 서로 다른 의미로
해석하는 위험을 줄인다.

## 5. 데이터 흐름

1. identity-guarded `task8_inventory.sql`이 검증 DB에서 마이그레이션 행을
   읽는다.
2. SQL은 `statements is null` 여부로 `statementsState`를 결정한다.
3. SQL이 보존된 statements의 본문 해시와 모든 행의 canonical catalog 해시를
   계산한다.
4. 수집기는 psql 장식과 분리된 단일 JSON payload를 파싱해 권한이 제한된
   `inventory-db-v2.json`으로 저장하고 manifest에 결속한다. JSON이 없거나 둘
   이상이면 실패한다.
5. 운영자가 Auth·Storage·Edge 관리 API 결과 및 승인된 복구 프로필과 함께
   `inventory-v3.json`을 합성한다.
6. 검증기는 증거 루트의 `inventory-db-v2.json`을 다시 읽고 canonical SHA-256,
   identity, migrations, member baseline, DB Auth 집계, table, Storage와 DB
   function 필드가 합성본의 해당 값과 정확히 일치하는지 검증한다.
7. JSON Schema와 TypeScript 검증기가 구조, 상태-해시 일관성, 중복 version/name,
   정렬, 체크섬 형식을 검증한다.
8. 성공한 v3만 기존 identity·recovery digest와 결속된 `inventory-validated`
   단계로 기록한다.

원격 수집은 읽기 전용이다. 제품 마이그레이션 파일은 배포 대상 HEAD를 고정하는 데
사용하지만, 과거 DB statement 해시의 대체 입력으로 사용하지 않는다.

## 6. 실패 조건

다음 입력은 fail-closed 처리한다.

- v3가 아닌 합성 인벤토리
- 알 수 없는 `statementsState`
- `recorded`와 `null` statement 해시 조합
- `unavailable`과 문자열 statement 해시 조합
- 누락되거나 잘못된 `catalogSha256`
- 누락되거나 불일치하는 `sourceDatabaseInventorySha256`
- 원시 DB payload의 누락, 복수 JSON payload 또는 manifest 불일치
- 중복된 version 또는 동일 version의 상충하는 name
- version 오름차순이 아닌 마이그레이션 배열
- 스키마에 없는 추가 필드
- DB SQL 출력과 합성 인벤토리 사이의 행 누락 또는 임의 보정

SQL 본문이 `unavailable`이라는 사실만으로 롤아웃을 실패시키지는 않는다. 대신 그
상태를 증거에 보존하며, 실제 적용 SQL을 사후 증명한 것으로 표시하지 않는다.

## 7. 테스트 전략

TDD의 첫 실패 테스트는 검증기의 외부 계약을 다룬다.

- 올바른 `recorded`와 `unavailable` 행을 함께 가진 v3를 허용한다.
- 상태와 statement 해시가 모순되는 두 조합을 각각 거부한다.
- v2 입력, 중복 version, 비정렬 배열과 잘못된 catalog 해시를 거부한다.
- 원시 DB payload의 행 누락, 추가, 변조와 잘못된 source digest를 거부한다.
- psql 출력에서 정확히 하나의 JSON payload만 추출한다.
- 정상 인벤토리 검증 후 identity·recovery 단계 결속이 기존과 동일함을 확인한다.

테스트 기대값은 구현의 해시 helper로 생성하지 않고 손으로 고정한 fixture를
사용한다. SQL 수집 결과는 로컬 Supabase와 identity-guarded 검증 프로젝트에서
실제로 실행해 `null` 행이 `unavailable`로 출력되는지 확인한다.

구현 완료 전 검증 명령은 다음을 모두 통과해야 한다.

- Task 8 Deno 형식·타입 검사와 전체 테스트
- 로컬 Supabase DB replay 및 pgTAP 전체 테스트
- 웹 애플리케이션 전체 테스트
- 새 제품 SHA로 고정된 검증 프로젝트 원격 인벤토리 수집·v3 검증

## 8. 운영 및 보안 영향

- 운영 Supabase에는 읽기·쓰기 모두 수행하지 않는다.
- 검증 DB에서도 인벤토리는 SELECT만 실행한다.
- member/Auth 원문, DB 비밀번호, API 키는 새 증거에 추가하지 않는다.
- 증거 디렉터리의 기존 `0700`/`0600`, redaction, manifest 해시 정책을 유지한다.
- v3 전환은 DB apply, Edge 배포, release enable 권한을 부여하지 않는다.

## 9. 대안과 기각 사유

### 센티널 문자열을 해시

`null` 대신 고정 문자열의 SHA-256을 넣으면 기존 형식 변경은 작지만, 그 값이 SQL
본문 해시인지 누락 상태 해시인지 필드만 보고 구분할 수 없다. 기각한다.

### 제품 SQL 파일 해시로 대체

현재 저장소의 기대 정의와 과거 DB의 실제 실행 사실을 혼동한다. 감사 증거를
과장하므로 기각한다.

### SQL 본문이 없는 모든 프로젝트 차단

가장 엄격하지만 Supabase가 이미 보존하지 않은 과거 정보를 복구할 수 없어 현재
검증 프로젝트를 영구 차단한다. 누락을 명시적으로 드러내고 카탈로그 행을 결속하는
v3보다 추가 안전성을 제공하지 못하므로 기각한다.

## 10. 수용 기준

- 두 과거 마이그레이션이 `unavailable`과 `statementSha256: null`로 정직하게
  기록됨
- 모든 마이그레이션에 유효한 `catalogSha256`이 존재함
- v3가 manifest에 등록된 정확한 `inventory-db-v2.json` digest와 DB 소유 필드에
  결속됨
- 상태-해시 모순, 중복, 비정렬, 구버전 입력이 자동 테스트에서 거부됨
- 로컬 전체 검증이 통과함
- 새 원격 인벤토리가 제품 SHA `37e75f15e5c1efd68c6a3514cb2ddcd8695a02d3`와 검증
  ref `orssnkppcukrqxikxdbf`에 결속됨
- 운영 프로젝트 `ydiusirreirhbvlftegp`에는 변경이 없음

## 11. 제외 범위

- 과거에 실행된 SQL의 사후 복원 또는 재구성
- `supabase_migrations` 행 수정
- 운영 DB 인벤토리 재수집
- Match DB apply, Edge 배포, iOS 설정 또는 release enable
- 기존 v2 증거 삭제
