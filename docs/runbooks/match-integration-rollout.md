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
roots. The helper canonicalizes paths, sets `umask 077`, requires directory
mode `0700`, writes redacted `0600` files, and hashes them in `manifest.json`.
Keep credentials, tokens, member rows, and service keys outside evidence.

First capture the server-derived production fingerprint read-only:

```bash
cd "$TOOL_ROOT"
TASK8_PRODUCTION_REF=ydiusirreirhbvlftegp \
TASK8_PRODUCTION_PGSERVICE=task8-production-readonly \
deno run --allow-read --allow-write --allow-run --allow-env --allow-sys \
  supabase/scripts/task8/rollout.ts capture-production
```

Stop unless the clone owner supplies its exact 20-letter ref, source snapshot,
isolated Auth/redirects/Storage/credentials, and approval IDs. Link only
`BACKEND_ROOT`; whitespace cannot disguise production. Bootstrap the immutable
marker with exact approval:

```text
BOOTSTRAP:<clone-ref>:<production-system-id>:<provenance-id>:1fc16f34442b60083a003292d59fdc95c5afec0b:ab1a6f0a41f4ce62a9a69ada7408627190a34e2e
```

Run `rollout.ts bootstrap-provenance`. It independently reads
`pg_control_system().system_identifier`, database OID/name, denies the
production fingerprint, and records clone ref/source fingerprint/snapshot/
provenance as a digest. If hosted PostgreSQL cannot expose this identity,
stop—there is no name-only fallback.

## 2. Inventory and recovery capability

Run `rollout.ts inventory`, then compose `inventory-v1.json` using
`inventory-v1.schema.json` and run `rollout.ts validate-inventory`. It requires:

- migration version/name/statement hash and member count/hash;
- Auth user/identity/provider counts plus site URL, redirect hosts, JWT expiry,
  and explicit production isolation;
- public/match table counts/hashes, Storage bucket config/object counts, and
  database function identity arguments/definition hashes;
- exact deployed version/status for `admin-command`, `game-day-command`,
  `game-day-snapshot`, `match-recommendation`, `member-link`, `member-read`,
  and `operator-read`;
- physical-backup/PITR status, newest recovery point, restore start/healthy
  timestamps, latest restored operation, and before/after member/match hashes.

Stop unless RPO is `<=15m`, the admin connection can prepare and reset the
database baseline, and `rollout.ts lock-capability` passes. That gate requires
approved instrumented lock acquisition with `lock_wait_ms` resolution
`<=10ms`; `pg_stat_activity` polling is not accepted as lock-duration evidence.

## 3. DB dry-run and apply

`db-dry-run` is read-only and separate from apply. Review and retain its
transcript. Every helper checks clean product HEADs, linked clone ref,
server fingerprint, database OID, and provenance marker before and after SQL.

Apply requires this exact value:

```text
APPLY:<clone-ref>:1fc16f34442b60083a003292d59fdc95c5afec0b:ab1a6f0a41f4ce62a9a69ada7408627190a34e2e
```

Run `rollout.ts db-apply` with an admin-capable `TASK8_PGSERVICE`. It prepares
the member baseline, revalidates, runs linked DB push, revalidates, and resets
the baseline in `finally`. Any failed gate aborts.

## 4. RPC, Edge, and iOS gates

With external view/operate/manage JWTs, test this direct-RPC matrix while
release is off:

- reads: `get_match_release_state`, `get_match_operator_read`,
  `get_match_game_day_snapshot`, `get_match_member_directory`,
  `get_member_read`, `get_match_recommendation_input`;
- commands: `apply_game_day_command`, `apply_admin_command`,
  `request_member_link`, `consume_member_link_edge_rate`;
- every role: valid result, unauthenticated, forbidden, malformed, release-off
  SQLSTATE `55000`, idempotent replay, and conflict where applicable.

Before first write, delete exactly the seven Edge Functions listed in §2 and
assert the inventory is empty; run `rollout.ts removal-proof`; redeploy the
same seven and assert exact names, versions, and `ACTIVE` status. With release
off all endpoints must return the fixed 503 contract.

Build from `CLIENT_ROOT` using the real project path:

```bash
cd "$CLIENT_ROOT/ios/JWTennisMatch"
xcodebuild test -project JWTennisMatch.xcodeproj -scheme JWTennisMatch \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
xcodebuild build -project JWTennisMatch.xcodeproj -scheme JWTennisMatch \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

## 5. Release transaction and deterministic load

Only after all prior gates pass may the owner run `release-enable`. The helper
updates only `match.release_state` in one transaction and proves every other
match table retained its exact count/hash.

Generate JSONL conforming to `evidence-event-v1.schema.json` and the immutable
`load-plan-v1.json`: five operator sessions, 2-second cadence, 900 polls each;
25 member sessions, 2-second cadence, 900 alternating requests each (450 reads
and 450 commands); 900 web requests before and after. Each of 11,250 member
commands needs one explicit instrumented `lock_wait_ms` sample.

Run `load_gate.ts load-plan-v1.json evidence.jsonl`. It fails on missing,
duplicate, malformed, or extra events. Required boundaries are:

- web p95 regression `<=20%` and absolute p95 `<=500ms`;
- lock p95 `<=100ms`, maximum `<=1000ms`;
- deadlock, timeout, server 5xx, and web-transaction-failure deltas all zero;
- CPU and connection warning ratios each `<70%`;
- restore RTO `<=60m`, RPO `<=15m`, and equal before/after hashes.

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
