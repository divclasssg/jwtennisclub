# Match integration cloned-project rollout

Status: `BLOCKED_PRECONDITION`; no remote rollout was run.

This runbook applies only to an approved disposable clone. Production
`jwtennisclub` (`ydiusirreirhbvlftegp`) is hard denied. Project creation, cost,
production changes, and deployment require separate authority.

## 1. Pin identity and custody

Use three distinct locations:

- `TOOL_ROOT`: this reviewed helper checkout;
- `BACKEND_ROOT`: clean exact product HEAD
  `1fc16f34442b60083a003292d59fdc95c5afec0b`;
- `CLIENT_ROOT`: clean exact product HEAD
  `ab1a6f0a41f4ce62a9a69ada7408627190a34e2e`.

Set `TASK8_EVIDENCE_ROOT` to an encrypted durable directory outside both Git
roots. The helper canonicalizes paths, sets `umask 077`, requires directory mode
`0700`, writes redacted `0600` files, and hashes them in `manifest.json`. Keep
credentials, tokens, member rows, and service keys outside evidence.

First capture the server-derived production identity read-only:

```bash
cd "$TOOL_ROOT"
TASK8_PRODUCTION_REF=ydiusirreirhbvlftegp \
deno run --allow-read --allow-write --allow-run --allow-env --allow-sys \
  supabase/scripts/task8/rollout.ts capture-production
```

The helper obtains Management API identity through `supabase projects list`,
then connects only to `db.ydiusirreirhbvlftegp.supabase.co:5432` as
database/user `postgres` with `sslmode=verify-full`. Supply the password through
the process environment; never put it in an argument, URL, runbook, or evidence.
Whitespace, poolers, aliases, ref/user mismatches, and a missing direct endpoint
fail before SQL. `serverFingerprintSha256` is only
`SHA-256(pg_control_system().system_identifier)`. Separately,
`sslmode=verify-full` verifies the TLS chain and hostname; no certificate
fingerprint is captured or claimed.

Stop unless the clone owner supplies its exact 20-letter ref, source snapshot,
isolated Auth/redirects/Storage/credentials, and approval IDs. Link only
`BACKEND_ROOT`; whitespace cannot disguise production. Bootstrap the immutable
marker with exact approval:

```text
BOOTSTRAP:<clone-ref>:<production-system-id>:<provenance-id>:1fc16f34442b60083a003292d59fdc95c5afec0b:ab1a6f0a41f4ce62a9a69ada7408627190a34e2e
```

Run `rollout.ts bootstrap-provenance`. It independently reads
`pg_control_system().system_identifier`, database OID/name, denies the
production system identifier, and records clone ref/source system identifier/
snapshot/provenance as a digest. If hosted PostgreSQL cannot expose this
identity, stop—there is no name-only fallback.

## 2. Inventory and recovery capability

Run `rollout.ts inventory`, then compose `inventory-v1.json` using
`inventory-v1.schema.json` and run `rollout.ts validate-inventory`. Successful
validation appends identity-bound `inventory-validated` and `recovery-validated`
ledger stages. It requires:

- migration version/name/statement hash and member count/hash;
- Auth user/identity/provider counts plus instance ID, site URL, redirect hosts,
  and JWT expiry; Storage includes its project ref;
- public/match table counts/hashes, Storage bucket config/object counts, and
  database function identity arguments/definition hashes;
- exact deployed version/status for `admin-command`, `game-day-command`,
  `game-day-snapshot`, `match-recommendation`, `member-link`, `member-read`, and
  `operator-read`;
- physical-backup/PITR status, newest recovery point, restore start/healthy
  timestamps, latest restored operation, and before/after member/match hashes.

Validation requires `TASK8_IDENTITY_FILE` and `TASK8_PRODUCTION_INVENTORY_FILE`;
the helper queries and validates live DB identity itself through the exact
direct endpoint. Isolation is derived by comparing stored/live DB identity,
production system identifier, Auth instance and network hosts, and Storage
project refs. A supplied `isolated` boolean is not accepted. Every Edge status
must equal `ACTIVE`.

Stop unless RPO is `<=15m`, the admin connection can prepare and reset the
database baseline, and `rollout.ts lock-capability` passes. That gate requires
approved instrumented lock acquisition with `lock_wait_ms` resolution `<=10ms`;
`pg_stat_activity` polling is not accepted as lock-duration evidence.

## 3. DB dry-run and apply

`db-dry-run` is read-only and separate from apply. Review and retain its
transcript. Every helper checks clean product HEADs, linked clone ref, server
system identifier hash, database OID, and provenance marker before and after
SQL.

Apply requires this exact value:

```text
APPLY:<clone-ref>:<db-dry-run-stage-hash>:1fc16f34442b60083a003292d59fdc95c5afec0b:ab1a6f0a41f4ce62a9a69ada7408627190a34e2e
```

Set `TASK8_DRY_RUN_HASH` to that exact stage hash. The helper uses only the
derived direct endpoint for identity SQL. It prepares the member baseline,
rechecks clean trees and live identity immediately before and after linked DB
push, and resets the baseline in `finally`. Any failed gate aborts.

## 4. RPC, Edge, and iOS gates

Put JWT-bearing curl config files in an external `0700` directory and set
`TASK8_AUTH_CONFIG_ROOT`; tokens never appear in command arguments or evidence.
Run `rollout.ts direct-rpc`. Its fixed direct PostgREST matrix proves allowed
200, unauthenticated 401, insufficient-permission 403, and release-off SQLSTATE
`55000`/HTTP 500 mapping. Checked-in payloads contain no credentials. The Edge
post-deploy checks below prove that internal `55000` is normalized to the
external 503 contract.

Approve Edge replacement with
`EDGE:<clone-ref>:<identity-digest>:<backend-head>:<client-head>`, then run
`rollout.ts edge-replace`. It deletes exactly the seven functions, lists and
requires empty, redeploys exactly seven, requires exact positive versions and
`ACTIVE`, and curls all seven for the release-off 503 `feature_unavailable`
contract.

Set `TASK8_IOS_CONFIG_FILE` to an external private file named exactly
`Task8Supabase.plist`. The gate parses it with `plutil`, requires URL exactly
`https://<clone-ref>.supabase.co` and an anon/publishable public key, rejects
any existing local `Configuration/Supabase.plist`, and records only a digest of
URL, key presence, and key class—never the key. It temporarily installs and
removes the reviewed file while checking the clean pinned client around each
command:

```bash
cd "$CLIENT_ROOT/ios/JWTennisMatch"
xcodebuild test -project JWTennisMatch.xcodeproj -scheme JWTennisMatch \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
xcodebuild build -project JWTennisMatch.xcodeproj -scheme JWTennisMatch \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

## 5. Release transaction and deterministic load

Only after all prior gates pass may the owner run `release-enable`. This is a
validation release for test traffic, not final rollout acceptance. The helper
requires the distinct pre-release approval
`RELEASE:<clone-ref>:<ledger-hash>:<manifest-hash>:<backend-head>:<client-head>`.
The hash-chained pre-release ledger must contain exactly one passed, correctly
ordered inventory validation, recovery/backup/PITR proof, lock capability, DB
dry-run/apply, direct RPC, Edge delete-empty/deploy-ACTIVE, and iOS test/build
stage for the same ref, identity digest, and pinned heads. Missing, stale,
wrong-identity, duplicate, or reordered evidence fails. The helper then updates
only `match.release_state`.

Generate JSONL conforming to `evidence-event-v1.schema.json` and the immutable
`load-plan-v1.json`: five operator sessions, 2-second cadence, 900 polls each;
25 member sessions, 2-second cadence, 900 alternating requests each (450 reads
and 450 commands); 900 web requests before and after. Each of 11,250 member
commands needs one explicit instrumented `lock_wait_ms` sample.

Every event has an ISO timestamp. Contiguous baseline and after windows must
each be exactly 30 minutes; both phases must match the 2-second schedule within
250ms. Session, operation, iteration, and JSON key sets are exact. Status
allowlists must agree with `outcome=ok`. Counter, resource, backup-capture, and
telemetry timestamps must exactly bracket the after window; recovery timestamps
must be monotonic. Every lock sample names the approved point/source at
`<=10ms`.

Run `load_gate.ts load-plan-v1.json evidence.jsonl`. It fails on missing,
duplicate, malformed, or extra events. Required boundaries are:

- web p95 regression `<=20%` and absolute p95 `<=500ms`;
- lock p95 `<=100ms`, maximum `<=1000ms`;
- deadlock, timeout, server 5xx, and web-transaction-failure deltas all zero;
- CPU and connection warning ratios each `<70%`;
- restore RTO `<=60m`, RPO `<=15m`, and equal before/after hashes.

The immutable load JSONL plus passing `load_gate.ts` output form a distinct
final rollout-acceptance event ledger. It is created only after validation
release and cannot replace or retroactively satisfy the pre-release ledger.

## 6. Disable and rollback rules

After the first successful command, require non-null `first_write_at`.
`release-disable` again proves domain counts/hashes unchanged. Edge endpoints
must return 503. `removal-proof` must then refuse before deletion.

Before first write only, `removal-proof` locks release state, requires traffic
off/no first write/empty match tables, simulates job/permission/RPC/schema
removal, proves the web member hash unchanged, revalidates identity, and always
rolls back. Actual Edge deletion must have the seven-function empty-inventory
postcondition; actual removal requires separate approval.

## 7. Current blocker

On 2026-07-30, the authenticated CLI exposed production and two unrelated
inactive projects, but no proven clone or isolated access path. Therefore no
project creation, link, deploy, load, release change, or remote mutation was
performed. Supply an approved existing clone and access path, or separately
approve project creation and cost.
