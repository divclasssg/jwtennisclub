# Match integration cloned-project rollout

Status: `RECOVERY_VERIFIED_ROLLOUT_BLOCKED`; the hosted recovery drill passed,
but no Match DB apply, Edge replacement, load run, or release was run.

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

The helper obtains Management API identity through `supabase projects list`. Its
default connection is the exact direct endpoint
`db.ydiusirreirhbvlftegp.supabase.co:5432`, database/user `postgres`, with
`sslmode=verify-full`. Supply the password through the process environment;
never put it in an argument, URL, runbook, or evidence.

For each command, set both `PGPASSWORD` (psql) and `SUPABASE_DB_PASSWORD`
(Supabase CLI) to that command's one project-specific password. Retrieve it from
the approved secret store in the invoking shell and unset both variables
immediately afterward. Never reuse production credentials for validation or
validation credentials for production.

On an IPv4-only operator network, the direct endpoint may be unreachable. The
only permitted fallback is the Supabase CLI-derived **session** pooler URL on
port `5432`, never the transaction pooler on `6543`. Download the Supabase root
certificate from the project Database Settings SSL configuration, store it
outside Git with mode `0600`, and set both variables as an atomic pair:

```bash
export TASK8_DB_SESSION_POOLER_URL='postgresql://postgres.<exact-ref>@aws-<cell>-<region>.pooler.supabase.com:5432/postgres'
export TASK8_DB_SSL_ROOT_CERT='/absolute/private/path/prod-ca-2021.crt'
```

The URL must contain no password, query, or fragment. The helper requires the
official `aws-<cell>-<region>.pooler.supabase.com` host, exact
`postgres.<project-ref>` user, `postgres` database, port `5432`,
`sslmode=verify-full`, and an absolute CA path. Supplying only one variable,
using an alias, changing the user/ref, or using any other pooler fails before
SQL. Set the URL to the production ref only for `capture-production`, then
replace it with the validation project's CLI-derived URL for every clone
command. Never reuse one project's pooler URL for the other.

For clone commands, the helper also reads `BACKEND_ROOT/supabase/.temp` and
requires its `project-ref` and canonical passwordless `pooler-url` to match the
validated target before any `db push`. The actual dry-run and apply do not
delegate target selection back to mutable linked state: they receive a canonical
passwordless `--db-url` rebuilt from the already validated target. Both inherit
`PGSSLMODE=verify-full` and `PGSSLROOTCERT`; the password remains
environment-only. The clean-checkout gate permits only the eight known untracked
Supabase CLI cache files under `.temp`. Any other non-ignored untracked or
modified file fails closed, as does any ignored/untracked DB or Edge mutation
input under the explicitly scanned Supabase paths.

`serverFingerprintSha256` is only
`SHA-256(pg_control_system().system_identifier)`. Separately,
`sslmode=verify-full` verifies the TLS chain and hostname; no server certificate
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

Run `rollout.ts inventory`; its raw output is manifest evidence, never a gate
ledger stage. Then compose `inventory-v2.json` using `inventory-v2.schema.json`
and run `rollout.ts validate-inventory`. Successful validation appends the
identity-bound `inventory-validated` and `recovery-validated` stages. It
requires:

- migration version/name/statement hash and member count/hash;
- Auth user/identity/provider counts plus project ref, site URL, redirect hosts,
  and JWT expiry; Storage includes its project ref;
- public/match table counts/hashes, Storage bucket config/object counts, and
  database function identity arguments/definition hashes;
- either no Edge functions for a first deployment, or the exact deployed
  version/status for all seven approved functions: `admin-command`,
  `game-day-command`, `game-day-snapshot`, `match-recommendation`,
  `member-link`, `member-read`, and `operator-read`; partial sets fail closed;
- exactly one explicit recovery profile and its canonical SHA-256 digest.

`managed-pitr-v1` is the preferred paid path. It requires physical backups and
PITR enabled, RPO `<=15m`, RTO `<=60m`, and equal before/after member and match
hashes. `logical-offsite-v1` is the approved Free path, not PITR-equivalent. It
requires private repository `divclasssg/jwtennisclub-backups`, the exact backup
ID, workflow run ID, encrypted archive SHA-256 and byte count, source
fingerprint, backup window, state check gap `<=1440m` and freshness `<=36h`,
successful private-key decrypt and local restore timestamps, and a hosted
restore in validation project `orssnkppcukrqxikxdbf` with RTO `<=60m`.

The Free path also requires an initial hosted restore and a hosted restore drill
at least every 93 days. If the production Storage object count is nonzero,
`storageObjectsProtected` must be true; metadata-only backup evidence fails.
Before every pre-deploy validation, manually run the private backup repository's
`Run workflow`, wait for its restore verification to pass, and use only that
run's immutable index/checksum evidence. Never restore to production here.

The initial hosted drill completed on 2026-08-02 against validation ref
`orssnkppcukrqxikxdbf` using backup
`20260802T030435497Z-af0948fe-295e-482f-aaff-d72ac743e6f8` from workflow run
`30729954729`. The conservative measured RTO was 885 seconds from the first
destructive attempt, including two fail-closed permission adjustments.
Production and validation matched the same normalized digest
`bcd68767f3be73f9b2491e185b61806ebbf851227738ca8ee4e16ebe151ee758`, the same
21-member checksum, zero Match tables, and zero Storage objects. Supabase denied
writes to the four platform-owned tables `auth.schema_migrations`,
`storage.buckets_vectors`, `storage.migrations`, and `storage.vector_indexes`;
the comparison excluded exactly those four on both sides. Catalog metadata
otherwise differed only in hosted role attributes. After Match first exists in
production, this pre-Match drill is insufficient: run a new manual backup and
hosted drill before promotion.

Validation requires `TASK8_IDENTITY_FILE` and `TASK8_PRODUCTION_INVENTORY_FILE`;
the helper queries and validates live DB identity itself through the exact bound
direct or approved session-pooler target. Isolation is derived by comparing
stored/live DB identity, production system identifier, Auth project and network
hosts, and Storage project refs. A supplied `isolated` boolean is not accepted.
When Edge functions already exist, every status must equal `ACTIVE`. An empty
set is accepted only as the explicit initial-deployment state; any partial or
foreign set fails closed.

Stop unless the chosen profile's honest RPO (`<=15m` managed or `<=1440m`
logical), the admin connection can prepare and reset the database baseline, and
`rollout.ts lock-capability` passes. That gate requires approved instrumented
lock acquisition with `lock_wait_ms` resolution `<=10ms`; `pg_stat_activity`
polling is not accepted as lock-duration evidence.

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
derived direct endpoint or strictly bound session-pooler target for identity
SQL. It prepares the member baseline, rechecks clean trees and live identity
immediately before and after the identity-bound `--db-url` push, and resets the
baseline in `finally`. Any failed gate aborts.

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
`https://<clone-ref>.supabase.co` and an anon/publishable public key. It
resolves the app's synchronized source root and built resource path from the
Xcode project/build settings, rejects any existing
`JWTennisMatch/Supabase.plist`, and records URL, key presence/class, and the
key's SHA-256—never the key—inside the config digest. It removes the temporary
input even after copy/chmod failure and verifies the matching resource exists
inside the built app:

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
The hash-chained pre-release ledger must be exactly the passed, ordered
sequence: inventory validation, profile-bound recovery proof, lock capability,
DB dry-run/apply, direct RPC, Edge delete-empty/deploy-ACTIVE, and iOS
test/build, all for the same ref, identity digest, and pinned heads. Every entry
is bound before sequence checking; foreign, unknown, missing, failed, duplicate,
or reordered evidence fails. The helper then updates only `match.release_state`.

Generate JSONL conforming to `evidence-event-v1.schema.json` and the immutable
`load-plan-v2.json`: five operator sessions, 2-second cadence, 900 polls each;
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

Run:

```bash
deno run --allow-read supabase/scripts/task8/load_gate.ts \
  supabase/scripts/task8/load-plan-v2.json evidence.jsonl \
  stage-01-recovery-validated.json
```

The third argument is mandatory and binds the load event to the earlier
hash-chained profile digest. It fails on missing, duplicate, malformed, extra,
cross-profile, or digest-drifted events. Required boundaries are:

- web p95 regression `<=20%` and absolute p95 `<=500ms`;
- lock p95 `<=100ms`, maximum `<=1000ms`;
- deadlock, timeout, server 5xx, and web-transaction-failure deltas all zero;
- CPU and connection warning ratios each `<70%`;
- restore RTO `<=60m`, profile-specific RPO (`<=15m` managed or `<=1440m`
  logical), and equal before/after hashes.

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

Validation ref `orssnkppcukrqxikxdbf` passed the approved destructive hosted
restore drill and the real `logical-offsite-v1` profile validates locally. The
remaining blockers are immutable clone provenance, isolated Auth/client
configuration, full inventory v2 composition, and the required Match/Edge/iOS
gates. No DB apply, Edge replacement, load run, or release change may proceed
until those prerequisites pass and their existing approvals are supplied.
Production remains hard denied.
