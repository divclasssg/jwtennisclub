/// <reference lib="deno.ns" />

import {
    appendStageEvidence,
    commandStreamEvidence,
    type GateStage,
    profileEvidenceDigest,
    recoveryProfileMetrics,
    verifyApplyApproval,
    verifyReleaseApproval,
} from "./stage_evidence_lib.ts";
import { BACKEND_PRODUCT_SHA, CLIENT_PRODUCT_SHA } from "./identity_lib.ts";
import type { RecoveryProfile } from "./recovery_profile_lib.ts";

function assert(
    condition: unknown,
    message = "assertion failed",
): asserts condition {
    if (!condition) throw new Error(message);
}

async function assertRejects(
    action: () => Promise<unknown> | unknown,
    expected: string,
): Promise<void> {
    try {
        await action();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(
            message.includes(expected),
            `expected ${expected}, got ${message}`,
        );
        return;
    }
    throw new Error(`expected rejection containing ${expected}`);
}

const ref = "abcdefghijklmnopqrst";
const identityDigest = "1".repeat(64);
const otherRef = "bcdefghijklmnopqrstu";
const otherIdentityDigest = "2".repeat(64);

async function append(
    root: string,
    stage: GateStage,
    sequence: number,
    predecessorHash: string | null,
    binding: {
        projectRef: string;
        identityDigest: string;
    } = { projectRef: ref, identityDigest },
    result: { passed: boolean; [key: string]: unknown } = { passed: true },
) {
    return await appendStageEvidence(root, {
        schemaVersion: 1,
        stage,
        sequence,
        startedAt: `2026-07-30T00:${String(sequence).padStart(2, "0")}:00.000Z`,
        endedAt: `2026-07-30T00:${String(sequence).padStart(2, "0")}:01.000Z`,
        projectRef: binding.projectRef,
        identityDigest: binding.identityDigest,
        backendHead: BACKEND_PRODUCT_SHA,
        clientHead: CLIENT_PRODUCT_SHA,
        predecessorHash,
        command: { program: "synthetic", args: ["--safe"] },
        stdout: commandStreamEvidence("Bearer must-not-survive\nresult=ok"),
        stderr: commandStreamEvidence(
            "postgresql://postgres:must-not-survive@db.example/postgres",
        ),
        result,
    });
}

function managedProfile() {
    return {
        profile: "managed-pitr-v1" as const,
        physicalBackupsEnabled: true as const,
        pitrEnabled: true as const,
        newestRecoveryPointAt: "2026-07-30T03:45:00.000Z",
        restoreStartedAt: "2026-07-30T03:46:00.000Z",
        restoreHealthyAt: "2026-07-30T03:55:00.000Z",
        recoveryPointAt: "2026-07-30T03:45:00.000Z",
        latestRestoredOperationAt: "2026-07-30T03:35:00.000Z",
        beforeMemberChecksum: "a".repeat(64),
        afterMemberChecksum: "a".repeat(64),
        beforeMatchChecksum: "b".repeat(64),
        afterMatchChecksum: "b".repeat(64),
    };
}

function logicalProfile() {
    return {
        profile: "logical-offsite-v1" as const,
        repository: "divclasssg/jwtennisclub-backups" as const,
        backupId: "20260802T030435497Z-af0948fe-295e-482f-aaff-d72ac743e6f8",
        workflowRunId: "30729954729",
        encryptedArchiveSha256: "c".repeat(64),
        sourceFingerprintSha256: "d".repeat(64),
        archiveBytes: 82470,
        backupStartedAt: "2026-08-02T03:04:35.497Z",
        backupCompletedAt: "2026-08-02T03:07:05.402Z",
        lastStateCheckAt: "2026-08-02T03:04:19.454Z",
        maxStateCheckGapMinutes: 1440,
        decryptTestedAt: "2026-08-02T03:13:56.000Z",
        localRestoreTestedAt: "2026-08-02T03:08:31.949Z",
        hostedRestoreStartedAt: "2026-08-02T03:14:00.000Z",
        hostedRestoreHealthyAt: "2026-08-02T03:40:00.000Z",
        hostedRestoreProjectRef: "orssnkppcukrqxikxdbf" as const,
        quarterlyDrillAt: "2026-08-02T03:40:00.000Z",
        storageObjectCount: 0,
        storageObjectsProtected: false,
        beforeMemberChecksum: "a".repeat(64),
        afterMemberChecksum: "a".repeat(64),
        beforeMatchChecksum: "b".repeat(64),
        afterMatchChecksum: "b".repeat(64),
    };
}

async function profileResult(profile: RecoveryProfile = managedProfile()) {
    return {
        passed: true,
        schemaVersion: 2,
        recoveryProfile: profile,
        profileEvidenceDigest: await profileEvidenceDigest(profile),
        profileMetrics: recoveryProfileMetrics(profile),
    };
}

Deno.test("release binds the exact logical profile, digest, and metrics across stages", async () => {
    const now = new Date("2026-08-02T05:00:00.000Z");
    const validRoot = await Deno.makeTempDir();
    try {
        const valid = await profileResult(logicalProfile());
        const { approval } = await appendReleaseLedger(
            validRoot,
            valid,
            valid,
        );
        await verifyReleaseApproval(
            validRoot,
            approval,
            ref,
            identityDigest,
            now,
        );
    } finally {
        await Deno.remove(validRoot, { recursive: true });
    }

    for (
        const mutation of [
            { workflowRunId: "30729954730" },
            { encryptedArchiveSha256: "e".repeat(64) },
        ]
    ) {
        const root = await Deno.makeTempDir();
        try {
            const inventory = await profileResult(logicalProfile());
            const recovery = await profileResult({
                ...logicalProfile(),
                ...mutation,
            });
            const { approval } = await appendReleaseLedger(
                root,
                inventory,
                recovery,
            );
            await assertRejects(
                () =>
                    verifyReleaseApproval(
                        root,
                        approval,
                        ref,
                        identityDigest,
                        now,
                    ),
                "digest mismatch",
            );
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    }
});

async function appendReleaseLedger(
    root: string,
    inventoryResult?: Awaited<ReturnType<typeof profileResult>>,
    recoveryResult?: Awaited<ReturnType<typeof profileResult>>,
) {
    inventoryResult ??= await profileResult();
    recoveryResult ??= inventoryResult;
    const required: GateStage[] = [
        "inventory-validated",
        "recovery-validated",
        "lock-capability",
        "db-dry-run",
        "db-apply",
        "direct-rpc",
        "edge-delete-empty",
        "edge-deploy-active",
        "ios-test",
        "ios-build",
    ];
    let predecessor: string | null = null;
    let ledgerHash = "";
    let manifestHash = "";
    for (const [sequence, stage] of required.entries()) {
        const result = stage === "inventory-validated"
            ? inventoryResult
            : stage === "recovery-validated"
            ? recoveryResult
            : { passed: true };
        const written = await append(
            root,
            stage,
            sequence,
            predecessor,
            { projectRef: ref, identityDigest },
            result,
        );
        predecessor = written.entryHash;
        ledgerHash = written.ledgerHash;
        manifestHash = written.manifestHash;
    }
    return {
        ledgerHash,
        manifestHash,
        approval:
            `RELEASE:${ref}:${ledgerHash}:${manifestHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`,
    };
}

Deno.test("stage evidence persists typed redacted output with a hashed chain", async () => {
    const root = await Deno.makeTempDir();
    try {
        await Deno.chmod(root, 0o700);
        const first = await append(root, "db-dry-run", 0, null);
        const second = await append(root, "db-apply", 1, first.entryHash);
        assert(second.ledgerHash !== first.ledgerHash);
        const body = await Deno.readTextFile(second.file);
        assert(!body.includes("must-not-survive"));
        assert(body.includes("[REDACTED]"));
        assert((await Deno.stat(second.file)).mode! % 0o1000 === 0o600);
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test("stage evidence rejects changed backend or client product heads", async () => {
    for (const changed of ["backendHead", "clientHead"] as const) {
        const root = await Deno.makeTempDir();
        try {
            const record = {
                schemaVersion: 1 as const,
                stage: "inventory-validated" as const,
                sequence: 0,
                startedAt: "2026-07-30T00:00:00.000Z",
                endedAt: "2026-07-30T00:00:01.000Z",
                projectRef: ref,
                identityDigest,
                backendHead: BACKEND_PRODUCT_SHA,
                clientHead: CLIENT_PRODUCT_SHA,
                predecessorHash: null,
                command: { program: "synthetic", args: [] },
                stdout: commandStreamEvidence(""),
                stderr: commandStreamEvidence(""),
                result: { passed: true },
            };
            record[changed] = "0".repeat(64);
            await assertRejects(
                () => appendStageEvidence(root, record),
                "stage evidence metadata is invalid",
            );
        } finally {
            await Deno.remove(root, { recursive: true });
        }
    }
});

Deno.test("DB apply approval binds the exact dry-run transcript hash", async () => {
    const root = await Deno.makeTempDir();
    try {
        const dryRun = await append(root, "db-dry-run", 0, null);
        const approval =
            `APPLY:${ref}:${dryRun.entryHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`;
        await verifyApplyApproval(
            root,
            approval,
            ref,
            identityDigest,
            BACKEND_PRODUCT_SHA,
            CLIENT_PRODUCT_SHA,
            dryRun.entryHash,
        );
        await assertRejects(
            () =>
                verifyApplyApproval(
                    root,
                    approval,
                    ref,
                    identityDigest,
                    BACKEND_PRODUCT_SHA,
                    CLIENT_PRODUCT_SHA,
                    "2".repeat(64),
                ),
            "dry-run transcript hash mismatch",
        );
        await assertRejects(
            () =>
                verifyApplyApproval(
                    root,
                    `APPLY:${ref}:${
                        "3".repeat(64)
                    }:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`,
                    ref,
                    identityDigest,
                    BACKEND_PRODUCT_SHA,
                    CLIENT_PRODUCT_SHA,
                    dryRun.entryHash,
                ),
            "explicit apply approval",
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test("DB apply rejects an exact dry-run hash from another clone identity", async () => {
    const root = await Deno.makeTempDir();
    try {
        const dryRun = await append(root, "db-dry-run", 0, null);
        const crossCloneApproval =
            `APPLY:${otherRef}:${dryRun.entryHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`;
        await assertRejects(
            () =>
                verifyApplyApproval(
                    root,
                    crossCloneApproval,
                    otherRef,
                    otherIdentityDigest,
                    BACKEND_PRODUCT_SHA,
                    CLIENT_PRODUCT_SHA,
                    dryRun.entryHash,
                ),
            "dry-run evidence binding mismatch",
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test("release rejects a ledger without inventory, recovery, and lock prerequisites", async () => {
    const root = await Deno.makeTempDir();
    try {
        let predecessor: string | null = null;
        let ledgerHash = "";
        let manifestHash = "";
        for (
            const [sequence, stage] of [
                "db-dry-run",
                "db-apply",
                "direct-rpc",
                "edge-delete-empty",
                "edge-deploy-active",
                "ios-test",
                "ios-build",
            ].entries()
        ) {
            const written = await append(
                root,
                stage as GateStage,
                sequence,
                predecessor,
            );
            predecessor = written.entryHash;
            ledgerHash = written.ledgerHash;
            manifestHash = written.manifestHash;
        }
        const approval =
            `RELEASE:${ref}:${ledgerHash}:${manifestHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`;
        await assertRejects(
            () =>
                verifyReleaseApproval(
                    root,
                    approval,
                    ref,
                    identityDigest,
                ),
            "release ledger stage sequence mismatch",
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test("release rejects an extra required stage bound to another clone identity", async () => {
    const root = await Deno.makeTempDir();
    try {
        const required: GateStage[] = [
            "inventory-validated",
            "recovery-validated",
            "lock-capability",
            "db-dry-run",
            "db-apply",
            "direct-rpc",
            "edge-delete-empty",
            "edge-deploy-active",
            "ios-test",
            "ios-build",
        ];
        let predecessor: string | null = null;
        let sequence = 0;
        for (const stage of required) {
            const written = await append(root, stage, sequence, predecessor);
            predecessor = written.entryHash;
            sequence += 1;
        }
        const polluted = await append(
            root,
            "recovery-validated",
            sequence,
            predecessor,
            {
                projectRef: otherRef,
                identityDigest: otherIdentityDigest,
            },
        );
        const approval =
            `RELEASE:${ref}:${polluted.ledgerHash}:${polluted.manifestHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`;
        await assertRejects(
            () =>
                verifyReleaseApproval(
                    root,
                    approval,
                    ref,
                    identityDigest,
                ),
            "release ledger entry identity mismatch",
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test("release validates a foreign raw inventory entry before stage allowlisting", async () => {
    const root = await Deno.makeTempDir();
    try {
        const required: GateStage[] = [
            "inventory-validated",
            "recovery-validated",
            "lock-capability",
            "db-dry-run",
            "db-apply",
            "direct-rpc",
            "edge-delete-empty",
            "edge-deploy-active",
            "ios-test",
            "ios-build",
        ];
        let predecessor: string | null = null;
        let sequence = 0;
        for (const stage of required) {
            const written = await append(root, stage, sequence, predecessor);
            predecessor = written.entryHash;
            sequence += 1;
        }
        const polluted = await append(
            root,
            "inventory",
            sequence,
            predecessor,
            {
                projectRef: otherRef,
                identityDigest: otherIdentityDigest,
            },
        );
        const approval =
            `RELEASE:${ref}:${polluted.ledgerHash}:${polluted.manifestHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`;
        await assertRejects(
            () =>
                verifyReleaseApproval(
                    root,
                    approval,
                    ref,
                    identityDigest,
                ),
            "release ledger entry identity mismatch",
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test("release rejects a same-identity non-allowlisted ledger stage", async () => {
    const root = await Deno.makeTempDir();
    try {
        const required: GateStage[] = [
            "inventory-validated",
            "recovery-validated",
            "lock-capability",
            "db-dry-run",
            "db-apply",
            "direct-rpc",
            "edge-delete-empty",
            "edge-deploy-active",
            "ios-test",
            "ios-build",
        ];
        let predecessor: string | null = null;
        let sequence = 0;
        for (const stage of required) {
            const written = await append(root, stage, sequence, predecessor);
            predecessor = written.entryHash;
            sequence += 1;
        }
        const polluted = await append(
            root,
            "inventory",
            sequence,
            predecessor,
        );
        const approval =
            `RELEASE:${ref}:${polluted.ledgerHash}:${polluted.manifestHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`;
        await assertRejects(
            () =>
                verifyReleaseApproval(
                    root,
                    approval,
                    ref,
                    identityDigest,
                ),
            "release ledger stage sequence mismatch",
        );
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});

Deno.test("release approval rejects missing, stale, and reordered gate evidence", async () => {
    const required: GateStage[] = [
        "inventory-validated",
        "recovery-validated",
        "lock-capability",
        "db-dry-run",
        "db-apply",
        "direct-rpc",
        "edge-delete-empty",
        "edge-deploy-active",
        "ios-test",
        "ios-build",
    ];
    const root = await Deno.makeTempDir();
    try {
        const { approval, manifestHash } = await appendReleaseLedger(root);
        await verifyReleaseApproval(root, approval, ref, identityDigest);
        await Deno.writeTextFile(`${root}/rogue.json`, "{}\n", {
            mode: 0o600,
        });
        await assertRejects(
            () =>
                verifyReleaseApproval(
                    root,
                    approval,
                    ref,
                    identityDigest,
                ),
            "evidence manifest",
        );
        await Deno.remove(`${root}/rogue.json`);
        await assertRejects(
            () =>
                verifyReleaseApproval(
                    root,
                    `RELEASE:${ref}:${
                        "4".repeat(64)
                    }:${manifestHash}:${BACKEND_PRODUCT_SHA}:${CLIENT_PRODUCT_SHA}`,
                    ref,
                    identityDigest,
                ),
            "release approval",
        );

        const missingRoot = await Deno.makeTempDir();
        try {
            await append(missingRoot, "db-apply", 0, null);
            await assertRejects(
                () =>
                    verifyReleaseApproval(
                        missingRoot,
                        approval,
                        ref,
                        identityDigest,
                    ),
                "release ledger stage sequence mismatch",
            );
        } finally {
            await Deno.remove(missingRoot, { recursive: true });
        }

        const reorderedRoot = await Deno.makeTempDir();
        try {
            const inventory = await append(
                reorderedRoot,
                "inventory-validated",
                0,
                null,
            );
            const recovery = await append(
                reorderedRoot,
                "recovery-validated",
                1,
                inventory.entryHash,
            );
            const lock = await append(
                reorderedRoot,
                "lock-capability",
                2,
                recovery.entryHash,
            );
            const one = await append(
                reorderedRoot,
                "db-dry-run",
                3,
                lock.entryHash,
            );
            const two = await append(
                reorderedRoot,
                "direct-rpc",
                4,
                one.entryHash,
            );
            await append(reorderedRoot, "db-apply", 5, two.entryHash);
            await assertRejects(
                () =>
                    verifyReleaseApproval(
                        reorderedRoot,
                        approval,
                        ref,
                        identityDigest,
                    ),
                "release ledger stage sequence mismatch",
            );
        } finally {
            await Deno.remove(reorderedRoot, { recursive: true });
        }
    } finally {
        await Deno.remove(root, { recursive: true });
    }
});
