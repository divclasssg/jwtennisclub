# Free Encrypted Backup Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-additional-cost, private GitHub Actions backup system that creates, verifies, encrypts, retains, and manually triggers recoverable `jwtennisclub` Supabase Free backups.

**Architecture:** A new private repository, `divclasssg/jwtennisclub-backups`, owns all backup code and encrypted archives. Deno modules make schedule, custody, manifest, retention, and command behavior testable; pinned GitHub Actions run read-only PostgreSQL dumps, restore them into a disposable local Supabase stack, encrypt only verified bundles with an `age` recipient, and commit only ciphertext through Git LFS. No application repository or production database write is part of this plan.

**Tech Stack:** Deno 2.x TypeScript, PostgreSQL 17 client tools, Supabase CLI 2.109.1 local stack, `age`, Git LFS, GitHub Actions, macOS Keychain for operator-side secrets.

## Global Constraints

- Production project ref is exactly `ydiusirreirhbvlftegp`; every production operation in this plan is read-only.
- Validation project ref is exactly `orssnkppcukrqxikxdbf`; hosted restore remains a separately approved destructive validation-only operation.
- New repository visibility must be `PRIVATE` before any Secret or backup is added.
- GitHub Free private repositories do not provide protected branches; require one owner, zero collaborators, a signed release tag, and runtime binding to an approved backup-code commit SHA instead.
- Existing public repositories `divclasssg/jwtennisclub` and `divclasssg/jwmatch` must never receive plaintext dumps, ciphertext backups, DB Secrets, or the `age` identity.
- GitHub billing budget is `$0` with over-budget usage stopped; do not enable paid Actions, LFS, storage, or Supabase features.
- Workflow jobs use `timeout-minutes: 10`; one archive may not exceed 10MB.
- Expected monthly upper bounds are 400 Actions minutes and 100MB Supabase egress.
- Database credentials must use environment variables or a private `PGPASSFILE`, never URLs or command arguments.
- TLS must use `sslmode=verify-full`, the exact session pooler host, and the verified Supabase 2021 root CA.
- GitHub receives only the `age` recipient. The private identity must never enter GitHub, Supabase, the backup repository, or Actions Secrets.
- Scheduled workflow times are interpreted in `Asia/Seoul`; GitHub cron remains UTC and is revalidated in code.
- Normal change-detection RPO is 24 hours, not PITR and not 15 minutes.
- Storage object count above zero fails backup completeness until object backup exists.
- Provider pricing or quota drift fails closed and requires a new user decision.

---

## File Map

The following paths are relative to the new `jwtennisclub-backups` repository.

- `README.md`: operator contract, threat model, manual backup and restore commands.
- `deno.json`: pinned fmt, check, and test tasks.
- `.gitignore`: plaintext, identities, local state, and Supabase temp exclusions.
- `.gitattributes`: `archives/**/*.age` Git LFS rule.
- `certs/supabase-prod-ca-2021.crt`: public TLS trust anchor.
- `src/contracts.ts`: manifest, schedule, command, and retention types.
- `src/config.ts`: exact environment, ref, TLS, quota, and path validation.
- `src/schedule.ts`: KST change-check, match, monthly, manual, and pre-deploy decisions.
- `src/fingerprint.ts`: deterministic source fingerprint parsing and allowlist checks.
- `src/manifest.ts`: canonical JSON and SHA-256 manifest creation/validation.
- `src/runner.ts`: injectable subprocess interface with redacted failures.
- `src/capture.ts`: read-only dump and source-custody orchestration.
- `src/restore_verify.ts`: disposable local restore and source/restore hash comparison.
- `src/encrypt.ts`: `age` encryption and ciphertext verification.
- `src/retention.ts`: class-aware active retention and quota gates.
- `src/main.ts`: CLI entry point for `check`, `backup`, `verify`, and `retain`.
- `sql/fingerprint.sql`: source and restored database deterministic digest query.
- `sql/catalog.sql`: approved schema, extension, role, Auth, and Storage inventory.
- `supabase/config.toml`: minimal local Supabase restore target.
- `.github/workflows/backup.yml`: scheduled and manual backup workflow.
- `.github/workflows/health.yml`: stale run and free-quota watchdog.
- `tests/*_test.ts`: pure unit and command-contract tests.
- `scripts/integration-local.sh`: local Supabase restore integration test.

### Task 1: Create the private repository and pin the repository contract

**Files:**
- Create: `README.md`
- Create: `deno.json`
- Create: `.gitignore`
- Create: `.gitattributes`
- Create: `src/contracts.ts`
- Test: `tests/contracts_test.ts`

**Interfaces:**
- Produces: `BackupClass`, `BackupTrigger`, `BackupManifestV1`, `StateFingerprintV1`, `WorkflowEvent`, `ScheduleDecision`, `CommandInvocation`, `CommandResult`, `CommandRunner`, `RestoreVerification`, `CapturedBackup`, `EncryptedBackup`, `RetentionEntry`, `UsageSnapshot`, and `RetentionPlan` shared by later tasks.

- [ ] **Step 1: Obtain external-write approval and create the private repository**

Run only after explicit approval:

```bash
cd /Users/seikpark/Desktop/projects
test ! -e jwtennisclub-backups
gh repo create divclasssg/jwtennisclub-backups --private --clone
cd /Users/seikpark/Desktop/projects/jwtennisclub-backups
gh repo view divclasssg/jwtennisclub-backups --json visibility --jq .visibility
```

If the remote repository already exists, do not recreate or overwrite it; inspect its owner, visibility, collaborators, contents, and refs first. Expected for a new repository: the final command prints exactly `PRIVATE`. Stop before adding files if it does not.

- [ ] **Step 2: Write the failing contract test**

```ts
import { assertEquals } from "jsr:@std/assert@1.0.14";
import { canonicalTrigger } from "../src/contracts.ts";

Deno.test("manual backups require a non-empty reason", () => {
  assertEquals(canonicalTrigger({ kind: "manual", reason: "  경기 전 확인  " }), {
    kind: "manual",
    reason: "경기 전 확인",
  });
});
```

- [ ] **Step 3: Run the test and verify RED**

Run: `deno test tests/contracts_test.ts`

Expected: FAIL because `src/contracts.ts` does not exist.

- [ ] **Step 4: Implement the exact shared types**

```ts
export type BackupClass = "daily" | "match" | "monthly" | "manual" | "pre-deploy";
export type BackupTrigger =
  | { kind: "change" }
  | { kind: "pre-match" }
  | { kind: "post-match" }
  | { kind: "monthly" }
  | { kind: "manual"; reason: string }
  | { kind: "pre-deploy"; reason: string };

export interface StateFingerprintV1 {
  schemaVersion: 1;
  projectRef: "ydiusirreirhbvlftegp";
  capturedAt: string;
  digestSha256: string;
  storageObjectCount: number;
  allowlistDigestSha256: string;
}

export interface BackupManifestV1 {
  schemaVersion: 1;
  backupId: string;
  backupClass: BackupClass;
  trigger: BackupTrigger;
  projectRef: "ydiusirreirhbvlftegp";
  databaseSystemIdentifierSha256: string;
  startedAt: string;
  completedAt: string;
  sourceFingerprint: StateFingerprintV1;
  files: Array<{ path: string; bytes: number; sha256: string }>;
  restoreVerification: {
    startedAt: string;
    completedAt: string;
    sourceDigestSha256: string;
    restoredDigestSha256: string;
    passed: true;
  };
}

export type WorkflowEvent =
  | { kind: "scheduled"; slot: "daily" | "pre-match" | "post-match" | "monthly" }
  | { kind: "manual"; backupKind: "manual" | "pre-deploy"; reason: string };

export interface ScheduleDecision {
  shouldCheck: boolean;
  force: boolean;
  backupClass: BackupClass | null;
  trigger: BackupTrigger | null;
}

export interface CommandInvocation {
  program: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(invocation: CommandInvocation): Promise<CommandResult>;
}

export interface RestoreVerification {
  startedAt: string;
  completedAt: string;
  sourceDigestSha256: string;
  restoredDigestSha256: string;
  passed: true;
}

export interface CapturedBackup {
  workRoot: string;
  bundleRoot: string;
  manifest: BackupManifestV1;
}

export interface EncryptedBackup {
  backupId: string;
  archivePath: string;
  checksumPath: string;
  indexPath: string;
  bytes: number;
  sha256: string;
}

export interface RetentionEntry {
  backupId: string;
  backupClass: BackupClass;
  createdAt: string;
  bytes: number;
}

export interface UsageSnapshot {
  lfsBytes: number;
  lfsFreeLimitBytes: 10737418240;
}

export interface RetentionPlan {
  keep: string[];
  removeActiveRefs: string[];
  warning: "none" | "seventy-percent" | "eighty-percent-stop";
  allowNewLongTermArchive: boolean;
}
```

Implement `canonicalTrigger()` so manual and pre-deploy reasons are trimmed, 1–200 characters, single-line, and reject control characters.

- [ ] **Step 5: Add repository safety files**

`.gitignore` must include:

```gitignore
*.sql
*.dump
*.tar.gz
*.agekey
.env*
.state/
.work/
supabase/.temp/
```

`.gitattributes` must contain:

```gitattributes
archives/**/*.age filter=lfs diff=lfs merge=lfs -text
```

Pin Deno dependencies in `deno.json`; expose `fmt`, `check`, and `test` tasks. Explain the no-plaintext/no-private-key rule at the top of `README.md`.

- [ ] **Step 6: Run validation and commit**

Run:

```bash
deno fmt --check
deno check src/contracts.ts
deno test tests/contracts_test.ts
git lfs track
git status --short
```

Expected: all checks pass; only intended repository files are tracked.

Commit:

```bash
git add README.md deno.json .gitignore .gitattributes src/contracts.ts tests/contracts_test.ts
git commit -m "chore: establish private backup repository contract"
```

### Task 2: Validate zero-cost configuration and exact production custody

**Files:**
- Create: `certs/supabase-prod-ca-2021.crt`
- Create: `src/config.ts`
- Test: `tests/config_test.ts`

**Interfaces:**
- Consumes: production ref and limits from Global Constraints.
- Produces: `loadConfig(env: Record<string, string | undefined>): BackupConfig`.

- [ ] **Step 1: Write failing configuration tests**

Cover exact acceptance and rejection for:

```ts
const valid = {
  TASK8_PROJECT_REF: "ydiusirreirhbvlftegp",
  PGHOST: "aws-1-ap-south-1.pooler.supabase.com",
  PGPORT: "5432",
  PGUSER: "postgres.ydiusirreirhbvlftegp",
  PGDATABASE: "postgres",
  PGSSLMODE: "verify-full",
  PGSSLROOTCERT: "certs/supabase-prod-ca-2021.crt",
  AGE_RECIPIENT: "age1example",
  MAX_ARCHIVE_BYTES: "10485760",
};
```

Reject the production direct host on IPv4-only runners, port 6543, another ref, a password-bearing URL, non-absolute runtime CA paths, max archive above 10MB, blank values, and surrounding whitespace.

- [ ] **Step 2: Run tests and verify RED**

Run: `deno test tests/config_test.ts`

Expected: FAIL because `loadConfig` is missing.

- [ ] **Step 3: Implement strict configuration**

```ts
export interface BackupConfig {
  projectRef: "ydiusirreirhbvlftegp";
  pg: { host: string; port: 5432; user: string; database: "postgres" };
  ssl: { mode: "verify-full"; rootCert: string };
  ageRecipient: string;
  maxArchiveBytes: number;
  timezone: "Asia/Seoul";
}
```

Require `PGPASSWORD` at runtime but never copy it into returned serializable config, error messages, or manifests. Validate the committed CA file against the approved SHA-256 and certificate subject before accepting it.

- [ ] **Step 4: Verify tests and commit**

Run:

```bash
deno fmt --check
deno check src/config.ts
deno test tests/config_test.ts
```

Commit:

```bash
git add certs/supabase-prod-ca-2021.crt src/config.ts tests/config_test.ts
git commit -m "feat: bind backups to the production read-only target"
```

### Task 3: Implement KST schedule and manual-button decisions

**Files:**
- Create: `src/schedule.ts`
- Test: `tests/schedule_test.ts`

**Interfaces:**
- Consumes: `WorkflowEvent` and `ScheduleDecision` from Task 1.
- Produces: `decideSchedule(now: Date, event: WorkflowEvent): ScheduleDecision`.

- [ ] **Step 1: Write table-driven failing tests**

Test exact KST cases:

```ts
{
  utc: "2026-08-14T14:00:00.000Z",
  expected: { force: true, backupClass: "match", trigger: { kind: "pre-match" } },
}
{
  utc: "2026-08-15T15:00:00.000Z",
  expected: { force: true, backupClass: "match", trigger: { kind: "post-match" } },
}
{
  utc: "2026-08-31T16:00:00.000Z",
  expected: { force: true, backupClass: "monthly", trigger: { kind: "monthly" } },
}
```

Also test Friday/Sunday candidates adjacent to second/fourth Saturdays do not force match backups, a daily event requests fingerprint comparison, blank manual reason fails, and pre-deploy always forces.

- [ ] **Step 2: Run tests and verify RED**

Run: `deno test tests/schedule_test.ts`

- [ ] **Step 3: Implement schedule decisions without locale ambiguity**

Use `Intl.DateTimeFormat(..., { timeZone: "Asia/Seoul" })` and compute the Saturday occurrence as `Math.floor((dayOfMonth - 1) / 7) + 1`. Return data only; do not execute commands here.

- [ ] **Step 4: Verify and commit**

Run: `deno test tests/schedule_test.ts && deno check src/schedule.ts`

Commit:

```bash
git add src/schedule.ts tests/schedule_test.ts
git commit -m "feat: classify scheduled and manual backup triggers"
```

### Task 4: Build deterministic, private change detection

**Files:**
- Create: `sql/fingerprint.sql`
- Create: `sql/catalog.sql`
- Create: `src/fingerprint.ts`
- Test: `tests/fingerprint_test.ts`

**Interfaces:**
- Produces: `parseFingerprint(stdout: string): StateFingerprintV1` and `assertExactCatalog(actual, approved)`.

- [ ] **Step 1: Write failing parser and allowlist tests**

Require one JSON object, exact project ref, lowercase 64-character hashes, nonnegative Storage count, ISO timestamp, and no extra fields. Assert that an added table, schema, function, or Auth table fails with `catalog allowlist changed`.

- [ ] **Step 2: Run tests and verify RED**

Run: `deno test tests/fingerprint_test.ts`

- [ ] **Step 3: Implement SQL that returns hashes, never rows**

The SQL must:

- set `ON_ERROR_STOP`, `default_transaction_read_only=on`, and a bounded statement timeout;
- enumerate all tables in `public`, `match`, `supabase_migrations`, `auth`, and `storage`;
- hash deterministic `to_jsonb(row)::text` orderings per approved table;
- hash RLS policies, functions, triggers, extensions, and migrations;
- return Storage object count and one final JSON document;
- assert the exact production system identifier hash before and after collection.

- [ ] **Step 4: Characterize SQL invocation with a fake runner**

Assert command arguments contain only `psql -X -v ON_ERROR_STOP=1 -f sql/fingerprint.sql`; the password is present only in the child environment and redacted from any thrown error.

- [ ] **Step 5: Verify and commit**

Run:

```bash
deno check src/fingerprint.ts
deno test tests/fingerprint_test.ts
```

Commit:

```bash
git add sql/fingerprint.sql sql/catalog.sql src/fingerprint.ts tests/fingerprint_test.ts
git commit -m "feat: detect database changes without exposing row data"
```

### Task 5: Capture a complete allowlisted backup and canonical manifest

**Files:**
- Create: `src/runner.ts`
- Create: `src/manifest.ts`
- Create: `src/capture.ts`
- Test: `tests/runner_test.ts`
- Test: `tests/manifest_test.ts`
- Test: `tests/capture_test.ts`

**Interfaces:**
- Consumes: `BackupConfig`, `BackupTrigger`, `CommandRunner`, and `CapturedBackup`.
- Produces: `captureBackup(config: BackupConfig, trigger: BackupTrigger, runner: CommandRunner): Promise<CapturedBackup>` and `canonicalJson(value: unknown): string`.

- [ ] **Step 1: Write failing runner redaction tests**

Verify `CommandRunner` captures exit code/stdout/stderr, rejects nonzero exits, redacts PostgreSQL URLs, `PGPASSWORD`, tokens, and private-key patterns, and never serializes the child environment.

- [ ] **Step 2: Write failing manifest tests**

Require lexicographically sorted file entries, integer byte lengths, lowercase hashes, monotonic timestamps, exact project ref, and canonical JSON ending in one newline.

- [ ] **Step 3: Write failing capture command-contract tests**

Require separate artifacts:

```text
roles.sql
app.dump
auth-data.dump
storage-data.dump
catalog.json
source-fingerprint.json
manifest.json
```

Assert every `pg_dump` call uses `--no-owner`, `--no-acl`, custom format where applicable, explicit schemas/table allowlists, snapshot-consistent capture, no URL argument, and read-only libpq environment.

- [ ] **Step 4: Implement the minimal runner, manifest, and capture pipeline**

Use a mode-0700 work directory and mode-0600 files. Refuse symlinks and paths outside the work root. Capture Auth and Storage as data-only against the managed target schema; capture app schemas and migration history as a custom archive. Export only approved custom roles, without passwords.

- [ ] **Step 5: Verify and commit**

Run:

```bash
deno check src/runner.ts src/manifest.ts src/capture.ts
deno test tests/runner_test.ts tests/manifest_test.ts tests/capture_test.ts
```

Commit:

```bash
git add src/runner.ts src/manifest.ts src/capture.ts tests/runner_test.ts tests/manifest_test.ts tests/capture_test.ts
git commit -m "feat: capture canonical full recovery bundles"
```

### Task 6: Restore every changed backup before accepting it

**Files:**
- Create: `supabase/config.toml`
- Create: `src/restore_verify.ts`
- Create: `scripts/integration-local.sh`
- Test: `tests/restore_verify_test.ts`

**Interfaces:**
- Consumes: `CapturedBackup`, `CommandRunner`, and `RestoreVerification`.
- Produces: `verifyRestore(captured: CapturedBackup, runner: CommandRunner): Promise<RestoreVerification>`.

- [ ] **Step 1: Write failing restore-order tests**

Assert the exact order: approved roles, app schema, migration history, app data, Auth data, Storage metadata, fingerprint. Assert cleanup runs in `finally`, checksum mismatch fails, and no production or hosted validation ref may appear in restore command arguments.

- [ ] **Step 2: Run unit tests and verify RED**

Run: `deno test tests/restore_verify_test.ts`

- [ ] **Step 3: Implement disposable local Supabase restore**

Pin Supabase CLI `2.109.1`. Start a unique local stack, verify its database identity is neither production nor hosted validation, restore the bundle, run `sql/fingerprint.sql`, compare the approved source/restored table counts and hashes, and stop the stack in `finally`.

- [ ] **Step 4: Add a synthetic integration fixture**

`scripts/integration-local.sh` must seed one member, one Auth user/identity fixture, one match record, and one Storage metadata fixture in the local source; capture, restore into a second local stack, and assert matching hashes. It must use synthetic values only.

- [ ] **Step 5: Run unit and local integration tests**

Run:

```bash
deno test tests/restore_verify_test.ts
bash scripts/integration-local.sh
```

Expected: both pass; `docker ps` shows no leaked task containers afterward.

- [ ] **Step 6: Commit**

```bash
git add supabase/config.toml src/restore_verify.ts scripts/integration-local.sh tests/restore_verify_test.ts
git commit -m "feat: prove backup bundles restore before retention"
```

### Task 7: Encrypt verified bundles and enforce class-aware retention

**Files:**
- Create: `src/encrypt.ts`
- Create: `src/retention.ts`
- Test: `tests/encrypt_test.ts`
- Test: `tests/retention_test.ts`

**Interfaces:**
- Consumes: `CapturedBackup`, `CommandRunner`, `EncryptedBackup`, `RetentionEntry`, `UsageSnapshot`, and `RetentionPlan`.
- Produces: `encryptBundle(captured: CapturedBackup, recipient: string, runner: CommandRunner): Promise<EncryptedBackup>` and `retentionPlan(index: RetentionEntry[], usage: UsageSnapshot): RetentionPlan`.

- [ ] **Step 1: Write failing encryption tests**

Require `age --recipient <public-recipient> --output <backup>.tar.gz.age`, reject identities and passphrases, enforce the 10MB ciphertext cap, verify output mode and SHA-256, and prove plaintext paths are excluded from the returned result.

- [ ] **Step 2: Write failing retention tests**

Use fixtures proving retention of 14 daily, 12 match, 12 monthly, all manual/pre-deploy active references; warning at 70% of 10GB; no new long-term archives at 80%; and manual runs cannot bypass file/quota limits.

- [ ] **Step 3: Implement encryption and retention**

Package the verified directory deterministically as `tar.gz`, place the internal manifest inside it, encrypt once, and emit only `.age`, `.sha256`, and a non-sensitive external JSON index. Retention deletes active references but reports that remote LFS reclamation is not assumed.

- [ ] **Step 4: Verify and commit**

Run:

```bash
deno check src/encrypt.ts src/retention.ts
deno test tests/encrypt_test.ts tests/retention_test.ts
```

Commit:

```bash
git add src/encrypt.ts src/retention.ts tests/encrypt_test.ts tests/retention_test.ts
git commit -m "feat: encrypt and retain verified backup archives"
```

### Task 8: Compose the CLI and GitHub workflows

**Files:**
- Create: `src/main.ts`
- Create: `.github/workflows/backup.yml`
- Create: `.github/workflows/health.yml`
- Test: `tests/main_test.ts`
- Test: `tests/workflow_test.ts`

**Interfaces:**
- Produces CLI commands `check`, `backup`, `verify`, and `retain` and the GitHub `Run workflow` button.

- [ ] **Step 1: Write failing CLI tests**

Test daily unchanged exits successfully without archive, daily changed creates one archive, forced triggers always archive, blank manual reason exits before DB access, failed restore never encrypts, and concurrent runs honor one repository-wide group.

- [ ] **Step 2: Write failing workflow-structure tests**

Parse YAML and assert:

- only `schedule` and `workflow_dispatch` triggers;
- required `reason` and `kind` manual inputs;
- exact KST-equivalent UTC cron entries;
- `timeout-minutes: 10` and one concurrency group;
- minimal `contents: write`/`issues: write` permissions;
- every third-party action is pinned to a full commit SHA;
- no `pull_request`, `pull_request_target`, artifact upload, private identity, or DB URL literal.

- [ ] **Step 3: Implement CLI orchestration**

The sequence is config → schedule → fingerprint → capture → restore verification → encryption → retention → commit/push. On any failure, update one private health issue and return nonzero. On success, write the workflow summary without member data.

- [ ] **Step 4: Implement backup and health workflows**

Use these four UTC schedules and let schedule code revalidate the KST date:

```yaml
- cron: "30 15 * * *" # 00:30 KST daily change check
- cron: "0 14 * * 5"  # 23:00 KST Friday match candidate
- cron: "0 15 * * 6"  # 00:00 KST Sunday post-match candidate
- cron: "0 16 * * *"  # 01:00 KST monthly candidate; code requires day 1
```

`workflow_dispatch` exposes `manual` and `pre-deploy` choices plus required reason. Health checks the latest completed state check and opens/updates one issue when older than 36 hours. The same issue records a due warning when the last private-key decrypt test is older than 31 days or the hosted validation restore drill is older than 93 days; it never uploads the private identity.

- [ ] **Step 5: Run the full local suite and commit**

Run:

```bash
deno fmt --check
deno check src/main.ts
deno test
bash scripts/integration-local.sh
```

Commit:

```bash
git add src/main.ts .github/workflows/backup.yml .github/workflows/health.yml tests/main_test.ts tests/workflow_test.ts
git commit -m "feat: automate scheduled and manual encrypted backups"
```

### Task 9: Configure private custody without exposing Secrets

**Files:**
- Modify: `README.md`
- Create: `docs/key-custody.md`
- Create: `docs/github-controls.md`

**Interfaces:**
- Consumes the implemented workflows.
- Produces configured private repository controls, public recipient, encrypted key-custody record, and `$0` billing guard.

- [ ] **Step 1: Confirm repository controls before Secrets**

Read back repository visibility, Actions permissions, fork status, owner, and collaborator list. Require `PRIVATE`, exactly one owner, zero collaborators, and Actions allowed only from pinned actions. Do not enable or claim unavailable private-repository branch protection.

Create a signed `backup-code-v1` release tag. Store its commit SHA as `APPROVED_BACKUP_CODE_SHA`; every workflow must fail before DB access unless its checked-out implementation SHA equals this value. Rotating the approved SHA requires a reviewed signed tag and an explicit repository-variable update.

- [ ] **Step 2: Generate the `age` identity on a trusted operator machine**

Run in a mode-0700 directory outside all Git roots:

```bash
umask 077
age-keygen -o jwtennisclub-backup-private.agekey
```

Record only the printed `age1...` recipient for GitHub. Do not continue until the user confirms two independent private-key copies and a successful local encrypt/decrypt smoke test.

- [ ] **Step 3: Register only approved GitHub Secrets and variables**

After explicit external-write approval, register discrete PostgreSQL values, `PGPASSWORD`, the public `AGE_RECIPIENT`, project ref, and CA path/content. Never register the private identity or a password-bearing URL. Read back names only, never values.

- [ ] **Step 4: Set and verify zero-dollar controls**

Configure GitHub Actions/LFS budget to `$0` with stop-usage enabled. Record a redacted screenshot or API response showing the control. Do not add a paid Supabase add-on or third active project.

- [ ] **Step 5: Document custody and commit**

Document key rotation, loss, compromise, manual backup, alert response, and Secret rotation without including values.

Commit:

```bash
git add README.md docs/key-custody.md docs/github-controls.md
git commit -m "docs: record backup custody and zero-cost controls"
```

### Task 10: Run the first production read-only backup and prove recovery

**Files:**
- Modify: `README.md`
- Create in private repo through workflow: `archives/<year>/<backup-id>.tar.gz.age`
- Create in private repo through workflow: `archives/<year>/<backup-id>.sha256`
- Create in private repo through workflow: `index/<backup-id>.json`

**Interfaces:**
- Produces the first real `logical-offsite-v1` candidate evidence for the separate Task 8 gate plan.

- [ ] **Step 1: Re-run all local checks at the pushed commit**

Run: `deno fmt --check && deno check src/main.ts && deno test && bash scripts/integration-local.sh`

Expected: PASS with no leaked containers or plaintext files.

- [ ] **Step 2: Push and verify the workflow from the private repository**

Push the reviewed commit, then read back the workflow YAML from GitHub and confirm its commit SHA matches local HEAD before enabling the schedule.

- [ ] **Step 3: Trigger a manual backup with an audit reason**

Use the GitHub `Run workflow` button or:

```bash
gh workflow run backup.yml --repo divclasssg/jwtennisclub-backups \
  -f kind=manual -f reason='initial verified backup'
```

Expected: success; one encrypted archive/index/checksum; no plaintext artifact; production remains healthy.

- [ ] **Step 4: Download and decrypt on the trusted operator machine**

```bash
age --decrypt \
  --identity jwtennisclub-backup-private.agekey \
  --output initial-backup.tar.gz \
  initial-backup.tar.gz.age
```

Verify the ciphertext checksum, internal manifest, archive listing, and mode-0600 plaintext. Remove the plaintext immediately after the restore test.

- [ ] **Step 5: Obtain validation-restore approval and restore only validation**

Resolve and recheck validation ref `orssnkppcukrqxikxdbf`, production ref hard deny, distinct system identifiers, and current validation inventory. After explicit approval, restore into validation, compare source/restore member and match checksums plus Auth/Storage aggregates, and record RTO.

- [ ] **Step 6: Verify cost and health evidence**

Confirm Actions minutes, LFS usage, Supabase egress, `$0` budget, latest successful state check, issue status, and repository visibility. Stop if any paid usage appears.

- [ ] **Step 7: Update operator documentation and commit**

Record timestamps, run IDs, archive hashes, restore result, RTO, observed bytes/minutes, and explicit statement that this is not PITR. Do not record credentials or row values.

Commit:

```bash
git add README.md
git commit -m "docs: record first verified encrypted backup"
```

## Completion Gate

Phase 1 is complete only when Tasks 1–10 pass, two private-key copies are confirmed, the first ciphertext decrypts, validation restore matches approved hashes, cost remains zero, and no public repository or production write was involved. Then execute `2026-08-01-task8-logical-backup-gate.md`; do not weaken the existing PITR gate before this evidence exists.
