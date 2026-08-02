/// <reference lib="deno.ns" />

import { validateInventoryBundle } from "./inventory_lib.ts";

const NOW = new Date("2026-08-02T05:00:00.000Z");

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
        beforeMemberChecksum: "e".repeat(64),
        afterMemberChecksum: "e".repeat(64),
        beforeMatchChecksum: "f".repeat(64),
        afterMatchChecksum: "f".repeat(64),
    };
}

function logicalProfile() {
    return {
        profile: "logical-offsite-v1",
        repository: "divclasssg/jwtennisclub-backups",
        backupId: "20260802T030435497Z-af0948fe-295e-482f-aaff-d72ac743e6f8",
        workflowRunId: "30729954729",
        encryptedArchiveSha256: "a".repeat(64),
        sourceFingerprintSha256: "b".repeat(64),
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
        beforeMemberChecksum: "e".repeat(64),
        afterMemberChecksum: "e".repeat(64),
        beforeMatchChecksum: "f".repeat(64),
        afterMatchChecksum: "f".repeat(64),
    };
}

function completeInventory(
    recoveryProfile:
        | ReturnType<typeof managedProfile>
        | ReturnType<typeof logicalProfile> = managedProfile(),
) {
    return {
        schemaVersion: 2,
        identity: {
            validationRef: "orssnkppcukrqxikxdbf",
            productionSystemIdentifier: "1111111111111111111",
            validationSystemIdentifier: "2222222222222222222",
            databaseOid: "5",
            markerDigest: "9".repeat(64),
            provenanceId: "clone-ticket-42",
        },
        migrations: [{
            version: "20260730000000",
            name: "match",
            sha256: "a".repeat(64),
        }],
        memberBaseline: { count: 25, sha256: "b".repeat(64) },
        auth: {
            userCount: 25,
            identityCount: 25,
            providerCounts: { email: 25 },
            projectRef: "orssnkppcukrqxikxdbf",
            siteUrl: "https://validation.invalid",
            redirectHosts: ["validation.invalid"],
            jwtExpirySeconds: 3600,
        },
        tables: [{
            schema: "match",
            name: "events",
            rowCount: 0,
            sha256: "c".repeat(64),
        }],
        storage: {
            projectRef: "orssnkppcukrqxikxdbf",
            buckets: [{
                id: "avatars",
                public: false,
                fileSizeLimit: 1048576,
                allowedMimeTypes: ["image/png"],
                objectCount: 0,
            }],
        },
        databaseFunctions: [{
            schema: "public",
            name: "match_state",
            identityArguments: "uuid",
            sha256: "d".repeat(64),
        }],
        edgeFunctions: [
            "admin-command",
            "game-day-command",
            "game-day-snapshot",
            "match-recommendation",
            "member-link",
            "member-read",
            "operator-read",
        ].map((name, index) => ({
            name,
            version: index + 1,
            status: "ACTIVE",
        })),
        recoveryProfile,
    };
}

function validationContext() {
    return {
        storedIdentity: {
            validationRef: "orssnkppcukrqxikxdbf",
            productionSystemIdentifier: "1111111111111111111",
            validationSystemIdentifier: "2222222222222222222",
            databaseOid: "5",
            markerDigest: "9".repeat(64),
            provenanceId: "clone-ticket-42",
        },
        liveIdentity: {
            projectRef: "orssnkppcukrqxikxdbf",
            systemIdentifier: "2222222222222222222",
            databaseOid: "5",
            databaseName: "postgres",
            sourceSystemIdentifier: "1111111111111111111",
            markerDigest: "9".repeat(64),
            provenanceId: "clone-ticket-42",
        },
        productionInventory: {
            projectRef: "ydiusirreirhbvlftegp",
            systemIdentifier: "1111111111111111111",
            auth: {
                projectRef: "ydiusirreirhbvlftegp",
                siteUrl: "https://jwtennisclub.example",
                redirectHosts: ["jwtennisclub.example"],
            },
            storage: { projectRef: "ydiusirreirhbvlftegp" },
        },
    };
}

Deno.test("inventory accepts exact v2 custody bundles for both recovery profiles", () => {
    const result = validateInventoryBundle(
        completeInventory(),
        validationContext(),
        NOW,
    );
    assert(result.edgeFunctions.length === 7);
    assert(result.derivedIsolation.authProjectBound);
    assert(result.derivedIsolation.storageProjectBound);
    assert(result.derivedIsolation.networkHostsDistinct);
    assert(result.recoveryProfile.profile === "managed-pitr-v1");

    const logical = validateInventoryBundle(
        completeInventory(logicalProfile()),
        validationContext(),
        NOW,
    );
    assert(logical.recoveryProfile.profile === "logical-offsite-v1");
});

Deno.test("inventory rejects v1 evidence and ambiguous PITR booleans", async () => {
    const legacy = completeInventory() as Record<string, unknown>;
    legacy.schemaVersion = 1;
    await assertRejects(
        () => validateInventoryBundle(legacy, validationContext(), NOW),
        "schemaVersion must equal 2",
    );

    const disabled = completeInventory();
    (disabled.recoveryProfile as ReturnType<typeof managedProfile>)
        .pitrEnabled = false;
    await assertRejects(
        () => validateInventoryBundle(disabled, validationContext(), NOW),
        "pitrEnabled",
    );

    const disguised = completeInventory(logicalProfile()) as Record<
        string,
        unknown
    >;
    disguised.physicalBackupsEnabled = false;
    await assertRejects(
        () => validateInventoryBundle(disguised, validationContext(), NOW),
        "unexpected field",
    );
});

Deno.test("inventory rejects a partial approved edge deployment", async () => {
    const inventory = completeInventory();
    inventory.edgeFunctions.pop();
    await assertRejects(
        () => validateInventoryBundle(inventory, validationContext(), NOW),
        "seven approved edge functions",
    );
});

Deno.test("inventory accepts an empty edge set for an initial deployment", () => {
    const inventory = completeInventory();
    inventory.edgeFunctions = [];

    const result = validateInventoryBundle(
        inventory,
        validationContext(),
        NOW,
    );

    assert(result.edgeFunctions.length === 0);
});

Deno.test("inventory derives and rejects production-coupled auth/storage", async () => {
    const auth = completeInventory();
    auth.auth.projectRef = "ydiusirreirhbvlftegp";
    await assertRejects(
        () => validateInventoryBundle(auth, validationContext(), NOW),
        "Auth project",
    );

    const storage = completeInventory();
    storage.storage.projectRef = "ydiusirreirhbvlftegp";
    await assertRejects(
        () => validateInventoryBundle(storage, validationContext(), NOW),
        "storage project",
    );

    const restore = completeInventory();
    restore.recoveryProfile.afterMemberChecksum = "0".repeat(64);
    await assertRejects(
        () => validateInventoryBundle(restore, validationContext(), NOW),
        "member checksum",
    );
});

Deno.test("inventory binds Auth isolation to observable project refs", () => {
    const inventory = completeInventory();
    const auth = inventory.auth as Record<string, unknown>;
    auth.projectRef = "orssnkppcukrqxikxdbf";

    const context = validationContext();
    const productionAuth = context.productionInventory.auth as Record<
        string,
        unknown
    >;
    productionAuth.projectRef = "ydiusirreirhbvlftegp";

    const result = validateInventoryBundle(inventory, context, NOW);
    assert(result.derivedIsolation.authProjectBound);
});

Deno.test("inventory binds stored, live, and production identities", async () => {
    const storedMismatch = validationContext();
    storedMismatch.storedIdentity.markerDigest = "8".repeat(64);
    await assertRejects(
        () => validateInventoryBundle(completeInventory(), storedMismatch, NOW),
        "stored identity",
    );

    const liveMismatch = validationContext();
    liveMismatch.liveIdentity.systemIdentifier = "3333333333333333333";
    await assertRejects(
        () => validateInventoryBundle(completeInventory(), liveMismatch, NOW),
        "validation database fingerprint mismatch",
    );
});

Deno.test("inventory requires exact ACTIVE edge deployment status", async () => {
    const inventory = completeInventory();
    inventory.edgeFunctions[0].status = "DEPLOYING";
    await assertRejects(
        () => validateInventoryBundle(inventory, validationContext(), NOW),
        "ACTIVE",
    );
});

Deno.test("inventory rejects malformed entries and extra fields", async () => {
    const extra = completeInventory() as
        & ReturnType<
            typeof completeInventory
        >
        & { bearerToken?: string };
    extra.bearerToken = "must-not-be-accepted";
    await assertRejects(
        () => validateInventoryBundle(extra, validationContext(), NOW),
        "unexpected field",
    );

    const malformed = completeInventory();
    malformed.migrations[0].sha256 = "not-a-hash";
    await assertRejects(
        () => validateInventoryBundle(malformed, validationContext(), NOW),
        "migrations[0].sha256",
    );
});

Deno.test("inventory rejects foreign, stale, large, and incomplete logical evidence", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
        [{ pitrEnabled: true }, "unexpected field"],
        [{ repository: "divclasssg/foreign" }, "repository"],
        [{ workflowRunId: "foreign-run" }, "workflowRunId"],
        [{ encryptedArchiveSha256: "not-a-hash" }, "encryptedArchiveSha256"],
        [
            { hostedRestoreProjectRef: "abcdefghijklmnopqrst" },
            "hosted restore project",
        ],
        [{ lastStateCheckAt: "2026-07-31T16:59:59.000Z" }, "state check"],
        [{ quarterlyDrillAt: "2026-05-01T04:59:59.000Z" }, "quarterly drill"],
        [{ archiveBytes: 10_485_761 }, "archiveBytes"],
        [{ storageObjectCount: 1 }, "Storage objects"],
        [{ afterMemberChecksum: "0".repeat(64) }, "member checksum"],
    ];
    for (const [mutation, message] of cases) {
        await assertRejects(
            () =>
                validateInventoryBundle(
                    completeInventory(
                        { ...logicalProfile(), ...mutation } as ReturnType<
                            typeof logicalProfile
                        >,
                    ),
                    validationContext(),
                    NOW,
                ),
            message,
        );
    }
});
