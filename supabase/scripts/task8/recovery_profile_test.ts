/// <reference lib="deno.ns" />

import { validateRecoveryProfile } from "./recovery_profile_lib.ts";

const NOW = new Date("2026-08-02T05:00:00.000Z");
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function assert(
    condition: unknown,
    message = "assertion failed",
): asserts condition {
    if (!condition) throw new Error(message);
}

async function assertRejects(action: () => unknown, message: string) {
    try {
        await action();
    } catch (error) {
        const actual = error instanceof Error ? error.message : String(error);
        assert(actual.includes(message), `expected ${message}, got ${actual}`);
        return;
    }
    throw new Error(`expected rejection containing ${message}`);
}

function managedProfile() {
    return {
        profile: "managed-pitr-v1",
        physicalBackupsEnabled: true,
        pitrEnabled: true,
        newestRecoveryPointAt: "2026-08-02T03:45:00.000Z",
        restoreStartedAt: "2026-08-02T03:46:00.000Z",
        restoreHealthyAt: "2026-08-02T03:55:00.000Z",
        recoveryPointAt: "2026-08-02T03:45:00.000Z",
        latestRestoredOperationAt: "2026-08-02T03:35:00.000Z",
        beforeMemberChecksum: SHA_A,
        afterMemberChecksum: SHA_A,
        beforeMatchChecksum: SHA_B,
        afterMatchChecksum: SHA_B,
    };
}

function logicalProfile() {
    return {
        profile: "logical-offsite-v1",
        repository: "divclasssg/jwtennisclub-backups",
        backupId: "20260802T030435497Z-af0948fe-295e-482f-aaff-d72ac743e6f8",
        workflowRunId: "30729954729",
        encryptedArchiveSha256: SHA_A,
        sourceFingerprintSha256: SHA_B,
        archiveBytes: 82470,
        backupStartedAt: "2026-08-02T03:04:35.497Z",
        backupCompletedAt: "2026-08-02T03:07:05.402Z",
        lastStateCheckAt: "2026-08-02T03:04:19.454Z",
        maxStateCheckGapMinutes: 1440,
        decryptTestedAt: "2026-08-02T03:13:56.000Z",
        localRestoreTestedAt: "2026-08-02T03:08:31.949Z",
        hostedRestoreStartedAt: "2026-08-02T03:14:00.000Z",
        hostedRestoreHealthyAt: "2026-08-02T03:40:00.000Z",
        hostedRestoreProjectRef: "orssnkppcukrqxikxdbf",
        quarterlyDrillAt: "2026-08-02T03:40:00.000Z",
        storageObjectCount: 0,
        storageObjectsProtected: false,
        beforeMemberChecksum: SHA_A,
        afterMemberChecksum: SHA_A,
        beforeMatchChecksum: SHA_B,
        afterMatchChecksum: SHA_B,
    };
}

Deno.test("managed PITR profile accepts exact evidence and returns an immutable copy", () => {
    const input = managedProfile();
    const result = validateRecoveryProfile(input, NOW);

    assert(result !== input);
    assert(result.profile === "managed-pitr-v1");
    assert(Object.isFrozen(result));
});

Deno.test("managed PITR profile rejects cross-mode, weak, stale, and mismatched evidence", async () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
        ["extra logical field", {
            repository: "divclasssg/jwtennisclub-backups",
        }, "unexpected field"],
        ["false PITR", { pitrEnabled: false }, "pitrEnabled"],
        [
            "slow restore",
            { restoreHealthyAt: "2026-08-02T04:47:00.000Z" },
            "RTO",
        ],
        ["wide recovery gap", {
            latestRestoredOperationAt: "2026-08-02T03:29:59.000Z",
        }, "RPO"],
        [
            "member mismatch",
            { afterMemberChecksum: "c".repeat(64) },
            "member checksum",
        ],
        [
            "match mismatch",
            { afterMatchChecksum: "c".repeat(64) },
            "match checksum",
        ],
    ];
    for (const [, mutation, message] of cases) {
        await assertRejects(
            () =>
                validateRecoveryProfile(
                    { ...managedProfile(), ...mutation },
                    NOW,
                ),
            message,
        );
    }
});

Deno.test("logical offsite profile accepts exact free-backup evidence", () => {
    const input = logicalProfile();
    const result = validateRecoveryProfile(input, NOW);

    assert(result !== input);
    assert(result.profile === "logical-offsite-v1");
    assert(result.archiveBytes === 82470);
    assert(Object.isFrozen(result));
});

Deno.test("logical offsite profile rejects foreign, stale, oversized, and incomplete evidence", async () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
        ["PITR field", { pitrEnabled: true }, "unexpected field"],
        [
            "foreign repository",
            { repository: "divclasssg/other" },
            "repository",
        ],
        ["foreign validation", {
            hostedRestoreProjectRef: "abcdefghijklmnopqrst",
        }, "hosted restore project"],
        [
            "invalid workflow run",
            { workflowRunId: "run-30729954729" },
            "workflowRunId",
        ],
        ["fractional archive", { archiveBytes: 82470.5 }, "archiveBytes"],
        ["oversized archive", { archiveBytes: 10485761 }, "archiveBytes"],
        [
            "wide state gap",
            { maxStateCheckGapMinutes: 1441 },
            "state check gap",
        ],
        [
            "stale state check",
            { lastStateCheckAt: "2026-07-31T15:59:59.000Z" },
            "state check",
        ],
        ["slow hosted restore", {
            hostedRestoreHealthyAt: "2026-08-02T04:14:01.000Z",
        }, "RTO"],
        [
            "stale drill",
            { quarterlyDrillAt: "2026-05-01T03:59:59.000Z" },
            "quarterly drill",
        ],
        ["unprotected objects", { storageObjectCount: 1 }, "Storage objects"],
        [
            "member mismatch",
            { afterMemberChecksum: "c".repeat(64) },
            "member checksum",
        ],
        [
            "match mismatch",
            { afterMatchChecksum: "c".repeat(64) },
            "match checksum",
        ],
    ];
    for (const [, mutation, message] of cases) {
        await assertRejects(
            () =>
                validateRecoveryProfile(
                    { ...logicalProfile(), ...mutation },
                    NOW,
                ),
            message,
        );
    }
});

Deno.test("recovery profiles reject missing, malformed, future, and unknown values", async () => {
    const missing = logicalProfile() as Record<string, unknown>;
    delete missing.encryptedArchiveSha256;
    await assertRejects(
        () => validateRecoveryProfile(missing, NOW),
        "encryptedArchiveSha256",
    );

    await assertRejects(
        () =>
            validateRecoveryProfile({
                ...logicalProfile(),
                encryptedArchiveSha256: "ABC",
            }, NOW),
        "encryptedArchiveSha256",
    );
    await assertRejects(
        () =>
            validateRecoveryProfile({
                ...logicalProfile(),
                decryptTestedAt: "2026-08-02T05:00:01.000Z",
            }, NOW),
        "future",
    );
    await assertRejects(
        () => validateRecoveryProfile({ profile: "unknown" }, NOW),
        "profile",
    );
});
