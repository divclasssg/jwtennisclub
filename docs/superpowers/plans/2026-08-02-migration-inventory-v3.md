# Migration Inventory v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검증 Supabase의 실제 마이그레이션 카탈로그를 `recorded`/`unavailable` 상태로 정직하게 기록하고, 합성 `inventory-v3.json`을 manifest에 결속된 원시 DB payload와 대조하는 fail-closed Task 8 인벤토리 게이트를 만든다.

**Architecture:** identity-guarded SQL은 psql 장식이 없는 DB payload v2를 한 줄 JSON으로 출력하고, 수집기는 정확히 하나의 payload만 `inventory-db-v2.json`으로 0600 저장한 뒤 manifest에 결속한다. 검증기는 manifest의 파일 바이트 해시를 먼저 확인하고, 파싱한 payload를 재귀적 키 정렬 canonical JSON으로 직렬화해 `sourceDatabaseInventorySha256`을 직접 재계산하며, 합성 v3의 DB 소유 필드를 원시 payload에서 결정적으로 투영한 값과 비교한다. SQL의 `catalogSha256`은 PostgreSQL `jsonb_build_object('version', ..., 'name', ..., 'statements', ...)::text`의 UTF-8 바이트를 `extensions.digest(..., 'sha256')`로 해시하는 별도 서버 계약이다.

**Tech Stack:** Deno TypeScript, JSON Schema draft 2020-12, PostgreSQL/Supabase CLI, pgTAP, Vitest, Git

## Global Constraints

- 승인 설계는 `docs/superpowers/specs/2026-08-02-migration-inventory-v3-design.md`이며 구현 중 의미를 확장하거나 v1/v2 호환 계층을 만들지 않는다.
- validation ref는 `orssnkppcukrqxikxdbf`, production ref는 `ydiusirreirhbvlftegp`, client product SHA는 `ab1a6f0a41f4ce62a9a69ada7408627190a34e2e`다.
- 현재 backend product SHA `37e75f15e5c1efd68c6a3514cb2ddcd8695a02d3`에 포함된 SQL을 변경하므로, 구현 결과의 새 product 커밋과 그 SHA만 고정하는 helper 커밋을 반드시 분리한다.
- PostgreSQL catalog canonical 값은 `jsonb_build_object('version', migration.version, 'name', migration.name, 'statements', migration.statements)::text`이며, `statements = null`도 JSON `null`로 포함한다. 클라이언트 source payload canonical 값과 혼용하지 않는다.
- source payload canonical JSON은 RFC 8785의 객체 키 정렬과 같은 ECMAScript UTF-16 code-unit 오름차순으로 모든 깊이의 키를 정렬하고, 배열 순서를 보존하며, 공백 없이 `JSON.stringify`한 UTF-8 바이트다.
- `inventory-db-v2.json` manifest 결속은 저장된 파일 바이트 SHA-256이고, `sourceDatabaseInventorySha256`은 그 파일을 파싱한 값의 canonical JSON SHA-256이다. 두 검사를 모두 통과해야 한다.
- `statementsState = "recorded"`이면 `statementSha256`은 64자리 소문자 hex이고, `statementsState = "unavailable"`이면 `statementSha256`은 정확히 `null`이다.
- 마이그레이션은 version 오름차순이어야 하며 version과 name은 각각 중복될 수 없다. 같은 version의 다른 name도 중복 version 오류로 거부한다.
- 기존 `inventory-v1.schema.json`, `inventory-v2.schema.json`, 과거 `inventory-v2.json` 증거는 삭제하거나 덮어쓰지 않는다.
- 증거 루트는 Git root 밖 0700, 증거 파일은 0600을 유지하고 비밀번호·토큰·member/Auth 원문을 기록하지 않는다.
- 이 계획은 검증 DB SELECT 외의 DB apply, Edge 배포, release enable, iOS 설정, 운영 DB 읽기/쓰기와 운영 프로젝트 변경을 승인하지 않는다.
- `supabase/.temp/`는 링크 캐시이므로 절대 stage하지 않는다.

---

## File Structure

- Create: `supabase/scripts/task8/inventory-v3.schema.json` — 합성 인벤토리 v3의 strict JSON Schema.
- Create: `supabase/scripts/task8/inventory_db_lib.ts` — DB payload v2 타입/검증, 단일 psql JSON 추출, canonical JSON과 SHA-256, DB→합성 투영을 담당.
- Create: `supabase/scripts/task8/inventory_db_test.ts` — 수집·canonicalization·manifest-bound 원시 증거 회귀 테스트.
- Create: `supabase/scripts/task8/fixtures/inventory-db-v2.json` — `recorded`와 `unavailable`을 함께 가진 손으로 고정한 DB payload fixture.
- Create: `supabase/scripts/task8/fixtures/inventory-v3.json` — 위 DB fixture와 정확히 결속된 합성 v3 fixture.
- Modify: `supabase/scripts/task8/inventory_lib.ts` — `InventoryBundleV3` strict 검증과 원시 DB payload 대조.
- Modify: `supabase/scripts/task8/inventory_test.ts` — v3 허용, v1/v2·상태 모순·중복·비정렬·원시 변조 거부 테스트.
- Modify: `supabase/scripts/task8/evidence_lib.ts` — manifest에 결속된 private JSON 읽기와 파일 바이트 검증 API.
- Modify: `supabase/scripts/task8/rollout_lib.ts` — inventory 실행 결과에서 단일 payload를 추출해 `inventory-db-v2.json`으로 보존.
- Modify: `supabase/scripts/task8/rollout_test.ts` — psql 장식/복수 payload 실패, 0600 파일과 manifest, v3 stage 결과 테스트.
- Modify: `supabase/scripts/task8/rollout.ts` — manifest-bound DB evidence를 로드해 v3 검증하고 `inventory-v3.json`을 기록.
- Modify: `supabase/scripts/task8/sql/task8_inventory.sql` — DB payload schema v2, migration 상태/두 해시, unaligned single-row 출력.
- Create: `supabase/tests/task8_inventory.test.sql` — PostgreSQL canonical catalog 표현과 null 상태를 고정하는 pgTAP 테스트.
- Modify: `docs/runbooks/match-integration-rollout.md` — v3 파일명, 합성/검증 절차, unavailable 의미, 별도 승인 경계.
- Modify: `supabase/scripts/task8/identity_lib.ts` — 새 product 커밋 SHA를 후속 helper 커밋에서만 고정.
- Modify: `supabase/scripts/task8/stage_evidence_test.ts` — 새 backend pin에 대한 ledger/release 결속 회귀 확인(기존 상수 import를 유지하되 v3 stage fixture로 갱신).

### Task 1: 합성 inventory v3 계약과 마이그레이션 상태 검증

**Files:**
- Create: `supabase/scripts/task8/inventory-v3.schema.json`
- Create: `supabase/scripts/task8/fixtures/inventory-db-v2.json`
- Create: `supabase/scripts/task8/fixtures/inventory-v3.json`
- Modify: `supabase/scripts/task8/inventory_lib.ts`
- Modify: `supabase/scripts/task8/inventory_test.ts`

**Interfaces:**
- Produces: `MigrationInventoryEntryV3`, `InventoryBundleV3`, `ValidatedInventoryBundle`.
- Produces: `validateInventoryStructure(value: unknown): InventoryBundleV3`; 이 단계에서는 구조/정렬/중복/상태 일관성만 검사한다.
- Consumes later: Task 4의 `ValidatedDatabaseInventoryV2`와 source evidence 결속 결과.

- [ ] **Step 1: v3 fixture와 실패 테스트를 먼저 작성한다**

`fixtures/inventory-db-v2.json`은 아래 객체를 그대로 사용한다. `catalogSha256` 값은 형식 및 source 결속용 고정 fixture이며 SQL canonical 표현의 별도 검증은 Task 3의 pgTAP이 담당한다.

```json
{
  "schemaVersion": 2,
  "identity": {
    "projectRef": "orssnkppcukrqxikxdbf",
    "systemIdentifier": "2222222222222222222",
    "databaseOid": "5",
    "sourceSystemIdentifier": "1111111111111111111",
    "markerDigest": "9999999999999999999999999999999999999999999999999999999999999999",
    "provenanceId": "clone-ticket-42",
    "sourceSnapshotAt": "2026-08-02T03:40:00.000Z"
  },
  "migrations": [
    {
      "version": "202607130001",
      "name": "optimize_navigation_queries",
      "statementsState": "unavailable",
      "statementSha256": null,
      "catalogSha256": "6f3f0d96f52eb42858814f6d5748bc6c3e9cd0ecde50bbf5cf56f98c97f6f421"
    },
    {
      "version": "202608020001",
      "name": "match_foundation",
      "statementsState": "recorded",
      "statementSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "catalogSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  ],
  "memberBaseline": {
    "count": 25,
    "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  },
  "authDatabaseInventory": {
    "userCount": 25,
    "identityCount": 25,
    "providers": { "email": 25 }
  },
  "tables": [
    {
      "schema": "match",
      "name": "events",
      "rowCount": 0,
      "sha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    }
  ],
  "storage": {
    "buckets": [
      {
        "id": "avatars",
        "name": "avatars",
        "public": false,
        "fileSizeLimit": 1048576,
        "allowedMimeTypes": ["image/png"],
        "objectCount": 0
      }
    ],
    "totalObjectCount": 0
  },
  "databaseFunctions": [
    {
      "schema": "public",
      "name": "match_state",
      "identityArguments": "uuid",
      "sha256": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    }
  ]
}
```

`fixtures/inventory-v3.json`은 다음 값으로 정확히 작성한다: `schemaVersion: 3`, `sourceDatabaseInventorySha256: "633ed186e36397fbc27a4babf1e8cc3c1fe7086be36f09a22872f8e68ebe5d77"`, 위 raw fixture에서 투영한 identity/migrations/memberBaseline/tables/databaseFunctions, `auth.providerCounts: { "email": 25 }`, `storage.buckets`에서 raw 전용 `name`을 뺀 동일 bucket, `edgeFunctions: []`. Auth 관리 API 필드는 `projectRef: "orssnkppcukrqxikxdbf"`, `siteUrl: "https://validation.invalid"`, `redirectHosts: ["validation.invalid"]`, `jwtExpirySeconds: 3600`으로 고정한다. recovery profile은 아래 JSON literal을 사용한다.

```json
{
  "profile": "managed-pitr-v1",
  "physicalBackupsEnabled": true,
  "pitrEnabled": true,
  "newestRecoveryPointAt": "2026-08-02T03:45:00.000Z",
  "restoreStartedAt": "2026-08-02T03:46:00.000Z",
  "restoreHealthyAt": "2026-08-02T03:55:00.000Z",
  "recoveryPointAt": "2026-08-02T03:45:00.000Z",
  "latestRestoredOperationAt": "2026-08-02T03:35:00.000Z",
  "beforeMemberChecksum": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "afterMemberChecksum": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "beforeMatchChecksum": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "afterMatchChecksum": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
}
```

두 fixture를 읽는 helper도 test 파일 상단에 실제 경로 검증과 함께 추가한다.

```ts
async function fixtureJson<T>(name: "inventory-db-v2.json" | "inventory-v3.json"): Promise<T> {
    return JSON.parse(
        await Deno.readTextFile(new URL(`./fixtures/${name}`, import.meta.url)),
    ) as T;
}
```

`inventory_test.ts`에 다음 행위 테스트를 추가한다. source digest는 Task 4에서 실제 fixture canonical hash로 교체하기 전까지 fixture 파일에 이미 고정된 64자리 값을 그대로 사용하며, 테스트 helper로 생성하지 않는다.

```ts
Deno.test("inventory accepts recorded and unavailable migrations in exact v3", async () => {
    const value = await fixtureJson("inventory-v3.json");
    const result = validateInventoryStructure(value);
    assert(result.schemaVersion === 3);
    assert(result.migrations[0].statementsState === "unavailable");
    assert(result.migrations[0].statementSha256 === null);
});

Deno.test("inventory rejects legacy schemas instead of upgrading", async () => {
    for (const schemaVersion of [1, 2]) {
        const value = await fixtureJson("inventory-v3.json") as Record<string, unknown>;
        value.schemaVersion = schemaVersion;
        await assertRejects(
            () => validateInventoryStructure(value),
            "schemaVersion must equal 3",
        );
    }
});

Deno.test("inventory rejects migration state/hash contradictions", async () => {
    const unavailableWithHash = await fixtureJson("inventory-v3.json");
    unavailableWithHash.migrations[0].statementSha256 = "a".repeat(64);
    await assertRejects(
        () => validateInventoryStructure(unavailableWithHash),
        "unavailable migration must have null statementSha256",
    );

    const recordedWithoutHash = await fixtureJson("inventory-v3.json");
    recordedWithoutHash.migrations[1].statementSha256 = null;
    await assertRejects(
        () => validateInventoryStructure(recordedWithoutHash),
        "recorded migration must have a SHA-256 statementSha256",
    );
});
```

같은 suite에 `catalogSha256` 대문자/63자리, 중복 version, 중복 name, 역순 배열, legacy `sha256`, 알 수 없는 `statementsState`, 추가 필드 거부를 각각 독립 테스트로 넣는다.

- [ ] **Step 2: RED를 확인한다**

Run:

```bash
deno test supabase/scripts/task8/inventory_test.ts
```

Expected: `validateInventoryStructure`와 `inventory-v3.schema.json`이 없어 컴파일 또는 assertion 실패.

- [ ] **Step 3: strict v3 JSON Schema를 작성한다**

`inventory-v2.schema.json`의 identity/member/auth/table/storage/function/recovery `$defs`를 복사해 기존 v2를 변경하지 않고 v3 파일에서 다음 최상위 차이만 적용한다.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jwtennisclub.invalid/schemas/task8/inventory-v3.schema.json",
  "title": "Task 8 rollout custody inventory v3",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "sourceDatabaseInventorySha256",
    "identity",
    "migrations",
    "memberBaseline",
    "auth",
    "tables",
    "storage",
    "databaseFunctions",
    "edgeFunctions",
    "recoveryProfile"
  ],
  "properties": {
    "schemaVersion": { "const": 3 },
    "sourceDatabaseInventorySha256": { "$ref": "#/$defs/sha256" },
    "migrations": {
      "type": "array",
      "items": { "$ref": "#/$defs/migrationV3" }
    }
  }
}
```

`migrationV3`는 `oneOf`로 두 상태의 상관관계를 schema 단계에서도 강제한다.

```json
{
  "migrationV3": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "version",
      "name",
      "statementsState",
      "statementSha256",
      "catalogSha256"
    ],
    "properties": {
      "version": { "type": "string", "pattern": "^[0-9]{12,14}$" },
      "name": { "type": "string", "minLength": 1 },
      "statementsState": { "enum": ["recorded", "unavailable"] },
      "statementSha256": { "type": ["string", "null"] },
      "catalogSha256": { "$ref": "#/$defs/sha256" }
    },
    "oneOf": [
      {
        "properties": {
          "statementsState": { "const": "recorded" },
          "statementSha256": { "$ref": "#/$defs/sha256" }
        }
      },
      {
        "properties": {
          "statementsState": { "const": "unavailable" },
          "statementSha256": { "type": "null" }
        }
      }
    ]
  }
}
```

- [ ] **Step 4: TypeScript 구조 검증을 최소 구현한다**

`inventory_lib.ts`의 v2 타입을 v3로 교체하되 recovery/Auth/Storage 검사는 유지한다.

```ts
export type MigrationInventoryEntryV3 =
    | {
        version: string;
        name: string;
        statementsState: "recorded";
        statementSha256: string;
        catalogSha256: string;
    }
    | {
        version: string;
        name: string;
        statementsState: "unavailable";
        statementSha256: null;
        catalogSha256: string;
    };

export interface InventoryBundleV3 {
    schemaVersion: 3;
    sourceDatabaseInventorySha256: string;
    identity: InventoryIdentity;
    migrations: MigrationInventoryEntryV3[];
    memberBaseline: { count: number; sha256: string };
    auth: InventoryAuth;
    tables: InventoryTable[];
    storage: InventoryStorage;
    databaseFunctions: InventoryDatabaseFunction[];
    edgeFunctions: InventoryEdgeFunction[];
    recoveryProfile: RecoveryProfile;
}

export interface ValidatedInventoryBundle extends InventoryBundleV3 {
    derivedIsolation: {
        authProjectBound: true;
        storageProjectBound: true;
        networkHostsDistinct: true;
    };
}
```

위 block에서 사용하는 sub-shape도 같은 파일에 다음처럼 명시한다.

```ts
export interface InventoryIdentity {
    validationRef: string;
    productionSystemIdentifier: string;
    validationSystemIdentifier: string;
    databaseOid: string;
    markerDigest: string;
    provenanceId: string;
}
export interface InventoryAuth {
    userCount: number;
    identityCount: number;
    providerCounts: Record<string, number>;
    projectRef: string;
    siteUrl: string;
    redirectHosts: string[];
    jwtExpirySeconds: number;
}
export interface InventoryTable {
    schema: string;
    name: string;
    rowCount: number;
    sha256: string;
}
export interface InventoryStorage {
    projectRef: string;
    buckets: Array<{
        id: string;
        public: boolean;
        fileSizeLimit: number | null;
        allowedMimeTypes: string[] | null;
        objectCount: number;
    }>;
}
export interface InventoryDatabaseFunction {
    schema: string;
    name: string;
    identityArguments: string;
    sha256: string;
}
export interface InventoryEdgeFunction {
    name: string;
    version: number;
    status: string;
}
```

`validateMigrations`는 키 검증 뒤 상태 조합, 정렬, 두 종류의 중복을 명시적으로 검사한다.

```ts
function validateMigrations(root: Record<string, unknown>): void {
    const migrations = required(root, "migrations", isArray, "inventory");
    const versions = new Set<string>();
    const names = new Set<string>();
    let previousVersion: string | undefined;

    migrations.forEach((entry, index) => {
        const path = `migrations[${index}]`;
        const item = record(entry, path);
        exactKeys(item, [
            "version",
            "name",
            "statementsState",
            "statementSha256",
            "catalogSha256",
        ], path);
        const version = required(item, "version", isString, path);
        const name = required(item, "name", isString, path);
        if (!/^[0-9]{12,14}$/.test(version)) throw new Error(`${path}.version is invalid`);
        if (previousVersion !== undefined && version <= previousVersion) {
            throw new Error("migrations must be sorted by ascending version");
        }
        if (versions.has(version)) throw new Error(`duplicate migration version: ${version}`);
        if (names.has(name)) throw new Error(`duplicate migration name: ${name}`);
        versions.add(version);
        names.add(name);
        previousVersion = version;
        requireChecksum(item.catalogSha256, `${path}.catalogSha256`);
        if (item.statementsState === "recorded") {
            requireChecksum(item.statementSha256, `${path}.statementSha256`);
        } else if (item.statementsState === "unavailable") {
            if (item.statementSha256 !== null) {
                throw new Error("unavailable migration must have null statementSha256");
            }
        } else {
            throw new Error(`${path}.statementsState is invalid`);
        }
    });
}
```

최상위 `exactKeys`에 `sourceDatabaseInventorySha256`을 추가하고 `schemaVersion !== 3`을 즉시 거부한다.

- [ ] **Step 5: GREEN과 정적 검사를 확인한다**

Run:

```bash
deno fmt --check supabase/scripts/task8/inventory_lib.ts supabase/scripts/task8/inventory_test.ts
deno check supabase/scripts/task8/inventory_lib.ts
deno test supabase/scripts/task8/inventory_test.ts
```

Expected: 모두 exit 0.

- [ ] **Step 6: 커밋한다**

```bash
git add supabase/scripts/task8/inventory-v3.schema.json supabase/scripts/task8/fixtures/inventory-db-v2.json supabase/scripts/task8/fixtures/inventory-v3.json supabase/scripts/task8/inventory_lib.ts supabase/scripts/task8/inventory_test.ts
git commit -m "feat(ops): define migration inventory v3 contract"
```

### Task 2: 단일 psql payload 추출과 manifest-bound private evidence

**Files:**
- Create: `supabase/scripts/task8/inventory_db_lib.ts`
- Create: `supabase/scripts/task8/inventory_db_test.ts`
- Modify: `supabase/scripts/task8/evidence_lib.ts`
- Modify: `supabase/scripts/task8/rollout_lib.ts`
- Modify: `supabase/scripts/task8/rollout_test.ts`

**Interfaces:**
- Produces: `extractSingleJsonPayload(stdout: string): unknown`.
- Produces: `canonicalJson(value: unknown): string` and `sha256CanonicalJson(value: unknown): Promise<string>`.
- Produces: `readManifestBoundPrivateJson<T>(evidenceRoot: string, name: string): Promise<T>`.
- Produces: inventory 수집 시 `inventory-db-v2.json`(0600)과 갱신된 `manifest.json`.

- [ ] **Step 1: 추출·canonicalization·manifest 실패 테스트를 작성한다**

`inventory_db_test.ts`에 다음 사례를 넣는다.

```ts
Deno.test("extracts exactly one unadorned JSON payload", () => {
    assertEquals(extractSingleJsonPayload('{"schemaVersion":2}\n'), {
        schemaVersion: 2,
    });
});

Deno.test("rejects missing, decorated, and multiple psql payloads", async () => {
    for (const stdout of [
        "",
        "schemaVersion | 2\n",
        'NOTICE before\n{"schemaVersion":2}\n',
        '{"schemaVersion":2}\n{"schemaVersion":2}\n',
        'prefix {"schemaVersion":2} suffix\n',
    ]) {
        await assertRejects(
            () => extractSingleJsonPayload(stdout),
            "exactly one JSON payload line",
        );
    }
});

Deno.test("canonical JSON sorts object keys recursively and preserves arrays", () => {
    assertEquals(
        canonicalJson({ z: 1, a: { y: 2, x: 3 }, rows: [{ b: 2, a: 1 }] }),
        '{"a":{"x":3,"y":2},"rows":[{"a":1,"b":2}],"z":1}',
    );
});
```

`rollout_test.ts`의 inventory fixture runner가 한 줄 DB payload를 반환하게 하고 다음을 검증한다.

```ts
assertEquals((await Deno.stat(`${evidenceRoot}/inventory-db-v2.json`)).mode! & 0o777, 0o600);
const manifest = JSON.parse(await Deno.readTextFile(`${evidenceRoot}/manifest.json`));
assert(manifest.files.some((entry: { path: string }) => entry.path === "inventory-db-v2.json"));
```

추가 runner 변형으로 0개/2개/decorated payload를 반환하고, 어느 경우에도 `inventory-db-v2.json`과 gate ledger가 생기지 않음을 검증한다.

- [ ] **Step 2: RED를 확인한다**

Run:

```bash
deno test supabase/scripts/task8/inventory_db_test.ts supabase/scripts/task8/rollout_test.ts
```

Expected: 새 모듈/파일이 없고 기존 수집기가 `inventory-raw.json`만 기록하므로 실패.

- [ ] **Step 3: 단일 payload와 canonical JSON helper를 구현한다**

`inventory_db_lib.ts`에서 임의 brace 검색을 금지하고 전체 stdout을 정확히 한 non-empty line으로 제한한다.

```ts
export function extractSingleJsonPayload(stdout: string): unknown {
    const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length !== 1 || lines[0].trim() !== lines[0]) {
        throw new Error("psql must return exactly one JSON payload line");
    }
    try {
        const value = JSON.parse(lines[0]);
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            throw new Error();
        }
        return value;
    } catch {
        throw new Error("psql must return exactly one JSON payload line");
    }
}

function canonicalValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
                .map(([key, child]) => [key, canonicalValue(child)]),
        );
    }
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
    throw new Error("canonical JSON contains an unsupported value");
}

export function canonicalJson(value: unknown): string {
    return JSON.stringify(canonicalValue(value));
}

export async function sha256CanonicalJson(value: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(canonicalJson(value));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
```

- [ ] **Step 4: manifest-bound private JSON reader를 구현한다**

`evidence_lib.ts`에서 기존 `sha256File`을 export하고, filename containment·0600·manifest entry 유일성·bytes·SHA를 모두 확인한 뒤 JSON을 반환한다.

```ts
export async function readManifestBoundPrivateJson<T>(
    evidenceRoot: string,
    name: string,
): Promise<T> {
    const safeName = safeEvidenceName(name);
    const file = resolve(evidenceRoot, safeName);
    const stat = await Deno.stat(file);
    if (stat.mode === null || (stat.mode & 0o777) !== 0o600) {
        throw new Error(`${safeName} mode must be 0600`);
    }
    const manifest = JSON.parse(
        await Deno.readTextFile(resolve(evidenceRoot, "manifest.json")),
    ) as { schemaVersion: number; files: Array<{ path: string; sha256: string; bytes: number }> };
    const matches = manifest.files.filter((entry) => entry.path === safeName);
    if (manifest.schemaVersion !== 1 || matches.length !== 1) {
        throw new Error(`${safeName} must have exactly one manifest entry`);
    }
    const [entry] = matches;
    if (entry.bytes !== stat.size || entry.sha256 !== await sha256File(file)) {
        throw new Error(`${safeName} does not match manifest`);
    }
    return JSON.parse(await Deno.readTextFile(file)) as T;
}
```

테스트는 파일 내용을 한 바이트 바꾸기, manifest hash 바꾸기, duplicate entry, mode 0644를 각각 거부하는지 확인한다.

- [ ] **Step 5: inventory 수집을 parsed private evidence로 바꾼다**

`executeRolloutStep(... step === "inventory")`에서 SQL 성공 직후 먼저 payload를 추출한다. 추출 성공 전에는 어떤 새 evidence도 쓰지 않는다.

```ts
const payload = extractSingleJsonPayload(result.stdout);
await writeEvidence(options.evidenceRoot, "inventory-db-v2.json", payload);
await writeEvidence(options.evidenceRoot, "inventory-raw.json", {
    schemaVersion: 2,
    kind: "inventory-raw",
    startedAt,
    endedAt: new Date().toISOString(),
    projectRef: options.expectedIdentity.validationRef,
    identityDigest: await expectedIdentityDigest(options.expectedIdentity),
    backendHead: BACKEND_PRODUCT_SHA,
    clientHead: CLIENT_PRODUCT_SHA,
    command: { program: "psql", args: [task8Script("task8_inventory.sql")] },
    stdout: commandStreamEvidence(result.stdout),
    stderr: commandStreamEvidence(result.stderr),
    result: { passed: true, exitCode: result.code },
});
await writeEvidenceManifest(options.evidenceRoot);
```

`inventory-raw.json`은 감사 transcript로 유지하지만 합성 검증의 source는 오직 manifest-bound `inventory-db-v2.json`이다.

- [ ] **Step 6: GREEN을 확인한다**

Run:

```bash
deno fmt --check supabase/scripts/task8/inventory_db_lib.ts supabase/scripts/task8/inventory_db_test.ts supabase/scripts/task8/evidence_lib.ts supabase/scripts/task8/rollout_lib.ts supabase/scripts/task8/rollout_test.ts
deno check supabase/scripts/task8/inventory_db_lib.ts supabase/scripts/task8/rollout_lib.ts
deno test supabase/scripts/task8/inventory_db_test.ts supabase/scripts/task8/rollout_test.ts
```

Expected: 모두 exit 0.

- [ ] **Step 7: 커밋한다**

```bash
git add supabase/scripts/task8/inventory_db_lib.ts supabase/scripts/task8/inventory_db_test.ts supabase/scripts/task8/evidence_lib.ts supabase/scripts/task8/rollout_lib.ts supabase/scripts/task8/rollout_test.ts
git commit -m "feat(ops): bind raw database inventory evidence"
```

### Task 3: SQL migration catalog v2 payload와 PostgreSQL canonical hash

**Files:**
- Modify: `supabase/scripts/task8/sql/task8_inventory.sql`
- Create: `supabase/tests/task8_inventory.test.sql`
- Modify: `supabase/scripts/task8/inventory_db_test.ts`

**Interfaces:**
- Produces: DB payload `{ schemaVersion: 2, identity, migrations, memberBaseline, authDatabaseInventory, tables, storage, databaseFunctions }`.
- Produces per migration: `{ version, name, statementsState, statementSha256, catalogSha256 }`.
- Consumes: `extensions.digest`, `supabase_migrations.schema_migrations.statements`.

- [ ] **Step 1: PostgreSQL 표현과 null 상태의 pgTAP RED를 작성한다**

`supabase/tests/task8_inventory.test.sql`은 운영 테이블을 수정하지 않고 fixture CTE만 사용한다.

```sql
begin;
select plan(7);

create temporary table task8_inventory_fixture (
  version text not null,
  name text not null,
  statements text[]
) on commit drop;

insert into task8_inventory_fixture(version, name, statements) values
  ('202607130001', 'optimize_navigation_queries', null),
  ('202608020001', 'match_foundation', array['select 1;']::text[]);

create temporary view task8_inventory_projection as
select
  version,
  name,
  case when statements is null then 'unavailable' else 'recorded' end as statements_state,
  case when statements is null then null else
    encode(extensions.digest(array_to_string(statements, E'\n'), 'sha256'), 'hex')
  end as statement_sha256,
  jsonb_build_object(
    'version', version,
    'name', name,
    'statements', statements
  )::text as catalog_json,
  encode(extensions.digest(jsonb_build_object(
    'version', version,
    'name', name,
    'statements', statements
  )::text, 'sha256'), 'hex') as catalog_sha256
from task8_inventory_fixture;

select is(
  (select statements_state from task8_inventory_projection where version = '202607130001'),
  'unavailable',
  'null statements are unavailable'
);

select is(
  (select statement_sha256 from task8_inventory_projection where version = '202607130001'),
  null,
  'unavailable statements have no statement hash'
);

select is(
  (select statements_state from task8_inventory_projection where version = '202608020001'),
  'recorded',
  'stored statements are recorded'
);

select is(
  (select statement_sha256 from task8_inventory_projection where version = '202608020001'),
  encode(extensions.digest('select 1;', 'sha256'), 'hex'),
  'recorded statements hash the newline-joined SQL text'
);

select is(
  (select catalog_json from task8_inventory_projection where version = '202607130001'),
  '{"name": "optimize_navigation_queries", "version": "202607130001", "statements": null}',
  'catalog canonical JSON includes explicit null statements'
);

select ok(
  (select bool_and(catalog_sha256 ~ '^[a-f0-9]{64}$') from task8_inventory_projection),
  'every catalog row has a lowercase SHA-256'
);

select is(
  (select array_agg(version order by version) from task8_inventory_projection),
  array['202607130001', '202608020001']::text[],
  'migration rows have a deterministic ascending order'
);

select * from finish();
rollback;
```

`catalog_json` literal이 로컬 PostgreSQL 버전 출력과 다르면 테스트를 느슨하게 만들지 말고 실제 `jsonb::text` 결과를 확인해 literal을 정확히 교정한다.

- [ ] **Step 2: 현재 SQL 정적 계약 테스트를 RED로 추가한다**

`inventory_db_test.ts`에서 SQL 파일을 읽고 다음 필수 계약이 아직 없음을 확인한다.

```ts
Deno.test("inventory SQL emits the v2 migration custody contract", async () => {
    const sql = await Deno.readTextFile(
        new URL("./sql/task8_inventory.sql", import.meta.url),
    );
    for (const required of [
        "'schemaVersion',\n  2",
        "'statementsState'",
        "'statementSha256'",
        "'catalogSha256'",
        "pg_catalog.jsonb_build_object",
        "migration.statements is null",
        "\\pset format unaligned",
        "\\pset tuples_only on",
    ]) assert(sql.includes(required), required);
    assert(!sql.includes("'sha256',\n        pg_catalog.encode(extensions.digest(\n          array_to_string(migration.statements"));
});
```

- [ ] **Step 3: RED를 확인한다**

Run:

```bash
deno test supabase/scripts/task8/inventory_db_test.ts
supabase test db supabase/tests/task8_inventory.test.sql
```

Expected: Deno test는 v2 키/psql 출력 설정 부재로 실패. pgTAP 호출 문법이 설치된 CLI에서 단일 파일 인자를 지원하지 않으면 `supabase test db`를 사용하되 새 파일의 failure가 출력되는지 확인한다.

- [ ] **Step 4: SQL을 단일 unaligned payload v2로 구현한다**

파일 상단에 출력 계약을 고정한다.

```sql
\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on
\pset footer off
```

최상위 raw payload `schemaVersion`을 2로 올리고 migration aggregate를 다음으로 교체한다.

```sql
'migrations',
(
  select coalesce(pg_catalog.json_agg(
    pg_catalog.json_build_object(
      'version', migration.version,
      'name', migration.name,
      'statementsState',
      case
        when migration.statements is null then 'unavailable'
        else 'recorded'
      end,
      'statementSha256',
      case
        when migration.statements is null then null
        else pg_catalog.encode(extensions.digest(
          array_to_string(migration.statements, E'\n'),
          'sha256'
        ), 'hex')
      end,
      'catalogSha256',
      pg_catalog.encode(extensions.digest(
        pg_catalog.jsonb_build_object(
          'version', migration.version,
          'name', migration.name,
          'statements', migration.statements
        )::text,
        'sha256'
      ), 'hex')
    )
    order by migration.version
  ), '[]'::json)
  from supabase_migrations.schema_migrations as migration
),
```

`statementSha256`의 입력은 기존 계약과 동일하게 statements 배열을 `E'\n'`으로 연결한 UTF-8 text다. `catalogSha256`만 `jsonb::text` canonical row 전체를 해시한다.

- [ ] **Step 5: GREEN을 확인한다**

Run:

```bash
deno test supabase/scripts/task8/inventory_db_test.ts
supabase test db
```

Expected: 새 SQL 계약 test 통과, pgTAP 7개 파일 전체 통과. 기존 기준이 6 files/205 tests였으므로 새 파일 assertions 수만큼 증가해야 한다.

- [ ] **Step 6: 커밋하고 새 product SHA를 기록한다**

이 커밋은 SQL 계약의 독립 검토 단위이며 아직 최종 backend product snapshot은 아니다. 아직 `identity_lib.ts`의 pin은 바꾸지 않는다.

```bash
git add supabase/scripts/task8/sql/task8_inventory.sql supabase/tests/task8_inventory.test.sql supabase/scripts/task8/inventory_db_test.ts
git commit -m "feat(ops): emit truthful migration inventory payload"
git rev-parse HEAD
```

Expected: 출력된 40자리 SHA는 SQL 변경 검토 근거로만 기록한다. 최종 pin에는 Task 5까지 포함한 pre-pin HEAD를 사용한다.

### Task 4: raw DB payload v2 strict 검증과 합성 v3 필드 결속

**Files:**
- Modify: `supabase/scripts/task8/inventory_db_lib.ts`
- Modify: `supabase/scripts/task8/inventory_db_test.ts`
- Modify: `supabase/scripts/task8/inventory_lib.ts`
- Modify: `supabase/scripts/task8/inventory_test.ts`

**Interfaces:**
- Produces: `ValidatedDatabaseInventoryV2`.
- Produces: `validateDatabaseInventoryV2(value: unknown): ValidatedDatabaseInventoryV2`.
- Produces: `validateInventoryBundle(value, source, context, now): Promise<ValidatedInventoryBundle>`.
- Consumes: manifest 검증을 통과한 parsed `inventory-db-v2.json`과 `sha256CanonicalJson(source)`.

- [ ] **Step 1: raw payload 변조와 DB-owned mismatch RED를 작성한다**

다음 테스트를 `inventory_test.ts`에 추가한다.

```ts
Deno.test("inventory recomputes the canonical source digest", async () => {
    const source = await fixtureJson("inventory-db-v2.json");
    const inventory = await fixtureJson("inventory-v3.json");
    inventory.sourceDatabaseInventorySha256 = "0".repeat(64);
    await assertRejects(
        () => validateInventoryBundle(inventory, source, validationContext(), NOW),
        "sourceDatabaseInventorySha256 does not match raw database payload",
    );
});

Deno.test("inventory rejects omitted, added, and mutated DB migration rows", async () => {
    for (const mutate of [
        (rows: unknown[]) => rows.slice(1),
        (rows: unknown[]) => [...rows, { ...rows[1], version: "202608020002", name: "extra" }],
        (rows: Array<Record<string, unknown>>) => rows.map((row, index) =>
            index === 0 ? { ...row, catalogSha256: "0".repeat(64) } : row),
    ]) {
        const source = await fixtureJson("inventory-db-v2.json");
        const inventory = await fixtureJson("inventory-v3.json");
        inventory.migrations = mutate(inventory.migrations);
        await assertRejects(
            () => validateInventoryBundle(inventory, source, validationContext(), NOW),
            "migrations do not match raw database payload",
        );
    }
});
```

DB 소유 영역별 mismatch는 다음 table-driven test로 빠짐없이 고정한다.

```ts
const dbOwnedMutations: Array<{
    label: string;
    mutate: (inventory: Record<string, unknown>) => void;
    message: string;
}> = [
    {
        label: "identity",
        mutate: (value) => ((value.identity as Record<string, unknown>).databaseOid = "6"),
        message: "identity does not match raw database payload",
    },
    {
        label: "member baseline",
        mutate: (value) => ((value.memberBaseline as Record<string, unknown>).count = 24),
        message: "memberBaseline does not match raw database payload",
    },
    {
        label: "DB Auth counts",
        mutate: (value) => ((value.auth as Record<string, unknown>).userCount = 24),
        message: "auth database counts do not match raw database payload",
    },
    {
        label: "DB Auth providers",
        mutate: (value) => ((value.auth as Record<string, unknown>).providerCounts = { email: 24 }),
        message: "auth database counts do not match raw database payload",
    },
    {
        label: "tables",
        mutate: (value) => ((value.tables as Array<Record<string, unknown>>)[0].rowCount = 1),
        message: "tables do not match raw database payload",
    },
    {
        label: "Storage buckets",
        mutate: (value) => (((value.storage as Record<string, unknown>).buckets as Array<Record<string, unknown>>)[0].objectCount = 1),
        message: "storage buckets do not match raw database payload",
    },
    {
        label: "database functions",
        mutate: (value) => ((value.databaseFunctions as Array<Record<string, unknown>>)[0].sha256 = "0".repeat(64)),
        message: "databaseFunctions do not match raw database payload",
    },
];

for (const testCase of dbOwnedMutations) {
    Deno.test(`inventory rejects raw mismatch in ${testCase.label}`, async () => {
        const source = await fixtureJson("inventory-db-v2.json");
        const inventory = await fixtureJson("inventory-v3.json");
        testCase.mutate(inventory);
        await assertRejects(
            () => validateInventoryBundle(inventory, source, validationContext(), NOW),
            testCase.message,
        );
    });
}
```

`inventory_db_test.ts`에는 raw payload의 `schemaVersion`을 각각 1과 3으로 바꾸는 두 test, top-level `unexpected: true`, 중복 version, 중복 name, 역순 migrations를 각각 넣고 `validateDatabaseInventoryV2`가 해당 path를 포함한 오류로 거부하는지 확인한다.

- [ ] **Step 2: RED를 확인한다**

Run:

```bash
deno test supabase/scripts/task8/inventory_db_test.ts supabase/scripts/task8/inventory_test.ts
```

Expected: raw schema validator와 source 비교 인자가 없어 실패.

- [ ] **Step 3: DB payload v2를 strict 타입으로 검증한다**

`inventory_db_lib.ts`에 raw payload 전용 타입을 정의한다. top-level 및 모든 nested object에 `exactKeys`를 적용하고, migrations에는 Task 1과 같은 상태/해시/정렬/중복 계약을 재사용 가능한 helper로 공유한다.

```ts
export interface ValidatedDatabaseInventoryV2 {
    schemaVersion: 2;
    identity: {
        projectRef: string;
        systemIdentifier: string;
        databaseOid: string;
        sourceSystemIdentifier: string;
        markerDigest: string;
        provenanceId: string;
        sourceSnapshotAt: string;
    };
    migrations: MigrationInventoryEntryV3[];
    memberBaseline: { count: number; sha256: string };
    authDatabaseInventory: {
        userCount: number;
        identityCount: number;
        providers: Record<string, number>;
    };
    tables: InventoryTable[];
    storage: {
        buckets: RawInventoryBucket[];
        totalObjectCount: number;
    };
    databaseFunctions: InventoryDatabaseFunction[];
}
```

raw의 `sourceSnapshotAt`, bucket `name`, `totalObjectCount`처럼 합성본에 반복되지 않는 필드는 strict 검증과 canonical source digest로 결속한다. 합성본에 대응 필드가 있는 경우에만 아래 projection 비교에 포함한다.

- [ ] **Step 4: DB-owned projection과 비동기 digest 검증을 구현한다**

`inventory_lib.ts`의 public validator를 비동기로 바꾼다.

```ts
export async function validateInventoryBundle(
    value: unknown,
    sourceValue: unknown,
    context: InventoryValidationContext,
    now = new Date(),
): Promise<ValidatedInventoryBundle> {
    const source = validateDatabaseInventoryV2(sourceValue);
    const inventory = validateInventoryStructure(value);
    const sourceSha256 = await sha256CanonicalJson(sourceValue);
    if (inventory.sourceDatabaseInventorySha256 !== sourceSha256) {
        throw new Error(
            "sourceDatabaseInventorySha256 does not match raw database payload",
        );
    }
    validateDatabaseOwnedProjection(inventory, source);
    validateIdentity(inventory as unknown as Record<string, unknown>, context);
    const authIsolation = validateAuthAndMember(inventory as unknown as Record<string, unknown>, context);
    const storageIsolation = validateTablesAndStorage(inventory as unknown as Record<string, unknown>, context);
    validateFunctions(inventory as unknown as Record<string, unknown>);
    const recoveryProfile = validateRecoveryProfile(inventory.recoveryProfile, now);
    return {
        ...inventory,
        recoveryProfile,
        derivedIsolation: { ...authIsolation, ...storageIsolation },
    };
}
```

projection은 stringify 비교 전에 명시적으로 필드명을 매핑한다.

```ts
const expectedProjection = {
    identity: {
        validationRef: source.identity.projectRef,
        productionSystemIdentifier: source.identity.sourceSystemIdentifier,
        validationSystemIdentifier: source.identity.systemIdentifier,
        databaseOid: source.identity.databaseOid,
        markerDigest: source.identity.markerDigest,
        provenanceId: source.identity.provenanceId,
    },
    migrations: source.migrations,
    memberBaseline: source.memberBaseline,
    authDatabaseInventory: {
        userCount: source.authDatabaseInventory.userCount,
        identityCount: source.authDatabaseInventory.identityCount,
        providerCounts: source.authDatabaseInventory.providers,
    },
    tables: source.tables,
    storageBuckets: source.storage.buckets.map(({ id, public: isPublic, fileSizeLimit, allowedMimeTypes, objectCount }) => ({
        id,
        public: isPublic,
        fileSizeLimit,
        allowedMimeTypes,
        objectCount,
    })),
    databaseFunctions: source.databaseFunctions,
};
```

actual projection도 동일한 shape로 만든 뒤 `canonicalJson(actual) === canonicalJson(expected)`를 비교한다. 어느 collection도 sort하거나 누락을 보정하지 않는다. SQL이 정렬을 보장하고 validator가 순서를 검사하므로 row omission/addition/reorder가 그대로 실패한다.

- [ ] **Step 5: fixture source digest를 독립 명령으로 고정한다**

테스트 대상 helper를 호출해 expected 값을 생성하지 않는다. 아래 일회성 Deno eval로 fixture를 읽고 별도의 짧은 canonicalization 코드를 실행해 SHA를 출력한 뒤 `fixtures/inventory-v3.json`에 그 64자리 literal을 기록한다.

```bash
deno eval 'const v=JSON.parse(await Deno.readTextFile("supabase/scripts/task8/fixtures/inventory-db-v2.json"));const c=(x:unknown):unknown=>Array.isArray(x)?x.map(c):x&&typeof x==="object"?Object.fromEntries(Object.entries(x as Record<string,unknown>).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,y])=>[k,c(y)])):x;const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(c(v))));console.log([...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join(""))'
```

그 후 테스트에 해당 literal을 한 번 더 assertion해 helper 변경이 fixture 기대값도 함께 바꾸는 self-fulfilling test가 되지 않게 한다.

- [ ] **Step 6: GREEN을 확인한다**

Run:

```bash
deno fmt --check supabase/scripts/task8/inventory_db_lib.ts supabase/scripts/task8/inventory_db_test.ts supabase/scripts/task8/inventory_lib.ts supabase/scripts/task8/inventory_test.ts
deno check supabase/scripts/task8/inventory_db_lib.ts supabase/scripts/task8/inventory_lib.ts
deno test supabase/scripts/task8/inventory_db_test.ts supabase/scripts/task8/inventory_test.ts
```

Expected: 모두 exit 0.

- [ ] **Step 7: 커밋한다**

```bash
git add supabase/scripts/task8/inventory_db_lib.ts supabase/scripts/task8/inventory_db_test.ts supabase/scripts/task8/inventory_lib.ts supabase/scripts/task8/inventory_test.ts supabase/scripts/task8/fixtures/inventory-db-v2.json supabase/scripts/task8/fixtures/inventory-v3.json
git commit -m "feat(ops): verify inventory against raw database custody"
```

### Task 5: validate-inventory orchestration, v3 output, ledger 결속

**Files:**
- Modify: `supabase/scripts/task8/rollout.ts`
- Modify: `supabase/scripts/task8/rollout_test.ts`
- Modify: `supabase/scripts/task8/stage_evidence_test.ts`

**Interfaces:**
- Consumes: `TASK8_INVENTORY_FILE`의 operator-composed v3와 `${TASK8_EVIDENCE_ROOT}/inventory-db-v2.json`.
- Produces: `${TASK8_EVIDENCE_ROOT}/inventory-v3.json`.
- Produces: schemaVersion 3을 가진 `inventory-validated`/`recovery-validated` 결과.
- Preserves: identity digest, recovery profile digest, predecessor ledger chaining.

- [ ] **Step 1: orchestration RED를 작성한다**

`rollout_test.ts`에 temp evidence root, 0600 source DB fixture, manifest, v3 input을 준비하고 `validateInventory`을 테스트할 수 있도록 export한다. 다음을 검증한다.

```ts
const validated = JSON.parse(
    await Deno.readTextFile(`${evidenceRoot}/inventory-v3.json`),
);
assertEquals(validated.schemaVersion, 3);
assertEquals(
    validated.sourceDatabaseInventorySha256,
    "633ed186e36397fbc27a4babf1e8cc3c1fe7086be36f09a22872f8e68ebe5d77",
);

const ledger = JSON.parse(
    await Deno.readTextFile(`${evidenceRoot}/gate-ledger.json`),
);
assertEquals(ledger.entries.at(-2).stage, "inventory-validated");
assertEquals(ledger.entries.at(-2).result.schemaVersion, 3);
assertEquals(ledger.entries.at(-1).stage, "recovery-validated");
assertEquals(ledger.entries.at(-1).result.schemaVersion, 3);
```

manifest에 없는 source, 변조된 source, v2 composite, 잘못된 source digest에서는 `inventory-v3.json`과 새 ledger entry가 생기지 않는 테스트를 각각 추가한다.

- [ ] **Step 2: RED를 확인한다**

Run:

```bash
deno test supabase/scripts/task8/rollout_test.ts supabase/scripts/task8/stage_evidence_test.ts
```

Expected: 기존 orchestration이 source DB evidence를 읽지 않고 `inventory-v2.json`을 쓰며 schemaVersion 2 stage를 생성하므로 실패.

- [ ] **Step 3: validate-inventory를 manifest-bound v3로 교체한다**

`validateInventory()`에서 source file 경로를 환경변수로 받지 않는다. 이미 canonicalized된 evidence root 아래 고정 이름만 읽는다.

```ts
const sourceDatabaseInventory = await readManifestBoundPrivateJson<unknown>(
    evidenceRoot,
    "inventory-db-v2.json",
);
const inventory = await validateInventoryBundle(
    await readPrivateJson<unknown>(env("TASK8_INVENTORY_FILE")),
    sourceDatabaseInventory,
    {
        storedIdentity,
        liveIdentity,
        productionInventory: await readPrivateJson<
            InventoryValidationContext["productionInventory"]
        >(env("TASK8_PRODUCTION_INVENTORY_FILE")),
    },
);
await writeEvidence(evidenceRoot, "inventory-v3.json", inventory);
await writeEvidenceManifest(evidenceRoot);
```

manifest는 `inventory-v3.json` 기록 직후 갱신하고, 그 다음에만 두 ledger stage를 append한다. 이 순서는 성공 ledger가 manifest 밖 결과를 가리키는 창을 없앤다.

`buildRecoveryValidationResults`의 입력 schemaVersion 타입을 `3`으로 바꾸고 두 stage 모두 3을 반환한다. identity/recovery digest 계산식은 변경하지 않는다.

- [ ] **Step 4: GREEN과 전체 Task 8 Deno suite를 확인한다**

Run:

```bash
deno fmt --check supabase/scripts/task8
deno check supabase/scripts/task8/rollout.ts
deno test supabase/scripts/task8
```

Expected: format/check exit 0, 기존 기준 80 tests에 새 v3 tests가 추가된 전체 suite 통과.

- [ ] **Step 5: 커밋한다**

```bash
git add supabase/scripts/task8/rollout.ts supabase/scripts/task8/rollout_test.ts supabase/scripts/task8/stage_evidence_test.ts
git commit -m "feat(ops): validate composed inventory v3 evidence"
```

이 커밋은 product 후보이지만 아직 pin하지 않는다. 먼저 다음 전체 로컬 게이트를 실행한다.

```bash
./scripts/replay-match-foundation-local.sh
supabase test db
deno fmt --check supabase/scripts/task8 docs/runbooks/match-integration-rollout.md
deno check supabase/scripts/task8/rollout.ts
deno test supabase/scripts/task8
npm test
npm run lint
npx tsc --noEmit
git diff --check
```

실패가 있으면 원인에 필요한 최소 파일만 수정하고 집중 RED→GREEN과 위 전체 게이트를 다시 실행한 뒤 `fix(ops): correct inventory v3 product candidate` 커밋을 만든다. 모든 명령이 exit 0인 깨끗한 pre-pin HEAD에서만 `git rev-parse HEAD`를 실행해 40자리 SHA를 기록한다. 이것이 Task 1~5의 schema, SQL, validator, collector, orchestration을 모두 포함하고 self-pin 변경은 포함하지 않은 새 backend product snapshot이다.

### Task 6: 새 product snapshot pin과 v3 runbook 전환

**Files:**
- Modify: `supabase/scripts/task8/identity_lib.ts`
- Modify: `docs/runbooks/match-integration-rollout.md`
- Modify: `supabase/scripts/task8/rollout_test.ts`
- Modify: `supabase/scripts/task8/stage_evidence_test.ts`

**Interfaces:**
- Consumes: Task 5 직후 `git rev-parse HEAD`로 기록한 정확한 새 product commit SHA.
- Produces: 모든 approval/ledger/clean-checkout gate가 새 product SHA를 사용.
- Produces: operator 문서가 `inventory-db-v2.json` → 합성 `inventory-v3.json` → validate 순서를 안내.

- [ ] **Step 1: 오래된 pin과 v2 운영 문구를 찾는 RED gate를 추가한다**

`rollout_test.ts`에 runbook과 상수를 읽는 테스트를 추가한다.

```ts
Deno.test("runbook requires manifest-bound inventory v3 custody", async () => {
    const runbook = await Deno.readTextFile(
        new URL("../../../docs/runbooks/match-integration-rollout.md", import.meta.url),
    );
    for (const required of [
        "inventory-db-v2.json",
        "inventory-v3.json",
        "inventory-v3.schema.json",
        "sourceDatabaseInventorySha256",
        "statementsState",
        "unavailable",
    ]) assert(runbook.includes(required), required);
    assert(!runbook.includes("compose `inventory-v2.json`"));
});
```

- [ ] **Step 2: RED를 확인한다**

Run:

```bash
deno test supabase/scripts/task8/rollout_test.ts
```

Expected: runbook이 아직 v2 합성을 안내하므로 실패.

- [ ] **Step 3: backend product SHA를 별도 helper-pin 변경으로 갱신한다**

Task 3에서 기록한 SHA가 실제 commit이고 현재 branch ancestry에 있는지 먼저 확인한다.

```bash
task8_product_sha="$(git rev-list --max-count=1 --grep='^feat(ops): validate composed inventory v3 evidence$' HEAD)"
test -n "$task8_product_sha"
git cat-file -e "${task8_product_sha}^{commit}"
git merge-base --is-ancestor "$task8_product_sha" HEAD
printf '%s\n' "$task8_product_sha"
```

네 명령이 exit 0이고 마지막 출력이 Task 5 직후 기록한 40자리 SHA와 일치하는 경우에만 `identity_lib.ts`의 `BACKEND_PRODUCT_SHA` 문자열을 그 출력값으로 바꾼다. `CLIENT_PRODUCT_SHA`는 변경하지 않는다.

- [ ] **Step 4: runbook의 inventory 절차를 v3로 교체한다**

섹션 2는 다음 사실을 명시한다.

1. `rollout.ts inventory`는 SELECT-only SQL 출력에서 정확히 한 JSON payload를 추출한다.
2. private `inventory-db-v2.json`과 raw transcript가 0600으로 저장되고 manifest에 결속된다.
3. 운영자는 Management API Auth/Storage/Edge 값과 승인 recovery profile을 합쳐 `inventory-v3.schema.json`에 맞는 별도 입력 파일을 만든다.
4. `sourceDatabaseInventorySha256`은 raw file bytes가 아니라 parsed source의 recursive-key-sorted canonical JSON SHA-256이다.
5. `rollout.ts validate-inventory`는 evidence root의 고정 source 파일을 다시 읽어 manifest bytes, canonical digest, DB-owned fields를 재검증한다.
6. `unavailable`은 SQL이 없음을 정직하게 보존하는 상태이며 성공을 막지 않지만, 실행 SQL 증명으로 취급할 수 없다.
7. v1/v2 composite는 새 `inventory-validated` stage에 사용할 수 없다.
8. validation DB password는 process environment로만 주입하고 인자/파일/evidence/chat에 남기지 않는다.
9. 이 절차는 DB apply, Edge deploy, release enable 또는 production 접근을 승인하지 않는다.

approval 예시의 backend SHA도 새 product SHA로 바꾸고 client SHA는 유지한다.

- [ ] **Step 5: pin/ledger/runbook GREEN을 확인한다**

Run:

```bash
deno fmt --check supabase/scripts/task8 docs/runbooks/match-integration-rollout.md
deno test supabase/scripts/task8/rollout_test.ts supabase/scripts/task8/stage_evidence_test.ts
rg -n 'inventory-v2.json|inventory-v2.schema.json|37e75f15e5c1efd68c6a3514cb2ddcd8695a02d3' supabase/scripts/task8 docs/runbooks/match-integration-rollout.md
```

Expected: tests exit 0. `rg`는 보존 대상인 `inventory-v2.schema.json` 파일 자체/legacy rejection fixture와 과거 증거 보존 설명만 출력하며, active output filename·active schema·approval pin에는 오래된 값이 없어야 한다.

- [ ] **Step 6: helper-pin 커밋을 별도로 만든다**

```bash
git add supabase/scripts/task8/identity_lib.ts docs/runbooks/match-integration-rollout.md supabase/scripts/task8/rollout_test.ts supabase/scripts/task8/stage_evidence_test.ts
git commit -m "chore(ops): pin migration inventory v3 product snapshot"
```

이 커밋의 SHA를 product SHA로 다시 고정하지 않는다. helper self-reference를 피하기 위해 product commit은 Task 5의 pre-pin 커밋으로 유지한다.

### Task 7: 로컬 통합 검증과 원격 validation 재수집 전 정지점

**Files:**
- Modify if needed after failures: 이번 계획에서 이미 열거한 Task 8/SQL/test/runbook 파일만 해당.
- Do not modify: `supabase/migrations/**` (실패가 migration 자체 결함을 증명하기 전까지), production/validation remote state.

**Interfaces:**
- Produces: 로컬 replay, pgTAP, Deno, web 검증 근거.
- Does not produce without separate authority: 원격 evidence, DB mutation, Edge release, production mutation.

- [ ] **Step 1: 전체 로컬 RED/GREEN 결과가 깨끗한지 확인한다**

Run:

```bash
./scripts/replay-match-foundation-local.sh
supabase test db
deno fmt --check supabase/scripts/task8 docs/runbooks/match-integration-rollout.md
deno check supabase/scripts/task8/rollout.ts
deno test supabase/scripts/task8
npm test
npm run lint
npx tsc --noEmit
git diff --check
```

Expected:

- local migration replay exit 0.
- pgTAP 7 files 전체 통과(기존 6 files/205 tests + 새 inventory assertions).
- Task 8 Deno 전체 통과(기존 80 tests + 새 tests).
- web 전체 통과(기존 113 files/766 tests 이상; 현재 branch의 실제 수를 최종 근거로 기록).
- fmt/check/lint/typecheck/diff-check exit 0.

어느 명령이 실패하면 해당 실패를 숨기거나 기존 수치로 통과 처리하지 않는다. 수정은 실패 원인에 직접 필요한 최소 파일에만 적용하고 해당 task의 집중 test부터 다시 실행한다.

- [ ] **Step 2: product/helper 두 커밋 경계를 검증한다**

Run:

```bash
task8_product_sha="$(git rev-list --max-count=1 --grep='^feat(ops): validate composed inventory v3 evidence$' HEAD)"
test -n "$task8_product_sha"
git log --oneline --decorate -8
git show --stat --oneline "$task8_product_sha"
git show --stat --oneline HEAD
git status --short --branch
```

Expected:

- Task 5 product commit의 ancestry에 `task8_inventory.sql`, pgTAP test, v3 validator와 orchestration이 모두 포함됨.
- 후속 helper-pin commit에 `identity_lib.ts`와 runbook/pin tests가 포함됨.
- `supabase/.temp/` 외 구현 파일이 모두 commit됨.
- product SHA가 helper HEAD와 다름.

- [ ] **Step 3: 원격 validation inventory 명령을 실행하지 말고 별도 승인 checkpoint를 만든다**

로컬 검증 결과와 다음 읽기 전용 원격 단계의 요구사항만 사용자에게 제시하고 멈춘다.

별도 승인 후에만 실행할 후속 범위:

```text
validation ref: orssnkppcukrqxikxdbf
product SHA: Task 5 직후 기록한 정확한 pre-pin product commit
command scope: rollout.ts inventory, operator composition of inventory-v3 input, rollout.ts validate-inventory
allowed remote effect: validation DB SELECT only
forbidden: db-apply, edge-replace, release-enable, production access
credential handling: validation PGPASSWORD/SUPABASE_DB_PASSWORD process environment only
```

원격 실행이 별도로 승인되면 새 evidence root에서 다음을 확인한다.

- `inventory-db-v2.json`이 manifest에 결속되고 mode 0600이다.
- `202607130001_optimize_navigation_queries`와 `202607130002_add_club_meetings`가 `unavailable`/`statementSha256: null`이다.
- 모든 migration에 lowercase 64자리 `catalogSha256`이 있다.
- 합성 v3의 source digest와 DB-owned projection이 통과한다.
- `inventory-validated`와 `recovery-validated`가 v3 schemaVersion, identity digest, recovery digest를 유지한다.
- production ref `ydiusirreirhbvlftegp`에는 읽기/쓰기 모두 수행하지 않는다.

- [ ] **Step 4: post-pin 확인에서 drift가 생기면 완료 선언 없이 멈춘다**

Task 5의 pre-pin 전체 게이트가 이미 통과했으므로 이 단계에서는 파일을 수정하거나 추가 커밋을 만들지 않는다. 결과가 달라지면 실패 명령, 실제 오류, `git status --short --branch`, 현재 product/helper SHA를 기록하고 완료 선언 없이 사용자에게 보고한다. 원인을 수정하려면 기존 pin 이후에 임의 커밋을 쌓지 말고 product snapshot과 helper pin을 다시 분리하는 별도 교정 계획을 검토받는다.

---

## Final Acceptance Checklist

- [ ] `inventory-v3.schema.json`과 TypeScript validator가 v1/v2, 추가 필드, legacy `sha256`을 거부한다.
- [ ] `recorded`/`unavailable` 상태와 `statementSha256` 조합이 schema와 TypeScript 양쪽에서 강제된다.
- [ ] migration version/name 중복과 비정렬이 거부된다.
- [ ] psql stdout은 정확히 한 unadorned JSON line만 허용한다.
- [ ] `inventory-db-v2.json`은 0600이고 manifest의 bytes/SHA와 일치해야 읽힌다.
- [ ] `sourceDatabaseInventorySha256`은 raw parsed payload에서 validator가 직접 재계산한다.
- [ ] identity/migrations/member baseline/DB Auth/tables/Storage/database functions의 대응 필드가 raw payload와 정확히 일치한다.
- [ ] raw에만 존재하는 `sourceSnapshotAt`, bucket name, total object count도 strict raw 검증과 source digest로 결속된다.
- [ ] SQL `catalogSha256`은 정확한 PostgreSQL `jsonb::text` 표현에 null statements를 포함한다.
- [ ] active output과 runbook은 v3이며 기존 v1/v2 schema/evidence는 감사 이력으로 보존된다.
- [ ] 새 product commit과 helper-pin commit이 분리되고 client SHA는 변하지 않는다.
- [ ] local replay, pgTAP, Deno fmt/check/tests, web tests/lint/typecheck, diff-check가 모두 통과한다.
- [ ] 원격 validation 재수집은 별도 승인 전 실행되지 않고 production은 접근하지 않는다.
