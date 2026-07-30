# Match integration cloned-project rollout

Status: `BLOCKED_PRECONDITION` (draft only; no remote rollout was run)

- backend: `1fc16f34442b60083a003292d59fdc95c5afec0b`
- client: `ab1a6f0a41f4ce62a9a69ada7408627190a34e2e`

This runbook is only for an existing, disposable clone of the web project. The
production project is `jwtennisclub` (`ydiusirreirhbvlftegp`) and is a hard-deny
target. Creating a project, incurring cost, or changing production requires
separate explicit approval.

## 1. Preconditions and evidence custody

The operator must prove all of the following before linking the CLI:

1. `supabase projects list` contains the supplied validation ref and name.
2. The ref differs from `ydiusirreirhbvlftegp`, and the dashboard identifies the
   project as a non-production clone.
3. Clone provenance records the source snapshot and timestamp.
4. The clone has isolated Auth users, callback URLs, Storage, and credentials.
5. A named owner approves destructive testing on that exact clone.

Use an encrypted, durable directory outside every Git checkout, mode `0700`;
evidence files must be `0600`. Do not store bearer tokens, database URLs,
passwords, HMAC keys, raw member rows, or service-role keys in evidence.

```bash
test -n "$TASK8_VALIDATION_REF"
test "$TASK8_VALIDATION_REF" != "ydiusirreirhbvlftegp"
test -n "$TASK8_EVIDENCE_ROOT"
test -d "$TASK8_EVIDENCE_ROOT"
test "$(stat -f '%Lp' "$TASK8_EVIDENCE_ROOT")" = "700"
git rev-parse --show-toplevel
git rev-parse HEAD
supabase projects list > "$TASK8_EVIDENCE_ROOT/projects-before.json"
```

Stop unless two people compare the CLI record, dashboard identity, and clone
provenance. Keep database access in an external `PGSERVICEFILE`. Link after:

```bash
supabase link --project-ref "$TASK8_VALIDATION_REF"
test "$(tr -d '\r\n' < supabase/.temp/project-ref)" = \
  "$TASK8_VALIDATION_REF"
```

## 2. Read-only inventory and baseline

Capture before-state and a same-load web latency baseline. The SQL emits only
aggregates and object names; review output before retaining it.

```bash
supabase migration list --linked \
  > "$TASK8_EVIDENCE_ROOT/migrations-before.txt"
supabase functions list --project-ref "$TASK8_VALIDATION_REF" \
  > "$TASK8_EVIDENCE_ROOT/functions-before.json"
supabase backups list --project-ref "$TASK8_VALIDATION_REF" \
  > "$TASK8_EVIDENCE_ROOT/backups-before.json"
supabase db dump --linked --schema public,auth,storage \
  --file "$TASK8_EVIDENCE_ROOT/schema-before.sql"
psql "service=$TASK8_PGSERVICE" -X -v ON_ERROR_STOP=1 \
  > "$TASK8_EVIDENCE_ROOT/inventory-before.txt" <<'SQL'
select version from supabase_migrations.schema_migrations order by version;
select count(*) as member_count,
       encode(extensions.digest(coalesce(string_agg(
         member_code || ':' || id::text, ',' order by member_code, id
       ), ''), 'sha256'), 'hex') as member_checksum
from public.members;
select count(*) as auth_user_count from auth.users;
select schemaname, tablename
from pg_catalog.pg_tables
where schemaname in ('public', 'auth', 'storage', 'match')
order by schemaname, tablename;
select count(*) as storage_bucket_count from storage.buckets;
select count(*) as storage_object_count from storage.objects;
select routine_schema, routine_name
from information_schema.routines
where routine_schema in ('public', 'match') order by 1, 2;
select extname, extversion from pg_extension order by extname;
select datname, numbackends, xact_commit, xact_rollback, deadlocks
from pg_stat_database where datname = current_database();
SQL
```

Record backup/PITR coverage and the newest recoverable timestamp. Stop if it
cannot support RPO `<=15m`. Run the existing web workload against the clone for
30 minutes and save request-level durations as `web-baseline.ndjson`; do not
include cookies, tokens, bodies, or PII.

## 3. DB objects, direct RPCs, and removal proof

Keep traffic disabled. Review the dry-run, then install private baseline
settings and apply migrations only to the validated link:

```bash
supabase db push --linked --dry-run \
  > "$TASK8_EVIDENCE_ROOT/db-push-dry-run.txt"
psql "service=$TASK8_PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -f supabase/scripts/prepare_match_baseline.local.sql
supabase db push --linked
psql "service=$TASK8_PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -f supabase/scripts/reset_match_baseline.local.sql
psql "service=$TASK8_PGSERVICE" -X -v ON_ERROR_STOP=1 \
  -v task8_validation_ref="$TASK8_VALIDATION_REF" \
  -f supabase/scripts/prove_match_guarded_removal.sql
```

With external view, operate, and manage test JWTs, call public RPCs directly.
Prove valid reads, 401/403, release state `false`, and command rejection with
SQLSTATE `55000`. Do not run a successful command yet.

Before the first write, delete and redeploy the seven Edge Functions on the
validated ref to prove the external removal path. Then run the checked-in proof
above. It locks release state, requires traffic off/no first write/empty match
tables, simulates removal of jobs, permissions, RPCs, and schema, checks member
checksum, and always ends with `ROLLBACK`. Save the transcript; any failed
assertion stops rollout.

## 4. Edge Functions, iOS build, and release flag

Provision versioned member-link Vault secrets and an identical limiter value in
Vault `match_edge_rate_limit_hmac` and Edge `MATCH_EDGE_RATE_LIMIT_SECRET`. Keep
inputs outside Git. Confirm both cron jobs and that hosted `remoteAddr`
distinguishes test origins.

```bash
supabase functions deploy operator-read game-day-snapshot game-day-command \
  match-recommendation admin-command member-link member-read \
  --project-ref "$TASK8_VALIDATION_REF"
supabase functions list --project-ref "$TASK8_VALIDATION_REF" \
  > "$TASK8_EVIDENCE_ROOT/functions-after.json"
```

While release remains off, all seven Edge endpoints must return the fixed 503
contract. Point a local, Git-ignored `Supabase.plist` at the clone and run:

```bash
xcodebuild test -project ios/JWTennisMatch/JWTennisMatch.xcodeproj \
  -scheme JWTennisMatch -destination \
  'platform=iOS Simulator,name=iPhone 17 Pro'
xcodebuild build -project ios/JWTennisMatch/JWTennisMatch.xcodeproj \
  -scheme JWTennisMatch -destination \
  'platform=iOS Simulator,name=iPhone 17 Pro'
```

Only after DB, RPC, Edge, web, and iOS pass may the owner set
`traffic_enabled = true` with `enabled_at` in one transaction. Record approver,
timestamp, and null `first_write_at`. Never enable production here.

## 5. Thirty-minute load and metric gates

Run five operator sessions polling every two seconds and 25 concurrent member
read/valid-idempotent-command sessions for 30 minutes. External fixtures hold
tokens and payloads. Emit only timestamp, route, status, duration, operation ID,
and error class. In parallel, sample once per second:

```sql
select clock_timestamp(), count(*) filter (where wait_event_type = 'Lock'),
       max(clock_timestamp() - query_start)
         filter (where wait_event_type = 'Lock'),
       count(*) filter (where state <> 'idle')
from pg_stat_activity where datname = current_database();
```

Capture Supabase CPU, connection, and plan-warning usage from the dashboard.
Re-run the identical web baseline workload as `web-after.ndjson`. Stop unless:

- web p95 regression is `<=20%` and absolute web p95 is `<=500ms`;
- lock-wait p95 is `<=100ms` and maximum is `<=1s`;
- deadlocks, timeouts, 5xx, and web transaction failures are all zero;
- each resource warning ratio is `<70%`;
- all expected operator/member iterations completed.

## 6. Disable, refusal, and recovery

After the first successful command, confirm `first_write_at` is non-null.
Disable traffic in one transaction, verify all Edge endpoints return 503, and
compare match row counts/checksums before and after disable. Data must be
unchanged.

Re-run the guarded-removal transaction. It must refuse before any `DROP` or
permission deletion because `first_write_at` is set. Preserve its error
transcript. Do not remove schemas, functions, secrets, jobs, or data.

Perform an approved restore rehearsal on the disposable target. Require RTO
`<=60m` and RPO `<=15m`. Finish with a redacted evidence-hash manifest, paired
SHAs, approvers, results, and unresolved warnings.

## 7. Current blocker

On 2026-07-30 the authenticated CLI exposed no identified validation clone. The
canonical backend worktree was unlinked. Only production and two unrelated
inactive projects were visible, with no clone provenance or local credentials.
No remote mutation was attempted.

Minimum user decision: either provide the ref and access path for an existing
non-production clone, or separately approve creation and cost of a disposable
validation project. Production approval is not a substitute.
