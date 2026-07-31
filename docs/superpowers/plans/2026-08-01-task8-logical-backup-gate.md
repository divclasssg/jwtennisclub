# Task 8 Logical Backup Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Task 8 release gate to accept either verified managed PITR evidence or verified zero-cost offsite logical-backup evidence without conflating their recovery guarantees.

**Architecture:** Introduce a versioned discriminated recovery profile shared by inventory and load evidence. Preserve the current `managed-pitr-v1` semantics and add a fail-closed `logical-offsite-v1` path bound to a real encrypted archive, state-check cadence, decryption test, local restore, hosted validation drill, Storage completeness, and 24-hour RPO. Stage ledger output records the selected profile so release approval cannot reuse or disguise evidence across modes.

**Tech Stack:** Deno 2.x TypeScript, JSON Schema, existing Task 8 evidence ledger, PostgreSQL/Supabase rollout tooling.

## Global Constraints

- Do not start this plan until the Phase 1 completion gate has produced a real verified encrypted backup.
- Production project `ydiusirreirhbvlftegp` remains hard-denied for every write.
- Validation project `orssnkppcukrqxikxdbf` is the only hosted destructive restore target and still requires explicit approval.
- `managed-pitr-v1` retains physical backup enabled, PITR enabled, RPO <=15 minutes, and RTO <=60 minutes.
- `logical-offsite-v1` requires RPO <=1,440 minutes, RTO <=60 minutes, latest state check <=36 hours, a successful decrypt test, and a valid quarterly restore drill.
- A logical profile may not set or imply physical backup/PITR booleans.
- Storage object count above zero requires protected object evidence; metadata-only backup fails.
- All evidence remains bound to exact production/validation identities, backend/client SHAs, archive SHA-256, workflow run, and ledger predecessor.
- Existing v1 evidence cannot be silently interpreted as logical evidence.

---

### Task 1: Define a versioned discriminated recovery profile

**Files:**
- Create: `supabase/scripts/task8/recovery_profile_lib.ts`
- Create: `supabase/scripts/task8/recovery-profile-v1.schema.json`
- Test: `supabase/scripts/task8/recovery_profile_test.ts`

**Interfaces:**
- Produces: `RecoveryProfile`, `ManagedPitrProfile`, `LogicalOffsiteProfile`, and `validateRecoveryProfile(value, now): RecoveryProfile`.

- [ ] **Step 1: Write failing managed/logical profile tests**

Define fixtures with exact shapes:

```ts
type ManagedPitrProfile = {
  profile: "managed-pitr-v1";
  physicalBackupsEnabled: true;
  pitrEnabled: true;
  newestRecoveryPointAt: string;
  restoreStartedAt: string;
  restoreHealthyAt: string;
  recoveryPointAt: string;
  latestRestoredOperationAt: string;
  beforeMemberChecksum: string;
  afterMemberChecksum: string;
  beforeMatchChecksum: string;
  afterMatchChecksum: string;
};

type LogicalOffsiteProfile = {
  profile: "logical-offsite-v1";
  repository: "divclasssg/jwtennisclub-backups";
  backupId: string;
  workflowRunId: string;
  encryptedArchiveSha256: string;
  sourceFingerprintSha256: string;
  archiveBytes: number;
  backupStartedAt: string;
  backupCompletedAt: string;
  lastStateCheckAt: string;
  maxStateCheckGapMinutes: number;
  decryptTestedAt: string;
  localRestoreTestedAt: string;
  hostedRestoreStartedAt: string;
  hostedRestoreHealthyAt: string;
  hostedRestoreProjectRef: string;
  quarterlyDrillAt: string;
  storageObjectCount: number;
  storageObjectsProtected: boolean;
  beforeMemberChecksum: string;
  afterMemberChecksum: string;
  beforeMatchChecksum: string;
  afterMatchChecksum: string;
};
```

Test exact keys, hashes, time ordering, `archiveBytes` integer range 1–10,485,760, repository literal, validation ref, max 1,440-minute check gap, <=36-hour freshness, <=60-minute hosted restore, checksum equality, quarterly drill age <=93 days, and Storage completeness.

- [ ] **Step 2: Run the test and verify RED**

Run: `deno test supabase/scripts/task8/recovery_profile_test.ts`

- [ ] **Step 3: Implement strict profile validation**

Use a `profile` switch and reject fields belonging to the other mode. Accept `now` as an injected `Date` so freshness tests are deterministic. Return a typed immutable copy.

- [ ] **Step 4: Verify schema fixtures and commit**

Run:

```bash
deno check supabase/scripts/task8/recovery_profile_lib.ts
deno test supabase/scripts/task8/recovery_profile_test.ts
```

Commit:

```bash
git add supabase/scripts/task8/recovery_profile_lib.ts supabase/scripts/task8/recovery-profile-v1.schema.json supabase/scripts/task8/recovery_profile_test.ts
git commit -m "feat(ops): define explicit recovery evidence profiles"
```

### Task 2: Upgrade inventory validation without preserving ambiguous booleans

**Files:**
- Create: `supabase/scripts/task8/inventory-v2.schema.json`
- Modify: `supabase/scripts/task8/inventory_lib.ts`
- Modify: `supabase/scripts/task8/inventory_test.ts`

**Interfaces:**
- Consumes: `validateRecoveryProfile` from Task 1.
- Produces: `InventoryBundleV2` with `schemaVersion: 2` and `recoveryProfile: RecoveryProfile`.

- [ ] **Step 1: Replace test fixtures with explicit v2 profiles**

Keep separate valid fixtures for managed and logical modes. Add failures proving:

- schemaVersion 1 cannot carry logical fields;
- `physicalBackupsEnabled: false` cannot masquerade as logical recovery;
- logical evidence rejects PITR fields;
- foreign repo/run/archive/ref fails;
- stale check/drill, checksum mismatch, large archive, and unprotected Storage fail.

- [ ] **Step 2: Run the inventory test and verify RED**

Run: `deno test supabase/scripts/task8/inventory_test.ts`

- [ ] **Step 3: Implement v2 inventory dispatch**

Change the top-level exact keys from `backup` and `recovery` to `recoveryProfile`. Keep all existing identity, migration, Auth, Storage, function, and Edge validation unchanged. Require `schemaVersion === 2`; retain `inventory-v1.schema.json` only as historical documentation, not an accepted rollout input.

- [ ] **Step 4: Verify and commit**

Run:

```bash
deno check supabase/scripts/task8/inventory_lib.ts
deno test supabase/scripts/task8/inventory_test.ts
```

Commit:

```bash
git add supabase/scripts/task8/inventory-v2.schema.json supabase/scripts/task8/inventory_lib.ts supabase/scripts/task8/inventory_test.ts
git commit -m "feat(ops): validate logical backup inventory evidence"
```

### Task 3: Bind the selected profile into the stage ledger

**Files:**
- Modify: `supabase/scripts/task8/rollout.ts`
- Modify: `supabase/scripts/task8/stage_evidence_lib.ts`
- Modify: `supabase/scripts/task8/rollout_test.ts`
- Modify: `supabase/scripts/task8/stage_evidence_test.ts`

**Interfaces:**
- Produces `inventory-validated` and `recovery-validated` results containing `recoveryProfile`, `profileEvidenceDigest`, and exact profile metrics.

- [ ] **Step 1: Write failing ledger-binding tests**

Require `profileEvidenceDigest = SHA-256(canonical recoveryProfile JSON)`. Prove release fails when the profile name, archive hash, workflow run, freshness, or digest changes after inventory validation; prove a managed stage cannot be replaced by a logical stage with the same checksums.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
deno test supabase/scripts/task8/rollout_test.ts
deno test supabase/scripts/task8/stage_evidence_test.ts
```

- [ ] **Step 3: Implement canonical profile stage results**

For managed mode, record PITR booleans, RPO/RTO, and checksum match. For logical mode, record repository, backup ID, workflow run, archive hash/bytes, state-check freshness/gap, decrypt/local/hosted restore timestamps, Storage completeness, RPO/RTO, and checksum match. Never emit Secrets or URLs.

- [ ] **Step 4: Verify and commit**

Run the two tests above plus `deno check supabase/scripts/task8/rollout.ts`.

Commit:

```bash
git add supabase/scripts/task8/rollout.ts supabase/scripts/task8/stage_evidence_lib.ts supabase/scripts/task8/rollout_test.ts supabase/scripts/task8/stage_evidence_test.ts
git commit -m "feat(ops): bind recovery profile to release evidence"
```

### Task 4: Make load recovery thresholds profile-aware

**Files:**
- Modify: `supabase/scripts/task8/load_gate_lib.ts`
- Modify: `supabase/scripts/task8/load_gate_evaluator.ts`
- Modify: `supabase/scripts/task8/load_gate_test.ts`
- Modify: `supabase/scripts/task8/evidence-event-v1.schema.json`
- Create: `supabase/scripts/task8/load-plan-v2.json`

**Interfaces:**
- Extends `RecoveryEvent` with `recoveryProfile` and `profileEvidenceDigest`.
- Produces load plan v2 thresholds `{ managedPitrRpoMinutes: 15, logicalOffsiteRpoMinutes: 1440, rtoMinutes: 60 }`.

- [ ] **Step 1: Write failing parser and evaluator tests**

Test managed 15-minute pass/over-15 failure; logical 1,440-minute pass/over-1,440 failure; profile/digest mismatch; missing forced before/after backup timestamps; stale decrypt/drill evidence; and cross-profile extra fields.

- [ ] **Step 2: Run the test and verify RED**

Run: `deno test supabase/scripts/task8/load_gate_test.ts`

- [ ] **Step 3: Implement profile-aware parsing and evaluation**

Parse exact v2 recovery events, select the RPO threshold only from the validated profile, retain the 60-minute RTO and checksum rules, and bind the event digest to the earlier `recovery-validated` stage. Do not allow plan JSON to choose a weaker profile independently.

- [ ] **Step 4: Verify schema and commit**

Run:

```bash
deno check supabase/scripts/task8/load_gate_lib.ts supabase/scripts/task8/load_gate_evaluator.ts
deno test supabase/scripts/task8/load_gate_test.ts
```

Commit:

```bash
git add supabase/scripts/task8/load_gate_lib.ts supabase/scripts/task8/load_gate_evaluator.ts supabase/scripts/task8/load_gate_test.ts supabase/scripts/task8/evidence-event-v1.schema.json supabase/scripts/task8/load-plan-v2.json
git commit -m "feat(ops): evaluate load recovery by explicit profile"
```

### Task 5: Update runbook and run the complete fail-closed suite

**Files:**
- Modify: `docs/runbooks/match-integration-rollout.md`
- Modify: `docs/superpowers/specs/2026-08-01-free-encrypted-backup-design.md`

**Interfaces:**
- Documents the exact evidence transfer from `divclasssg/jwtennisclub-backups` to Task 8 without copying Secrets or plaintext data.

- [ ] **Step 1: Update the runbook with two explicit paths**

Document:

- managed PITR remains the preferred paid path;
- logical offsite is the approved Free path with RPO 24 hours;
- exact private repository, archive/index/checksum evidence fields;
- initial and quarterly hosted restore requirements;
- Storage object fail-closed rule;
- manual `Run workflow` pre-deploy backup;
- no claim of PITR equivalence;
- production hard deny and validation-only restoration.

- [ ] **Step 2: Add a release regression test for every old bypass class**

Ensure the suite rejects missing stages, reordered stages, foreign identity, changed backend/client SHAs, mutated archive hash, stale logical evidence, false PITR booleans, ignored Storage objects, and reused ledger evidence.

- [ ] **Step 3: Run complete verification**

Run:

```bash
deno fmt --check supabase/scripts/task8 docs/runbooks/match-integration-rollout.md
deno check supabase/scripts/task8/rollout.ts
deno test supabase/scripts/task8
git diff --check
```

Expected: all tests pass with zero ignored failures.

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/match-integration-rollout.md docs/superpowers/specs/2026-08-01-free-encrypted-backup-design.md supabase/scripts/task8
git commit -m "docs(ops): operate Task 8 with verified logical backups"
```

### Task 6: Validate the real logical profile before resuming rollout

**Files:**
- Create outside Git roots: private `inventory-v2.json` and Task 8 evidence files.
- No production file or database writes.

**Interfaces:**
- Consumes the real Phase 1 archive/index, decrypt proof, local restore proof, and hosted validation restore proof.
- Produces identity-bound `inventory-validated` and `recovery-validated` ledger stages for `logical-offsite-v1`.

- [ ] **Step 1: Verify exact code and evidence custody**

Require clean reviewed tool/product SHAs, private evidence directory modes 0700/0600, exact production/validation refs, matching archive SHA-256 and workflow run, and current GitHub visibility `PRIVATE`.

- [ ] **Step 2: Compose inventory v2 without fabricating fields**

Populate every logical field from observed workflow, archive, decrypt, local restore, and hosted restore evidence. If any field is unavailable, stop; do not substitute current time or a guessed value.

- [ ] **Step 3: Run validation read-only against production and identity-bound against validation**

Run the updated `rollout.ts validate-inventory` with the exact session-pooler/TLS bindings and private files. Production access remains read-only.

- [ ] **Step 4: Inspect sanitized evidence**

Verify stage order, profile digest, backup/run/archive binding, RPO/RTO, freshness, quarterly drill, Storage completeness, manifest hashes, and no row data or Secrets.

- [ ] **Step 5: Resume Task 8 only after the gate passes**

Proceed to lock capability and DB dry-run. Do not run DB apply, Edge replacement, release enable, or production mutation without their existing explicit approvals.

## Completion Gate

This plan is complete only when both recovery modes pass their positive tests, every cross-mode/stale/foreign/bypass test fails closed, the real logical profile produces identity-bound ledger stages, and the runbook states the honest 24-hour Free-path RPO. The gate must not be weakened merely because the backup repository exists.
